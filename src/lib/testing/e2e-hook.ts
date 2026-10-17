// Zugang für die E2E-Tests (nur im Test-Build mit VITE_E2E=1 enthalten, siehe (app)/+layout.svelte).
// Damit kann Playwright schon vor der ersten echten Oberfläche (Einkaufsliste, Schritt 5) Daten
// über dieselben Repositories schreiben und lesen wie die App.
import { session } from '#lib/auth/session.svelte.js';
import { getDb } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import type { CollectionName, CollectionTypes } from '#lib/db/types.js';
import type { Editable } from '#lib/db/repository.js';
import { syncStatus } from '#lib/sync/status.svelte.js';

export interface E2EHook {
	household(): string | null;
	create<N extends CollectionName>(name: N, data: Editable<N>): Promise<CollectionTypes[N]>;
	update<N extends CollectionName>(name: N, id: string, changes: Editable<N>): Promise<void>;
	remove(name: CollectionName, id: string): Promise<void>;
	list<N extends CollectionName>(name: N): Promise<CollectionTypes[N][]>;
	status(): { state: string; pending: number };
}

declare global {
	interface Window {
		__familienhub?: E2EHook;
	}
}

export function install(): void {
	window.__familienhub = {
		household: () => session.householdId,
		create: (name, data) => repo(name).create(data),
		update: (name, id, changes) => repo(name).update(id, changes),
		remove: (name, id) => repo(name).remove(id),
		list: (name) => getDb().collection(name).toArray(),
		status: () => ({ state: syncStatus.state, pending: syncStatus.pending })
	};
}
