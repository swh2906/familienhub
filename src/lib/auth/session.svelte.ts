// Anmeldung und aktueller Familienraum.
// Spricht direkt mit PocketBase, weil Anmelden und Familienraum-Verwaltung nur online gehen.
// Die Familien-Daten (Einkauf, Aufgaben …) laufen ab Schritt 4 über das Sync-Modul.
import { ClientResponseError } from 'pocketbase';
import { deleteLocalData } from '#lib/db/database.js';
import { getPocketBase } from '#lib/pb/client.js';
import { stopSync } from '#lib/sync/service.js';
import type { Membership, User } from './types.js';

const HOUSEHOLD_KEY = 'fh-household';
const MEMBERSHIPS_KEY = 'fh-memberships';
/** Wem die lokalen Daten gehören – meldet sich ein anderes Konto an, werden sie verworfen. */
const LAST_USER_KEY = 'fh-last-user';
/** So lange wartet der Start auf den Server, danach geht es mit den gespeicherten Daten weiter. */
const STARTUP_TIMEOUT_MS = 4_000;

function readCache<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeCache(key: string, value: unknown): void {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Speicher nicht verfügbar: gilt dann nur bis zum Neuladen.
	}
}

/** Netzwerkfehler (offline, Server nicht erreichbar, Zeitlimit) statt einer Antwort des Servers? */
export function isOffline(error: unknown): boolean {
	return error instanceof ClientResponseError && error.status === 0 && !error.isAbort;
}

type RefreshResult = 'ok' | 'offline' | 'invalid';

function toUser(record: Record<string, unknown> | null): User | null {
	if (!record) return null;
	return {
		id: String(record.id ?? ''),
		name: String(record.name ?? ''),
		email: String(record.email ?? ''),
		username: String(record.username ?? '')
	};
}

class Session {
	user: User | null = $state(null);
	memberships: Membership[] = $state([]);
	#householdId: string | null = $state(readCache<string>(HOUSEHOLD_KEY));
	#ready: Promise<void> | null = null;

	/** Mitgliedschaft im aktuell gewählten Familienraum (oder im ersten). */
	get membership(): Membership | null {
		return (
			this.memberships.find((m) => m.household === this.#householdId) ?? this.memberships[0] ?? null
		);
	}

	get householdId(): string | null {
		return this.membership?.household ?? null;
	}

	get householdName(): string {
		return this.membership?.expand?.household?.name ?? '';
	}

	get isAdmin(): boolean {
		return this.membership?.role === 'admin';
	}

	/** Darf Rezepte, Essensplan, Termine und Aufgaben bearbeiten (Admin und Erwachsene, keine Kinder). */
	get canEdit(): boolean {
		const role = this.membership?.role;
		return role === 'admin' || role === 'adult';
	}

	/** Stellt die Sitzung beim Start einmalig wieder her und verlängert sie (Token-Refresh). */
	ready(): Promise<void> {
		this.#ready ??= this.#restore();
		return this.#ready;
	}

	/**
	 * Verfügbarkeit vor allem: Mit gespeicherten Daten startet die App auch, wenn der Server nicht
	 * (schnell genug) antwortet oder die Anmeldung abgelaufen ist, und arbeitet lokal weiter. Die
	 * Verlängerung läuft im Hintergrund weiter; lehnt der Server ab, meldet der Abgleich „Neu
	 * anmelden“ – lokale Daten und noch nicht gesendete Änderungen bleiben dabei erhalten.
	 */
	async #restore(): Promise<void> {
		const pb = getPocketBase();
		const record = pb.authStore.record;
		if (!pb.authStore.token || !record) {
			pb.authStore.clear();
			return;
		}
		// Sitzungen von vor diesem Update: Besitzer der lokalen Daten merken.
		if (!readCache<string>(LAST_USER_KEY)) writeCache(LAST_USER_KEY, record.id);

		const cached = readCache<Membership[]>(MEMBERSHIPS_KEY) ?? [];
		const refresh = this.#refresh();
		const result =
			cached.length > 0
				? await Promise.race([
						refresh,
						new Promise<'slow'>((done) => setTimeout(() => done('slow'), STARTUP_TIMEOUT_MS))
					])
				: await refresh;
		if (result === 'ok') return;
		if (cached.length === 0) {
			// Nichts Lokales zum Weiterarbeiten: bei ungültiger Anmeldung zur Anmeldeseite.
			if (result === 'invalid') this.#expire();
			else this.user = toUser(record);
			return;
		}
		this.user = toUser(record);
		this.memberships = cached;
	}

	/** Anmeldung beim Server verlängern und Mitgliedschaften laden. */
	async #refresh(): Promise<RefreshResult> {
		const pb = getPocketBase();
		try {
			await pb.collection('users').authRefresh();
			this.user = toUser(pb.authStore.record);
			await this.loadMemberships();
			return 'ok';
		} catch (error) {
			return isOffline(error) ? 'offline' : 'invalid';
		}
	}

	/**
	 * Anmeldung verwerfen, lokale Daten behalten (abgelaufen oder „Neu anmelden“). Meldet sich
	 * dieselbe Person wieder an, gehen die gespeicherten Änderungen danach raus.
	 */
	#expire(): void {
		getPocketBase().authStore.clear();
		this.user = null;
	}

	/** „Neu anmelden“: zur Anmeldeseite, ohne lokale Daten zu löschen. */
	async reauthenticate(): Promise<void> {
		await stopSync();
		this.#expire();
		this.#ready = Promise.resolve();
	}

	async loadMemberships(): Promise<void> {
		const pb = getPocketBase();
		if (!this.user) return;
		const list = await pb.collection('memberships').getFullList<Membership>({
			filter: pb.filter("user = {:user} && deleted_at = ''", { user: this.user.id }),
			expand: 'household',
			sort: 'created'
		});
		this.memberships = list;
		writeCache(MEMBERSHIPS_KEY, list);
	}

	selectHousehold(id: string): void {
		this.#householdId = id;
		writeCache(HOUSEHOLD_KEY, id);
	}

	/** Anmelden mit E-Mail oder Benutzername. */
	async login(identity: string, password: string): Promise<void> {
		const pb = getPocketBase();
		await pb.collection('users').authWithPassword(identity.trim(), password);
		const id = pb.authStore.record?.id ?? '';
		const previous = readCache<string>(LAST_USER_KEY);
		if (previous && previous !== id) {
			// Anderes Konto: dessen Daten gehören nicht auf dieses Gerät.
			await stopSync();
			await deleteLocalData();
			this.#householdId = null;
			writeCache(HOUSEHOLD_KEY, null);
			writeCache(MEMBERSHIPS_KEY, null);
		}
		writeCache(LAST_USER_KEY, id);
		this.user = toUser(pb.authStore.record);
		this.#ready = Promise.resolve();
		await this.loadMemberships();
	}

	async register(data: { name: string; email: string; password: string }): Promise<void> {
		const pb = getPocketBase();
		await pb.collection('users').create({
			name: data.name.trim(),
			email: data.email.trim(),
			password: data.password,
			passwordConfirm: data.password
		});
		await this.login(data.email, data.password);
	}

	/**
	 * Familienraum nicht mehr erreichbar (gelöscht oder entfernt): Sync stoppen, lokale Daten verwerfen,
	 * Mitgliedschaften neu laden. Danach gilt der nächste Familienraum oder es geht zum Onboarding.
	 */
	async leaveHousehold(): Promise<void> {
		await stopSync();
		await deleteLocalData();
		this.#householdId = null;
		writeCache(HOUSEHOLD_KEY, null);
		await this.loadMemberships();
	}

	/** Abmelden löscht Sitzung und lokale Daten; Darstellung (Hell/Dunkel, Akzent) bleibt. */
	logout(): Promise<void> {
		return this.#clear();
	}

	async #clear(): Promise<void> {
		this.#ready = Promise.resolve();
		getPocketBase().authStore.clear();
		this.user = null;
		this.memberships = [];
		this.#householdId = null;
		writeCache(HOUSEHOLD_KEY, null);
		writeCache(MEMBERSHIPS_KEY, null);
		writeCache(LAST_USER_KEY, null);
		await stopSync();
		await deleteLocalData();
	}
}

export const session = new Session();
