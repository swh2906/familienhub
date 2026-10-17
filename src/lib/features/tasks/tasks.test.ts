import { describe, expect, it } from 'vitest';
import type { Task, TaskCompletion } from '#lib/db/types.js';
import { canComplete, dueKind, isOverdue, recentCompletions, tasksForTab } from './list.js';
import {
	nextDueDate,
	presetToRrule,
	rruleToPreset,
	shiftRrule,
	type Preset
} from './recurrence.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function task(id: string, title: string, extra: Partial<Task> = {}): Task {
	return {
		...base,
		id,
		household: 'h',
		title,
		notes: '',
		due_date: '',
		status: 'open',
		rrule: '',
		points: 0,
		assignees: [],
		...extra
	};
}

describe('Vorlagen ↔ RRULE', () => {
	const cases: [Preset, string][] = [
		[{ kind: 'none' }, ''],
		[{ kind: 'daily' }, 'FREQ=DAILY'],
		[{ kind: 'weekly', days: [3, 0], interval: 1 }, 'FREQ=WEEKLY;BYDAY=MO,TH'],
		[{ kind: 'weekly', days: [5], interval: 2 }, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA'],
		[{ kind: 'monthly', day: 15 }, 'FREQ=MONTHLY;BYMONTHDAY=15'],
		[{ kind: 'monthly', day: 31 }, 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1'],
		[{ kind: 'monthly', day: 30 }, 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1']
	];

	it.each(cases)('%o → %s', (preset, rrule) => {
		expect(presetToRrule(preset)).toBe(rrule);
	});

	it.each(cases)('zurück: %o', (preset, rrule) => {
		const expected =
			preset.kind === 'weekly' ? { ...preset, days: [...preset.days].sort() } : preset;
		expect(rruleToPreset(rrule)).toEqual(expected);
	});

	it('verschiebt Wochentage und Monatstag mit der Serie', () => {
		expect(shiftRrule('FREQ=WEEKLY;BYDAY=MO,TH', 1)).toBe('FREQ=WEEKLY;BYDAY=TU,FR');
		expect(shiftRrule('FREQ=WEEKLY;BYDAY=SU', 1)).toBe('FREQ=WEEKLY;BYDAY=MO');
		expect(shiftRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', -1)).toBe(
			'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU'
		);
		expect(shiftRrule('FREQ=MONTHLY;BYMONTHDAY=15', 2)).toBe('FREQ=MONTHLY;BYMONTHDAY=17');
		expect(shiftRrule('FREQ=DAILY', 3)).toBe('FREQ=DAILY');
		expect(shiftRrule('FREQ=WEEKLY;BYDAY=MO', 0)).toBe('FREQ=WEEKLY;BYDAY=MO');
	});

	it('unbekannte Regeln bleiben als „custom“ erhalten', () => {
		expect(rruleToPreset('FREQ=YEARLY;BYMONTH=3')).toEqual({
			kind: 'custom',
			rrule: 'FREQ=YEARLY;BYMONTH=3'
		});
		expect(presetToRrule({ kind: 'custom', rrule: 'FREQ=YEARLY' })).toBe('FREQ=YEARLY');
	});
});

describe('nextDueDate', () => {
	it.each([
		// [Regel, fällig, heute, erwartet, Beschreibung]
		['FREQ=DAILY', '2026-10-17', '2026-10-17', '2026-10-18', 'täglich, heute erledigt'],
		['FREQ=DAILY', '2026-10-10', '2026-10-17', '2026-10-18', 'überfällig → nächstes kommendes'],
		['FREQ=WEEKLY;BYDAY=MO,TH', '2026-10-19', '2026-10-19', '2026-10-22', 'Mo → Do'],
		['FREQ=WEEKLY;BYDAY=MO,TH', '2026-10-22', '2026-10-22', '2026-10-26', 'Do → Mo'],
		[
			'FREQ=WEEKLY;BYDAY=SA',
			'2026-10-24',
			'2026-10-20',
			'2026-10-31',
			'früh erledigt → übernächster Sa'
		],
		['FREQ=WEEKLY;INTERVAL=2;BYDAY=SA', '2026-10-17', '2026-10-17', '2026-10-31', 'alle 2 Wochen'],
		[
			'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA',
			'2026-10-17',
			'2026-10-25',
			'2026-10-31',
			'Rhythmus bleibt'
		],
		['FREQ=MONTHLY;BYMONTHDAY=15', '2026-10-15', '2026-10-15', '2026-11-15', 'monatlich'],
		[
			'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
			'2026-01-31',
			'2026-01-31',
			'2026-02-28',
			'am 31. → Februar'
		],
		[
			'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
			'2028-01-31',
			'2028-01-31',
			'2028-02-29',
			'Schaltjahr'
		],
		[
			'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
			'2026-03-31',
			'2026-03-31',
			'2026-04-30',
			'April hat 30'
		],
		['FREQ=DAILY', '2026-10-24', '2026-10-24', '2026-10-25', 'vor der Zeitumstellung'],
		['FREQ=DAILY', '2026-10-25', '2026-10-25', '2026-10-26', 'Tag der Zeitumstellung'],
		['FREQ=WEEKLY;BYDAY=SU', '2026-03-22', '2026-03-22', '2026-03-29', 'über Sommerzeit-Beginn'],
		['FREQ=DAILY', '', '2026-10-17', '2026-10-18', 'ohne Fälligkeit']
	])('%s, fällig %s, heute %s → %s (%s)', (rrule, due, today, expected) => {
		expect(nextDueDate(rrule, due, today)).toBe(expected);
	});

	it('ohne oder mit ungültiger Regel → leer', () => {
		expect(nextDueDate('', '2026-10-17', '2026-10-17')).toBe('');
		expect(nextDueDate('QUATSCH', '2026-10-17', '2026-10-17')).toBe('');
	});
});

describe('Aufgabenliste', () => {
	const today = '2026-10-17';
	const me = 'me';
	const tasks = [
		task('a', 'Blumen gießen', { due_date: '2026-10-20' }),
		task('b', 'Zimmer aufräumen', { due_date: '2026-10-18', assignees: [me] }),
		task('c', 'Steuer', { due_date: '2026-10-01', assignees: ['other'] }),
		task('d', 'Müll', { due_date: '2026-10-15' }),
		task('e', 'Fahrrad', {}),
		task('f', 'Erledigt', { status: 'done' }),
		task('g', 'Gelöscht', { deleted_at: 'x' })
	];

	it('„Meine“: mir zugewiesen oder niemandem, eigene zuerst, dann überfällig, dann Datum', () => {
		expect(tasksForTab(tasks, 'mine', me, today).map((t) => t.id)).toEqual(['b', 'd', 'a', 'e']);
	});

	it('„Alle“: auch fremde Aufgaben', () => {
		expect(tasksForTab(tasks, 'all', me, today).map((t) => t.id)).toEqual([
			'b',
			'c',
			'd',
			'a',
			'e'
		]);
	});

	it('überfällig und Fälligkeitsart', () => {
		expect(isOverdue(tasks[2], today)).toBe(true);
		expect(isOverdue(task('x', 'x', { due_date: '2026-10-01', status: 'done' }), today)).toBe(
			false
		);
		expect(dueKind('2026-10-16', today)).toBe('overdue');
		expect(dueKind('2026-10-17', today)).toBe('today');
		expect(dueKind('2026-10-18', today)).toBe('tomorrow');
		expect(dueKind('2026-10-25', today)).toBe('later');
		expect(dueKind('', today)).toBe('none');
		expect(dueKind('2027-01-01', '2026-12-31')).toBe('tomorrow');
	});

	it('Kinder haken eigene und nicht zugewiesene ab', () => {
		expect(canComplete(tasks[1], me, false)).toBe(true);
		expect(canComplete(tasks[0], me, false)).toBe(true);
		expect(canComplete(tasks[2], me, false)).toBe(false);
		expect(canComplete(tasks[2], me, true)).toBe(true);
	});

	it('zuletzt Erledigtes, neueste zuerst, mit Aufgabe', () => {
		const completions: TaskCompletion[] = [
			{
				...base,
				id: '1',
				task: 'a',
				membership: me,
				completed_at: '2026-10-10 10:00:00.000Z',
				points: 0
			},
			{
				...base,
				id: '2',
				task: 'b',
				membership: me,
				completed_at: '2026-10-12 10:00:00.000Z',
				points: 0
			},
			{
				...base,
				id: '3',
				task: 'b',
				membership: me,
				completed_at: '2026-10-13 10:00:00.000Z',
				points: 0,
				deleted_at: 'x'
			}
		];
		const result = recentCompletions(completions, tasks);
		expect(result.map((e) => e.completion.id)).toEqual(['2', '1']);
		expect(result[0].task?.title).toBe('Zimmer aufräumen');
	});
});
