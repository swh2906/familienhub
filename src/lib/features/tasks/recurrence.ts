// Wiederholungen (Aufgaben und Kalender): einfache Vorlagen ↔ RRULE (RFC 5545) und das nächste
// Fälligkeitsdatum von Aufgaben.
// Gerechnet wird mit Kalendertagen in UTC, damit die Zeitumstellung keinen Tag verschiebt.
import { RRule } from 'rrule';

/** Wochentage 0 = Montag … 6 = Sonntag (wie in Deutschland üblich). */
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export type Preset =
	| { kind: 'none' }
	| { kind: 'daily' }
	| { kind: 'weekly'; days: number[]; interval: 1 | 2 }
	| { kind: 'monthly'; day: number }
	| { kind: 'yearly' }
	| { kind: 'custom'; rrule: string };

/** Vorlage → RRULE (ohne „RRULE:“-Präfix); leer bei „keine Wiederholung“. */
export function presetToRrule(preset: Preset): string {
	switch (preset.kind) {
		case 'none':
			return '';
		case 'daily':
			return 'FREQ=DAILY';
		case 'weekly': {
			const days = [...new Set(preset.days)].sort((a, b) => a - b).map((d) => BYDAY[d]);
			const interval = preset.interval === 2 ? ';INTERVAL=2' : '';
			return `FREQ=WEEKLY${interval}${days.length ? `;BYDAY=${days.join(',')}` : ''}`;
		}
		case 'monthly': {
			const day = Math.min(31, Math.max(1, Math.round(preset.day)));
			if (day <= 28) return `FREQ=MONTHLY;BYMONTHDAY=${day}`;
			// „Am 31.“ heißt: am 31. oder am letzten Tag davor (28./29./30.), nie ausfallen lassen.
			const candidates = Array.from({ length: day - 27 }, (_, i) => 28 + i);
			return `FREQ=MONTHLY;BYMONTHDAY=${candidates.join(',')};BYSETPOS=-1`;
		}
		case 'yearly':
			return 'FREQ=YEARLY';
		case 'custom':
			return preset.rrule;
	}
}

function parts(rrule: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const part of rrule.replace(/^RRULE:/i, '').split(';')) {
		const [key, value] = part.split('=');
		if (key && value !== undefined) map.set(key.toUpperCase(), value.toUpperCase());
	}
	return map;
}

/** RRULE → Vorlage. Was keiner Vorlage entspricht, bleibt als „custom“ erhalten. */
export function rruleToPreset(rrule: string): Preset {
	if (!rrule.trim()) return { kind: 'none' };
	const p = parts(rrule);
	const freq = p.get('FREQ');
	const interval = Number(p.get('INTERVAL') ?? '1');
	const known = (keys: string[]) => [...p.keys()].every((k) => keys.includes(k));

	if (freq === 'DAILY' && interval === 1 && known(['FREQ'])) return { kind: 'daily' };
	if (freq === 'YEARLY' && interval === 1 && known(['FREQ'])) return { kind: 'yearly' };

	if (
		freq === 'WEEKLY' &&
		(interval === 1 || interval === 2) &&
		known(['FREQ', 'INTERVAL', 'BYDAY'])
	) {
		const days = (p.get('BYDAY') ?? '')
			.split(',')
			.filter(Boolean)
			.map((d) => BYDAY.indexOf(d as (typeof BYDAY)[number]));
		if (days.every((d) => d >= 0)) return { kind: 'weekly', days, interval: interval as 1 | 2 };
	}

	if (freq === 'MONTHLY' && interval === 1) {
		const monthDays = (p.get('BYMONTHDAY') ?? '').split(',').map(Number);
		if (known(['FREQ', 'BYMONTHDAY']) && monthDays.length === 1 && monthDays[0] >= 1) {
			return { kind: 'monthly', day: monthDays[0] };
		}
		const last = monthDays.at(-1) ?? 0;
		const expected = Array.from({ length: Math.max(0, last - 27) }, (_, i) => 28 + i).join(',');
		if (
			known(['FREQ', 'BYMONTHDAY', 'BYSETPOS']) &&
			p.get('BYSETPOS') === '-1' &&
			monthDays.join(',') === expected
		) {
			return { kind: 'monthly', day: last };
		}
	}

	return { kind: 'custom', rrule };
}

function toUtc(date: string): Date {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Nächstes Fälligkeitsdatum nach dem Abhaken: erstes Vorkommen nach dem späteren von
 * Fälligkeit und heute. Früh erledigt → das übernächste Mal; überfällig erledigt → nächstes
 * kommendes Datum. Der Rhythmus (z. B. alle 2 Wochen) richtet sich nach dem Fälligkeitsdatum.
 * Ohne gültige Regel → ''.
 */
export function nextDueDate(rrule: string, due: string, today: string): string {
	if (!rrule.trim()) return '';
	const anchor = due || today;
	try {
		const rule = new RRule({
			...RRule.parseString(rrule.replace(/^RRULE:/i, '')),
			dtstart: toUtc(anchor)
		});
		const after = due && due > today ? due : today;
		const next = rule.after(toUtc(after), false);
		return next ? fromUtc(next) : '';
	} catch {
		return '';
	}
}
