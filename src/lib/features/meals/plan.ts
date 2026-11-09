// Reine Logik des Wochenplans: Einträge nach Tag und Mahlzeit gruppieren, Links prüfen, Vorschläge.
import { stableId } from '#lib/db/ids.js';
import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
import { normalize } from './recipes.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export type Slot = (typeof SLOTS)[number];

/** Geplante Mahlzeiten der Familie in fester Reihenfolge; leer oder unbekannt → alle drei. */
export function plannedSlots(mealSlots: readonly string[] | null | undefined): Slot[] {
	const chosen = SLOTS.filter((slot) => mealSlots?.includes(slot));
	return chosen.length > 0 ? chosen : [...SLOTS];
}

/**
 * Sichtbare Mahlzeiten: die geplanten plus jede, die an den Tagen schon Einträge hat – beim
 * Umstellen verschwindet nichts.
 */
export function visibleSlots(
	planned: readonly Slot[],
	groups: ReadonlyMap<string, readonly MealPlanEntry[]>,
	days: readonly string[]
): Slot[] {
	return SLOTS.filter(
		(slot) =>
			planned.includes(slot) ||
			days.some((day) => (groups.get(slotKey(day, slot))?.length ?? 0) > 0)
	);
}

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

/** Gerichte für die Eingabe-Vorschläge: häufig geplante zuerst, danach Homi-Rezepte. */
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

/** Homi-Rezept mit genau diesem Titel (ohne Groß-/Kleinschreibung), sonst undefined. */
export function matchRecipe(title: string, recipes: readonly Recipe[]): Recipe | undefined {
	const key = normalize(title);
	return key ? recipes.find((r) => !r.deleted_at && normalize(r.title) === key) : undefined;
}

/**
 * Feste ID des Rezepts zu einem geplanten Gericht (Familie + Titel ohne Groß-/Kleinschreibung).
 * Planen zwei Geräte offline dasselbe neue Gericht, entsteht so ein Rezept statt zwei.
 */
export function recipeIdFor(household: string, title: string): string {
	return stableId(household, `recipe:${normalize(title)}`);
}

/**
 * Einträge mit Gericht, aber ohne verknüpftes Rezept (für die einmalige Übernahme). Zusammengesetzte
 * Gerichte („Schnitzel mit Pommes“) bleiben außen vor: Ob sie aufgeteilt werden, entscheidet jemand
 * im Dialog – sonst entstünde daraus ein falsches Sammelrezept.
 */
export function entriesWithoutRecipe(
	entries: readonly MealPlanEntry[],
	recipes: readonly Recipe[] = []
): MealPlanEntry[] {
	return entries.filter(
		(e) =>
			!e.deleted_at &&
			!e.recipe &&
			(e.title ?? '').trim() !== '' &&
			splitDish(e.title, recipes).length === 1
	);
}

// Trennstellen zwischen Gerichten: Komma, Plus, & sowie „und“, „mit“, „dazu“ als
// eigene Wörter (nicht mitten im Wort, z. B. „Schmitt“).
const DISH_SEPARATOR = /\s*[,+&]\s*|\s+(?:und|mit|dazu)\s+/i;

/**
 * Teilt ein geplantes Abendessen in einzelne Gerichte auf, z. B. „Schnitzel mit Pommes und Salat“ →
 * Schnitzel, Pommes, Salat. Gibt es schon ein Rezept mit dem ganzen Titel, bleibt es ein Gericht.
 * Nur ein Vorschlag: Der Dialog fragt nach („Lasagne mit Spinat“ ist ein Rezept).
 */
export function splitDish(title: string, recipes: readonly Recipe[] = []): string[] {
	const whole = title.trim();
	if (!whole || matchRecipe(whole, recipes)) return [whole];
	const seen = new Set<string>();
	const parts: string[] = [];
	for (const raw of whole.split(DISH_SEPARATOR)) {
		const part = raw.trim();
		const key = normalize(part);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		// Kleingeschriebene Teile („mit pommes“) groß beginnen – deutsche Gerichte sind Nomen.
		parts.push(part.charAt(0).toLocaleUpperCase('de') + part.slice(1));
	}
	return parts.length > 1 ? parts : [whole];
}
