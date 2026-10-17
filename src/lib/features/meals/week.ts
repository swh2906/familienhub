// Kalenderwochen nach ISO 8601 (Montag ist der erste Tag, KW 1 enthält den ersten Donnerstag).
// Gerechnet wird mit lokalen Kalendertagen um 12 Uhr, damit die Zeitumstellung keinen Tag verschiebt.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lokaler Kalendertag als Date um 12 Uhr. */
export function noon(year: number, month: number, day: number): Date {
	return new Date(year, month - 1, day, 12);
}

/** „2026-10-13“ (lokal). */
export function toDateString(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateString(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const date = noon(Number(match[1]), Number(match[2]), Number(match[3]));
	return toDateString(date) === value ? date : null;
}

export function addDays(date: Date, days: number): Date {
	return noon(date.getFullYear(), date.getMonth() + 1, date.getDate() + days);
}

/** Montag der Woche, in der `date` liegt. */
export function mondayOf(date: Date): Date {
	const weekday = (date.getDay() + 6) % 7; // Montag = 0 … Sonntag = 6
	return addDays(noon(date.getFullYear(), date.getMonth() + 1, date.getDate()), -weekday);
}

/** ISO-Woche: Jahr der Woche (kann vom Kalenderjahr abweichen) und Nummer. */
export function isoWeek(date: Date): { year: number; week: number } {
	const thursday = addDays(mondayOf(date), 3);
	const year = thursday.getFullYear();
	const firstThursday = addDays(mondayOf(noon(year, 1, 4)), 3);
	const week = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS)) + 1;
	return { year, week };
}

/** „2026-W42“ */
export function weekKey(date: Date): string {
	const { year, week } = isoWeek(date);
	return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Montag zu „2026-W42“, oder null bei ungültiger Angabe. */
export function mondayOfWeekKey(key: string | null | undefined): Date | null {
	const match = /^(\d{4})-W(\d{2})$/.exec(key ?? '');
	if (!match) return null;
	const year = Number(match[1]);
	const week = Number(match[2]);
	if (week < 1 || week > 53) return null;
	const monday = addDays(mondayOf(noon(year, 1, 4)), (week - 1) * 7);
	return weekKey(monday) === key ? monday : null;
}

export function shiftWeek(key: string, delta: number): string {
	const monday = mondayOfWeekKey(key) ?? mondayOf(new Date());
	return weekKey(addDays(monday, delta * 7));
}

/** Die sieben Kalendertage (JJJJ-MM-TT) ab Montag. */
export function weekDays(monday: Date): string[] {
	return Array.from({ length: 7 }, (_, i) => toDateString(addDays(monday, i)));
}

const dayFormat = new Intl.DateTimeFormat('de-DE', {
	weekday: 'long',
	day: 'numeric',
	month: 'long'
});
const shortFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });

/** „Montag, 13. Oktober“ */
export function formatDay(value: string): string {
	const date = fromDateString(value);
	return date ? dayFormat.format(date) : value;
}

const weekdayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });

/** „Montag“ */
export function formatWeekday(value: string): string {
	const date = fromDateString(value);
	return date ? weekdayFormat.format(date) : value;
}

/** „12. Okt.“ */
export function formatShortDate(value: string): string {
	const date = fromDateString(value);
	return date ? shortFormat.format(date) : value;
}

const compactFormat = new Intl.DateTimeFormat('de-DE', {
	weekday: 'short',
	day: 'numeric',
	month: 'short'
});

/** „Fr., 23. Okt.“ */
export function formatCompactDay(value: string): string {
	const date = fromDateString(value);
	return date ? compactFormat.format(date) : value;
}

/** „13. Okt. – 19. Okt.“ */
export function formatWeekRange(monday: Date): string {
	return `${shortFormat.format(monday)} – ${shortFormat.format(addDays(monday, 6))}`;
}
