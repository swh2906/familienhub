// Termine für einen sichtbaren Zeitraum berechnen: Einzeltermine und Serien (RRULE + exdates).
// Serien werden in Wanduhrzeit gerechnet („jeden Montag 15:00“ bleibt nach der Zeitumstellung
// 15:00) und erst danach in echte UTC-Zeitpunkte umgerechnet.
import { RRule } from 'rrule';
import type { CalendarEvent } from '#lib/db/types.js';
import { allDayToDate, parseUtc, utcToZoned, zonedToUtc } from './tz.js';

export interface Occurrence {
	/** Eindeutig je Vorkommen: Termin-ID plus Tag des Vorkommens. */
	key: string;
	event: CalendarEvent;
	allDay: boolean;
	/** Echte Zeitpunkte (UTC-Millisekunden); bei ganztägigen Terminen Mitternacht in UTC. */
	start: number;
	end: number;
	/** Erster und letzter Tag (JJJJ-MM-TT, Zeitzone des Haushalts, einschließlich). */
	startDate: string;
	endDate: string;
	startTime: string;
	endTime: string;
	/** Tag des Vorkommens in der Serie (für Ausnahmen „nur dieser Termin“). */
	occurrenceDate: string;
	recurring: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Wanduhrzeit als „schwebender“ UTC-Wert (für Rechnungen ohne Zeitzone). */
function floating(date: string, time = '00:00'): number {
	const [y, m, d] = date.split('-').map(Number);
	const [h, mi] = time.split(':').map(Number);
	return Date.UTC(y, m - 1, d, h, mi);
}

function floatingParts(ms: number): { date: string; time: string } {
	const iso = new Date(ms).toISOString();
	return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function addDaysTo(date: string, days: number): string {
	return floatingParts(floating(date) + days * DAY).date;
}

/** Aktive Termine eines Zeitraums (Tage einschließlich), nach Beginn sortiert. */
export function expandEvents(
	events: readonly CalendarEvent[],
	from: string,
	to: string,
	timeZone: string
): Occurrence[] {
	const result: Occurrence[] = [];
	for (const event of events) {
		if (event.deleted_at || !event.start) continue;
		result.push(...expandOne(event, from, to, timeZone));
	}
	return result.sort(
		(a, b) => a.start - b.start || a.event.title.localeCompare(b.event.title, 'de')
	);
}

function expandOne(event: CalendarEvent, from: string, to: string, timeZone: string): Occurrence[] {
	const allDay = !!event.all_day;

	// Beginn und Ende in Wanduhrzeit des Haushalts.
	let startDate: string;
	let startTime: string;
	let endDate: string;
	let endTime: string;
	if (allDay) {
		startDate = allDayToDate(event.start);
		endDate = allDayToDate(event.end) || startDate;
		if (endDate < startDate) endDate = startDate;
		startTime = '00:00';
		endTime = '23:59';
	} else {
		const start = utcToZoned(parseUtc(event.start), timeZone);
		const endMs = parseUtc(event.end);
		const end = Number.isNaN(endMs)
			? utcToZoned(parseUtc(event.start) + HOUR, timeZone)
			: utcToZoned(Math.max(endMs, parseUtc(event.start)), timeZone);
		({ date: startDate, time: startTime } = start);
		({ date: endDate, time: endTime } = end);
	}
	const duration = floating(endDate, endTime) - floating(startDate, startTime);
	const spanDays = Math.round((floating(endDate) - floating(startDate)) / DAY);

	const make = (occurrenceStart: string, occurrenceTime: string): Occurrence => {
		const endFloating = floatingParts(floating(occurrenceStart, occurrenceTime) + duration);
		const oEndDate = allDay ? addDaysTo(occurrenceStart, spanDays) : endFloating.date;
		return {
			key: `${event.id}:${occurrenceStart}`,
			event,
			allDay,
			start: allDay
				? floating(occurrenceStart)
				: zonedToUtc(occurrenceStart, occurrenceTime, timeZone),
			end: allDay
				? floating(oEndDate) + DAY
				: zonedToUtc(endFloating.date, endFloating.time, timeZone),
			startDate: occurrenceStart,
			endDate: oEndDate,
			startTime: allDay ? '' : occurrenceTime,
			endTime: allDay ? '' : endFloating.time,
			occurrenceDate: occurrenceStart,
			recurring: !!event.rrule
		};
	};

	const overlaps = (o: Occurrence) => o.startDate <= to && o.endDate >= from;

	if (!event.rrule) {
		const single = make(startDate, startTime);
		return overlaps(single) ? [single] : [];
	}

	let rule: RRule;
	try {
		rule = new RRule({
			...RRule.parseString(event.rrule.replace(/^RRULE:/i, '')),
			dtstart: new Date(floating(startDate, startTime))
		});
	} catch {
		const single = make(startDate, startTime);
		return overlaps(single) ? [single] : [];
	}

	const excluded = new Set(event.exdates ?? []);
	// Mehrtägige Termine können vor dem Zeitraum beginnen und hineinragen.
	const windowStart = floating(addDaysTo(from, -(spanDays + 1)));
	const windowEnd = floating(to, '23:59');
	return rule
		.between(new Date(windowStart), new Date(windowEnd), true)
		.map((date) => floatingParts(date.getTime()))
		.filter(({ date }) => !excluded.has(date))
		.map(({ date, time }) => make(date, time))
		.filter(overlaps);
}

/** Vorkommen, die einen bestimmten Tag berühren (für Monats- und Tagesansicht). */
export function onDay(occurrences: readonly Occurrence[], date: string): Occurrence[] {
	return occurrences.filter((o) => o.startDate <= date && o.endDate >= date);
}
