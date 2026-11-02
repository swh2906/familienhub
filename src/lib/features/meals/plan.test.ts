import { describe, expect, it } from 'vitest';
import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
import {
	dishSuggestions,
	groupEntries,
	matchRecipe,
	normalizeRecipeUrl,
	plannedSlots,
	slotKey,
	visibleSlots
} from './plan.js';
import {
	formatDay,
	formatWeekRange,
	fromDateString,
	isoWeek,
	mondayOf,
	mondayOfWeekKey,
	noon,
	shiftWeek,
	toDateString,
	weekDays,
	weekKey
} from './week.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function entry(
	id: string,
	date: string,
	slot: MealPlanEntry['slot'],
	title: string,
	extra: Partial<MealPlanEntry> = {}
): MealPlanEntry {
	return {
		...base,
		id,
		household: 'h',
		date,
		slot,
		title,
		recipe_url: '',
		recipe: '',
		note: '',
		servings: 0,
		cooked: '',
		...extra
	};
}

function recipe(title: string, extra: Partial<Recipe> = {}): Recipe {
	return {
		...base,
		id: title,
		household: 'h',
		title,
		servings: 4,
		instructions: '',
		tags: [],
		is_favorite: false,
		...extra
	};
}

describe('Kalenderwochen', () => {
	it.each([
		['2026-10-17', '2026-W42'],
		['2026-01-01', '2026-W01'],
		['2025-12-29', '2026-W01'], // Montag gehört schon zur KW 1 des Folgejahres
		['2021-01-03', '2020-W53'], // Sonntag gehört noch zur KW 53 des Vorjahres
		['2020-12-31', '2020-W53'],
		['2027-01-04', '2027-W01']
	])('%s liegt in %s', (date, key) => {
		expect(weekKey(fromDateString(date)!)).toBe(key);
	});

	it('Montag einer Woche, auch über die Zeitumstellung', () => {
		expect(toDateString(mondayOf(noon(2026, 10, 25)))).toBe('2026-10-19'); // Sonntag der Umstellung
		expect(toDateString(mondayOf(noon(2026, 3, 30)))).toBe('2026-03-30');
		expect(weekDays(mondayOf(noon(2026, 10, 25)))).toEqual([
			'2026-10-19',
			'2026-10-20',
			'2026-10-21',
			'2026-10-22',
			'2026-10-23',
			'2026-10-24',
			'2026-10-25'
		]);
	});

	it('Wochen-Schlüssel lesen und blättern', () => {
		expect(toDateString(mondayOfWeekKey('2026-W42')!)).toBe('2026-10-12');
		expect(toDateString(mondayOfWeekKey('2020-W53')!)).toBe('2020-12-28');
		// 2026 beginnt an einem Donnerstag und hat daher 53 Wochen, 2027 nur 52.
		expect(toDateString(mondayOfWeekKey('2026-W53')!)).toBe('2026-12-28');
		expect(mondayOfWeekKey('2027-W53')).toBeNull();
		expect(mondayOfWeekKey('quatsch')).toBeNull();
		expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
		expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
		expect(isoWeek(noon(2026, 10, 17))).toEqual({ year: 2026, week: 42 });
	});

	it('Datumstexte prüfen und deutsch formatieren', () => {
		expect(fromDateString('2026-02-30')).toBeNull();
		expect(formatDay('2026-10-12')).toBe('Montag, 12. Oktober');
		expect(formatWeekRange(mondayOfWeekKey('2026-W42')!)).toBe('12. Okt. – 18. Okt.');
	});
});

describe('groupEntries', () => {
	it('gruppiert aktive Einträge der Woche nach Tag und Mahlzeit', () => {
		const days = ['2026-10-12', '2026-10-13'];
		const groups = groupEntries(
			[
				entry('b', '2026-10-12', 'dinner', 'Pizza', { created: '2026-10-10 10:00:00.000Z' }),
				entry('a', '2026-10-12', 'dinner', 'Salat', { created: '2026-10-10 09:00:00.000Z' }),
				entry('c', '2026-10-12', 'dinner', 'Neu (lokal)'),
				entry('d', '2026-10-13', 'lunch', 'Weg', { deleted_at: 'x' }),
				entry('e', '2026-10-20', 'lunch', 'Andere Woche')
			],
			days
		);
		expect(groups.get(slotKey('2026-10-12', 'dinner'))?.map((e) => e.title)).toEqual([
			'Salat',
			'Pizza',
			'Neu (lokal)'
		]);
		expect(groups.has(slotKey('2026-10-13', 'lunch'))).toBe(false);
		expect(groups.size).toBe(1);
	});
});

describe('Geplante Mahlzeiten', () => {
	it('leer oder unbekannt: alle drei, sonst in fester Reihenfolge', () => {
		expect(plannedSlots(undefined)).toEqual(['breakfast', 'lunch', 'dinner']);
		expect(plannedSlots([])).toEqual(['breakfast', 'lunch', 'dinner']);
		expect(plannedSlots(['snack'])).toEqual(['breakfast', 'lunch', 'dinner']);
		expect(plannedSlots(['dinner', 'breakfast'])).toEqual(['breakfast', 'dinner']);
	});

	it('ausgeblendete Mahlzeit mit Einträgen bleibt sichtbar', () => {
		const days = ['2026-10-12', '2026-10-13'];
		const groups = groupEntries([entry('a', '2026-10-13', 'lunch', 'Reste')], days);
		expect(visibleSlots(['dinner'], groups, days)).toEqual(['lunch', 'dinner']);
		expect(visibleSlots(['dinner'], new Map(), days)).toEqual(['dinner']);
	});
});

describe('normalizeRecipeUrl', () => {
	it.each([
		['', ''],
		['  https://rezepte.example.de/lasagne ', 'https://rezepte.example.de/lasagne'],
		['rezepte.example.de/lasagne', 'https://rezepte.example.de/lasagne'],
		['http://192.168.1.20:3000/r/5', 'http://192.168.1.20:3000/r/5'],
		['http://localhost:8080/r/1', 'http://localhost:8080/r/1']
	])('„%s“ → „%s“', (input, expected) => {
		expect(normalizeRecipeUrl(input)).toBe(expected);
	});

	it.each([
		'javascript:alert(1)',
		'data:text/html,hi',
		'ftp://example.de/x',
		'nur text',
		'http://'
	])('lehnt „%s“ ab', (input) => {
		expect(normalizeRecipeUrl(input)).toBeNull();
	});
});

describe('Vorschläge und Rezept-Zuordnung', () => {
	it('häufig geplante Gerichte zuerst, dann Rezepte, ohne Doppelte', () => {
		const entries = [
			entry('1', '2026-10-12', 'dinner', 'Pizza'),
			entry('2', '2026-10-13', 'dinner', 'pizza'),
			entry('3', '2026-10-14', 'dinner', 'Curry'),
			entry('4', '2026-10-15', 'dinner', 'Alt', { deleted_at: 'x' })
		];
		expect(dishSuggestions(entries, [recipe('Apfelkuchen'), recipe('Curry')])).toEqual([
			'Pizza',
			'Curry',
			'Apfelkuchen'
		]);
	});

	it('ordnet ein Gericht einem gleichnamigen Rezept zu', () => {
		const recipes = [recipe('Gemüse-Lasagne'), recipe('Gelöscht', { deleted_at: 'x' })];
		expect(matchRecipe(' gemüse-lasagne ', recipes)?.title).toBe('Gemüse-Lasagne');
		expect(matchRecipe('Gelöscht', recipes)).toBeUndefined();
		expect(matchRecipe('', recipes)).toBeUndefined();
	});
});
