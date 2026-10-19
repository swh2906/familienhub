import { describe, expect, it } from 'vitest';
import type { CalendarEvent, MealPlanEntry, Recipe } from '#lib/db/types.js';
import { expandEvents } from '#lib/features/calendar/expand.js';
import {
	cookingConflicts,
	prepareDay,
	quickerRecipes,
	swapCandidates,
	type ConflictInput
} from './cooking.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };
const TODAY = '2026-10-19';
const TZ = 'Europe/Berlin';

function entry(id: string, date: string, recipe = 'lasagne', extra: Partial<MealPlanEntry> = {}) {
	return {
		...base,
		id,
		household: 'h',
		date,
		slot: 'dinner',
		title: id,
		recipe_url: '',
		recipe,
		note: '',
		servings: 0,
		cooked: '',
		...extra
	} as MealPlanEntry;
}

function recipe(id: string, prep: number, extra: Partial<Recipe> = {}): Recipe {
	return {
		...base,
		id,
		household: 'h',
		title: id,
		servings: 4,
		instructions: '',
		tags: [],
		is_favorite: false,
		prep_minutes: prep,
		difficulty: 0,
		...extra
	} as Recipe;
}

function event(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}) {
	return {
		...base,
		id,
		household: 'h',
		title: id,
		start: new Date(start).toISOString(),
		end: new Date(end).toISOString(),
		all_day: false,
		location: '',
		rrule: '',
		exdates: [],
		reminder_minutes: 0,
		participants: [],
		...extra
	} as CalendarEvent;
}

function input(events: CalendarEvent[], over: Partial<ConflictInput> = {}): ConflictInput {
	return {
		today: TODAY,
		entries: [entry('mo', TODAY), entry('di', '2026-10-20'), entry('mi', '2026-10-21', 'nudeln')],
		recipes: [
			recipe('lasagne', 90),
			recipe('nudeln', 0),
			recipe('omelett', 15, { is_favorite: true }),
			recipe('salat', 10)
		],
		occurrences: expandEvents(events, TODAY, '2026-10-26', TZ),
		adults: ['anna', 'ben'],
		...over
	};
}

describe('Kochzeit gegen Termine', () => {
	it('findet Termine im Kochfenster (Lasagne 90 Min. vor 18:30)', () => {
		const list = cookingConflicts(
			input([event('training', '2026-10-20T16:00:00+02:00', '2026-10-20T17:45:00+02:00')])
		);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ from: '17:00', to: '18:30', minutes: 90, estimated: false });
		expect(list[0].entry.id).toBe('di');
		expect(list[0].freeMinutes).toBe(45);
	});

	it('ohne Zubereitungszeit gelten ca. 30 Minuten', () => {
		const list = cookingConflicts(
			input([event('elternabend', '2026-10-21T17:45:00+02:00', '2026-10-21T19:00:00+02:00')])
		);
		expect(list[0]).toMatchObject({ from: '18:00', estimated: true, freeMinutes: 0 });
	});

	it('Termine außerhalb, ganztägige und solche mit nur einem Erwachsenen blockieren nicht', () => {
		const list = cookingConflicts(
			input([
				event('früh', '2026-10-20T14:00:00+02:00', '2026-10-20T16:30:00+02:00'),
				event('geburtstag', '2026-10-20T00:00:00+02:00', '2026-10-21T00:00:00+02:00', {
					all_day: true
				}),
				event('anna allein', '2026-10-20T17:00:00+02:00', '2026-10-20T19:00:00+02:00', {
					participants: ['anna']
				})
			])
		);
		expect(list).toEqual([]);
	});

	it('beide Erwachsene beim Termin blockieren; Vergangenes heute zählt nicht', () => {
		const events = [
			event('beide', '2026-10-20T17:30:00+02:00', '2026-10-20T19:00:00+02:00', {
				participants: ['anna', 'ben', 'kind']
			}),
			event('heute', '2026-10-19T17:30:00+02:00', '2026-10-19T19:00:00+02:00')
		];
		expect(cookingConflicts(input(events)).map((c) => c.entry.id)).toEqual(['mo', 'di']);
		expect(cookingConflicts(input(events, { nowMinutes: 19 * 60 })).map((c) => c.entry.id)).toEqual(
			['di']
		);
	});

	it('Gekochtes und Einträge ohne Gericht werden übersprungen', () => {
		const list = cookingConflicts(
			input([event('abend', '2026-10-19T17:00:00+02:00', '2026-10-19T20:00:00+02:00')], {
				entries: [
					entry('mo', TODAY, 'lasagne', { cooked: 'yes' }),
					entry('leer', TODAY, '', { title: ' ' })
				]
			})
		);
		expect(list).toEqual([]);
	});
});

describe('Vorschläge', () => {
	const events = [event('training', '2026-10-20T16:00:00+02:00', '2026-10-20T17:45:00+02:00')];
	const data = input(events);
	const conflicts = cookingConflicts(data);
	const conflict = conflicts[0];

	it('tauschen mit einem freien Tag derselben Mahlzeit', () => {
		expect(swapCandidates(conflict, data.entries, conflicts, TODAY).map((e) => e.id)).toEqual([
			'mo',
			'mi'
		]);
	});

	it('schnellere Rezepte, die in die freie Zeit passen, Favoriten zuerst', () => {
		expect(quickerRecipes(conflict, data.recipes).map((r) => r.id)).toEqual(['omelett', 'salat']);
		expect(quickerRecipes({ ...conflict, freeMinutes: 5 }, data.recipes)).toEqual([]);
	});

	it('vorbereiten am Vortag, nicht in der Vergangenheit', () => {
		expect(prepareDay(conflict, TODAY)).toBe(TODAY);
		expect(prepareDay({ ...conflict, entry: entry('mo', TODAY) }, TODAY)).toBeNull();
	});
});
