// Sync-Status für die Kopfzeile: synchron, ausstehend, offline oder Fehler.
import type { SyncNotice } from './engine.js';

export type SyncState = 'synced' | 'pending' | 'offline' | 'error';

class SyncStatus {
	/** Server erreichbar (Browser online und letzter Versuch ohne Netzfehler). */
	online = $state(true);
	/** Anzahl ausstehender Änderungen in der Outbox. */
	pending = $state(0);
	/** Anmeldung abgelaufen: Sync pausiert, bis neu angemeldet wird. */
	authLost = $state(false);
	/** Vom Server abgelehnte und zurückgesetzte Änderungen (zuletzt höchstens 5). */
	notices: SyncNotice[] = $state([]);

	get state(): SyncState {
		if (this.authLost) return 'error';
		if (!this.online) return 'offline';
		if (this.pending > 0) return 'pending';
		return 'synced';
	}

	addNotice(notice: SyncNotice): void {
		this.notices = [...this.notices.slice(-4), notice];
	}

	dismissNotices(): void {
		this.notices = [];
	}

	reset(): void {
		this.online = true;
		this.pending = 0;
		this.authLost = false;
		this.notices = [];
	}
}

export const syncStatus = new SyncStatus();
