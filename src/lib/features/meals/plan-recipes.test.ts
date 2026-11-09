import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import { entriesWithoutRecipe, recipeIdFor, splitDish } from './plan.js';
import {
	addEntry,
	allEntries,
	linkPlannedRecipes,
	saveDishes,
	splitRecipe,
	updateEntry
} from './plan-store.js';
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

describe('Abendessen aus mehreren Gerichten', () => {
	it('splitDish trennt an Komma, Plus, & und an „und“, „mit“, „dazu“', () => {
		expect(splitDish('Schnitzel mit pommes und Salat')).toEqual(['Schnitzel', 'Pommes', 'Salat']);
		expect(splitDish('Fisch, Kartoffeln + Gurkensalat')).toEqual([
			'Fisch',
			'Kartoffeln',
			'Gurkensalat'
		]);
		expect(splitDish('Reis & Curry dazu Naan')).toEqual(['Reis', 'Curry', 'Naan']);
		expect(splitDish('Spaghetti Bolognese')).toEqual(['Spaghetti Bolognese']);
		expect(splitDish('Chili con Carne')).toEqual(['Chili con Carne']);
		expect(splitDish('Schmitts Mitternachtssuppe')).toEqual(['Schmitts Mitternachtssuppe']);
		expect(splitDish('Reis und reis')).toEqual(['Reis und reis']);
		expect(splitDish(' ')).toEqual(['']);
	});

	it('vorhandenes Rezept mit dem ganzen Titel bleibt ein Gericht', async () => {
		await ensureRecipe(H, 'Lasagne mit Spinat');
		expect(splitDish('lasagne mit spinat', await recipesOf(H))).toEqual(['lasagne mit spinat']);
	});

	it('aufgeteilt gespeichert: ein Eintrag und ein Rezept je Gericht in derselben Mahlzeit', async () => {
		await ensureRecipe(H, 'Salat');
		const title = 'Schnitzel mit Pommes und Salat';
		await saveDishes(
			H,
			undefined,
			form(title, { recipe_url: 'https://example.org/s' }),
			splitDish(title)
		);
		const entries = await allEntries(H);
		const rows = entries.map((e) => [e.title, e.slot, e.date, e.recipe_url]);
		expect(rows.sort()).toEqual([
			['Pommes', 'dinner', '2026-11-09', ''],
			['Salat', 'dinner', '2026-11-09', ''],
			['Schnitzel', 'dinner', '2026-11-09', 'https://example.org/s']
		]);
		const titles = (await recipesOf(H)).map((r) => r.title).sort();
		expect(titles).toEqual(['Pommes', 'Salat', 'Schnitzel']);
		expect(entries.every((e) => e.recipe)).toBe(true);
	});

	it('„Zusammen lassen“ speichert wie bisher ein Rezept', async () => {
		await saveDishes(H, undefined, form('Lasagne mit Spinat'), ['Lasagne mit Spinat']);
		expect((await recipesOf(H)).map((r) => r.title)).toEqual(['Lasagne mit Spinat']);
	});

	it('Nachtrag legt für zusammengesetzte Gerichte kein Sammelrezept an', async () => {
		await repo('meal_plan_entries').create({ ...form('Fisch mit Reis'), household: H });
		expect(await linkPlannedRecipes(H)).toBe(0);
		expect(await recipesOf(H)).toHaveLength(0);
	});

	it('leeres Sammelrezept aufteilen: Einträge je Gericht, Sammelrezept gelöscht', async () => {
		const combined = await ensureRecipe(H, 'Fisch mit Reis');
		for (const date of ['2026-11-02', '2026-11-09']) {
			await repo('meal_plan_entries').create({
				...form('Fisch mit Reis', { date, recipe: combined }),
				household: H,
				servings: 3,
				cooked: 'yes'
			});
		}
		await splitRecipe((await repo('recipes').get(combined))!);
		const recipes = await recipesOf(H);
		expect(recipes.find((r) => r.id === combined)?.deleted_at).toBeTruthy();
		const active = (await allEntries(H)).filter((e) => !e.deleted_at);
		expect(active).toHaveLength(4);
		expect(active.map((e) => e.title).sort()).toEqual(['Fisch', 'Fisch', 'Reis', 'Reis']);
		expect(active.every((e) => e.recipe && e.recipe !== combined && e.servings === 3)).toBe(true);
		expect(active.every((e) => e.cooked === 'yes')).toBe(true);
	});
});
