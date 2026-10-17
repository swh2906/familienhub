// Lesen und Schreiben einer Collection für die Oberfläche.
// Jede Änderung landet in derselben Transaktion in der Tabelle und in der Outbox (nur geänderte Felder);
// das Sync-Modul sendet die Outbox später der Reihe nach an den Server.
import { liveQuery, type Observable, type Table } from 'dexie';
import type { FamilyDb } from './database.js';
import { newId } from './ids.js';
import {
	SERVER_FIELDS,
	type BaseRecord,
	type CollectionName,
	type CollectionTypes,
	type OutboxEntry
} from './types.js';

/** Felder, die die Oberfläche setzen darf (alles außer Server-Feldern). */
export type Editable<N extends CollectionName> = Partial<
	Omit<CollectionTypes[N], 'id' | 'created' | 'updated' | 'updated_by'>
>;

/** Meldet lokale Änderungen, damit das Sync-Modul zeitnah sendet. */
export const localChanges = new EventTarget();

function notifyChange(): void {
	localChanges.dispatchEvent(new Event('change'));
}

/**
 * Einfache Kopie der Daten. Svelte-Zustand (z. B. eine Liste aus `$state`) ist ein Proxy, den
 * IndexedDB nicht speichern kann; alle Felder sind JSON-kompatibel, daher genügt dieser Weg.
 */
function plain<T>(data: T): T {
	return JSON.parse(JSON.stringify(data)) as T;
}

/** Entfernt Server-Felder und die ID aus den zu sendenden Feldern. */
function editableFields(data: Record<string, unknown>): Record<string, unknown> {
	const fields = plain(data);
	delete fields.id;
	for (const key of SERVER_FIELDS) delete fields[key];
	return fields;
}

/**
 * Stellt eine Änderung in die Outbox. Steht der Datensatz bereits ganz am Ende und wird noch nicht
 * gesendet, werden die Felder zusammengefasst. Sonst neuer Eintrag, damit die Reihenfolge erhalten
 * bleibt (z. B. wenn eine spätere Änderung auf einen neueren Datensatz verweist).
 */
export async function enqueue(
	db: FamilyDb,
	collection: CollectionName,
	recordId: string,
	op: OutboxEntry['op'],
	fields: Record<string, unknown>
): Promise<void> {
	const tail = await db.outbox.orderBy('seq').last();
	if (
		tail &&
		tail.seq !== undefined &&
		tail.collection === collection &&
		tail.recordId === recordId &&
		tail.inFlight === 0
	) {
		await db.outbox.update(tail.seq, { fields: { ...tail.fields, ...fields } });
		return;
	}
	await db.outbox.add({
		collection,
		recordId,
		op,
		fields,
		queuedAt: Date.now(),
		attempts: 0,
		inFlight: 0
	});
}

export class Repository<N extends CollectionName> {
	constructor(
		private readonly db: FamilyDb,
		readonly name: N
	) {}

	get table(): Table<CollectionTypes[N], string> {
		return this.db.collection(this.name);
	}

	/** Legt einen Datensatz mit einer auf dem Gerät erzeugten ID an. */
	async create(data: Editable<N> & { id?: string }): Promise<CollectionTypes[N]> {
		const id = data.id ?? newId();
		const base: BaseRecord = { id, created: '', updated: '', updated_by: '', deleted_at: '' };
		const record = { ...base, ...plain(data), id } as CollectionTypes[N];
		const fields = { ...editableFields(data), id };

		await this.db.transaction('rw', this.table, this.db.outbox, async () => {
			await this.table.add(record);
			await enqueue(this.db, this.name, id, 'create', fields);
		});
		notifyChange();
		return record;
	}

	/** Ändert einzelne Felder; nur diese gehen später an den Server. */
	async update(id: string, changes: Editable<N>): Promise<void> {
		const fields = editableFields(changes);
		if (Object.keys(fields).length === 0) return;

		await this.db.transaction('rw', this.table, this.db.outbox, async () => {
			const existing = await this.table.get(id);
			if (!existing) throw new Error(`${this.name}/${id} gibt es lokal nicht.`);
			await this.table.put({ ...existing, ...fields } as CollectionTypes[N]);
			await enqueue(this.db, this.name, id, 'update', fields);
		});
		notifyChange();
	}

	/** Löschen = `deleted_at` setzen; der Aufräum-Job auf dem Server entfernt später endgültig. */
	async remove(id: string): Promise<void> {
		await this.update(id, { deleted_at: new Date().toISOString() } as Editable<N>);
	}

	get(id: string): Promise<CollectionTypes[N] | undefined> {
		return this.table.get(id);
	}

	/** Beobachtet eine Abfrage; liefert bei jeder lokalen Änderung (auch durch den Sync) neue Werte. */
	observe<R>(query: (table: Table<CollectionTypes[N], string>) => Promise<R>): Observable<R> {
		return liveQuery(() => query(this.table));
	}
}
