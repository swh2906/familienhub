import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import type { MealPlanEntry } from '#lib/db/types.js';
import type { CookingConflict } from './cooking.js';
import { prepareAhead, resetNever, respond, responsesOf, swapEntries } from './store.js';

const H = 'household000001';
const ME = 'membership00001';

afterEach(async () => {
	await deleteLocalData();
});

function plan(date: string, title: string) {
	return repo('meal_plan_entries').create({
		household: H,
		date,
		slot: 'dinner',
		title,
		recipe: '',
		servings: 0,
		cooked: ''
	});
}

describe('Antworten auf Hinweise', () => {
	it('eine Antwort je Person und Hinweis; erneute Antwort überschreibt', async () => {
		const now = new Date('2026-10-19T15:00:00');
		await respond(H, ME, 'conflict:a', 'later', now);
		await respond(H, ME, 'conflict:a', 'not_today', now);
		const list = await responsesOf(H, ME);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ key: 'conflict:a', response: 'not_today' });
		expect(new Date(list[0].until).getDate()).toBe(20);
	});

	it('„Nie wieder so“ lässt sich zurücknehmen', async () => {
		await respond(H, ME, 'kind:conflict', 'never');
		await respond(H, ME, 'cooked:b', 'done');
		expect(await resetNever(H, ME)).toBe(1);
		expect((await responsesOf(H, ME)).map((r) => r.key)).toEqual(['cooked:b']);
		// Erneut „Nie wieder so“ funktioniert danach wieder.
		await respond(H, ME, 'kind:conflict', 'never');
		expect(await responsesOf(H, ME)).toHaveLength(2);
	});
});

describe('Aktionen aus Kochzeit-Hinweisen', () => {
	it('tauschen die Tage zweier Planeinträge', async () => {
		const a = await plan('2026-10-20', 'Lasagne');
		const b = await plan('2026-10-22', 'Nudeln');
		await swapEntries(a, b);
		expect((await repo('meal_plan_entries').get(a.id))?.date).toBe('2026-10-22');
		expect((await repo('meal_plan_entries').get(b.id))?.date).toBe('2026-10-20');
	});

	it('legt eine Aufgabe zum Vorbereiten am Vortag an', async () => {
		const entry = (await plan('2026-10-20', 'Lasagne')) as MealPlanEntry;
		const conflict = {
			entry,
			recipe: null,
			minutes: 90,
			estimated: false,
			from: '17:00',
			to: '18:30',
			freeMinutes: 0,
			blocking: [{ event: { title: 'Training' }, startTime: '16:30', endTime: '18:00' }]
		} as unknown as CookingConflict;
		await prepareAhead(H, conflict, '2026-10-19');
		const [task] = await repo('tasks').table.toArray();
		expect(task).toMatchObject({
			title: 'Lasagne vorbereiten',
			due_date: '2026-10-19',
			notes: 'Am Kochtag ist Training von 16:30 bis 18:00.'
		});
	});
});
