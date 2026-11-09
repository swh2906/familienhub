// Wochenplan lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
import { repo } from '#lib/db/index.js';
import type { Household, MealPlanEntry, Recipe } from '#lib/db/types.js';
import { entriesWithoutRecipe, splitDish, type Slot } from './plan.js';
import { deleteRecipe, ensureRecipe, recipesOf } from './store.js';

/** Einträge eines Haushalts zwischen zwei Tagen (einschließlich), auch gelöschte. */
export function entriesBetween(
	household: string,
	from: string,
	to: string
): Promise<MealPlanEntry[]> {
	return repo('meal_plan_entries')
		.table.where('date')
		.between(from, to, true, true)
		.and((entry) => entry.household === household)
		.toArray();
}

/** Der Familienraum aus der lokalen Datenbank (für Einstellungen wie die geplanten Mahlzeiten). */
export function householdOf(household: string): Promise<Household | undefined> {
	return repo('households').table.get(household);
}

/** Geplante Mahlzeiten der Familie speichern (geht auch offline, Abgleich später). */
export async function setMealSlots(household: string, slots: Slot[]): Promise<void> {
	await repo('households').update(household, { meal_slots: slots });
}

/** Alle Einträge des Haushalts (für Vorschläge häufiger Gerichte). */
export function allEntries(household: string): Promise<MealPlanEntry[]> {
	return repo('meal_plan_entries').table.where('household').equals(household).toArray();
}

export interface EntryForm {
	date: string;
	slot: Slot;
	title: string;
	recipe_url: string;
	recipe: string;
}

/** Jedes geplante Gericht bekommt einmal ein Rezept (ohne Verknüpfung wird es angelegt). */
async function withRecipe(household: string, form: EntryForm): Promise<EntryForm> {
	const title = form.title.trim();
	if (form.recipe || !title) return { ...form, title };
	return { ...form, title, recipe: await ensureRecipe(household, title, form.recipe_url) };
}

export async function addEntry(household: string, form: EntryForm): Promise<void> {
	await repo('meal_plan_entries').create({ household, ...(await withRecipe(household, form)) });
}

/** Speichert nur geänderte Felder. */
export async function updateEntry(entry: MealPlanEntry, form: EntryForm): Promise<void> {
	// Gericht unverändert: Verknüpfung behalten, auch wenn das Rezept inzwischen anders heißt.
	const keep = !form.recipe && entry.recipe && form.title.trim() === entry.title;
	const next = await withRecipe(entry.household, keep ? { ...form, recipe: entry.recipe } : form);
	const changes = Object.fromEntries(
		Object.entries(next).filter(([key, value]) => (entry[key as keyof EntryForm] ?? '') !== value)
	);
	await repo('meal_plan_entries').update(entry.id, changes);
}

/**
 * Speichert ein Gericht, auf Wunsch in einzelne Gerichte aufgeteilt („Schnitzel mit Pommes“ →
 * zwei Einträge in derselben Mahlzeit, jeder mit eigenem Rezept). Der erste Teil übernimmt den
 * bestehenden Eintrag und den Link, die übrigen kommen neu dazu.
 */
export async function saveDishes(
	household: string,
	entry: MealPlanEntry | undefined,
	form: EntryForm,
	parts: readonly string[]
): Promise<void> {
	const [first, ...rest] = parts.length > 0 ? parts : [form.title];
	const main = parts.length > 1 ? { ...form, title: first, recipe: '' } : form;
	if (entry) await updateEntry(entry, main);
	else await addEntry(household, main);
	for (const title of rest) {
		await addEntry(household, { ...form, title, recipe_url: '', recipe: '' });
	}
}

export async function moveEntry(entry: MealPlanEntry, date: string, slot: Slot): Promise<void> {
	if (entry.date === date && entry.slot === slot) return;
	await repo('meal_plan_entries').update(entry.id, { date, slot });
}

export async function removeEntry(entry: MealPlanEntry): Promise<void> {
	await repo('meal_plan_entries').remove(entry.id);
}

/**
 * Nachtrag: Einträge ohne Rezept (vor dieser Funktion geplant oder per Sync eingetroffen) bekommen
 * ihr Rezept. Das App-Layout ruft das auf, sobald solche Einträge lokal da sind.
 */
export async function linkPlannedRecipes(household: string): Promise<number> {
	const recipes = await recipesOf(household);
	const open = entriesWithoutRecipe(await allEntries(household), recipes);
	if (open.length === 0) return 0;
	for (const entry of open) {
		const recipe = await ensureRecipe(household, entry.title, entry.recipe_url, recipes);
		await repo('meal_plan_entries').update(entry.id, { recipe });
		const created = await repo('recipes').get(recipe);
		if (created && !recipes.some((r) => r.id === recipe)) recipes.push(created);
	}
	return open.length;
}

/** Leeres Rezept, dessen Titel aus mehreren Gerichten besteht (früher als ein Rezept übernommen). */
export function splittableRecipe(recipe: Recipe, recipes: readonly Recipe[]): string[] {
	return splitDish(
		recipe.title,
		recipes.filter((r) => r.id !== recipe.id)
	);
}

/**
 * Teilt ein fälschlich zusammengefasstes, noch leeres Rezept auf: Jeder geplante Eintrag damit wird
 * zu einem Eintrag je Gericht (gleicher Tag, gleiche Mahlzeit), danach wird das Sammelrezept gelöscht.
 */
export async function splitRecipe(recipe: Recipe): Promise<void> {
	const parts = splittableRecipe(recipe, await recipesOf(recipe.household));
	if (parts.length < 2) return;
	const entries = (await allEntries(recipe.household)).filter(
		(e) => !e.deleted_at && e.recipe === recipe.id
	);
	const ids: string[] = [];
	for (const [index, title] of parts.entries()) {
		ids.push(await ensureRecipe(recipe.household, title, index === 0 ? recipe.source_url : ''));
	}
	for (const entry of entries) {
		await repo('meal_plan_entries').update(entry.id, { title: parts[0], recipe: ids[0] });
		for (const [index, title] of parts.slice(1).entries()) {
			await repo('meal_plan_entries').create({
				household: entry.household,
				date: entry.date,
				slot: entry.slot,
				title,
				recipe: ids[index + 1],
				servings: entry.servings,
				cooked: entry.cooked
			});
		}
	}
	await deleteRecipe(recipe);
}
