// Wochenplan lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
import { repo } from '#lib/db/index.js';
import type { Household, MealPlanEntry } from '#lib/db/types.js';
import { entriesWithoutRecipe, type Slot } from './plan.js';
import { ensureRecipe, recipesOf } from './store.js';

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
	const open = entriesWithoutRecipe(await allEntries(household));
	if (open.length === 0) return 0;
	const recipes = await recipesOf(household);
	for (const entry of open) {
		const recipe = await ensureRecipe(household, entry.title, entry.recipe_url, recipes);
		await repo('meal_plan_entries').update(entry.id, { recipe });
		const created = await repo('recipes').get(recipe);
		if (created && !recipes.some((r) => r.id === recipe)) recipes.push(created);
	}
	return open.length;
}
