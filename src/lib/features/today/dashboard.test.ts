import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent, MealPlanEntry, Recipe, Task } from '#lib/db/types.js';
import type { Occurrence } from '#lib/features/calendar/expand.js';
import {
	SCOPE_STORAGE_KEY,
	conflictPairs,
	dueBy,
	eventsInScope,
	isMyEvent,
	isMyTask,
	loadScope,
	saveScope,
	stats,
	tasksInScope,
	upNext,
	weekStrip
} from './dashboard.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };
const TODAY = '2026-10-21';

function at(date: string, time: string): number {
	return Date.parse(`${date}T${time}:00Z`);
}

function occ(
	key: string,
	from: string,
	to: string,
	participants: string[] = [],
	{ date = TODAY, allDay = false } = {}
): Occurrence {
	return {
		key,
		event: { ...base, id: key, title: key, participants } as unknown as CalendarEvent,
		allDay,
		start: at(date, allDay ? '00:00' : from),
		end: allDay ? at(date, '00:00') + 86_400_000 : at(date, to),
		startDate: date,
		endDate: date,
		startTime: allDay ? '' : from,
		endTime: allDay ? '' : to,
		occurrenceDate: date,
		recurring: false
	};
}

function task(id: string, extra: Partial<Task> = {}): Task {
	return {
		...base,
		id,
		household: 'h',
		title: id,
		notes: '',
		due_date: '',
		status: 'open',
		rrule: '',
		points: 0,
		assignees: [],
		...extra
	};
}

function meal(id: string, slot: MealPlanEntry['slot'], extra: Partial<MealPlanEntry> = {}) {
	return {
		...base,
		id,
		household: 'h',
		date: TODAY,
		slot,
		title: id,
		recipe_url: '',
		recipe: '',
		note: '',
		servings: 4,
		cooked: '',
		...extra
	} satisfies MealPlanEntry;
}

const minutes = (time: string) => {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + m;
};

describe('Filter „Nur meins“', () => {
	it('Termine: eigene und Familien-Termine', () => {
		expect(isMyEvent(occ('fam', '09:00', '10:00'), 'me')).toBe(true);
		expect(isMyEvent(occ('mine', '09:00', '10:00', ['me', 'x']), 'me')).toBe(true);
		expect(isMyEvent(occ('other', '09:00', '10:00', ['x']), 'me')).toBe(false);
		const all = [occ('a', '09:00', '10:00', ['x']), occ('b', '09:00', '10:00', ['me'])];
		expect(eventsInScope(all, 'all', 'me')).toHaveLength(2);
		expect(eventsInScope(all, 'mine', 'me').map((o) => o.key)).toEqual(['b']);
	});

	it('Aufgaben: mir zugewiesene und nicht zugewiesene', () => {
		expect(isMyTask(task('frei'), 'me')).toBe(true);
		expect(isMyTask(task('meine', { assignees: ['me'] }), 'me')).toBe(true);
		expect(isMyTask(task('fremd', { assignees: ['x'] }), 'me')).toBe(false);
		const all = [task('a', { assignees: ['x'] }), task('b')];
		expect(tasksInScope(all, 'mine', 'me').map((t) => t.id)).toEqual(['b']);
		expect(tasksInScope(all, 'all', 'me')).toHaveLength(2);
	});
});

describe('Auswahl speichern', () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubStorage(initial: Record<string, string> = {}) {
		const store = new Map(Object.entries(initial));
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v)
		});
		return store;
	}

	it('ohne Auswahl: Kinder „Nur meins“, Erwachsene alles', () => {
		stubStorage();
		expect(loadScope(true)).toBe('mine');
		expect(loadScope(false)).toBe('all');
	});

	it('gespeicherte Auswahl gilt, ungültige nicht', () => {
		const store = stubStorage({ [SCOPE_STORAGE_KEY]: 'mine' });
		expect(loadScope(false)).toBe('mine');
		saveScope('all');
		expect(store.get(SCOPE_STORAGE_KEY)).toBe('all');
		store.set(SCOPE_STORAGE_KEY, 'quatsch');
		expect(loadScope(true)).toBe('mine');
	});

	it('gesperrter Speicher: Standard, kein Fehler', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		expect(loadScope(false)).toBe('all');
		expect(() => saveScope('mine')).not.toThrow();
	});
});

describe('Kennzahlen', () => {
	it('zählt Termine, übrige Termine, Aufgaben, Überfälliges und Konflikte', () => {
		const todayEvents = [
			occ('früh', '08:00', '09:00', ['a']),
			occ('schwimmen', '15:00', '16:30', ['a', 'b']),
			occ('zahnarzt', '16:00', '16:45', ['b']),
			occ('geburtstag', '', '', [], { allDay: true })
		];
		const result = stats({
			todayEvents,
			tasks: [
				task('heute', { due_date: TODAY }),
				task('alt', { due_date: '2026-10-19' }),
				task('morgen', { due_date: '2026-10-22' }),
				task('erledigt', { due_date: TODAY, status: 'done' }),
				task('ohne')
			],
			openShopping: 3,
			today: TODAY,
			now: at(TODAY, '12:00')
		});
		expect(result).toEqual({
			events: 4,
			eventsLeft: 3,
			shopping: 3,
			tasks: 2,
			overdue: 1,
			conflicts: 1
		});
	});

	it('Überschneidungen als Paare: drei Termine einer Person zur selben Zeit = 3', () => {
		const same = ['a', 'b', 'c'].map((k) => occ(k, '10:00', '11:00', ['p']));
		expect(conflictPairs(same)).toBe(3);
		expect(
			conflictPairs([occ('x', '10:00', '11:00', ['p']), occ('y', '10:00', '11:00', ['q'])])
		).toBe(0);
	});

	it('dueBy: nur offene mit Datum bis einschließlich', () => {
		const tasks = [
			task('a', { due_date: TODAY }),
			task('b'),
			task('c', { due_date: '2026-10-25' })
		];
		expect(dueBy(tasks, TODAY).map((t) => t.id)).toEqual(['a']);
	});
});

describe('Als Nächstes', () => {
	const recipes = [{ ...base, id: 'r1', title: 'Lasagne', prep_minutes: 60 } as Recipe];

	it('sortiert Termine und Kochbeginn nach Uhrzeit, Vergangenes fällt weg', () => {
		const items = upNext({
			todayEvents: [
				occ('vorbei', '08:00', '09:00'),
				occ('zahnarzt', '16:00', '16:45', ['b']),
				occ('schwimmen', '15:00', '16:30', ['a', 'b']),
				occ('geburtstag', '', '', [], { allDay: true })
			],
			meals: [meal('Lasagne', 'dinner', { recipe: 'r1' }), meal('Brot', 'lunch')],
			recipes,
			today: TODAY,
			nowMinutes: minutes('13:00'),
			limit: 5
		});
		expect(items.map((i) => [i.kind, i.at])).toEqual([
			['event', '15:00'],
			['event', '16:00'],
			['meal', '17:30']
		]);
	});

	it('laufende Termine und Überschneidungen derselben Person', () => {
		const [first, second] = upNext({
			todayEvents: [
				occ('schwimmen', '15:00', '16:30', ['a', 'b']),
				occ('zahnarzt', '16:00', '16:45', ['b']),
				occ('anderer', '16:00', '17:00', ['c'])
			],
			meals: [],
			recipes: [],
			today: TODAY,
			nowMinutes: minutes('15:10')
		});
		expect(first).toMatchObject({ key: 'schwimmen', running: true, clashes: ['zahnarzt'] });
		expect(second).toMatchObject({ key: 'zahnarzt', running: false, clashes: ['schwimmen'] });
	});

	it('Kochzeit ohne Angabe geschätzt (30 Min.), gekochtes und gelöschtes fällt weg', () => {
		const items = upNext({
			todayEvents: [],
			meals: [
				meal('Suppe', 'dinner'),
				meal('Reste', 'lunch', { cooked: 'yes' }),
				meal('weg', 'lunch', { deleted_at: '2026-10-20' }),
				meal('gestern', 'dinner', { date: '2026-10-20' })
			],
			recipes,
			today: TODAY,
			nowMinutes: minutes('10:00')
		});
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			kind: 'meal',
			at: '18:00',
			mealTime: '18:30',
			minutes: 30,
			estimated: true
		});
	});

	it('Mahlzeit erscheint bis zur Essenszeit, auch wenn das Kochen schon läuft', () => {
		const items = upNext({
			todayEvents: [],
			meals: [meal('Lasagne', 'dinner', { recipe: 'r1' })],
			recipes,
			today: TODAY,
			nowMinutes: minutes('18:00')
		});
		expect(items[0]).toMatchObject({ at: '17:30', estimated: false, minutes: 60 });
		expect(
			upNext({
				todayEvents: [],
				meals: [meal('Lasagne', 'dinner')],
				recipes,
				today: TODAY,
				nowMinutes: minutes('18:30')
			})
		).toEqual([]);
	});

	it('höchstens drei Einträge', () => {
		const events = ['09', '10', '11', '12'].map((h) => occ(h, `${h}:00`, `${h}:30`));
		const items = upNext({
			todayEvents: events,
			meals: [],
			recipes: [],
			today: TODAY,
			nowMinutes: 0
		});
		expect(items.map((i) => i.key)).toEqual(['09', '10', '11']);
	});
});

describe('Wochenstreifen', () => {
	it('sieben Tage ab heute mit Terminen, Personen, Essen und Aufgaben', () => {
		const days = weekStrip({
			occurrences: [
				occ('schwimmen', '15:00', '16:30', ['a', 'b']),
				occ('zahnarzt', '16:00', '16:45', ['b', 'c']),
				occ('fußball', '10:00', '12:00', [], { date: '2026-10-24' })
			],
			meals: [
				meal('Lasagne', 'dinner'),
				meal('Müsli', 'breakfast'),
				meal('Curry', 'dinner', { date: '2026-10-22' }),
				meal('weg', 'lunch', { date: '2026-10-22', deleted_at: 'x' })
			],
			tasks: [
				task('alt', { due_date: '2026-10-19' }),
				task('heute', { due_date: TODAY }),
				task('morgen', { due_date: '2026-10-22' }),
				task('fertig', { due_date: '2026-10-22', status: 'done' }),
				task('später', { due_date: '2026-11-30' })
			],
			today: TODAY
		});
		expect(days.map((d) => d.date)).toEqual([
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24',
			'2026-10-25',
			'2026-10-26',
			'2026-10-27'
		]);
		const [today, tomorrow, , saturday] = days;
		expect(today).toMatchObject({
			isToday: true,
			people: ['a', 'b', 'c'],
			familyEvents: 0,
			hasConflict: true,
			tasks: 2
		});
		expect(today.meals.map((e) => e.title)).toEqual(['Müsli', 'Lasagne']);
		expect(tomorrow).toMatchObject({ isToday: false, tasks: 1, hasConflict: false });
		expect(tomorrow.meals.map((e) => e.title)).toEqual(['Curry']);
		expect(saturday).toMatchObject({ familyEvents: 1, people: [] });
		expect(saturday.events).toHaveLength(1);
	});
});
