// Schritt 10c: tägliche Backups sind eingerichtet und lassen sich erzeugen.
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

let server: TestServer;
let root: PocketBase;

beforeAll(async () => {
	server = await startPocketBase();
	root = new PocketBase(server.url);
	await root
		.collection('_superusers')
		.authWithPassword(server.superuser.email, server.superuser.password);
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

describe('Backups', () => {
	it('täglich um 4 Uhr, die letzten 14 bleiben', async () => {
		const settings = await root.settings.getAll();
		expect(settings.backups).toMatchObject({ cron: '0 4 * * *', cronMaxKeep: 14 });
	});

	it('lässt sich von Hand erzeugen und auflisten', async () => {
		await root.backups.create('test.zip');
		const list = await root.backups.getFullList();
		expect(list.map((b) => b.key)).toContain('test.zip');
	});
});
