// Schritt 6: Kinder rücken wiederkehrende Aufgaben beim Abhaken weiter, einmalige nicht.
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHousehold, expectDenied, PASSWORD, signUp } from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

let server: TestServer;
let admin: PocketBase;
let child: PocketBase;
let household: string;
let childMembership: string;

beforeAll(async () => {
	server = await startPocketBase();
	admin = (await signUp(server.url, { email: 'admin@tasks.test', name: 'Julia' })).pb;
	household = (await createHousehold(admin, 'Familie Aufgaben')).household.id;
	const result = await admin.send('/api/fh/children', {
		method: 'POST',
		body: { household, username: 'tim', password: PASSWORD, display_name: 'Tim' }
	});
	childMembership = result.membership.id;
	child = new PocketBase(server.url);
	await child.collection('users').authWithPassword('tim', PASSWORD);
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

describe('Kinder und Fälligkeit', () => {
	it('dürfen eine eigene wiederkehrende Aufgabe weiterrücken', async () => {
		const task = await admin.collection('tasks').create({
			household,
			title: 'Zimmer aufräumen',
			due_date: '2026-10-17',
			rrule: 'FREQ=WEEKLY;BYDAY=SA',
			assignees: [childMembership]
		});
		const moved = await child.collection('tasks').update(task.id, { due_date: '2026-10-24' });
		expect(moved.due_date).toBe('2026-10-24');
	});

	it('dürfen das Datum einer einmaligen Aufgabe nicht ändern', async () => {
		const task = await admin.collection('tasks').create({
			household,
			title: 'Referat vorbereiten',
			due_date: '2026-10-20',
			assignees: [childMembership]
		});
		await expectDenied(child.collection('tasks').update(task.id, { due_date: '2026-11-30' }));
		const done = await child.collection('tasks').update(task.id, { status: 'done' });
		expect(done.status).toBe('done');
	});

	it('dürfen die Wiederholung selbst nicht ändern', async () => {
		const task = await admin.collection('tasks').create({
			household,
			title: 'Müll rausbringen',
			due_date: '2026-10-19',
			rrule: 'FREQ=WEEKLY;BYDAY=MO'
		});
		await expectDenied(child.collection('tasks').update(task.id, { rrule: '' }));
	});
});
