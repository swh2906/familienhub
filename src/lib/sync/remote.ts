// Schnittstelle zum Server. Die Sync-Engine kennt nur diese Schnittstelle, nicht PocketBase selbst;
// so ist sie ohne Server testbar und bliebe beim Wechsel des Backends unverändert (Plan B: Jazz).
import type { CollectionName } from '#lib/db/types.js';

export interface RemoteRecord {
	id: string;
	updated: string;
	[field: string]: unknown;
}

/**
 * - network: Server nicht erreichbar → später erneut versuchen
 * - auth: Anmeldung abgelaufen → Sync pausieren
 * - exists: Datensatz mit dieser ID gibt es schon (z. B. Antwort ging verloren) → als Änderung senden
 * - rejected: Server lehnt ab (Rechte, ungültige Daten) → Änderung verwerfen, Serverstand übernehmen
 */
export type RemoteErrorKind = 'network' | 'auth' | 'exists' | 'rejected';

export class RemoteError extends Error {
	constructor(
		readonly kind: RemoteErrorKind,
		message: string,
		readonly status = 0
	) {
		super(message);
		this.name = 'RemoteError';
	}
}

export interface RealtimeEvent {
	action: 'create' | 'update' | 'delete';
	record: RemoteRecord;
}

export interface Remote {
	create(collection: CollectionName, fields: Record<string, unknown>): Promise<RemoteRecord>;
	update(
		collection: CollectionName,
		id: string,
		fields: Record<string, unknown>
	): Promise<RemoteRecord>;
	/** Aktueller Serverstand oder null, wenn es den Datensatz nicht (mehr) gibt oder er nicht sichtbar ist. */
	fetchOne(collection: CollectionName, id: string): Promise<RemoteRecord | null>;
	/** Alle Datensätze des Haushalts mit `updated >= since` (leer = alle), nach `updated` sortiert. */
	fetchChanged(
		collection: CollectionName,
		scope: string,
		household: string,
		since: string
	): Promise<RemoteRecord[]>;
	/**
	 * Gilt die Anmeldung beim Server noch? Verlängert sie dabei. Wichtig, weil der Server ungültige
	 * Anmeldungen still wie Gäste behandelt: leere Listen, „nicht gefunden“, „abgelehnt“ – die Engine
	 * darf daraus erst Schlüsse ziehen (verwerfen, löschen), wenn die Anmeldung gültig ist.
	 * Netzwerkfehler → RemoteError 'network'.
	 */
	verifyAuth(): Promise<boolean>;
	/** Live-Abo; liefert eine Funktion zum Abmelden. */
	subscribe(
		collection: CollectionName,
		scope: string,
		household: string,
		onEvent: (event: RealtimeEvent) => void
	): Promise<() => Promise<void>>;
}
