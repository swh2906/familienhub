// Reine Logik für „Woche vorschlagen“: Abendessen aus den Homi-Rezepten der Familie auswählen.
// Gewichtete Zufallsauswahl – Favoriten und lange nicht geplante Gerichte kommen eher dran,
// unter der Woche schnelle Gerichte. Kein Gericht zweimal in derselben Woche.
import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
import { normalize } from './recipes.js';
import { fromDateString } from './week.js';

/** Ab so vielen Tagen gilt ein Gericht als „lange nicht gegessen“ (volles Gewicht). */
const FULL_AFTER_DAYS = 28;
const QUICK_MINUTES = 30;
const SLOW_MINUTES = 60;

export interface Suggestion {
	date: string;
	recipe: Recipe;
}

export interface SuggestInput {
	/** Tage, für die ein Abendessen gesucht wird (in der Reihenfolge der Woche). */
	dates: readonly string[];
	/** Erster und letzter Tag der Woche: was dort schon steht, wird nicht noch einmal vorgeschlagen. */
	week: { from: string; to: string };
	recipes: readonly Recipe[];
	/** Alle Einträge der Familie (Verlauf und bereits Geplantes). */
	entries: readonly MealPlanEntry[];
	/** Zufallszahl in [0, 1) – in Tests fest vorgegeben. */
	random?: () => number;
}

function daysBetween(a: string, b: string): number {
	const from = fromDateString(a);
	const to = fromDateString(b);
	if (!from || !to) return Infinity;
	return Math.round(Math.abs(to.getTime() - from.getTime()) / 86_400_000);
}

function isWeekday(date: string): boolean {
	const day = fromDateString(date)?.getDay() ?? 0;
	return day >= 1 && day <= 5;
}

/** Gehört der Eintrag zu diesem Rezept (verknüpft oder gleicher Titel)? */
function belongsTo(entry: MealPlanEntry, recipe: Recipe): boolean {
	return entry.recipe === recipe.id || normalize(entry.title ?? '') === normalize(recipe.title);
}

/** Abstand in Tagen zum nächstgelegenen Eintrag dieses Gerichts (Infinity = nie geplant). */
export function distanceToPlanned(
	recipe: Recipe,
	date: string,
	entries: readonly MealPlanEntry[]
): number {
	let best = Infinity;
	for (const entry of entries) {
		if (entry.deleted_at || !belongsTo(entry, recipe)) continue;
		best = Math.min(best, daysBetween(entry.date, date));
	}
	return best;
}

/** Gewicht eines Rezepts für einen Tag. In der Woche davor/danach geplant: nur zur Not. */
export function scoreRecipe(recipe: Recipe, date: string, distance: number): number {
	if (distance < 7) return 0.02;
	let score = 0.2 + 0.8 * Math.min(1, distance / FULL_AFTER_DAYS);
	if (recipe.is_favorite) score *= 2;
	const minutes = recipe.prep_minutes ?? 0;
	if (isWeekday(date) && minutes > 0) {
		if (minutes <= QUICK_MINUTES) score *= 1.3;
		else if (minutes > SLOW_MINUTES) score *= 0.6;
	}
	return score;
}

function pick(date: string, input: SuggestInput, exclude: ReadonlySet<string>): Recipe | undefined {
	const random = input.random ?? Math.random;
	const weighted = input.recipes
		.filter((r) => !r.deleted_at && r.title.trim() && !exclude.has(r.id))
		.map((recipe) => ({
			recipe,
			score: scoreRecipe(recipe, date, distanceToPlanned(recipe, date, input.entries))
		}))
		.sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'de'));
	const total = weighted.reduce((sum, c) => sum + c.score, 0);
	if (total <= 0) return undefined;
	let threshold = random() * total;
	for (const candidate of weighted) {
		threshold -= candidate.score;
		if (threshold < 0) return candidate.recipe;
	}
	return weighted[weighted.length - 1].recipe;
}

/** Rezepte, die in dieser Woche schon geplant sind, gehen nicht noch einmal. */
function plannedInRange(input: SuggestInput): Set<string> {
	const { from, to } = input.week;
	const ids = new Set<string>();
	for (const recipe of input.recipes) {
		const inWeek = input.entries.some(
			(e) => !e.deleted_at && e.date >= from && e.date <= to && belongsTo(e, recipe)
		);
		if (inWeek) ids.add(recipe.id);
	}
	return ids;
}

/** Ein Vorschlag je Tag; Tage ohne passendes Rezept fehlen im Ergebnis. */
export function suggestWeek(input: SuggestInput): Suggestion[] {
	const used = plannedInRange(input);
	const result: Suggestion[] = [];
	for (const date of input.dates) {
		const recipe = pick(date, input, used);
		if (!recipe) continue;
		used.add(recipe.id);
		result.push({ date, recipe });
	}
	return result;
}

/** Anderes Gericht für einen Vorschlag – keins, das schon in der Woche steht. Sonst undefined. */
export function alternativeFor(
	suggestions: readonly Suggestion[],
	index: number,
	input: SuggestInput
): Recipe | undefined {
	const current = suggestions[index];
	if (!current) return undefined;
	const used = plannedInRange(input);
	for (const s of suggestions) used.add(s.recipe.id);
	return pick(current.date, input, used);
}

/**
 * Abende, für die vorgeschlagen wird: ab heute (vergangene Abende nicht mehr) und nur solche ohne
 * geplantes Abendessen. Datumswerte als „JJJJ-MM-TT“, darum genügt der Textvergleich.
 */
export function openDinnerDates(
	days: readonly string[],
	weekEntries: readonly MealPlanEntry[],
	today: string
): string[] {
	const taken = new Set(
		weekEntries.filter((e) => !e.deleted_at && e.slot === 'dinner').map((e) => e.date)
	);
	return days.filter((d) => d >= today && !taken.has(d));
}
