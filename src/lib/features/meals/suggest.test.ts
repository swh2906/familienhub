import { describe, expect, it } from 'vitest';
import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
import {
	alternativeFor,
	distanceToPlanned,
	openDinnerDates,
	scoreRecipe,
	suggestWeek
} from './suggest.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function recipe(id: string, title: string, extra: Partial<Recipe> = {}): Recipe {
	return {
		...base,
		id,
		household: 'h',
		title,
		servings: 4,
		instructions: '',
		tags: [],
		is_favorite: false,
		...extra
	};
}

function entry(date: string, title: string, recipeId = ''): MealPlanEntry {
	return {
		...base,
		id: `${date}-${title}`,
		household: 'h',
		date,
		slot: 'dinner',
		title,
		recipe_url: '',
		recipe: recipeId,
		note: '',
		servings: 0,
		cooked: ''
	};
}

// Woche Mo 16.11. – So 22.11.2026
const week = { from: '2026-11-16', to: '2026-11-22' };
const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const first = () => 0;

describe('Woche vorschlagen', () => {
	it('kein Gericht doppelt, auch nicht, was schon in der Woche steht', () => {
		const recipes = ['A', 'B', 'C', 'D', 'E', 'F'].map((t) => recipe(t.toLowerCase(), t));
		const entries = [entry('2026-11-21', 'a')]; // per Titel, ohne Verknüpfung
		const result = suggestWeek({ dates: days, week, recipes, entries, random: Math.random });
		const ids = result.map((s) => s.recipe.id);
		expect(result).toHaveLength(5);
		expect(new Set(ids).size).toBe(5);
		expect(ids).not.toContain('a');
	});

	it('weniger Rezepte als Tage: nur so viele Vorschläge wie Rezepte', () => {
		const recipes = [recipe('a', 'A'), recipe('b', 'B', { deleted_at: '2026-01-01' })];
		const result = suggestWeek({ dates: days, week, recipes, entries: [], random: first });
		expect(result.map((s) => s.recipe.id)).toEqual(['a']);
	});

	it('kürzlich gegessen zählt weniger als lange nicht gegessen; Favoriten doppelt', () => {
		const r = recipe('a', 'A');
		expect(scoreRecipe(r, '2026-11-18', 3)).toBeLessThan(scoreRecipe(r, '2026-11-18', 10));
		expect(scoreRecipe(r, '2026-11-18', 10)).toBeLessThan(scoreRecipe(r, '2026-11-18', 40));
		expect(scoreRecipe(r, '2026-11-18', Infinity)).toBe(scoreRecipe(r, '2026-11-18', 28));
		const fav = recipe('b', 'B', { is_favorite: true });
		expect(scoreRecipe(fav, '2026-11-18', 40)).toBe(2 * scoreRecipe(r, '2026-11-18', 40));
	});

	it('unter der Woche schnelle Gerichte bevorzugt, am Wochenende nicht', () => {
		const quick = recipe('q', 'Q', { prep_minutes: 20 });
		const slow = recipe('s', 'S', { prep_minutes: 90 });
		expect(scoreRecipe(quick, '2026-11-18', 40)).toBeGreaterThan(
			scoreRecipe(slow, '2026-11-18', 40)
		);
		expect(scoreRecipe(quick, '2026-11-21', 40)).toBe(scoreRecipe(slow, '2026-11-21', 40));
	});

	it('Abstand zum nächsten geplanten Eintrag (verknüpft oder gleicher Titel)', () => {
		const r = recipe('a', 'Lasagne');
		const entries = [entry('2026-11-01', 'Irgendwas', 'a'), entry('2026-11-12', 'lasagne')];
		expect(distanceToPlanned(r, '2026-11-18', entries)).toBe(6);
		expect(distanceToPlanned(recipe('b', 'B'), '2026-11-18', entries)).toBe(Infinity);
	});

	it('gewichtete Auswahl folgt dem Zufallswert (stabil sortiert nach Titel)', () => {
		const recipes = [recipe('b', 'B'), recipe('a', 'A')];
		const low = suggestWeek({ dates: [days[0]], week, recipes, entries: [], random: () => 0 });
		const high = suggestWeek({ dates: [days[0]], week, recipes, entries: [], random: () => 0.99 });
		expect(low[0].recipe.id).toBe('a');
		expect(high[0].recipe.id).toBe('b');
	});

	it('anderes Gericht: keins aus der Woche; ohne weitere Rezepte undefined', () => {
		const recipes = [recipe('a', 'A'), recipe('b', 'B'), recipe('c', 'C')];
		const input = { dates: days.slice(0, 2), week, recipes, entries: [], random: first };
		const result = suggestWeek(input);
		expect(alternativeFor(result, 0, input)?.id).toBe('c');
		const full = [...result, { date: days[2], recipe: recipes[2] }];
		expect(alternativeFor(full, 0, input)).toBeUndefined();
	});
});

describe('freie Abende für den Vorschlag', () => {
	it('nur ab heute und nur Abende ohne Abendessen', () => {
		const lunch = { ...entry('2026-11-19', 'Brot'), slot: 'lunch' as const };
		const gone = { ...entry('2026-11-20', 'Alt'), deleted_at: '2026-11-01' };
		const entries = [entry('2026-11-18', 'Suppe'), lunch, gone];
		expect(openDinnerDates(days, entries, '2026-11-17')).toEqual([
			'2026-11-17',
			'2026-11-19',
			'2026-11-20'
		]);
		expect(openDinnerDates(days, [], '2026-11-23')).toEqual([]);
		expect(openDinnerDates(days, [], '2026-11-01')).toEqual(days);
	});
});
