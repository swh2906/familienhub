// Zeitzonen ohne zusätzliche Bibliothek: gespeichert wird in UTC, angezeigt in der Zeitzone des
// Haushalts (z. B. Europe/Berlin) – unabhängig davon, wo das Gerät gerade ist.
// Zeitumstellung: Eine Uhrzeit, die es nicht gibt (Frühjahr, 02:30), wird nach vorn verschoben
// (03:30). Bei der doppelten Stunde (Herbst) gilt die erste.

export interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric'
		});
		formatters.set(timeZone, f);
	}
	return f;
}

/** Wanduhrzeit in einer Zeitzone zu einem UTC-Zeitpunkt (Millisekunden). */
export function zonedParts(utcMs: number, timeZone: string): ZonedParts {
	const parts: Record<string, number> = {};
	for (const part of formatter(timeZone).formatToParts(new Date(utcMs))) {
		if (part.type !== 'literal') parts[part.type] = Number(part.value);
	}
	return {
		year: parts.year,
		month: parts.month,
		day: parts.day,
		hour: parts.hour,
		minute: parts.minute
	};
}

/** Abstand der Zeitzone zu UTC in Minuten zu einem Zeitpunkt (Berlin: +60 oder +120). */
export function offsetMinutes(utcMs: number, timeZone: string): number {
	const p = zonedParts(utcMs, timeZone);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
	return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC-Zeitpunkt zu Datum (JJJJ-MM-TT) und Uhrzeit (HH:MM) in der Zeitzone. */
export function zonedToUtc(date: string, time: string, timeZone: string): number {
	const [y, m, d] = date.split('-').map(Number);
	const [h, mi] = (time || '00:00').split(':').map(Number);
	const local = Date.UTC(y, m - 1, d, h, mi);
	const before = offsetMinutes(local - 12 * 3_600_000, timeZone);
	const after = offsetMinutes(local + 12 * 3_600_000, timeZone);
	const matches = [before, after]
		.map((offset) => local - offset * 60_000)
		.filter((t) => {
			const p = zonedParts(t, timeZone);
			return p.year === y && p.month === m && p.day === d && p.hour === h && p.minute === mi;
		})
		.sort((a, b) => a - b);
	// Doppelte Stunde: die erste; Lücke: mit dem Abstand von vorher (= nach vorn verschoben).
	return matches[0] ?? local - before * 60_000;
}

export interface ZonedDateTime {
	date: string;
	time: string;
	/** Minuten seit Mitternacht (für die Zeitachse). */
	minutes: number;
}

export function utcToZoned(utcMs: number, timeZone: string): ZonedDateTime {
	const p = zonedParts(utcMs, timeZone);
	return {
		date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
		time: `${pad(p.hour)}:${pad(p.minute)}`,
		minutes: p.hour * 60 + p.minute
	};
}

/** PocketBase-Zeit („2026-10-17 13:00:00.000Z“ oder ISO) → Millisekunden; leer → NaN. */
export function parseUtc(value: string): number {
	return value ? Date.parse(value.replace(' ', 'T')) : Number.NaN;
}

/** Millisekunden → ISO-Zeit für PocketBase. */
export function toUtcString(ms: number): string {
	return new Date(ms).toISOString();
}

/**
 * Ganztägige Termine speichern nur das Datum, als UTC-Mitternacht („2026-10-17 00:00:00.000Z“).
 * So rutschen sie nie auf den Vortag, egal in welcher Zeitzone.
 */
export function dateToAllDay(date: string): string {
	return `${date}T00:00:00.000Z`;
}

export function allDayToDate(value: string): string {
	return value ? value.replace(' ', 'T').slice(0, 10) : '';
}

/** Zeitzone, die das Gerät gerade nutzt (Rückfall, falls der Haushalt keine hat). */
export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
}
