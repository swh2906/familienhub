import { describe, expect, it } from 'vitest';
import type {
	CalendarEvent,
	Ingredient,
	MealPlanEntry,
	Recipe,
	RecipeIngredient
} from '#lib/db/types.js';
import { expandEvents } from '#lib/features/calendar/expand.js';
import { buildHints, type HintInput } from './build.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };
const TODAY = '2026-10-19';

const entries = [
	{
		...base,
		id: 'gestern',
		household: 'h',
		date: '2026-10-18',
		slot: 'dinner',
		title: 'Suppe',
		recipe_url: '',
		recipe: 'suppe',
		note: '',
		servings: 0,
		cooked: ''
	},
	{
		...base,
		id: 'morgen',
		household: 'h',
		date: '2026-10-20',
		slot: 'dinner',
		title: 'Lasagne',
		recipe_url: '',
		recipe: 'lasagne',
		note: '',
		servings: 0,
		cooked: ''
	}
] as MealPlanEntry[];
const recipes = [
	{ ...base, id: 'suppe', household: 'h', title: 'Suppe', servings: 2, prep_minutes: 20 },
	{ ...base, id: 'lasagne', household: 'h', title: 'Lasagne', servings: 4, prep_minutes: 90 }
] as Recipe[];
const rows = [
	{
		...base,
		id: 'r1',
		recipe: 'lasagne',
		name: 'Nudelplatten',
		amount: 250,
		unit: 'g',
		category: '',
		sort: 0,
		ingredient: 'platten'
	}
] as RecipeIngredient[];
const ingredients = [
	{
		...base,
		id: 'platten',
		household: 'h',
		name: 'Nudelplatten',
		key: 'nudelplatte',
		aliases: [],
		unit: 'g',
		category: '',
		pack_amount: 250
	}
] as Ingredient[];
const training = {
	...base,
	id: 'training',
	household: 'h',
	title: 'Training',
	start: new Date('2026-10-20T16:30:00+02:00').toISOString(),
	end: new Date('2026-10-20T18:00:00+02:00').toISOString(),
	all_day: false,
	location: '',
	rrule: '',
	exdates: [],
	reminder_minutes: 0,
	participants: []
} as unknown as CalendarEvent;

function input(canEdit: boolean): HintInput {
	return {
		today: TODAY,
		now: new Date(`${TODAY}T12:00:00Z`),
		canEdit,
		entries,
		recipes,
		rows,
		ingredients,
		pantryEvents: [],
		occurrences: expandEvents([training], TODAY, '2026-10-26', 'Europe/Berlin'),
		adults: [],
		openItems: []
	};
}

describe('Hinweise zusammenstellen', () => {
	it('Erwachsene: Konflikt, Vorratsfrage und Gekocht-Frage', () => {
		const hints = buildHints(input(true));
		expect(hints.map((h) => h.key).sort()).toEqual([
			'conflict:morgen',
			'cooked:gestern',
			'stock:platten'
		]);
		// Bestand unbekannt → Vorratsfrage statt Einkaufs-Hinweis (nur sicher Fehlendes).
		const conflict = hints.find((h) => h.kind === 'conflict');
		expect(conflict && conflict.kind === 'conflict' && conflict.prepareOn).toBe(TODAY);
	});

	it('bekannt leer: Einkaufs-Hinweis für morgen statt Vorratsfrage', () => {
		const hints = buildHints({
			...input(true),
			pantryEvents: [
				{
					...base,
					id: 'p1',
					household: 'h',
					ingredient: 'platten',
					kind: 'set',
					amount: 0,
					unit: 'g',
					at: `${TODAY}T08:00:00Z`,
					ref: '',
					source: 'manual'
				}
			]
		});
		const shopping = hints.find((h) => h.kind === 'shopping');
		expect(shopping?.key).toBe('shopping:2026-10-20');
		expect(shopping?.kind === 'shopping' && shopping.need.missing.map((l) => l.name)).toEqual([
			'Nudelplatten'
		]);
		expect(hints.some((h) => h.kind === 'stock')).toBe(false);
	});

	it('Kinder: nur Vorratsfragen', () => {
		expect(buildHints(input(false)).map((h) => h.kind)).toEqual(['stock']);
	});
});
