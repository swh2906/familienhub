// Kochzeit gegen Termine (Schritt 11 D1) – reine Logik.
// Jede Mahlzeit hat eine übliche Essenszeit; davor liegt die Kochzeit (Zubereitungszeit des
// Rezepts, sonst ca. 30 Minuten). Überschneidet sich ein Termin damit, gibt es einen Hinweis mit
// Vorschlägen: tauschen, schnelleres Rezept, am Vortag vorbereiten. Ganztägige Termine
// (Geburtstage, Ferien) blockieren das Kochen nicht.
import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
import { addDaysTo, type Occurrence } from '#lib/features/calendar/expand.js';

export const MEAL_TIMES = { breakfast: '07:30', lunch: '12:30', dinner: '18:30' } as const;
export const DEFAULT_PREP_MINUTES = 30;

/** Zubereitungszeit (ältere Rezepte haben keine Angabe). */
const prepOf = (recipe: Recipe | null): number => recipe?.prep_minutes ?? 0;

export function toMinutes(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(minutes: number): string {
	const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export interface CookingConflict {
	entry: MealPlanEntry;
	recipe: Recipe | null;
	/** Kochzeit in Minuten; geschätzt, wenn das Rezept keine Angabe hat. */
	minutes: number;
	estimated: boolean;
	/** Kochfenster („17:30“–„18:30“). */
	from: string;
	to: string;
	/** Termine, die das Kochfenster blockieren. */
	blocking: Occurrence[];
	/** Freie Minuten vor dem Essen nach dem letzten Termin (0 = gar keine). */
	freeMinutes: number;
}

/** Minuten eines Vorkommens an einem Tag (mehrtägige Termine: ganzer Tag dazwischen). */
function span(occurrence: Occurrence, date: string): [number, number] | null {
	if (occurrence.allDay || occurrence.startDate > date || occurrence.endDate < date) return null;
	const start = occurrence.startDate === date ? toMinutes(occurrence.startTime) : 0;
	const end = occurrence.endDate === date ? toMinutes(occurrence.endTime) : 24 * 60;
	return end > start ? [start, end] : null;
}

/**
 * Blockiert der Termin das Kochen? Ohne Teilnehmer gilt er für die ganze Familie; sonst nur, wenn
 * alle Erwachsenen dabei sind (dann kann niemand sonst kochen).
 */
function blocksCooking(occurrence: Occurrence, adults: readonly string[]): boolean {
	const participants = occurrence.event.participants ?? [];
	if (participants.length === 0 || adults.length === 0) return true;
	return adults.every((id) => participants.includes(id));
}

export interface ConflictInput {
	today: string;
	days?: number;
	entries: readonly MealPlanEntry[];
	recipes: readonly Recipe[];
	occurrences: readonly Occurrence[];
	/** Mitgliedschaften der Erwachsenen (Admin, Erwachsene). */
	adults: readonly string[];
	/** Jetzt in Minuten (nur für heute: Vergangenes zählt nicht mehr). */
	nowMinutes?: number;
}

/** Kochzeit-Konflikte der nächsten Tage, früheste zuerst. */
export function cookingConflicts(input: ConflictInput): CookingConflict[] {
	const { today, days = 7 } = input;
	const until = addDaysTo(today, days - 1);
	const recipes = new Map(input.recipes.map((r) => [r.id, r]));
	const result: CookingConflict[] = [];

	for (const entry of input.entries) {
		if (entry.deleted_at || entry.cooked || entry.date < today || entry.date > until) continue;
		const recipe = entry.recipe ? (recipes.get(entry.recipe) ?? null) : null;
		if (!recipe && !entry.title.trim()) continue;
		const estimated = prepOf(recipe) <= 0;
		const minutes = estimated ? DEFAULT_PREP_MINUTES : prepOf(recipe);
		const meal = toMinutes(MEAL_TIMES[entry.slot]);
		const start = meal - minutes;
		if (entry.date === today && input.nowMinutes !== undefined && meal <= input.nowMinutes) {
			continue;
		}

		const blocking: Occurrence[] = [];
		let lastEnd = start;
		for (const occurrence of input.occurrences) {
			const range = span(occurrence, entry.date);
			if (!range || !blocksCooking(occurrence, input.adults)) continue;
			// Überschneidung mit dem Kochfenster [start, meal).
			if (range[0] < meal && range[1] > start) {
				blocking.push(occurrence);
				lastEnd = Math.max(lastEnd, range[1]);
			}
		}
		if (blocking.length === 0) continue;
		result.push({
			entry,
			recipe,
			minutes,
			estimated,
			from: fromMinutes(start),
			to: fromMinutes(meal),
			blocking,
			freeMinutes: Math.max(0, meal - lastEnd)
		});
	}
	return result.sort((a, b) =>
		a.entry.date === b.entry.date
			? toMinutes(a.from) - toMinutes(b.from)
			: a.entry.date.localeCompare(b.entry.date)
	);
}

/** Tauschpartner: gleiche Mahlzeit an einem anderen Tag ohne Konflikt, nicht gekocht. */
export function swapCandidates(
	conflict: CookingConflict,
	entries: readonly MealPlanEntry[],
	conflicts: readonly CookingConflict[],
	today: string,
	days = 7
): MealPlanEntry[] {
	const until = addDaysTo(today, days - 1);
	const blocked = new Set(conflicts.map((c) => c.entry.id));
	return entries
		.filter(
			(e) =>
				!e.deleted_at &&
				!e.cooked &&
				e.id !== conflict.entry.id &&
				e.slot === conflict.entry.slot &&
				e.date >= today &&
				e.date <= until &&
				e.date !== conflict.entry.date &&
				!blocked.has(e.id)
		)
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(0, 2);
}

/** Schnellere Rezepte, die in die freie Zeit passen (Favoriten zuerst, höchstens drei). */
export function quickerRecipes(conflict: CookingConflict, recipes: readonly Recipe[]): Recipe[] {
	if (conflict.freeMinutes < 10) return [];
	return recipes
		.filter(
			(r) =>
				!r.deleted_at &&
				r.id !== conflict.recipe?.id &&
				prepOf(r) > 0 &&
				prepOf(r) <= conflict.freeMinutes
		)
		.sort(
			(a, b) =>
				Number(b.is_favorite) - Number(a.is_favorite) ||
				prepOf(a) - prepOf(b) ||
				a.title.localeCompare(b.title, 'de')
		)
		.slice(0, 3);
}

/** Vortag zum Vorbereiten – nur, wenn er nicht schon vorbei ist. */
export function prepareDay(conflict: CookingConflict, today: string): string | null {
	const day = addDaysTo(conflict.entry.date, -1);
	return day >= today ? day : null;
}
