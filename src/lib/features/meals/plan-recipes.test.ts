import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import { entriesWithoutRecipe, recipeIdFor } from './plan.js';
import { addEntry, allEntries, linkPlannedRecipes, updateEntry } from './plan-store.js';
import { isIncomplete } from './recipes.js';
import { ensureRecipe, recipesOf } from './store.js';

const H = 'household000001';

afterEach(async () => {
	await deleteLocalData();
});

const form = (title: string, extra = {}) => ({
	date: '2026-11-09',
	slot: 'dinner' as const,
	title,
	recipe_url: '',
	recipe: '',
	...extra
});

describe('Rezepte aus dem Wochenplan', () => {
	it('feste ID: gleicher Titel (ohne Groß-/Kleinschreibung) → gleiche ID, je Familie verschieden', () => {
		expect(recipeIdFor(H, 'Lasagne')).toBe(recipeIdFor(H, ' lasagne'));
		expect(recipeIdFor(H, 'Lasagne')).not.toBe(recipeIdFor('household000002', 'Lasagne'));
		expect(recipeIdFor(H, 'Lasagne')).toMatch(/^[a-z0-9]{15}$/);
	});

	it('neues Gericht wird einmalig als Rezept angelegt und verknüpft', async () => {
		await addEntry(H, form('Lasagne', { recipe_url: 'https://example.org/lasagne' }));
		await addEntry(H, form('lasagne', { date: '2026-11-10' }));
		const recipes = await recipesOf(H);
		expect(recipes).toHaveLength(1);
		expect(recipes[0]).toMatchObject({
			id: recipeIdFor(H, 'Lasagne'),
			title: 'Lasagne',
			source_url: 'https://example.org/lasagne'
		});
		const entries = await allEntries(H);
		expect(entries.every((e) => e.recipe === recipes[0].id)).toBe(true);
	});

	it('vorhandenes Rezept mit gleichem Titel wird verwendet, kein neues', async () => {
		const existing = await repo('recipes').create({ household: H, title: 'Pizza', servings: 2 });
		expect(await ensureRecipe(H, 'pizza')).toBe(existing.id);
		expect(await recipesOf(H)).toHaveLength(1);
	});

	it('gelöschtes Rezept zum Gericht wird wiederhergestellt statt doppelt angelegt', async () => {
		const id = await ensureRecipe(H, 'Suppe');
		await repo('recipes').remove(id);
		expect(await ensureRecipe(H, 'Suppe')).toBe(id);
		expect((await repo('recipes').get(id))?.deleted_at).toBe('');
	});

	it('Umbenennen im Plan legt ein neues Rezept an, das alte bleibt', async () => {
		await addEntry(H, form('Curry'));
		const [entry] = await allEntries(H);
		await updateEntry(entry, form('Linsencurry'));
		const titles = (await recipesOf(H)).map((r) => r.title).sort();
		expect(titles).toEqual(['Curry', 'Linsencurry']);
		expect((await allEntries(H))[0].recipe).toBe(recipeIdFor(H, 'Linsencurry'));
	});

	it('unverändertes Gericht behält die Verknüpfung, auch wenn das Rezept umbenannt wurde', async () => {
		await addEntry(H, form('Lasagne'));
		const [entry] = await allEntries(H);
		await repo('recipes').update(entry.recipe, { title: 'Gemüse-Lasagne' });
		await updateEntry(entry, form('Lasagne', { date: '2026-11-11' }));
		expect(await recipesOf(H)).toHaveLength(1);
		expect((await allEntries(H))[0]).toMatchObject({ recipe: entry.recipe, date: '2026-11-11' });
	});

	it('einmalige Übernahme verknüpft alte Einträge ohne Rezept, danach nichts mehr zu tun', async () => {
		for (const [date, title] of [
			['2026-11-01', 'Pfannkuchen'],
			['2026-11-02', 'pfannkuchen'],
			['2026-11-03', 'Reste']
		]) {
			await repo('meal_plan_entries').create({
				household: H,
				date,
				slot: 'dinner',
				title,
				recipe: ''
			});
		}
		expect(await linkPlannedRecipes(H)).toBe(3);
		expect(await recipesOf(H)).toHaveLength(2);
		expect(entriesWithoutRecipe(await allEntries(H))).toHaveLength(0);
		expect(await linkPlannedRecipes(H)).toBe(0);
	});

	it('Rezept ohne Zutaten und Zubereitung gilt als unvollständig', async () => {
		const id = await ensureRecipe(H, 'Chili');
		const recipe = (await repo('recipes').get(id))!;
		expect(isIncomplete(recipe, 0)).toBe(true);
		expect(isIncomplete(recipe, 2)).toBe(false);
		expect(isIncomplete({ ...recipe, instructions: 'Kochen.' }, 0)).toBe(false);
	});
});
