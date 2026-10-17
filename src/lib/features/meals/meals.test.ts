import { describe, expect, it } from 'vitest';
import type { Recipe, RecipeIngredient } from '#lib/db/types.js';
import { formatAmount, parseAmount, scaleAmount } from './amounts.js';
import { parseIngredientLine, parseIngredientText } from './paste.js';
import { availableTags, cleanTags, diffIngredients, filterRecipes } from './recipes.js';

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

function ingredient(
	id: string,
	recipeId: string,
	name: string,
	extra: Partial<RecipeIngredient> = {}
): RecipeIngredient {
	return {
		...base,
		id,
		recipe: recipeId,
		name,
		amount: 0,
		unit: '',
		category: '',
		sort: 0,
		...extra
	};
}

describe('parseAmount', () => {
	it.each([
		['0,5', 0.5],
		['1.5', 1.5],
		['1/2', 0.5],
		['½', 0.5],
		['1 ½', 1.5],
		['1½', 1.5],
		['2-3', 2],
		['', 0],
		['viel', 0],
		['-1', 0]
	])('%s → %s', (input, expected) => {
		expect(parseAmount(input)).toBeCloseTo(expected);
	});
});

describe('formatAmount und scaleAmount', () => {
	it('formatiert deutsch, leer bei 0', () => {
		expect(formatAmount(0.5)).toBe('0,5');
		expect(formatAmount(1250)).toBe('1.250');
		expect(formatAmount(1 / 3)).toBe('0,33');
		expect(formatAmount(0)).toBe('');
	});

	it('rechnet für andere Portionen um', () => {
		expect(scaleAmount(300, 4, 6)).toBe(450);
		expect(scaleAmount(1, 3, 2)).toBe(0.67);
		expect(scaleAmount(0, 4, 8)).toBe(0);
		expect(scaleAmount(200, 0, 4)).toBe(200);
	});
});

describe('Tags', () => {
	it('bereinigt und entfernt Doppelte ohne Groß-/Kleinschreibung', () => {
		expect(cleanTags([' Schnell ', 'schnell', '', 'Ofen'])).toEqual(['Schnell', 'Ofen']);
	});

	it('zeigt Vorschläge zuerst, dann benutzte Tags alphabetisch', () => {
		const recipes = [
			recipe('a', 'A', { tags: ['Ofen', 'vegetarisch'] }),
			recipe('b', 'B', { tags: ['Asiatisch'] })
		];
		expect(availableTags(recipes)).toEqual([
			'vegetarisch',
			'schnell',
			'günstig',
			'Reste',
			'Asiatisch',
			'Ofen'
		]);
	});
});

describe('filterRecipes', () => {
	const recipes = [
		recipe('lasagne', 'Gemüse-Lasagne', { tags: ['vegetarisch'] }),
		recipe('spaetzle', 'Käsespätzle', { tags: ['schnell'], is_favorite: true }),
		recipe('curry', 'Curry'),
		recipe('alt', 'Altes Rezept', { deleted_at: '2026-01-01' })
	];
	const ingredients = [
		ingredient('i1', 'curry', 'Kokosmilch'),
		ingredient('i2', 'lasagne', 'Zucchini'),
		ingredient('i3', 'curry', 'Zucchini', { deleted_at: 'x' })
	];

	it('Favoriten zuerst, sonst alphabetisch, ohne gelöschte', () => {
		expect(filterRecipes(recipes, ingredients, { query: '', tag: null }).map((r) => r.id)).toEqual([
			'spaetzle',
			'curry',
			'lasagne'
		]);
	});

	it('sucht in Titel, Tags und Zutaten, ohne Umlaut-Empfindlichkeit', () => {
		const find = (query: string) =>
			filterRecipes(recipes, ingredients, { query, tag: null }).map((r) => r.id);
		expect(find('spatzle')).toEqual(['spaetzle']);
		expect(find('kokos')).toEqual(['curry']);
		expect(find('zucchini')).toEqual(['lasagne']); // gelöschte Zutat zählt nicht
		expect(find('VEGETARISCH')).toEqual(['lasagne']);
		expect(find('gemüse lasagne')).toEqual(['lasagne']);
	});

	it('filtert nach Tag', () => {
		expect(
			filterRecipes(recipes, ingredients, { query: '', tag: 'Schnell' }).map((r) => r.id)
		).toEqual(['spaetzle']);
	});
});

describe('diffIngredients', () => {
	const existing = [
		ingredient('mehl', 'r', 'Mehl', { amount: 300, unit: 'g', sort: 0 }),
		ingredient('eier', 'r', 'Eier', { amount: 3, sort: 1 }),
		ingredient('weg', 'r', 'Schon gelöscht', { deleted_at: 'x' })
	];

	it('erkennt neue, geänderte und entfernte Zutaten', () => {
		const changes = diffIngredients(existing, [
			{ id: 'eier', name: 'Eier', amount: 4, unit: '', category: '' },
			{ name: 'Milch', amount: 0.5, unit: 'l', category: 'Kühlregal' },
			{ name: '   ', amount: 0, unit: '', category: '' }
		]);
		expect(changes.create).toEqual([
			{ name: 'Milch', amount: 0.5, unit: 'l', category: 'Kühlregal', sort: 1 }
		]);
		expect(changes.update).toEqual([{ id: 'eier', changes: { amount: 4, sort: 0 } }]);
		expect(changes.remove).toEqual(['mehl']);
	});

	it('meldet nichts, wenn sich nichts geändert hat', () => {
		const changes = diffIngredients(existing, [
			{ id: 'mehl', name: 'Mehl', amount: 300, unit: 'g', category: '' },
			{ id: 'eier', name: ' Eier ', amount: 3, unit: '', category: '' }
		]);
		expect(changes).toEqual({ create: [], update: [], remove: [] });
	});
});

describe('Zutaten aus Text', () => {
	it.each([
		['300 g Mehl', { name: 'Mehl', amount: 300, unit: 'g' }],
		['2 EL Olivenöl', { name: 'Olivenöl', amount: 2, unit: 'EL' }],
		['1/2 TL Salz', { name: 'Salz', amount: 0.5, unit: 'TL' }],
		['½ Liter Milch', { name: 'Milch', amount: 0.5, unit: 'l' }],
		['3 Eier', { name: 'Eier', amount: 3, unit: '' }],
		['1 Zwiebel', { name: 'Zwiebel', amount: 1, unit: '' }],
		['2 Zehen Knoblauch', { name: 'Knoblauch', amount: 2, unit: 'Zehe' }],
		['- 1 Pck. Backpulver', { name: 'Backpulver', amount: 1, unit: 'Packung' }],
		['• 200 gr. Zucker', { name: 'Zucker', amount: 200, unit: 'g' }],
		['2-3 Tomaten', { name: 'Tomaten', amount: 2, unit: '' }],
		[
			'1,5 kg Kartoffeln, festkochend',
			{ name: 'Kartoffeln, festkochend', amount: 1.5, unit: 'kg' }
		],
		['Salz und Pfeffer', { name: 'Salz und Pfeffer', amount: 0, unit: '' }],
		['1. 250 ml Sahne', { name: 'Sahne', amount: 250, unit: 'ml' }]
	])('„%s“', (line, expected) => {
		expect(parseIngredientLine(line)).toEqual({ ...expected, category: '' });
	});

	it('überspringt leere Zeilen und Überschriften', () => {
		const text = 'Für den Teig:\n300 g Mehl\n\n  \nFür die Füllung:\n2 Äpfel\r\n';
		expect(parseIngredientText(text).map((d) => d.name)).toEqual(['Mehl', 'Äpfel']);
	});
});
