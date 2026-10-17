// Wochenplan-Felder aus Schritt 8: Gericht als Text und Link zum Rezept in einer anderen App.
import type PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHousehold, expectDenied, PASSWORD, signUp } from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

let server: TestServer;
let admin: PocketBase;
let child: PocketBase;
let household: string;

beforeAll(async () => {
	server = await startPocketBase();
	admin = (await signUp(server.url, { email: 'admin@plan.test', name: 'Julia' })).pb;
	household = (await createHousehold(admin, 'Familie Plan')).household.id;
	await admin.send('/api/fh/children', {
		method: 'POST',
		body: { household, username: 'leo', password: PASSWORD, display_name: 'Leo' }
	});
	const { default: PocketBaseClient } = await import('pocketbase');
	child = new PocketBaseClient(server.url);
	await child.collection('users').authWithPassword('leo', PASSWORD);
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

describe('Wochenplan-Einträge', () => {
	it('speichern Gericht und Link zum Rezept', async () => {
		const entry = await admin.collection('meal_plan_entries').create({
			household,
			date: '2026-10-12',
			slot: 'dinner',
			title: 'Gemüse-Lasagne',
			recipe_url: 'https://rezepte.example.de/lasagne'
		});
		expect(entry).toMatchObject({
			title: 'Gemüse-Lasagne',
			recipe_url: 'https://rezepte.example.de/lasagne'
		});
		expect((await child.collection('meal_plan_entries').getOne(entry.id)).title).toBe(
			'Gemüse-Lasagne'
		);
	});

	it('lehnen ungültige Links ab', async () => {
		for (const recipe_url of ['javascript:alert(1)', 'kein link']) {
			await expectDenied(
				admin.collection('meal_plan_entries').create({
					household,
					date: '2026-10-12',
					slot: 'lunch',
					title: 'Test',
					recipe_url
				}),
				[400]
			);
		}
	});

	it('Kinder planen nicht', async () => {
		await expectDenied(
			child
				.collection('meal_plan_entries')
				.create({ household, date: '2026-10-13', slot: 'lunch', title: 'Eis' })
		);
	});
});
