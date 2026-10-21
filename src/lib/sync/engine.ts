// Sync-Engine: gleicht die lokale Datenbank mit dem Server ab.
// - push: Outbox der Reihe nach senden; Eintrag erst nach Erfolg entfernen
// - pull: pro Collection alles mit `updated >= lastSync` holen (Zeitstempel vom Server)
// - applyRealtime: Live-Änderungen übernehmen
// Konflikte: pro Feld gewinnt die zuletzt beim Server angekommene Änderung. Lokal noch nicht
// gesendete Felder bleiben beim Übernehmen eines Serverstands erhalten und gehen danach raus.
import type { FamilyDb } from '#lib/db/database.js';
import { COLLECTIONS, type CollectionName, type OutboxEntry } from '#lib/db/types.js';
import { RemoteError, type RealtimeEvent, type Remote, type RemoteRecord } from './remote.js';

export type PushResult = 'done' | 'offline' | 'auth';

/** Hinweis, wenn der Server eine Änderung endgültig abgelehnt hat. */
export interface SyncNotice {
	collection: CollectionName;
	recordId: string;
	op: OutboxEntry['op'];
	status: number;
	at: number;
}

export interface EngineHooks {
	onRejected?: (notice: SyncNotice) => void;
}

function asRemoteError(error: unknown): RemoteError {
	return error instanceof RemoteError ? error : new RemoteError('network', String(error));
}

/** Wie der Aufräum-Job auf dem Server (pocketbase/pb_hooks/lib/familienhub.js). */
export const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Erledigt-Verlauf der Aufgaben bleibt 14 Tage (wie auf dem Server). */
export const COMPLETIONS_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

/** Zeitpunkt älter als `age`? Versteht ISO- und PocketBase-Format; leer oder ungültig → nein. */
function olderThan(value: string | undefined, age: number, now: number): boolean {
	if (!value) return false;
	const time = Date.parse(value.replace(' ', 'T'));
	return Number.isFinite(time) && time < now - age;
}

/** `deleted_at` gesetzt und älter als 30 Tage? Versteht ISO- und PocketBase-Format. */
export function isOlderTombstone(deletedAt: string | undefined, now: number): boolean {
	return olderThan(deletedAt, PURGE_AFTER_MS, now);
}

/** Erledigt-Eintrag älter als 14 Tage? */
export function isExpiredCompletion(completedAt: string | undefined, now: number): boolean {
	return olderThan(completedAt, COMPLETIONS_KEEP_MS, now);
}

export class SyncEngine {
	constructor(
		private readonly db: FamilyDb,
		private readonly remote: Remote,
		private readonly household: string,
		private readonly hooks: EngineHooks = {}
	) {}

	/** Sendet die Outbox der Reihe nach. Bricht bei Netz- oder Anmeldefehler ab, Rest bleibt erhalten. */
	async push(): Promise<PushResult> {
		for (;;) {
			const entry = await this.db.outbox.orderBy('seq').first();
			if (!entry || entry.seq === undefined) return 'done';
			const seq = entry.seq;
			await this.db.outbox.update(seq, { inFlight: 1 });

			let record: RemoteRecord;
			try {
				record = await this.send(entry);
			} catch (error) {
				const remoteError = asRemoteError(error);
				if (remoteError.kind === 'network' || remoteError.kind === 'auth') {
					await this.db.outbox.update(seq, { inFlight: 0, attempts: entry.attempts + 1 });
					return remoteError.kind === 'network' ? 'offline' : 'auth';
				}
				await this.reject(entry, remoteError);
				continue;
			}

			const table = this.db.collection(entry.collection);
			await this.db.transaction('rw', table, this.db.outbox, async () => {
				await this.db.outbox.delete(seq);
				await this.applyRemote(entry.collection, record);
			});
		}
	}

	private async send(entry: OutboxEntry): Promise<RemoteRecord> {
		if (entry.op === 'update') {
			return this.remote.update(entry.collection, entry.recordId, entry.fields);
		}
		try {
			return await this.remote.create(entry.collection, { ...entry.fields, id: entry.recordId });
		} catch (error) {
			// Gibt es den Datensatz schon (Antwort ging verloren), als Änderung senden.
			if (error instanceof RemoteError && error.kind === 'exists') {
				const fields = { ...entry.fields };
				delete fields.id;
				return this.remote.update(entry.collection, entry.recordId, fields);
			}
			throw error;
		}
	}

	/** Abgelehnte Änderung verwerfen und den Serverstand wiederherstellen. */
	private async reject(entry: OutboxEntry, error: RemoteError): Promise<void> {
		let server: RemoteRecord | null | undefined;
		try {
			server = await this.remote.fetchOne(entry.collection, entry.recordId);
		} catch {
			server = undefined; // Netz weg: lokalen Stand lassen, der nächste Abgleich korrigiert.
		}

		const table = this.db.collection(entry.collection);
		await this.db.transaction('rw', table, this.db.outbox, async () => {
			if (entry.seq !== undefined) await this.db.outbox.delete(entry.seq);
			if (server) {
				await this.applyRemote(entry.collection, server, true);
			} else if (server === null) {
				// Gibt es beim Server nicht: lokale Kopie und alle weiteren Änderungen daran verwerfen.
				await table.delete(entry.recordId);
				await this.pendingFor(entry.collection, entry.recordId).delete();
			}
		});

		this.hooks.onRejected?.({
			collection: entry.collection,
			recordId: entry.recordId,
			op: entry.op,
			status: error.status,
			at: Date.now()
		});
	}

	private pendingFor(collection: CollectionName, recordId: string) {
		return this.db.outbox.where('[collection+recordId]').equals([collection, recordId]);
	}

	/**
	 * Übernimmt einen Serverstand. Noch ausstehende lokale Felder werden darübergelegt (Feld-Merge).
	 * Ältere Stände als der lokal bekannte werden ignoriert, außer `force` (nach einer Ablehnung).
	 * Muss in einer Transaktion über Tabelle und Outbox laufen.
	 */
	async applyRemote(
		collection: CollectionName,
		record: RemoteRecord,
		force = false
	): Promise<void> {
		const table = this.db.collection(collection);
		const local = await table.get(record.id);
		if (!force && local?.updated && record.updated && record.updated < local.updated) return;

		const pending = await this.pendingFor(collection, record.id).toArray();
		const merged = Object.assign({}, local, record, ...pending.map((p) => p.fields));
		await table.put(merged);
	}

	/** Holt alle Änderungen seit dem letzten Abgleich, Collection für Collection. */
	async pull(): Promise<void> {
		for (const { name, scope } of COLLECTIONS) {
			const key = `lastSync:${this.household}:${name}`;
			const since = (await this.db.meta.get(key))?.value ?? '';
			const records = await this.remote.fetchChanged(name, scope, this.household, since);
			if (records.length === 0) continue;

			const table = this.db.collection(name);
			await this.db.transaction('rw', table, this.db.outbox, this.db.meta, async () => {
				let newest = since;
				for (const record of records) {
					await this.applyRemote(name, record);
					if (record.updated > newest) newest = record.updated;
				}
				// `>=` beim nächsten Mal: gleiche Zeitstempel gehen nicht verloren, doppelt schadet nicht.
				await this.db.meta.put({ key, value: newest });
			});
		}
	}

	/** Ist der Familienraum noch sichtbar? false = gelöscht oder eigene Mitgliedschaft entfernt. */
	async hasAccess(): Promise<boolean> {
		return (await this.remote.fetchOne('households', this.household)) !== null;
	}

	/**
	 * Entfernt lokal Einträge, die vor mehr als 30 Tagen gelöscht wurden, und Erledigt-Einträge älter
	 * als 14 Tage – der Server löscht sie dann endgültig und meldet das nicht mehr. Mitgliedschaften
	 * bleiben („Ehemaliges Mitglied“), ebenso Einträge mit noch nicht gesendeten Änderungen.
	 * Gibt die Anzahl zurück.
	 */
	async purgeTombstones(now = Date.now()): Promise<number> {
		let removed = 0;
		for (const { name } of COLLECTIONS) {
			if (name === 'memberships' || name === 'households') continue;
			const table = this.db.collection(name);
			await this.db.transaction('rw', table, this.db.outbox, async () => {
				const old = await table
					.filter(
						(row) =>
							isOlderTombstone(row.deleted_at, now) ||
							(name === 'task_completions' &&
								isExpiredCompletion((row as { completed_at?: string }).completed_at, now))
					)
					.primaryKeys();
				for (const id of old) {
					if ((await this.pendingFor(name, id).count()) > 0) continue;
					await table.delete(id);
					removed += 1;
				}
			});
		}
		return removed;
	}

	/** Live-Änderung vom Server übernehmen. */
	async applyRealtime(collection: CollectionName, event: RealtimeEvent): Promise<void> {
		const table = this.db.collection(collection);
		await this.db.transaction('rw', table, this.db.outbox, async () => {
			if (event.action === 'delete') {
				await table.delete(event.record.id);
				await this.pendingFor(collection, event.record.id).delete();
			} else {
				await this.applyRemote(collection, event.record);
			}
		});
	}
}
