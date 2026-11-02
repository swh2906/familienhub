// Umsetzung der Remote-Schnittstelle mit PocketBase (einzige Stelle der Sync-Engine, die PocketBase kennt).
import PocketBase, { ClientResponseError } from 'pocketbase';
import type { CollectionName } from '#lib/db/types.js';
import { RemoteError, type RealtimeEvent, type Remote, type RemoteRecord } from './remote.js';

// Keine automatische Abbruch-Logik des SDK: parallele Anfragen derselben Collection sind gewollt.
const NO_CANCEL = { requestKey: null };

/** Übersetzt Fehler des SDK in die Fehlerarten der Sync-Engine. */
export function toRemoteError(error: unknown): RemoteError {
	if (!(error instanceof ClientResponseError)) {
		return new RemoteError('network', String(error));
	}
	const { status } = error;
	if (status === 0) return new RemoteError('network', error.message);
	if (status === 401) return new RemoteError('auth', error.message, status);
	const data = (error.response as { data?: Record<string, unknown> }).data ?? {};
	if (status === 400 && 'id' in data) return new RemoteError('exists', error.message, status);
	return new RemoteError('rejected', error.message, status);
}

export class PocketBaseRemote implements Remote {
	constructor(private readonly pb: PocketBase) {}

	async create(collection: CollectionName, fields: Record<string, unknown>): Promise<RemoteRecord> {
		try {
			return await this.pb.collection(collection).create<RemoteRecord>(fields, NO_CANCEL);
		} catch (error) {
			throw toRemoteError(error);
		}
	}

	async update(
		collection: CollectionName,
		id: string,
		fields: Record<string, unknown>
	): Promise<RemoteRecord> {
		try {
			return await this.pb.collection(collection).update<RemoteRecord>(id, fields, NO_CANCEL);
		} catch (error) {
			throw toRemoteError(error);
		}
	}

	async verifyAuth(): Promise<boolean> {
		if (!this.pb.authStore.token) return false;
		try {
			await this.pb.collection('users').authRefresh(NO_CANCEL);
			return true;
		} catch (error) {
			const remoteError = toRemoteError(error);
			if (remoteError.kind === 'network') throw remoteError;
			return false;
		}
	}

	async fetchOne(collection: CollectionName, id: string): Promise<RemoteRecord | null> {
		try {
			return await this.pb.collection(collection).getOne<RemoteRecord>(id, NO_CANCEL);
		} catch (error) {
			const remoteError = toRemoteError(error);
			if (remoteError.kind === 'rejected' && [403, 404].includes(remoteError.status)) return null;
			throw remoteError;
		}
	}

	async fetchChanged(
		collection: CollectionName,
		scope: string,
		household: string,
		since: string
	): Promise<RemoteRecord[]> {
		const filter = since
			? this.pb.filter(`${scope} = {:household} && updated >= {:since}`, { household, since })
			: this.pb.filter(`${scope} = {:household}`, { household });
		try {
			return await this.pb
				.collection(collection)
				.getFullList<RemoteRecord>({ filter, sort: 'updated', batch: 500, ...NO_CANCEL });
		} catch (error) {
			throw toRemoteError(error);
		}
	}

	async subscribe(
		collection: CollectionName,
		scope: string,
		household: string,
		onEvent: (event: RealtimeEvent) => void
	): Promise<() => Promise<void>> {
		try {
			return await this.pb
				.collection(collection)
				.subscribe<RemoteRecord>(
					'*',
					(event) =>
						onEvent({ action: event.action as RealtimeEvent['action'], record: event.record }),
					{ filter: this.pb.filter(`${scope} = {:household}`, { household }) }
				);
		} catch (error) {
			throw toRemoteError(error);
		}
	}
}
