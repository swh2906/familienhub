// Steuert die Sync-Engine in der App: Start/Stopp, Auslöser, Wiederholung mit wachsender Wartezeit.
// Auslöser: lokale Änderung (kurz verzögert), wieder online, App wieder sichtbar, alle 60 Sekunden.
// Live-Abos, die offline nicht zustande kamen (App ohne Netz gestartet), werden beim nächsten
// erfolgreichen Abgleich nachgeholt.
import { liveQuery } from 'dexie';
import { getDb } from '#lib/db/database.js';
import { localChanges } from '#lib/db/repository.js';
import { COLLECTIONS, type CollectionName } from '#lib/db/types.js';
import { getPocketBase } from '#lib/pb/client.js';
import { SyncEngine } from './engine.js';
import { PocketBaseRemote } from './pocketbase-remote.js';
import { RemoteError } from './remote.js';
import { syncStatus } from './status.svelte.js';

const DEBOUNCE_MS = 300;
const INTERVAL_MS = 60_000;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

interface Running {
	household: string;
	engine: SyncEngine;
	cleanup: (() => void)[];
	unsubscribe: (() => Promise<void>)[];
	/** Collections mit bestehendem oder gerade entstehendem Live-Abo. */
	subscribed: Set<CollectionName>;
	busy: boolean;
	again: boolean;
	retryDelay: number;
	retryTimer: ReturnType<typeof setTimeout> | null;
	purged: boolean;
	remote: PocketBaseRemote;
	/** Abos werden nachgeholt: nach jedem neuen Abo noch einmal abgleichen. */
	resubscribing: boolean;
}

let current: Running | null = null;

/** Startet den Abgleich für einen Familienraum (beendet einen laufenden für einen anderen). */
export function startSync(household: string): void {
	if (current?.household === household) return;
	void stopSync();

	const db = getDb();
	const remote = new PocketBaseRemote(getPocketBase());
	const engine = new SyncEngine(db, remote, household, {
		onRejected: (notice) => syncStatus.addNotice(notice)
	});
	const running: Running = {
		household,
		engine,
		remote,
		cleanup: [],
		unsubscribe: [],
		subscribed: new Set(),
		busy: false,
		again: false,
		retryDelay: RETRY_MIN_MS,
		retryTimer: null,
		purged: false,
		resubscribing: false
	};
	current = running;
	syncStatus.reset();
	syncStatus.online = navigator.onLine;

	const pending = liveQuery(() => db.outbox.count()).subscribe((count) => {
		syncStatus.pending = count;
	});
	running.cleanup.push(() => pending.unsubscribe());

	let debounce: ReturnType<typeof setTimeout> | null = null;
	const onLocalChange = () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS);
	};
	const onOnline = () => {
		syncStatus.online = true;
		void syncNow();
	};
	const onOffline = () => {
		syncStatus.online = false;
	};
	const onVisible = () => {
		if (document.visibilityState === 'visible') void syncNow();
	};
	localChanges.addEventListener('change', onLocalChange);
	window.addEventListener('online', onOnline);
	window.addEventListener('offline', onOffline);
	document.addEventListener('visibilitychange', onVisible);
	const interval = setInterval(() => void syncNow(), INTERVAL_MS);
	running.cleanup.push(() => {
		if (debounce) clearTimeout(debounce);
		localChanges.removeEventListener('change', onLocalChange);
		window.removeEventListener('online', onOnline);
		window.removeEventListener('offline', onOffline);
		document.removeEventListener('visibilitychange', onVisible);
		clearInterval(interval);
	});

	// Live-Abos zuerst, damit zwischen Abgleich und Abo nichts verloren geht.
	subscribeMissing(running);

	void syncNow();
}

/**
 * Legt die Live-Abos an, die noch fehlen. Schlägt eines fehl (offline), bleibt es offen und wird beim
 * nächsten erfolgreichen Abgleich erneut versucht; danach wird noch einmal abgeglichen, damit
 * nichts aus der Zeit vor dem Abo fehlt.
 */
function subscribeMissing(running: Running): void {
	for (const { name, scope } of COLLECTIONS) {
		if (running.subscribed.has(name)) continue;
		running.subscribed.add(name);
		running.remote
			.subscribe(name, scope, running.household, (event) => {
				void running.engine.applyRealtime(name, event);
				// Familienraum gelöscht: gleich abgleichen, dabei fällt der fehlende Zugriff auf.
				if (name === 'households' && event.action === 'delete') void syncNow();
			})
			.then((unsubscribe) => {
				if (current !== running) return void unsubscribe();
				running.unsubscribe.push(unsubscribe);
				if (running.resubscribing) void syncNow();
			})
			.catch(() => {
				// Offline: beim nächsten erfolgreichen Abgleich erneut versuchen.
				running.subscribed.delete(name);
			});
	}
}

/** Ein Abgleich: erst senden, dann holen, dann Neues aus der Zwischenzeit senden. */
export async function syncNow(): Promise<void> {
	const running = current;
	if (!running) return;
	if (running.busy) {
		running.again = true;
		return;
	}
	running.busy = true;
	if (running.retryTimer) clearTimeout(running.retryTimer);
	running.retryTimer = null;

	try {
		let result = await running.engine.push();
		if (result === 'done') {
			await running.engine.pull();
			result = await running.engine.push();
		}
		if (result === 'auth') {
			syncStatus.authLost = true;
		} else if (result === 'offline') {
			retryLater(running);
		} else if (!(await running.engine.hasAccess())) {
			// Familienraum gelöscht oder Mitgliedschaft entfernt: die App räumt auf (siehe Layout).
			syncStatus.accessLost = true;
		} else {
			syncStatus.online = true;
			running.retryDelay = RETRY_MIN_MS;
			if (running.subscribed.size < COLLECTIONS.length) {
				running.resubscribing = true;
				subscribeMissing(running);
			}
			if (!running.purged) {
				running.purged = true;
				await running.engine.purgeTombstones();
			}
		}
	} catch (error) {
		if (error instanceof RemoteError && error.kind === 'auth') syncStatus.authLost = true;
		else retryLater(running);
	} finally {
		running.busy = false;
	}

	if (running.again && current === running) {
		running.again = false;
		await syncNow();
	}
}

function retryLater(running: Running): void {
	syncStatus.online = false;
	running.retryTimer = setTimeout(() => void syncNow(), running.retryDelay);
	running.retryDelay = Math.min(running.retryDelay * 2, RETRY_MAX_MS);
}

/** Beendet den Abgleich (beim Abmelden oder Wechsel des Familienraums). */
export async function stopSync(): Promise<void> {
	const running = current;
	if (!running) return;
	current = null;
	if (running.retryTimer) clearTimeout(running.retryTimer);
	for (const cleanup of running.cleanup) cleanup();
	await Promise.allSettled(running.unsubscribe.map((unsubscribe) => unsubscribe()));
	syncStatus.reset();
}
