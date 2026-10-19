import { describe, expect, it } from 'vitest';
import type {
	Ingredient,
	MealPlanEntry,
	Recipe,
	RecipeIngredient,
	ShoppingItem
} from '#lib/db/types.js';
import { buyFor, computeDemand, type DemandInput } from './demand.js';
import { computeStock, type PantryEntry, type Stock } from './stock.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };
const TODAY = '2026-10-19';
const NOW = new Date(`${TODAY}T12:00:00Z`);

function ingredient(id: string, unit = 'g', pack = 0): Ingredient {
	return {
		...base,
		id,
		household: 'h',
		name: id.charAt(0).toUpperCase() + id.slice(1),
		key: id,
		aliases: [],
		unit,
		category: 'Trockenware',
		pack_amount: pack
	};
}

function recipe(id: string, servings: number): Recipe {
	return {
		...base,
		id,
		household: 'h',
		title: id,
		servings,
		instructions: '',
		tags: [],
		is_favorite: false
	} as Recipe;
}

let rowCount = 0;
function row(recipe: string, ingredient: string, amount: number, unit: string, extra = {}) {
	rowCount += 1;
	return {
		...base,
		id: `row${rowCount}`,
		recipe,
		name: ingredient,
		amount,
		unit,
		category: '',
		sort: 0,
		ingredient,
		...extra
	} as RecipeIngredient;
}

function entry(id: string, date: string, recipe: string, extra: Partial<MealPlanEntry> = {}) {
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

function stock(amount: number | null, unit = 'g', daysAgo = 1): Stock {
	const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
	const entries: PantryEntry[] =
		amount === null ? [] : [{ id: 's1', kind: 'set', amount, unit, at }];
	return computeStock(entries, { unit, now: NOW });
}

function item(name: string, amount: number, unit: string, extra = {}): ShoppingItem {
	return {
		...base,
		id: `item-${name}`,
		household: 'h',
		name,
		amount,
		unit,
		category: '',
		checked: false,
		checked_at: '',
		added_by: '',
		checked_by: '',
		meal_plan_entry: '',
		...extra
	};
}

function input(over: Partial<DemandInput>): DemandInput {
	return {
		today: TODAY,
		entries: [],
		recipes: [],
		rows: [],
		ingredients: [],
		stocks: new Map(),
		openItems: [],
		...over
	};
}

describe('Bedarf aus dem Essensplan', () => {
	const ingredients = [
		ingredient('reis', 'g', 1000),
		ingredient('ei', 'Stück'),
		ingredient('milch', 'ml')
	];
	const recipes = [recipe('pfanne', 2), recipe('kuchen', 4)];
	const rows = [
		row('pfanne', 'reis', 250, 'g'),
		row('pfanne', 'ei', 2, 'Stück'),
		row('kuchen', 'milch', 0.5, 'l'),
		row('kuchen', 'reis', 1, 'kg')
	];

	it('rechnet Portionen um, fasst zusammen und vergleicht mit dem Vorrat', () => {
		const lines = computeDemand(
			input({
				entries: [
					entry('mo', TODAY, 'pfanne', { servings: 4 }),
					entry('mi', '2026-10-21', 'kuchen')
				],
				recipes,
				rows,
				ingredients,
				stocks: new Map([
					['reis', stock(300)],
					['ei', stock(10, 'Stück')],
					['milch', stock(null, 'ml')]
				])
			})
		);
		const byName = Object.fromEntries(lines.map((l) => [l.name, l]));
		// Reis: 500 g (4 statt 2 Portionen) + 1 kg = 1500 g, 300 g da → 1200 g fehlen → 2 Packungen.
		expect(byName.Reis).toMatchObject({
			needed: 1500,
			missing: 1200,
			status: 'missing',
			buy: { amount: 2000, unit: 'g', packs: 2 }
		});
		expect(byName.Reis.meals.map((m) => m.entry)).toEqual(['mo', 'mi']);
		expect(byName.Ei).toMatchObject({ needed: 4, status: 'covered', because: 'in_stock' });
		// Milch: Bestand unbekannt → bitte prüfen, Vorschlag = ganze Menge.
		expect(byName.Milch).toMatchObject({
			needed: 500,
			status: 'check',
			because: 'unknown_stock',
			buy: { amount: 500, unit: 'ml' }
		});
		expect(lines.map((l) => l.status)).toEqual(['missing', 'check', 'covered']);
	});

	it('nur die nächsten 7 Tage, ohne Gekochtes und Gelöschtes', () => {
		const lines = computeDemand(
			input({
				entries: [
					entry('gestern', '2026-10-18', 'pfanne'),
					entry('gekocht', TODAY, 'pfanne', { cooked: 'yes' }),
					entry('weg', TODAY, 'pfanne', { deleted_at: 'x' }),
					entry('später', '2026-10-26', 'pfanne'),
					entry('sonntag', '2026-10-25', 'kuchen')
				],
				recipes,
				rows,
				ingredients
			})
		);
		expect(lines.flatMap((l) => l.meals.map((m) => m.entry))).toEqual(['sonntag', 'sonntag']);
	});

	it('optionale Zutaten nur als Angebot, Pflicht-Zeilen gehen vor', () => {
		const lines = computeDemand(
			input({
				entries: [entry('mo', TODAY, 'salat')],
				recipes: [recipe('salat', 2)],
				rows: [
					row('salat', 'petersilie', 1, 'Bund', { optional: true }),
					row('salat', 'ei', 2, 'Stück'),
					row('salat', 'ei', 1, 'Stück', { optional: true })
				],
				ingredients: [ingredient('petersilie', 'Bund'), ingredient('ei', 'Stück')]
			})
		);
		const byName = Object.fromEntries(lines.map((l) => [l.name, l]));
		expect(byName.Petersilie.status).toBe('optional');
		expect(byName.Ei).toMatchObject({ needed: 2, status: 'check' });
	});

	it('offene Einkaufsartikel zählen mit; ohne Menge gilt die Zutat als eingeplant', () => {
		const make = (open: ShoppingItem[]) =>
			computeDemand(
				input({
					entries: [entry('mo', TODAY, 'pfanne')],
					recipes,
					rows,
					ingredients,
					stocks: new Map([
						['reis', stock(0)],
						['ei', stock(0, 'Stück')]
					]),
					openItems: open
				})
			);
		const partly = Object.fromEntries(
			make([item('Reis', 100, 'g'), item('Eier', 0, '')]).map((l) => [l.name, l])
		);
		expect(partly.Reis).toMatchObject({ missing: 150, status: 'missing' });
		expect(partly.Reis.onList?.name).toBe('Reis');
		expect(partly.Ei).toMatchObject({ status: 'covered', because: 'on_list' });

		const full = make([item('Reis', 1, 'kg', { ingredient: 'reis' })]);
		expect(full.find((l) => l.name === 'Reis')).toMatchObject({
			status: 'covered',
			because: 'on_list'
		});
	});

	it('nach Geschmack: nur wenn leer fehlt es, unbekannt → prüfen', () => {
		const lines = (status: Stock) =>
			computeDemand(
				input({
					entries: [entry('mo', TODAY, 'suppe')],
					recipes: [recipe('suppe', 2)],
					rows: [row('suppe', 'salz', 0, '', { amount_kind: 'to_taste' })],
					ingredients: [ingredient('salz', 'g')],
					stocks: new Map([['salz', status]])
				})
			)[0];
		expect(lines(stock(0)).status).toBe('missing');
		expect(lines(stock(null))).toMatchObject({ status: 'check', because: 'unknown_stock' });
		expect(lines(stock(500))).toMatchObject({ status: 'covered', because: 'in_stock' });
	});

	it('Zutaten ohne Basisartikel werden nach Namen zusammengefasst und geprüft', () => {
		const lines = computeDemand(
			input({
				entries: [entry('mo', TODAY, 'pfanne'), entry('di', '2026-10-20', 'pfanne')],
				recipes: [recipe('pfanne', 2)],
				rows: [row('pfanne', 'Tahini', 2, 'EL', { ingredient: '' })]
			})
		);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ name: 'Tahini', needed: 4, unit: 'EL', status: 'check' });
	});
});

describe('Packungen', () => {
	it('rundet auf ganze Packungen, wenn bekannt', () => {
		expect(buyFor(1200, 'g', { unit: 'g', pack_amount: 500 })).toEqual({
			amount: 1500,
			unit: 'g',
			packs: 3
		});
		expect(buyFor(1000, 'g', { unit: 'g', pack_amount: 500 })).toEqual({
			amount: 1000,
			unit: 'g',
			packs: 2
		});
		expect(buyFor(3, 'Stück', { unit: 'Stück', pack_amount: 0 })).toEqual({
			amount: 3,
			unit: 'Stück',
			packs: 0
		});
		expect(buyFor(0, 'g', null).amount).toBe(0);
	});
});
