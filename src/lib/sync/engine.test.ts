import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FamilyDb } from '#lib/db/database.js';
import { Repository } from '#lib/db/repository.js';
import type { CollectionName } from '#lib/db/types.js';
import { SyncEngine, type SyncNotice } from './engine.js';
import { RemoteError, type Remote, type RemoteRecord } from './remote.js';

const HOUSEHOLD = 'household000001';

/** Server im Speicher: kann offline gehen und einzelne Änderungen ablehnen. */
class FakeRemote implements Remote {
	records = new Map<string, RemoteRecord>();
	online = true;
	calls: string[] = [];
	rejectIf:
		((collection: CollectionName, fields: Record<string, unknown>) => number | null) | null = null;
	#clock = 0;

	#stamp(): string {
		this.#clock += 1;
		return `2026-10-17 10:00:00.${String(this.#clock).padStart(3, '0')}Z`;
	}

	#check(collection: CollectionName, fields: Record<string, unknown>): void {
		if (!this.online) throw new RemoteError('network', 'offline');
		const status = this.rejectIf?.(collection, fields) ?? null;
		if (status) throw new RemoteError('rejected', 'abgelehnt', status);
	}

	async create(collection: CollectionName, fields: Record<string, unknown>) {
		this.#check(collection, fields);
		const id = String(fields.id);
		this.calls.push(`create ${collection}/${id}`);
		if (this.records.has(`${collection}/${id}`)) throw new RemoteError('exists', 'id', 400);
		const record = { deleted_at: '', ...fields, id, updated: this.#stamp() } as RemoteRecord;
		this.records.set(`${collection}/${id}`, record);
		return record;
	}

	async update(collection: CollectionName, id: string, fields: Record<string, unknown>) {
		this.#check(collection, fields);
		this.calls.push(`update ${collection}/${id} ${Object.keys(fields).sort().join(',')}`);
		const old = this.records.get(`${collection}/${id}`);
		if (!old) throw new RemoteError('rejected', 'not found', 404);
		const record = { ...old, ...fields, id, updated: this.#stamp() };
		this.records.set(`${collection}/${id}`, record);
		return record;
	}

	async fetchOne(collection: CollectionName, id: string) {
		if (!this.online) throw new RemoteError('network', 'offline');
		return this.records.get(`${collection}/${id}`) ?? null;
	}

	async fetchChanged(collection: CollectionName, scope: string, household: string, since: string) {
		if (!this.online) throw new RemoteError('network', 'offline');
		return [...this.records.entries()]
			.filter(([key]) => key.startsWith(`${collection}/`))
			.map(([, record]) => record)
			.filter((r) => (scope === 'id' ? r.id : r[scope]) === household && r.updated >= since)
			.sort((a, b) => a.updated.localeCompare(b.updated));
	}

	async subscribe() {
		return async () => {};
	}

	/** Änderung durch ein anderes Gerät direkt beim Server. */
	serverEdit(collection: CollectionName, id: string, fields: Record<string, unknown>) {
		const old = this.records.get(`${collection}/${id}`);
		this.records.set(`${collection}/${id}`, {
			...old,
			...fields,
			id,
			updated: this.#stamp()
		} as RemoteRecord);
	}
}

let db: FamilyDb;
let remote: FakeRemote;
let engine: SyncEngine;
let notices: SyncNotice[];
let items: Repository<'shopping_items'>;
let counter = 0;

beforeEach(() => {
	counter += 1;
	db = new FamilyDb(`test-${counter}`);
	remote = new FakeRemote();
	notices = [];
	engine = new SyncEngine(db, remote, HOUSEHOLD, { onRejected: (n) => notices.push(n) });
	items = new Repository(db, 'shopping_items');
});

afterEach(async () => {
	db.close();
	await db.delete();
});

describe('Repository', () => {
	it('legt lokal mit Geräte-ID an und stellt die Änderung in die Outbox', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Milch' });
		expect(item.id).toMatch(/^[a-z0-9]{15}$/);
		expect(await items.get(item.id)).toMatchObject({ name: 'Milch', updated: '', deleted_at: '' });

		const outbox = await db.outbox.toArray();
		expect(outbox).toHaveLength(1);
		expect(outbox[0]).toMatchObject({ op: 'create', recordId: item.id });
		expect(outbox[0].fields).toEqual({ household: HOUSEHOLD, name: 'Milch', id: item.id });
	});

	it('fasst Änderungen am letzten Datensatz der Outbox zusammen', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Milch' });
		await items.update(item.id, { amount: 2 });
		await items.update(item.id, { unit: 'l' });

		const outbox = await db.outbox.toArray();
		expect(outbox).toHaveLength(1);
		expect(outbox[0].fields).toMatchObject({ name: 'Milch', amount: 2, unit: 'l' });
	});

	it('fasst nicht über andere Datensätze hinweg zusammen (Reihenfolge bleibt)', async () => {
		const a = await items.create({ household: HOUSEHOLD, name: 'A' });
		const b = await items.create({ household: HOUSEHOLD, name: 'B' });
		await items.update(a.id, { name: 'A2' });
		expect((await db.outbox.toArray()).map((e) => `${e.op} ${e.recordId}`)).toEqual([
			`create ${a.id}`,
			`create ${b.id}`,
			`update ${a.id}`
		]);
	});

	it('Löschen setzt nur deleted_at und wird als Änderung gesendet', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Milch' });
		await engine.push();
		await items.remove(item.id);

		expect((await items.get(item.id))?.deleted_at).not.toBe('');
		const [entry] = await db.outbox.toArray();
		expect(entry.op).toBe('update');
		expect(Object.keys(entry.fields)).toEqual(['deleted_at']);

		await engine.push();
		expect(remote.records.get(`shopping_items/${item.id}`)?.deleted_at).not.toBe('');
	});

	it('Server-Felder lassen sich nicht setzen', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Milch' });
		await engine.push();
		await items.update(item.id, { updated: 'x', updated_by: 'y' } as never);
		expect(await db.outbox.count()).toBe(0);
	});
});

describe('Push', () => {
	it('sendet die Outbox in Reihenfolge und leert sie erst nach Erfolg', async () => {
		const a = await items.create({ household: HOUSEHOLD, name: 'A' });
		const b = await items.create({ household: HOUSEHOLD, name: 'B' });
		await items.update(a.id, { checked: true });

		expect(await engine.push()).toBe('done');
		expect(remote.calls).toEqual([
			`create shopping_items/${a.id}`,
			`create shopping_items/${b.id}`,
			`update shopping_items/${a.id} checked`
		]);
		expect(await db.outbox.count()).toBe(0);
		// Lokal steht danach der Serverstand mit Zeitstempel.
		expect((await items.get(a.id))?.updated).not.toBe('');
	});

	it('behält bei Netzfehler alles und sendet später erneut', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Brot' });
		remote.online = false;

		expect(await engine.push()).toBe('offline');
		const [entry] = await db.outbox.toArray();
		expect(entry).toMatchObject({ attempts: 1, inFlight: 0 });

		remote.online = true;
		expect(await engine.push()).toBe('done');
		expect(remote.records.has(`shopping_items/${item.id}`)).toBe(true);
		expect(await db.outbox.count()).toBe(0);
	});

	it('sendet ein Anlegen, das der Server schon kennt, als Änderung', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Eier' });
		// Erste Antwort ging verloren: Server hat den Datensatz, die Outbox noch den Eintrag.
		remote.records.set(`shopping_items/${item.id}`, {
			id: item.id,
			household: HOUSEHOLD,
			name: 'Eier',
			updated: '2026-10-17 09:00:00.000Z'
		});

		expect(await engine.push()).toBe('done');
		expect(remote.calls.at(-1)).toBe(`update shopping_items/${item.id} household,name`);
	});

	it('verwirft abgelehnte Änderungen, stellt den Serverstand her und meldet es', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Kaffee' });
		await engine.push();

		remote.rejectIf = (_c, fields) => (fields.name === 'Kakao' ? 403 : null);
		await items.update(item.id, { name: 'Kakao' });
		const other = await items.create({ household: HOUSEHOLD, name: 'Tee' });

		expect(await engine.push()).toBe('done');
		expect((await items.get(item.id))?.name).toBe('Kaffee');
		expect(notices).toMatchObject([{ recordId: item.id, op: 'update', status: 403 }]);
		// Die nächste Änderung ging trotzdem durch, die Outbox ist leer.
		expect(remote.records.has(`shopping_items/${other.id}`)).toBe(true);
		expect(await db.outbox.count()).toBe(0);
	});

	it('entfernt lokal, wenn ein abgelehntes Anlegen beim Server nicht existiert', async () => {
		remote.rejectIf = () => 400;
		const item = await items.create({ household: HOUSEHOLD, name: '' });
		await engine.push();
		expect(await items.get(item.id)).toBeUndefined();
		expect(await db.outbox.count()).toBe(0);
	});

	it('meldet abgelaufene Anmeldung und behält die Outbox', async () => {
		await items.create({ household: HOUSEHOLD, name: 'Milch' });
		remote.create = async () => {
			throw new RemoteError('auth', 'abgelaufen', 401);
		};
		expect(await engine.push()).toBe('auth');
		expect(await db.outbox.count()).toBe(1);
	});
});

describe('Pull und Feld-Merge', () => {
	it('holt neue Datensätze und merkt sich den Stand', async () => {
		remote.serverEdit('shopping_items', 'serveritem0001a', {
			household: HOUSEHOLD,
			name: 'Butter'
		});
		remote.serverEdit('shopping_items', 'fremditem00001a', {
			household: 'anderer00000001',
			name: 'X'
		});

		await engine.pull();
		expect((await items.get('serveritem0001a'))?.name).toBe('Butter');
		expect(await items.get('fremditem00001a')).toBeUndefined();

		const meta = await db.meta.get(`lastSync:${HOUSEHOLD}:shopping_items`);
		expect(meta?.value).toBe(remote.records.get('shopping_items/serveritem0001a')?.updated);
	});

	it('behält lokal ausstehende Felder, übernimmt die übrigen vom Server', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Milch', amount: 1 });
		await engine.push();

		await items.update(item.id, { name: 'Hafermilch' }); // lokal, noch nicht gesendet
		remote.serverEdit('shopping_items', item.id, { name: 'Vollmilch', amount: 3 }); // anderes Gerät

		await engine.pull();
		expect(await items.get(item.id)).toMatchObject({ name: 'Hafermilch', amount: 3 });

		await engine.push();
		expect(remote.records.get(`shopping_items/${item.id}`)).toMatchObject({
			name: 'Hafermilch',
			amount: 3
		});
	});

	it('ignoriert ältere Stände (z. B. verspätete Live-Nachricht)', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Neu' });
		await engine.push();
		const current = await items.get(item.id);

		await engine.applyRealtime('shopping_items', {
			action: 'update',
			record: {
				id: item.id,
				household: HOUSEHOLD,
				name: 'Alt',
				updated: '2026-01-01 00:00:00.000Z'
			}
		});
		expect((await items.get(item.id))?.name).toBe(current?.name);
	});

	it('Live-Löschung beim Server entfernt den Datensatz lokal', async () => {
		const item = await items.create({ household: HOUSEHOLD, name: 'Weg' });
		await engine.push();
		await engine.applyRealtime('shopping_items', {
			action: 'delete',
			record: { id: item.id, updated: '' }
		});
		expect(await items.get(item.id)).toBeUndefined();
	});
});
