import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import { saveRecipe } from '#lib/features/meals/store.js';
import { addItem, toggleItem } from '#lib/features/shopping/store.js';
import { ingredientId, ingredientKey } from './catalog.js';
import { answerCooked, answerStock, eventsOf, stockMap } from './journal.js';
import { baseIngredientsOf } from './store.js';

const H = 'household000001';
const MEMBER = 'membership00001';
const mehl = ingredientId(H, ingredientKey('Mehl'));

afterEach(async () => {
	await deleteLocalData();
});

async function stockOf(id: string) {
	const stocks = stockMap(await baseIngredientsOf(H), await eventsOf(H));
	return stocks.get(id);
}

async function recipe() {
	return saveRecipe(
		H,
		null,
		{
			title: 'Streuselkuchen',
			servings: 4,
			tags: [],
			is_favorite: false,
			instructions: '',
			prep_minutes: 0,
			difficulty: 0
		},
		[
			{ name: 'Mehl', amount: 300, unit: 'g', category: '' },
			{ name: 'Weizenmehl', amount: 100, unit: 'g', category: '', note: 'für die Streusel' },
			{ name: 'Zimt', amount: 1, unit: 'TL', category: '', optional: true },
			{ name: 'Salz', amount: 0, unit: '', category: '' }
		]
	);
}

async function plan(recipeId: string, servings: number) {
	return repo('meal_plan_entries').create({
		household: H,
		date: '2026-10-18',
		slot: 'dinner',
		title: 'Streuselkuchen',
		recipe: recipeId,
		servings,
		cooked: ''
	});
}

describe('Kauf buchen', () => {
	it('Abhaken eines bekannten Artikels bucht den Kauf, wieder öffnen storniert', async () => {
		await recipe();
		await addItem(H, MEMBER, { name: 'Weizenmehl', amount: 1, unit: 'kg' }, []);
		const [item] = await repo('shopping_items').table.toArray();

		await toggleItem(item, MEMBER);
		expect((await stockOf(mehl))?.amount).toBe(1000);

		const checked = await repo('shopping_items').get(item.id);
		await toggleItem(checked!, MEMBER);
		expect((await stockOf(mehl))?.status).toBe('unknown');
		expect((await eventsOf(H)).map((e) => e.kind).sort()).toEqual(['purchase', 'undo']);
	});

	it('unbekannte Artikel (z. B. Spülmittel) buchen nichts', async () => {
		await addItem(H, MEMBER, { name: 'Spülmittel', amount: 0, unit: '' }, []);
		const [item] = await repo('shopping_items').table.toArray();
		await toggleItem(item, MEMBER);
		expect(await eventsOf(H)).toHaveLength(0);
	});

	it('ohne Menge zählt eine Packung', async () => {
		await recipe();
		await addItem(H, MEMBER, { name: 'Mehl', amount: 0, unit: '' }, []);
		const [item] = await repo('shopping_items').table.toArray();
		await toggleItem(item, MEMBER);
		// Mehl hat im Wörterbuch 1000 g je Packung.
		expect((await stockOf(mehl))?.amount).toBe(1000);
	});
});

describe('Gekocht buchen', () => {
	it('verbraucht Zutaten für die geplanten Portionen, ohne optionale und ohne Menge', async () => {
		const id = await recipe();
		await answerStock(H, (await repo('ingredients').get(mehl))!, (await stockOf(mehl))!, 'empty');
		const entry = await plan(id, 2);
		await answerCooked(H, entry, 'yes');

		const consumed = (await eventsOf(H)).filter((e) => e.kind === 'consume');
		// 300 g + 100 g Mehl für 4 Portionen → 200 g für 2, zusammengefasst.
		expect(consumed).toHaveLength(1);
		expect(consumed[0]).toMatchObject({ ingredient: mehl, amount: 200, unit: 'g' });
		expect((await repo('meal_plan_entries').get(entry.id))?.cooked).toBe('yes');

		// Zweite Bestätigung (z. B. anderes Gerät) bucht nicht doppelt.
		await answerCooked(H, entry, 'yes');
		expect((await eventsOf(H)).filter((e) => e.kind === 'consume')).toHaveLength(1);
	});

	it('„doch nicht gekocht“ storniert, erneutes „Ja“ bucht wieder', async () => {
		const id = await recipe();
		const entry = await plan(id, 4);
		await answerCooked(H, entry, 'yes');
		await answerCooked(H, entry, 'no');
		let events = await eventsOf(H);
		expect(events.filter((e) => e.kind === 'undo')).toHaveLength(1);

		await answerCooked(H, entry, 'yes');
		events = await eventsOf(H);
		expect(events.filter((e) => e.kind === 'consume')).toHaveLength(2);
		const stock = await stockOf(mehl);
		expect(stock?.weekly).toBeCloseTo(400 / 8);
	});
});

describe('Antworten im Vorrat', () => {
	it('„habe ich noch“, „ist alle“, „ungefähr die Hälfte“', async () => {
		await recipe();
		const item = (await repo('ingredients').get(mehl))!;
		await answerStock(H, item, (await stockOf(mehl))!, 'have');
		expect(await stockOf(mehl)).toMatchObject({ present: true, status: 'ok' });

		await answerStock(H, item, (await stockOf(mehl))!, 'half');
		expect((await stockOf(mehl))?.amount).toBe(500);

		await answerStock(H, item, (await stockOf(mehl))!, 'empty');
		expect((await stockOf(mehl))?.status).toBe('empty');
	});
});
