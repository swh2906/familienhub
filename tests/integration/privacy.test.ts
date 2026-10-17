// Schritt 10b: Konto löschen, Familienraum löschen, Aufräum-Job für alte gelöschte Einträge.
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createHousehold,
	createInvite,
	expectDenied,
	PASSWORD,
	redeem,
	signUp
} from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

let server: TestServer;
let counter = 0;

beforeAll(async () => {
	server = await startPocketBase();
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

const DAY_MS = 24 * 60 * 60 * 1000;

function pbDate(ms: number): string {
	return new Date(ms).toISOString().replace('T', ' ');
}

/** Admin mit eigenem Haushalt plus ein Erwachsener, der per Einladung beitritt. */
async function family() {
	counter += 1;
	const admin = await signUp(server.url, { email: `admin${counter}@p.test`, name: 'Julia' });
	const { household, membership } = await createHousehold(admin.pb, `Familie ${counter}`);
	const adult = await signUp(server.url, { email: `adult${counter}@p.test`, name: 'Tom' });
	const invite = await createInvite(admin.pb, household.id, 'adult');
	const joined = await redeem(adult.pb, { token: invite.token });
	return {
		admin,
		adult,
		household: household.id as string,
		householdName: household.name as string,
		adminMembership: membership.id as string,
		adultMembership: joined.membership.id as string
	};
}

function deleteAccount(pb: PocketBase, password: string) {
	return pb.send('/api/fh/account/delete', { method: 'POST', body: { password } });
}

function deleteHousehold(pb: PocketBase, household: string, name: string) {
	return pb.send('/api/fh/households/delete', { method: 'POST', body: { household, name } });
}

describe('Konto löschen', () => {
	it('verlangt das richtige Passwort', async () => {
		const f = await family();
		await expectDenied(deleteAccount(f.adult.pb, 'falsch'), [400]);
	});

	it('lässt die Mitgliedschaft als „Ehemaliges Mitglied“ stehen; Verweise bleiben', async () => {
		const f = await family();
		const item = await f.adult.pb
			.collection('shopping_items')
			.create({ household: f.household, name: 'Brot' });
		expect(item.added_by).toBe(f.adultMembership);

		await deleteAccount(f.adult.pb, PASSWORD);

		const membership = await f.admin.pb.collection('memberships').getOne(f.adultMembership);
		expect(membership.user).toBe('');
		expect(membership.display_name).toBe('');
		expect(membership.deleted_at).not.toBe('');
		const after = await f.admin.pb.collection('shopping_items').getOne(item.id);
		expect(after.added_by).toBe(f.adultMembership);
		expect(after.updated_by).toBe('');

		// Anmelden geht nicht mehr.
		const fresh = new PocketBase(server.url);
		await expectDenied(
			fresh.collection('users').authWithPassword(`adult${counter}@p.test`, PASSWORD)
		);
	});

	it('der letzte Admin muss erst übergeben oder den Familienraum löschen', async () => {
		const f = await family();
		const error = await expectDenied(deleteAccount(f.admin.pb, PASSWORD), [400]);
		expect(error.response.data).toMatchObject({ household: { code: 'last_admin' } });

		// Nach Übergabe der Admin-Rolle klappt es.
		await f.admin.pb.collection('memberships').update(f.adultMembership, { role: 'admin' });
		await deleteAccount(f.admin.pb, PASSWORD);
		const left = await f.adult.pb.collection('memberships').getOne(f.adminMembership);
		expect(left.deleted_at).not.toBe('');
	});

	it('Kinder können ihr Konto ebenfalls löschen', async () => {
		const f = await family();
		const child = await f.admin.pb.send('/api/fh/children', {
			method: 'POST',
			body: {
				household: f.household,
				username: `kind${counter}`,
				password: PASSWORD,
				display_name: 'Mia'
			}
		});
		const pb = new PocketBase(server.url);
		await pb.collection('users').authWithPassword(`kind${counter}`, PASSWORD);
		await deleteAccount(pb, PASSWORD);
		const membership = await f.admin.pb.collection('memberships').getOne(child.membership.id);
		expect(membership.deleted_at).not.toBe('');
	});
});

describe('Familienraum löschen', () => {
	it('nur Admins und nur mit dem richtigen Namen', async () => {
		const f = await family();
		await expectDenied(deleteHousehold(f.adult.pb, f.household, f.householdName), [403]);
		await expectDenied(deleteHousehold(f.admin.pb, f.household, 'Falscher Name'), [400]);
	});

	it('entfernt den Haushalt mit allen Daten, andere Haushalte bleiben', async () => {
		const f = await family();
		const other = await family();
		const otherItem = await other.admin.pb
			.collection('shopping_items')
			.create({ household: other.household, name: 'Milch' });

		const task = await f.admin.pb
			.collection('tasks')
			.create({ household: f.household, title: 'Müll', status: 'done' });
		await f.admin.pb.collection('task_completions').create({
			task: task.id,
			membership: f.adultMembership,
			completed_at: new Date().toISOString()
		});
		const recipe = await f.admin.pb
			.collection('recipes')
			.create({ household: f.household, title: 'Suppe', servings: 2 });
		await f.admin.pb.collection('recipe_ingredients').create({ recipe: recipe.id, name: 'Wasser' });
		await f.adult.pb.collection('shopping_items').create({ household: f.household, name: 'Brot' });
		await createInvite(f.admin.pb, f.household, 'adult');

		await deleteHousehold(f.admin.pb, f.household, ` ${f.householdName} `);

		await expectDenied(f.admin.pb.collection('households').getOne(f.household));
		expect(await f.adult.pb.collection('shopping_items').getFullList()).toEqual([]);
		expect(await f.admin.pb.collection('memberships').getFullList()).toEqual([]);
		expect((await other.admin.pb.collection('shopping_items').getOne(otherItem.id)).name).toBe(
			'Milch'
		);
	});
});

describe('Aufräum-Job', () => {
	it('löscht nur Einträge, die vor mehr als 30 Tagen gelöscht wurden', async () => {
		const f = await family();
		const items = f.admin.pb.collection('shopping_items');
		const old = await items.create({
			household: f.household,
			name: 'Alt',
			deleted_at: pbDate(Date.now() - 40 * DAY_MS)
		});
		const recent = await items.create({
			household: f.household,
			name: 'Neu gelöscht',
			deleted_at: pbDate(Date.now() - 10 * DAY_MS)
		});
		const alive = await items.create({ household: f.household, name: 'Aktiv' });
		const task = await f.admin.pb.collection('tasks').create({
			household: f.household,
			title: 'Alte Aufgabe',
			status: 'open',
			deleted_at: pbDate(Date.now() - 31 * DAY_MS)
		});

		// Nur Superuser.
		await expectDenied(f.admin.pb.send('/api/fh/purge', { method: 'POST' }), [401, 403]);

		const root = new PocketBase(server.url);
		await root
			.collection('_superusers')
			.authWithPassword(server.superuser.email, server.superuser.password);
		const removed = await root.send('/api/fh/purge', { method: 'POST' });
		expect(removed.shopping_items).toBeGreaterThanOrEqual(1);

		await expectDenied(items.getOne(old.id), [404]);
		await expectDenied(f.admin.pb.collection('tasks').getOne(task.id), [404]);
		expect((await items.getOne(recent.id)).name).toBe('Neu gelöscht');
		expect((await items.getOne(alive.id)).name).toBe('Aktiv');
		// Mitgliedschaften werden nie aufgeräumt.
		expect((await f.admin.pb.collection('memberships').getFullList()).length).toBe(2);
	});
});
