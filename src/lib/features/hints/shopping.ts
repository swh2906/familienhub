// Proaktiver Einkaufsassistent ohne Standort (Schritt 11 E1) – reine Logik.
// Ablauf: geplante Rezepte → Bedarf → Vorrat → Unsicheres → Zeitpunkt → Hinweis mit Begründung.
// Gefragt wird am Vortag oder am selben Tag vor dem Essen; der Zeitvorschlag kommt aus dem
// Kalender (wann sind die Erwachsenen frei?). Ohne Standort, ohne Push – nur auf Heute.
import { addDaysTo, type Occurrence } from '#lib/features/calendar/expand.js';
import type { DemandLine } from '#lib/features/pantry/demand.js';
import { blocksAdults, daySpan, fromMinutes, MEAL_TIMES, toMinutes } from './cooking.js';

/** Übliche Einkaufszeit (Läden offen) und Mindestdauer eines Einkaufs. */
export const SHOP_OPEN = toMinutes('08:00');
export const SHOP_CLOSE = toMinutes('20:00');
export const SHOP_MINUTES = 30;

export interface ShoppingTiming {
	/** 'now' = jetzt frei, 'later' = ab `from`, 'tomorrow' = heute keine Zeit mehr. */
	when: 'now' | 'later' | 'tomorrow';
	from: string;
}

/** Wann ist heute Zeit zum Einkaufen? (Erste freie halbe Stunde ab jetzt, Läden offen.) */
export function shoppingTiming(
	occurrences: readonly Occurrence[],
	today: string,
	adults: readonly string[],
	nowMinutes: number
): ShoppingTiming {
	const busy = occurrences
		.filter((o) => blocksAdults(o, adults))
		.map((o) => daySpan(o, today))
		.filter((r): r is [number, number] => !!r)
		.sort((a, b) => a[0] - b[0]);
	let start = Math.max(nowMinutes, SHOP_OPEN);
	for (const [from, to] of busy) {
		if (to <= start) continue;
		if (from - start >= SHOP_MINUTES) break;
		start = Math.max(start, to);
	}
	if (start + SHOP_MINUTES > SHOP_CLOSE) return { when: 'tomorrow', from: '' };
	if (start <= Math.max(nowMinutes, SHOP_OPEN) && nowMinutes >= SHOP_OPEN) {
		return { when: 'now', from: '' };
	}
	return { when: 'later', from: fromMinutes(start) };
}

export interface ShoppingNeed {
	/** Tag, an dem gekocht wird (heute oder morgen). */
	date: string;
	/** Fehlt und steht noch nicht auf der Liste. */
	missing: DemandLine[];
	timing: ShoppingTiming;
}

/**
 * Fehlt für heute (vor dem Essen) oder morgen etwas, das noch nicht auf der Liste steht?
 * Unsicheres („bitte prüfen“) erfragen die Vorratsfragen; hier geht es nur um sicher Fehlendes.
 */
export function shoppingNeed(
	lines: readonly DemandLine[],
	today: string,
	occurrences: readonly Occurrence[],
	adults: readonly string[],
	nowMinutes: number,
	slots: ReadonlyMap<string, keyof typeof MEAL_TIMES> = new Map()
): ShoppingNeed | null {
	const tomorrow = addDaysTo(today, 1);
	// Heute nur, solange das Essen noch bevorsteht.
	const stillToday = (line: DemandLine) =>
		line.meals.some((meal) => {
			if (meal.date !== today) return false;
			const slot = slots.get(meal.entry) ?? 'dinner';
			return toMinutes(MEAL_TIMES[slot]) > nowMinutes;
		});
	const missing = lines.filter(
		(l) =>
			l.status === 'missing' &&
			!l.onList &&
			(stillToday(l) || l.meals.some((m) => m.date === tomorrow))
	);
	if (missing.length === 0) return null;
	const date = missing.some(stillToday) ? today : tomorrow;
	return { date, missing, timing: shoppingTiming(occurrences, today, adults, nowMinutes) };
}
