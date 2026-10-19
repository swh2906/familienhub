import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '#lib/db/types.js';
import { expandEvents } from '#lib/features/calendar/expand.js';
import type { DemandLine } from '#lib/features/pantry/demand.js';
import { shoppingNeed, shoppingTiming } from './shopping.js';

const TODAY = '2026-10-19';
const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function event(start: string, end: string, participants: string[] = []) {
	return {
		...base,
		id: start,
		household: 'h',
		title: 'Termin',
		start: new Date(`${TODAY}T${start}:00+02:00`).toISOString(),
		end: new Date(`${TODAY}T${end}:00+02:00`).toISOString(),
		all_day: false,
		location: '',
		rrule: '',
		exdates: [],
		reminder_minutes: 0,
		participants
	} as unknown as CalendarEvent;
}

const occ = (events: CalendarEvent[]) => expandEvents(events, TODAY, TODAY, 'Europe/Berlin');
const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function line(name: string, date: string, extra: Partial<DemandLine> = {}): DemandLine {
	return {
		key: name,
		ingredient: name,
		name,
		category: '',
		unit: 'g',
		needed: 100,
		missing: 100,
		buy: { amount: 100, unit: 'g', packs: 0 },
		pack: 0,
		status: 'missing',
		because: '',
		meals: [{ entry: `e-${date}`, title: 'Essen', date }],
		stock: null,
		onList: null,
		...extra
	};
}

describe('Zeit zum Einkaufen', () => {
	it('jetzt frei', () => {
		expect(shoppingTiming(occ([event('17:00', '18:00')]), TODAY, [], at('10:00'))).toEqual({
			when: 'now',
			from: ''
		});
	});

	it('nach dem letzten Termin, wenn bis dahin keine halbe Stunde frei ist', () => {
		const events = [event('09:45', '12:00'), event('12:15', '16:30')];
		expect(shoppingTiming(occ(events), TODAY, [], at('09:30'))).toEqual({
			when: 'later',
			from: '16:30'
		});
	});

	it('vor Ladenöffnung ab 8 Uhr, nach Ladenschluss morgen', () => {
		expect(shoppingTiming([], TODAY, [], at('06:00'))).toEqual({ when: 'later', from: '08:00' });
		expect(shoppingTiming([], TODAY, [], at('19:45')).when).toBe('tomorrow');
		expect(shoppingTiming(occ([event('15:00', '20:00')]), TODAY, [], at('14:45')).when).toBe(
			'tomorrow'
		);
	});

	it('Termine nur eines Erwachsenen blockieren nicht', () => {
		const events = [event('09:00', '19:00', ['anna'])];
		expect(shoppingTiming(occ(events), TODAY, ['anna', 'ben'], at('10:00')).when).toBe('now');
	});
});

describe('Fehlt etwas für heute oder morgen?', () => {
	it('sicher Fehlendes für morgen, nicht auf der Liste', () => {
		const need = shoppingNeed(
			[
				line('reis', '2026-10-20'),
				line('milch', '2026-10-20', { status: 'check' }),
				line('mehl', '2026-10-23'),
				line('eier', '2026-10-20', { onList: { id: 'x' } as DemandLine['onList'] })
			],
			TODAY,
			[],
			[],
			at('10:00')
		);
		expect(need?.date).toBe('2026-10-20');
		expect(need?.missing.map((l) => l.name)).toEqual(['reis']);
	});

	it('heute nur, solange das Essen bevorsteht', () => {
		const lines = [line('reis', TODAY)];
		expect(shoppingNeed(lines, TODAY, [], [], at('10:00'))?.date).toBe(TODAY);
		expect(shoppingNeed(lines, TODAY, [], [], at('19:00'))).toBeNull();
		const lunch = new Map([[`e-${TODAY}`, 'lunch' as const]]);
		expect(shoppingNeed(lines, TODAY, [], [], at('13:00'), lunch)).toBeNull();
	});

	it('nichts zu tun', () => {
		expect(shoppingNeed([], TODAY, [], [], at('10:00'))).toBeNull();
	});
});
