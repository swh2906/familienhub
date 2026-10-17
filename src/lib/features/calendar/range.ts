// Sichtbarer Zeitraum der Kalender-Ansichten und Blättern.
import {
	addDays,
	fromDateString,
	mondayOf,
	toDateString,
	weekDays
} from '#lib/features/meals/week.js';

export type View = 'tag' | 'woche' | 'monat';

export const VIEWS: readonly View[] = ['tag', 'woche', 'monat'];

export function parseView(value: string | null | undefined): View {
	return VIEWS.find((v) => v === value) ?? 'woche';
}

/** Tage der Ansicht: 1 Tag, 7 Tage ab Montag oder 6 Wochen ab dem Montag vor dem Monatsersten. */
export function daysFor(view: View, date: string): string[] {
	const day = fromDateString(date) ?? new Date();
	if (view === 'tag') return [toDateString(day)];
	if (view === 'woche') return weekDays(mondayOf(day));
	const first = new Date(day.getFullYear(), day.getMonth(), 1, 12);
	const start = mondayOf(first);
	return Array.from({ length: 42 }, (_, i) => toDateString(addDays(start, i)));
}

/** Datum eine Ansicht weiter (+1) oder zurück (−1); Monate bleiben auf einem gültigen Tag. */
export function shiftDate(view: View, date: string, delta: number): string {
	const day = fromDateString(date) ?? new Date();
	if (view === 'tag') return toDateString(addDays(day, delta));
	if (view === 'woche') return toDateString(addDays(day, 7 * delta));
	return toDateString(new Date(day.getFullYear(), day.getMonth() + delta, 1, 12));
}
