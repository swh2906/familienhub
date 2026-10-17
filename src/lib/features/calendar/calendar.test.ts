import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Membership } from '#lib/db/types.js';
import { conflictsWith, findConflicts, layoutColumns, matchesFilter } from './conflicts.js';
import { expandEvents, onDay } from './expand.js';
import { describeOccurrence } from './label.js';
import { daysFor, parseView, shiftDate } from './range.js';
import { dateToAllDay, offsetMinutes, toUtcString, utcToZoned, zonedToUtc } from './tz.js';

const BERLIN = 'Europe/Berlin';
const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

/** Termin mit Beginn/Ende als Berliner Wanduhrzeit. */
function event(
	id: string,
	title: string,
	from: string,
	to: string,
	extra: Partial<CalendarEvent> = {}
): CalendarEvent {
	const [fd, ft] = from.split(' ');
	const [td, tt] = to.split(' ');
	return {
		...base,
		id,
		household: 'h',
		title,
		start: toUtcString(zonedToUtc(fd, ft, BERLIN)),
		end: toUtcString(zonedToUtc(td, tt, BERLIN)),
		all_day: false,
		location: '',
		rrule: '',
		exdates: [],
		reminder_minutes: 0,
		participants: [],
		...extra
	};
}

describe('Zeiträume der Ansichten', () => {
	it('Tag, Woche ab Montag, Monat als 6 Wochen', () => {
		expect(daysFor('tag', '2026-10-21')).toEqual(['2026-10-21']);
		expect(daysFor('woche', '2026-10-21')).toEqual([
			'2026-10-19',
			'2026-10-20',
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24',
			'2026-10-25'
		]);
		const month = daysFor('monat', '2026-10-21');
		expect(month).toHaveLength(42);
		expect(month[0]).toBe('2026-09-28'); // Montag vor dem 1. Oktober (Donnerstag)
		expect(month.at(-1)).toBe('2026-11-08');
	});

	it('blättert und bleibt bei Monaten auf einem gültigen Tag', () => {
		expect(shiftDate('tag', '2026-10-31', 1)).toBe('2026-11-01');
		expect(shiftDate('woche', '2026-10-21', -1)).toBe('2026-10-14');
		expect(shiftDate('monat', '2026-01-31', 1)).toBe('2026-02-01');
		expect(shiftDate('monat', '2026-01-15', -1)).toBe('2025-12-01');
		expect(parseView('monat')).toBe('monat');
		expect(parseView('quatsch')).toBe('woche');
	});
});

describe('Zeitzone Europe/Berlin', () => {
	it('rechnet Sommer- und Winterzeit um', () => {
		expect(new Date(zonedToUtc('2026-07-01', '12:00', BERLIN)).toISOString()).toBe(
			'2026-07-01T10:00:00.000Z'
		);
		expect(new Date(zonedToUtc('2026-12-01', '12:00', BERLIN)).toISOString()).toBe(
			'2026-12-01T11:00:00.000Z'
		);
		expect(offsetMinutes(Date.parse('2026-07-01T10:00:00Z'), BERLIN)).toBe(120);
		expect(utcToZoned(Date.parse('2026-12-01T23:30:00Z'), BERLIN)).toEqual({
			date: '2026-12-02',
			time: '00:30',
			minutes: 30
		});
	});

	it('nicht existierende Uhrzeit (29.03., 02:30) wird zu 03:30', () => {
		const t = zonedToUtc('2026-03-29', '02:30', BERLIN);
		expect(utcToZoned(t, BERLIN).time).toBe('03:30');
	});

	it('doppelte Stunde (25.10., 02:30) nimmt die erste', () => {
		const t = zonedToUtc('2026-10-25', '02:30', BERLIN);
		expect(new Date(t).toISOString()).toBe('2026-10-25T00:30:00.000Z');
	});

	it('funktioniert auch für andere Zeitzonen', () => {
		expect(new Date(zonedToUtc('2026-07-01', '09:00', 'America/New_York')).toISOString()).toBe(
			'2026-07-01T13:00:00.000Z'
		);
	});
});

describe('expandEvents', () => {
	it('Einzeltermin im Zeitraum, außerhalb nicht', () => {
		const e = event('a', 'Zahnarzt', '2026-10-20 16:00', '2026-10-20 16:45');
		expect(expandEvents([e], '2026-10-19', '2026-10-25', BERLIN)).toHaveLength(1);
		expect(expandEvents([e], '2026-10-26', '2026-11-01', BERLIN)).toHaveLength(0);
	});

	it('wöchentliche Serie bleibt über die Zeitumstellung um 15:00 Ortszeit', () => {
		const e = event('s', 'Schwimmen', '2026-10-19 15:00', '2026-10-19 16:30', {
			rrule: 'FREQ=WEEKLY;BYDAY=MO'
		});
		const occ = expandEvents([e], '2026-10-19', '2026-11-08', BERLIN);
		expect(occ.map((o) => `${o.startDate} ${o.startTime}-${o.endTime}`)).toEqual([
			'2026-10-19 15:00-16:30',
			'2026-10-26 15:00-16:30',
			'2026-11-02 15:00-16:30'
		]);
		// UTC verschiebt sich um eine Stunde (Sommer → Winter).
		expect(new Date(occ[0].start).toISOString()).toBe('2026-10-19T13:00:00.000Z');
		expect(new Date(occ[1].start).toISOString()).toBe('2026-10-26T14:00:00.000Z');
	});

	it('Ausnahmen (exdates) fallen weg', () => {
		const e = event('s', 'Schwimmen', '2026-10-19 15:00', '2026-10-19 16:30', {
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			exdates: ['2026-10-26']
		});
		expect(expandEvents([e], '2026-10-19', '2026-11-08', BERLIN).map((o) => o.startDate)).toEqual([
			'2026-10-19',
			'2026-11-02'
		]);
	});

	it('Serie beginnt vor dem Zeitraum, monatlich am 31. fällt nicht aus', () => {
		const e = event('m', 'Abrechnung', '2026-01-31 09:00', '2026-01-31 10:00', {
			rrule: 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1'
		});
		expect(expandEvents([e], '2026-02-01', '2026-04-30', BERLIN).map((o) => o.startDate)).toEqual([
			'2026-02-28',
			'2026-03-31',
			'2026-04-30'
		]);
	});

	it('ganztägig und mehrtägig, jährlich (Geburtstag)', () => {
		const trip: CalendarEvent = {
			...event('t', 'Urlaub', '2026-10-24 00:00', '2026-10-24 00:00'),
			all_day: true,
			start: dateToAllDay('2026-10-24'),
			end: dateToAllDay('2026-10-27')
		};
		const [o] = expandEvents([trip], '2026-10-26', '2026-10-26', BERLIN);
		expect(o).toMatchObject({ allDay: true, startDate: '2026-10-24', endDate: '2026-10-27' });
		expect(onDay([o], '2026-10-27')).toHaveLength(1);
		expect(onDay([o], '2026-10-28')).toHaveLength(0);

		const birthday: CalendarEvent = {
			...trip,
			id: 'b',
			title: 'Geburtstag Oma',
			start: dateToAllDay('2020-03-14'),
			end: '',
			rrule: 'FREQ=YEARLY'
		};
		expect(
			expandEvents([birthday], '2026-03-01', '2026-03-31', BERLIN).map((x) => x.startDate)
		).toEqual(['2026-03-14']);
	});

	it('gelöschte Termine und Termine ohne Ende', () => {
		const deleted = event('d', 'Weg', '2026-10-20 10:00', '2026-10-20 11:00', { deleted_at: 'x' });
		const noEnd = event('n', 'Kurz', '2026-10-20 10:00', '2026-10-20 10:00', { end: '' });
		const occ = expandEvents([deleted, noEnd], '2026-10-20', '2026-10-20', BERLIN);
		expect(occ.map((o) => `${o.event.id} ${o.startTime}-${o.endTime}`)).toEqual(['n 10:00-11:00']);
	});
});

describe('Konflikte', () => {
	const mia = 'mia';
	const tom = 'tom';
	const day = '2026-10-20';
	const occ = expandEvents(
		[
			event('a', 'Zahnarzt', `${day} 16:00`, `${day} 16:45`, { participants: [mia] }),
			event('b', 'Schwimmen', `${day} 15:30`, `${day} 16:30`, { participants: [mia, tom] }),
			event('c', 'Fußball', `${day} 16:00`, `${day} 17:00`, { participants: [tom] }),
			event('d', 'Familienessen', `${day} 16:00`, `${day} 17:00`),
			event('e', 'Danach', `${day} 16:45`, `${day} 17:30`, { participants: [mia] })
		],
		day,
		day,
		BERLIN
	);

	it('markiert Überschneidungen derselben Person, nicht Termine ohne Teilnehmer', () => {
		const keys = findConflicts(occ);
		expect([...keys].map((k) => k.split(':')[0]).sort()).toEqual(['a', 'b', 'c']);
	});

	it('warnt im Editor vor Überschneidungen', () => {
		const start = zonedToUtc(day, '16:15', BERLIN);
		const hits = conflictsWith(
			{ start, end: start + 30 * 60_000, participants: [tom], allDay: false },
			occ
		);
		expect(hits.map((o) => o.event.title).sort()).toEqual(['Fußball', 'Schwimmen']);
		expect(
			conflictsWith(
				{ start, end: start + 1, participants: [tom], allDay: false, ignore: 'c' },
				occ
			).map((o) => o.event.id)
		).toEqual(['b']);
	});

	it('ordnet überlappende Termine in Spalten an', () => {
		const placed = layoutColumns(occ);
		const byId = Object.fromEntries(placed.map((p) => [p.occurrence.event.id, p]));
		// Bei gleichem Beginn kommen längere Termine zuerst (weiter links), sonst alphabetisch.
		expect(byId.b.column).toBe(0);
		expect(byId.d.column).toBe(1);
		expect(byId.c.column).toBe(2);
		expect(byId.a.column).toBe(3);
		expect(byId.e.column).toBe(0); // beginnt, als Schwimmen schon vorbei ist
		expect(new Set(placed.map((p) => p.columns))).toEqual(new Set([4]));
	});

	it('Personen-Filter', () => {
		const family = occ.find((o) => o.event.id === 'd')!;
		const tomOnly = occ.find((o) => o.event.id === 'c')!;
		expect(matchesFilter(tomOnly, new Set([mia]))).toBe(false);
		expect(matchesFilter(family, new Set([mia]))).toBe(true);
		expect(matchesFilter(tomOnly, new Set())).toBe(true);
	});
});

describe('describeOccurrence', () => {
	const members = new Map([['m1', { id: 'm1', display_name: 'Mia' } as Membership]]);
	const [o] = expandEvents(
		[event('e1', 'Zahnarzt', '2026-10-20 16:00', '2026-10-20 16:45', { participants: ['m1'] })],
		'2026-10-20',
		'2026-10-20',
		BERLIN
	);

	it('beginnt mit dem, was die Ansicht zuerst zeigt', () => {
		expect(describeOccurrence(o, members, false)).toBe('Zahnarzt, 16:00–16:45, Mia');
		expect(describeOccurrence(o, members, true, 'range')).toBe(
			'16:00–16:45, Zahnarzt, Mia, Überschneidung'
		);
		expect(describeOccurrence(o, members, false, 'start')).toBe('16:00 Zahnarzt, bis 16:45, Mia');
	});
});
