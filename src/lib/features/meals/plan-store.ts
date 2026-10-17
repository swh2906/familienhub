// Wochenplan lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
import { repo } from '#lib/db/index.js';
import type { MealPlanEntry } from '#lib/db/types.js';
import type { Slot } from './plan.js';

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

export async function addEntry(household: string, form: EntryForm): Promise<void> {
	await repo('meal_plan_entries').create({ household, ...form, title: form.title.trim() });
}

/** Speichert nur geänderte Felder. */
export async function updateEntry(entry: MealPlanEntry, form: EntryForm): Promise<void> {
	const next = { ...form, title: form.title.trim() };
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
