import { describe, expect, it } from 'vitest';
import type { Ingredient, MealPlanEntry, RecipeIngredient } from '#lib/db/types.js';
import { neededSoon, pendingCooked, stockQuestions } from './questions.js';
import { computeStock } from './stock.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };
const TODAY = '2026-10-19';

function entry(id: string, date: string, extra: Partial<MealPlanEntry> = {}): MealPlanEntry {
	return {
		...base,
		id,
		household: 'h',
		date,
		slot: 'dinner',
		title: id,
		recipe_url: '',
		recipe: 'r1',
		note: '',
		servings: 0,
		cooked: '',
		...extra
	};
}

function row(recipe: string, ingredient: string, extra: Partial<RecipeIngredient> = {}) {
	return {
		...base,
		id: `${recipe}-${ingredient}`,
		recipe,
		name: ingredient,
		amount: 100,
		unit: 'g',
		category: '',
		sort: 0,
		ingredient,
		...extra
	} as RecipeIngredient;
}

function ingredient(id: string): Ingredient {
	return {
		...base,
		id,
		household: 'h',
		name: id,
		key: id,
		aliases: [],
		unit: 'g',
		category: '',
		pack_amount: 0
	};
}

describe('Gekocht? fragen', () => {
	it('nur vergangene Tage mit Rezept, ohne Antwort; neueste zuerst', () => {
		const list = pendingCooked(
			[
				entry('heute', TODAY),
				entry('gestern', '2026-10-18'),
				entry('mittag', '2026-10-18', { slot: 'lunch' }),
				entry('vorgestern', '2026-10-17'),
				entry('alt', '2026-10-10'),
				entry('beantwortet', '2026-10-18', { cooked: 'no' }),
				entry('ohne Rezept', '2026-10-18', { recipe: '' }),
				entry('gelöscht', '2026-10-18', { deleted_at: '2026-10-18T10:00:00Z' })
			],
			TODAY
		);
		expect(list.map((e) => e.id)).toEqual(['gestern', 'mittag', 'vorgestern']);
	});
});

describe('Vorratsfragen', () => {
	const entries = [
		entry('morgen', '2026-10-20', { recipe: 'r1' }),
		entry('bald', '2026-10-24', { recipe: 'r2' }),
		entry('später', '2026-11-10', { recipe: 'r3' })
	];
	const rows = [
		row('r1', 'reis'),
		row('r1', 'petersilie', { optional: true }),
		row('r2', 'reis'),
		row('r2', 'linsen'),
		row('r3', 'nudeln')
	];

	it('bald gebraucht: frühestes Datum, ohne optionale und spätere', () => {
		const needed = neededSoon(entries, rows, TODAY);
		expect(Object.fromEntries(needed)).toEqual({ reis: '2026-10-20', linsen: '2026-10-24' });
	});

	it('fragt nur Unsicheres, Dringendes zuerst, höchstens drei', () => {
		const now = new Date(`${TODAY}T12:00:00Z`);
		const items = ['reis', 'linsen', 'nudeln'].map(ingredient);
		const stocks = new Map([
			['reis', computeStock([], { unit: 'g', now })],
			[
				'linsen',
				computeStock([{ id: 'e1', kind: 'set', amount: 500, unit: 'g', at: now.toISOString() }], {
					unit: 'g',
					now
				})
			],
			['nudeln', computeStock([], { unit: 'g', now })]
		]);
		const needed = neededSoon(entries, rows, TODAY);
		expect(stockQuestions(items, stocks, needed).map((q) => q.ingredient.id)).toEqual(['reis']);
		expect(stockQuestions(items, stocks, needed, new Set(['reis']))).toEqual([]);
	});
});
