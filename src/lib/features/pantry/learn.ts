// Aus Korrekturen lernen (Schritt 11 A3) – nur lokal gespeichert und in der Familie synchronisiert.
// 1. Schreibweisen: Ordnet jemand eine Zutat einem anderen Basisartikel zu, merkt sich der Artikel
//    die Schreibweise („Mehl 550“ gehört ab jetzt zu „Mehl“).
// 2. Zeilen: Korrigiert jemand eine eingefügte Zeile, wird dieselbe Zeile künftig so erkannt.
import { repo } from '#lib/db/index.js';
import type { CorrectedIngredient, ParseCorrection } from '#lib/db/types.js';
import { ingredientId, ingredientKey, matchIngredient } from './catalog.js';
import { baseIngredientsOf, ensureIngredients } from './store.js';

/** Schlüssel einer eingefügten Zeile: klein, Leerraum vereinheitlicht, ohne Aufzählungszeichen. */
export function correctionKey(line: string): string {
	return line
		.toLocaleLowerCase('de')
		.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 300);
}

/** Gelernte Zeilen-Korrekturen der Familie (Schlüssel → Ergebnis). */
export function correctionMap(
	list: readonly ParseCorrection[]
): Map<string, CorrectedIngredient[]> {
	const map = new Map<string, CorrectedIngredient[]>();
	for (const item of list) {
		if (!item.deleted_at && item.result?.length) map.set(item.key, item.result);
	}
	return map;
}

export async function correctionsOf(household: string): Promise<ParseCorrection[]> {
	return repo('parse_corrections').table.where('household').equals(household).toArray();
}

function same(a: readonly CorrectedIngredient[], b: readonly CorrectedIngredient[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merkt sich das korrigierte Ergebnis einer Zeile. Entspricht es wieder der automatischen
 * Erkennung, wird die gelernte Korrektur verworfen (damit sie nichts mehr überschreibt).
 */
export async function learnCorrection(
	household: string,
	input: string,
	automatic: readonly CorrectedIngredient[],
	result: readonly CorrectedIngredient[]
): Promise<void> {
	const key = correctionKey(input);
	if (!key) return;
	const id = ingredientId(household, `line:${key}`);
	const existing = await repo('parse_corrections').get(id);
	const value = same(result, automatic) ? null : [...result];
	if (!existing) {
		if (value) await repo('parse_corrections').create({ id, household, key, input, result: value });
		return;
	}
	const stored = existing.deleted_at ? null : existing.result;
	if (JSON.stringify(stored) === JSON.stringify(value)) return;
	await repo('parse_corrections').update(id, { input, result: value, deleted_at: '' });
}

/**
 * Ordnet einen Zutatennamen fest einem Basisartikel zu (legt ihn bei Bedarf an) und lernt die
 * Schreibweise, falls sie nicht ohnehin dorthin führt. Gibt die Artikel-ID zurück.
 */
export async function learnAlias(household: string, name: string, base: string): Promise<string> {
	const links = await ensureIngredients(household, [base]);
	const id = links.get(base.trim());
	if (!id) return '';
	const clean = name.trim();
	if (!clean) return id;
	const automatic = (await automaticLink(household, clean)) === id;
	if (automatic) return id;
	const item = await repo('ingredients').get(id);
	if (!item) return id;
	const aliases = item.aliases ?? [];
	const key = ingredientKey(clean);
	if (key !== item.key && !aliases.some((a) => ingredientKey(a) === key)) {
		await repo('ingredients').update(id, { aliases: [...aliases, clean] });
	}
	return id;
}

/** Wohin würde der Name ohne Korrektur führen? (ohne etwas anzulegen) */
async function automaticLink(household: string, name: string): Promise<string> {
	const list = await baseIngredientsOf(household);
	const match = matchIngredient(
		name,
		list.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] }))
	);
	return match.source === 'known' && match.known && 'id' in match.known && match.known.id
		? match.known.id
		: ingredientId(household, match.key);
}
