// Basisartikel lesen und anlegen – nur über die lokale Datenbank; der Sync erledigt den Rest.
import { repo } from '#lib/db/index.js';
import type { Ingredient } from '#lib/db/types.js';
import { categoryFromKeywords } from '#lib/features/shopping/categorize.js';
import { ingredientId, matchIngredient, starterFor, type KnownIngredient } from './catalog.js';

/** Aktive Basisartikel der Familie. */
export async function baseIngredientsOf(household: string): Promise<Ingredient[]> {
	const all = await repo('ingredients').table.where('household').equals(household).toArray();
	return all.filter((i) => !i.deleted_at);
}

function known(list: readonly Ingredient[]): KnownIngredient[] {
	return list.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] }));
}

/**
 * Ordnet Zutatennamen ihren Basisartikeln zu und legt fehlende an (feste ID je Familie und
 * Schlüssel, damit zwei Geräte nicht zwei „Mehl“ erzeugen). Gibt Name → Artikel-ID zurück.
 */
export async function ensureIngredients(
	household: string,
	names: readonly string[]
): Promise<Map<string, string>> {
	const list = await baseIngredientsOf(household);
	const result = new Map<string, string>();
	for (const name of names) {
		const clean = name.trim();
		if (!clean || result.has(clean)) continue;
		const match = matchIngredient(clean, known(list));
		if (match.source === 'known' && match.known && 'id' in match.known && match.known.id) {
			result.set(clean, match.known.id);
			continue;
		}
		const id = ingredientId(household, match.key);
		const existing = await repo('ingredients').get(id);
		if (!existing) {
			const { unit, pack } = starterFor(match);
			const created = await repo('ingredients').create({
				id,
				household,
				name: match.name,
				key: match.key,
				aliases: [],
				unit,
				category: categoryFromKeywords(match.name),
				pack_amount: pack
			});
			list.push(created);
		} else if (existing.deleted_at) {
			await repo('ingredients').update(id, { deleted_at: '' });
		}
		result.set(clean, id);
	}
	return result;
}
