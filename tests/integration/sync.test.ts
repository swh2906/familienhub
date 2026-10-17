// Sync-Engine gegen ein echtes PocketBase: zwei Geräte (eigene lokale Datenbank) derselben Familie.
// Live-Updates (Realtime) prüft der E2E-Test im Browser; hier geht es um Push, Pull, Merge und Rechte.
import 'fake-indexeddb/auto';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FamilyDb } from '#lib/db/database.js';
import { Repository } from '#lib/db/repository.js';
import { SyncEngine, type SyncNotice } from '#lib/sync/engine.js';
import { PocketBaseRemote } from '#lib/sync/pocketbase-remote.js';
import { RemoteError } from '#lib/sync/remote.js';
import { createHousehold, PASSWORD, signUp } from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

interface Device {
	pb: PocketBase;
	db: FamilyDb;
	engine: SyncEngine;
	notices: SyncNotice[];
	items: Repository<'shopping_items'>;
}

let server: TestServer;
let household: string;
let adminMembership: string;
let childMembership: string;
let admin: Device;
let child: Device;

function device(pb: PocketBase, name: string): Device {
	const db = new FamilyDb(`sync-${name}`);
	const notices: SyncNotice[] = [];
	const engine = new SyncEngine(db, new PocketBaseRemote(pb), household, {
		onRejected: (notice) => notices.push(notice)
	});
	return { pb, db, engine, notices, items: new Repository(db, 'shopping_items') };
}

beforeAll(async () => {
	server = await startPocketBase();
	const adminAccount = await signUp(server.url, { email: 'admin@sync.test', name: 'Julia' });
	const created = await createHousehold(adminAccount.pb, 'Familie Sync');
	household = created.household.id;
	adminMembership = created.membership.id;

	const result = await adminAccount.pb.send('/api/fh/children', {
		method: 'POST',
		body: { household, username: 'mia', password: PASSWORD, display_name: 'Mia' }
	});
	childMembership = result.membership.id;
	const childPb = new PocketBase(server.url);
	childPb.autoCancellation(false);
	await childPb.collection('users').authWithPassword('mia', PASSWORD);

	admin = device(adminAccount.pb, 'admin');
	child = device(childPb, 'child');
}, 60_000);

afterAll(async () => {
	for (const d of [admin, child]) {
		d?.db.close();
		await d?.db.delete();
	}
	await server?.stop();
});

describe('Sync gegen PocketBase', () => {
	it('erster Abgleich holt Haushalt und Mitglieder', async () => {
		await child.engine.pull();
		expect((await child.db.households.get(household))?.name).toBe('Familie Sync');
		expect((await child.db.memberships.toArray()).map((m) => m.id).sort()).toEqual(
			[adminMembership, childMembership].sort()
		);
	});

	it('Anlegen auf Gerät A erscheint nach Push und Pull auf Gerät B, mit Server-Feldern', async () => {
		const item = await admin.items.create({ household, name: 'Milch', amount: 2, unit: 'l' });
		expect(await admin.engine.push()).toBe('done');

		const local = await admin.items.get(item.id);
		expect(local).toMatchObject({ added_by: adminMembership, deleted_at: '' });
		expect(local?.updated).not.toBe('');

		await child.engine.pull();
		expect(await child.items.get(item.id)).toMatchObject({ name: 'Milch', amount: 2 });
	});

	it('Kind hakt ab, der Server setzt checked_by; Gerät A sieht es', async () => {
		const [item] = await child.items.table.where('household').equals(household).toArray();
		await child.items.update(item.id, { checked: true });
		expect(await child.engine.push()).toBe('done');

		await admin.engine.pull();
		const seen = await admin.items.get(item.id);
		expect(seen).toMatchObject({ checked: true, checked_by: childMembership });
		expect(seen?.checked_at).not.toBe('');
	});

	it('abgelehnte Änderung (Kind benennt fremden Artikel um) wird zurückgesetzt', async () => {
		const [item] = await child.items.table.where('household').equals(household).toArray();
		await child.items.update(item.id, { name: 'Schokomilch' });
		expect((await child.items.get(item.id))?.name).toBe('Schokomilch');

		expect(await child.engine.push()).toBe('done');
		expect((await child.items.get(item.id))?.name).toBe('Milch');
		expect(child.notices).toMatchObject([{ recordId: item.id, op: 'update' }]);
		expect(await child.db.outbox.count()).toBe(0);
	});

	it('Feld-Merge: gleichzeitige Änderungen an verschiedenen Feldern bleiben beide erhalten', async () => {
		const item = await admin.items.create({ household, name: 'Brot', amount: 1 });
		await admin.engine.push();
		await child.engine.pull();

		// Gerät A ändert offline die Menge, Gerät B (Kind, eigener Artikel nicht nötig) hakt ab.
		await admin.items.update(item.id, { amount: 2 });
		await child.items.update(item.id, { checked: true });
		await child.engine.push();
		await admin.engine.pull(); // Serverstand mit checked kommt an, lokale Menge bleibt ausstehend
		expect(await admin.items.get(item.id)).toMatchObject({ amount: 2, checked: true });

		await admin.engine.push();
		const server = await admin.pb.collection('shopping_items').getOne(item.id);
		expect(server).toMatchObject({ amount: 2, checked: true });
	});

	it('Löschen setzt deleted_at beim Server', async () => {
		const item = await admin.items.create({ household, name: 'Weg damit' });
		await admin.engine.push();
		await admin.items.remove(item.id);
		await admin.engine.push();

		const server = await admin.pb.collection('shopping_items').getOne(item.id);
		expect(server.deleted_at).not.toBe('');
		await child.engine.pull();
		expect((await child.items.get(item.id))?.deleted_at).not.toBe('');
	});

	it('Unter-Collections (Zutaten) laufen über den Haushalt des Rezepts', async () => {
		const recipes = new Repository(admin.db, 'recipes');
		const ingredients = new Repository(admin.db, 'recipe_ingredients');
		const recipe = await recipes.create({ household, title: 'Pfannkuchen', servings: 4 });
		const egg = await ingredients.create({ recipe: recipe.id, name: 'Eier', amount: 3 });
		expect(await admin.engine.push()).toBe('done');

		await child.engine.pull();
		expect(await child.db.recipe_ingredients.get(egg.id)).toMatchObject({ name: 'Eier' });
	});

	it('Pull holt nur Neues seit dem letzten Stand', async () => {
		const before = await child.db.meta.get(`lastSync:${household}:shopping_items`);
		const remote = new PocketBaseRemote(child.pb);
		const changed = await remote.fetchChanged(
			'shopping_items',
			'household',
			household,
			before?.value ?? ''
		);
		// Nur die Datensätze mit dem neuesten Zeitstempel (>=), nicht die ganze Liste.
		const all = await child.pb.collection('shopping_items').getFullList();
		expect(changed.length).toBeLessThan(all.length);
	});

	it('erkennt beim Anlegen eine bereits vorhandene ID', async () => {
		const remote = new PocketBaseRemote(admin.pb);
		const id = 'duplikat0000001';
		await remote.create('shopping_items', { id, household, name: 'Einmal' });
		const error = await remote
			.create('shopping_items', { id, household, name: 'Zweimal' })
			.catch((e) => e);
		expect(error).toBeInstanceOf(RemoteError);
		expect(error.kind).toBe('exists');
	});
});
