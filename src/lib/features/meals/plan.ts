// Reine Logik des Wochenplans: Einträge nach Tag und Mahlzeit gruppieren, Links prüfen, Vorschläge.
import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
import { normalize } from './recipes.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export type Slot = (typeof SLOTS)[number];

/** Was der Eintrag-Dialog bearbeitet: bestehender Eintrag oder neuer an Tag und Mahlzeit. */
export interface DialogTarget {
	entry?: MealPlanEntry;
	date: string;
	slot: Slot;
}

export function slotKey(date: string, slot: Slot): string {
	return `${date}|${slot}`;
}

/** Aktive Einträge der angegebenen Tage, gruppiert nach „Tag|Mahlzeit“, in Anlege-Reihenfolge. */
export function groupEntries(
	entries: readonly MealPlanEntry[],
	days: readonly string[]
): Map<string, MealPlanEntry[]> {
	const visible = new Set(days);
	const groups = new Map<string, MealPlanEntry[]>();
	for (const entry of entries) {
		if (entry.deleted_at || !visible.has(entry.date)) continue;
		const key = slotKey(entry.date, entry.slot);
		groups.set(key, [...(groups.get(key) ?? []), entry]);
	}
	// Noch nicht synchronisierte Einträge (ohne `created`) ans Ende; Vergleich nach Zeichencode.
	const order = (e: MealPlanEntry) => `${e.created || '￿'}|${e.id}`;
	for (const list of groups.values()) {
		list.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
	}
	return groups;
}

/**
 * Prüft einen eingegebenen Rezept-Link. Leer → ''. Ohne Schema wird https:// ergänzt.
 * Nur http und https sind erlaubt (kein javascript: o. Ä.). Ungültig → null.
 */
export function normalizeRecipeUrl(input: string): string | null {
	const text = input.trim();
	if (!text) return '';
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
	try {
		const url = new URL(withScheme);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
		return url.href;
	} catch {
		return null;
	}
}

/** Gerichte für die Eingabe-Vorschläge: häufig geplante zuerst, danach FamilienHub-Rezepte. */
export function dishSuggestions(
	entries: readonly MealPlanEntry[],
	recipes: readonly Recipe[]
): string[] {
	const counts = new Map<string, { title: string; count: number }>();
	const add = (title: string, weight: number) => {
		const trimmed = title.trim();
		if (!trimmed) return;
		const key = normalize(trimmed);
		const current = counts.get(key);
		counts.set(key, { title: current?.title ?? trimmed, count: (current?.count ?? 0) + weight });
	};
	for (const entry of entries) if (!entry.deleted_at) add(entry.title ?? '', 1);
	for (const recipe of recipes) if (!recipe.deleted_at) add(recipe.title, 0);
	return [...counts.values()]
		.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'de'))
		.map((s) => s.title);
}

/** FamilienHub-Rezept mit genau diesem Titel (ohne Groß-/Kleinschreibung), sonst undefined. */
export function matchRecipe(title: string, recipes: readonly Recipe[]): Recipe | undefined {
	const key = normalize(title);
	return key ? recipes.find((r) => !r.deleted_at && normalize(r.title) === key) : undefined;
}
