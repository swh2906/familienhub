import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Task } from '#lib/db/types.js';
import type { Occurrence } from '#lib/features/calendar/expand.js';
import { greetingFor, isPast, nextOccurrence, tasksForToday } from './summary.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function occ(key: string, start: number, end: number, allDay = false): Occurrence {
	return {
		key,
		event: { ...base, id: key, title: key } as CalendarEvent,
		allDay,
		start,
		end,
		startDate: '2026-10-17',
		endDate: '2026-10-17',
		startTime: '',
		endTime: '',
		occurrenceDate: '2026-10-17',
		recurring: false
	};
}

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

describe('greetingFor', () => {
	it.each([
		[4, 'night'],
		[5, 'morning'],
		[10, 'morning'],
		[11, 'day'],
		[17, 'day'],
		[18, 'evening'],
		[22, 'evening'],
		[23, 'night']
	])('%i Uhr → %s', (hour, greeting) => {
		expect(greetingFor(hour)).toBe(greeting);
	});
});

describe('nächster Termin', () => {
	const events = [
		occ('früh', 100, 200),
		occ('läuft', 250, 400),
		occ('später', 500, 600),
		occ('ganztags', 0, 1000, true)
	];

	it('nimmt den laufenden oder nächsten Termin mit Uhrzeit', () => {
		expect(nextOccurrence(events, 300)).toBe('läuft');
		expect(nextOccurrence(events, 450)).toBe('später');
		expect(nextOccurrence(events, 700)).toBeNull();
	});

	it('erkennt vergangene Termine, ganztägige nie', () => {
		expect(isPast(events[0], 300)).toBe(true);
		expect(isPast(events[1], 300)).toBe(false);
		expect(isPast(events[3], 5000)).toBe(false);
	});
});

describe('tasksForToday', () => {
	const today = '2026-10-17';
	const tasks = [
		task('a', 'Blumen', { due_date: today }),
		task('b', 'Steuer', { due_date: '2026-10-10', assignees: ['other'] }),
		task('c', 'Zimmer', { due_date: today, assignees: ['me'] }),
		task('d', 'Müll', { due_date: '2026-10-15', assignees: ['me'] }),
		task('e', 'Morgen', { due_date: '2026-10-18', assignees: ['me'] }),
		task('f', 'Ohne Datum', { assignees: ['me'] }),
		task('g', 'Erledigt', { due_date: today, status: 'done' })
	];

	it('eigene zuerst, dann nicht zugewiesene, dann andere; überfällige vorn', () => {
		const result = tasksForToday(tasks, 'me', today);
		expect(result.tasks.map((t) => t.id)).toEqual(['d', 'c', 'a', 'b']);
		expect(result.total).toBe(4);
	});

	it('begrenzt die Anzahl, nennt aber die Gesamtzahl', () => {
		const result = tasksForToday(tasks, 'me', today, 2);
		expect(result.tasks).toHaveLength(2);
		expect(result.total).toBe(4);
	});
});
