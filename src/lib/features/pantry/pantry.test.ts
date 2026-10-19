import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData, getDb } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import { saveRecipe } from '#lib/features/meals/store.js';
import { linkExistingIngredients } from './backfill.js';
import { ingredientId, ingredientKey } from './catalog.js';
import { baseIngredientsOf, ensureIngredients } from './store.js';

const H = 'household000001';
const form = {
	title: 'Pizza',
	servings: 4,
	tags: [],
	is_favorite: false,
	instructions: '',
	prep_minutes: 0,
	difficulty: 0
};

afterEach(async () => {
	await deleteLocalData();
});

describe('Basisartikel speichern', () => {
	it('legt fehlende Artikel mit fester ID an und nutzt vorhandene', async () => {
		const first = await ensureIngredients(H, ['Weizenmehl Typ 405', 'Mehl', 'Tahini']);
		const mehl = ingredientId(H, ingredientKey('Mehl'));
		expect(first.get('Weizenmehl Typ 405')).toBe(mehl);
		expect(first.get('Mehl')).toBe(mehl);
		const list = await baseIngredientsOf(H);
		expect(list.map((i) => i.name).sort()).toEqual(['Mehl', 'Tahini']);
		expect(list.find((i) => i.name === 'Mehl')).toMatchObject({ unit: 'g', pack_amount: 1000 });

		// Zweiter Durchlauf legt nichts doppelt an.
		await ensureIngredients(H, ['Mehl 405']);
		expect(await baseIngredientsOf(H)).toHaveLength(2);
	});

	it('Rezept speichern verknüpft Zutaten und speichert Zusatzangaben', async () => {
		const id = await saveRecipe(H, null, form, [
			{
				name: 'Mehl',
				amount: 500,
				unit: 'g',
				category: '',
				alternatives: ['Dinkelmehl'],
				amount_kind: 'exact'
			},
			{ name: 'Petersilie', amount: 0, unit: '', category: '', optional: true }
		]);
		const rows = await repo('recipe_ingredients').table.where('recipe').equals(id).toArray();
		const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
		expect(byName.Mehl).toMatchObject({
			ingredient: ingredientId(H, 'mehl'),
			alternatives: ['Dinkelmehl']
		});
		expect(byName.Petersilie).toMatchObject({ optional: true, amount_kind: 'exact' });
	});

	it('ordnet bestehende Zeilen ohne Basisartikel nachträglich zu', async () => {
		const recipe = await repo('recipes').create({
			household: H,
			title: 'Alt',
			servings: 2,
			instructions: '',
			tags: [],
			is_favorite: false
		});
		await repo('recipe_ingredients').create({
			recipe: recipe.id,
			name: 'Kartoffeln',
			amount: 1,
			unit: 'kg',
			category: '',
			sort: 0
		});
		expect(await linkExistingIngredients(H)).toBe(1);
		const [row] = await repo('recipe_ingredients').table.toArray();
		expect(row.ingredient).toBe(ingredientId(H, ingredientKey('Kartoffel')));
		expect(await linkExistingIngredients(H)).toBe(0);
		expect(getDb().isOpen()).toBe(true);
	});
});
