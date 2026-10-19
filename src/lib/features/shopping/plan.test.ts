import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import { saveRecipe } from '#lib/features/meals/store.js';
import { computeDemand } from '#lib/features/pantry/demand.js';
import { loadDemandInput } from '#lib/features/pantry/journal.js';
import { addFromPlan, addItem } from './store.js';

const H = 'household000001';
const MEMBER = 'membership00001';
const TODAY = '2026-10-19';

afterEach(async () => {
	await deleteLocalData();
});

async function planRisotto() {
	const recipe = await saveRecipe(
		H,
		null,
		{
			title: 'Risotto',
			servings: 2,
			tags: [],
			is_favorite: false,
			instructions: '',
			prep_minutes: 0,
			difficulty: 0
		},
		[
			{ name: 'Risottoreis', amount: 300, unit: 'g', category: '' },
			{ name: 'Parmesan', amount: 50, unit: 'g', category: '', optional: true }
		]
	);
	await repo('meal_plan_entries').create({
		household: H,
		date: '2026-10-21',
		slot: 'dinner',
		title: 'Risotto',
		recipe,
		servings: 4,
		cooked: ''
	});
}

describe('Fehlendes aus dem Essensplan auf die Liste', () => {
	it('legt neue Artikel mit Begründung und Basisartikel an', async () => {
		await planRisotto();
		const lines = computeDemand(await loadDemandInput(H, TODAY));
		const reis = lines.find((l) => l.name === 'Risottoreis');
		expect(reis).toMatchObject({ needed: 600, status: 'check' });

		expect(await addFromPlan(H, MEMBER, [reis!], [])).toBe(1);
		const [item] = await repo('shopping_items').table.toArray();
		expect(item).toMatchObject({
			name: 'Risottoreis',
			// 600 g, aufgerundet auf zwei 500-g-Packungen.
			amount: 1,
			unit: 'kg',
			ingredient: reis!.ingredient
		});
		expect(item.reason).toMatch(/^Für Risotto \(Mi\.?\)$/);
		expect(item.meal_plan_entry).not.toBe('');

		// Danach gilt die Zutat als eingeplant.
		const after = computeDemand(await loadDemandInput(H, TODAY));
		expect(after.find((l) => l.name === 'Risottoreis')).toMatchObject({
			status: 'covered',
			because: 'on_list'
		});
	});

	it('addiert zu einem offenen Artikel derselben Zutat', async () => {
		await planRisotto();
		await addItem(H, MEMBER, { name: 'Risottoreis', amount: 200, unit: 'g' }, []);
		const lines = computeDemand(await loadDemandInput(H, TODAY));
		const reis = lines.find((l) => l.name === 'Risottoreis')!;
		expect(reis.missing).toBe(400);
		await addFromPlan(H, MEMBER, [reis], []);
		const items = await repo('shopping_items').table.toArray();
		expect(items).toHaveLength(1);
		// 200 g + 400 g = 600 g → zwei Packungen.
		expect(items[0]).toMatchObject({ amount: 1, unit: 'kg' });
	});
});
