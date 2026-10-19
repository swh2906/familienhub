// Bestehende Rezept-Zutaten ihren Basisartikeln zuordnen (einmal nach dem Update, danach nur für
// Zeilen ohne Zuordnung). Gleiche Logik wie beim Speichern; idempotent, auch auf mehreren Geräten.
import { repo } from '#lib/db/index.js';
import { ensureIngredients } from './store.js';

/** Ordnet alle Zutaten ohne Basisartikel zu. Gibt die Anzahl geänderter Zeilen zurück. */
export async function linkExistingIngredients(household: string): Promise<number> {
	const recipes = await repo('recipes').table.where('household').equals(household).toArray();
	const recipeIds = recipes.filter((r) => !r.deleted_at).map((r) => r.id);
	if (recipeIds.length === 0) return 0;
	const rows = (
		await repo('recipe_ingredients').table.where('recipe').anyOf(recipeIds).toArray()
	).filter((row) => !row.deleted_at && !row.ingredient && row.name.trim());
	if (rows.length === 0) return 0;

	const links = await ensureIngredients(
		household,
		rows.map((row) => row.name)
	);
	let changed = 0;
	for (const row of rows) {
		const id = links.get(row.name.trim());
		if (!id) continue;
		await repo('recipe_ingredients').update(row.id, { ingredient: id });
		changed += 1;
	}
	return changed;
}
