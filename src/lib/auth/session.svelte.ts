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

/** Netzwerkfehler (offline, Server nicht erreichbar) statt einer Antwort des Servers? */
export function isOffline(error: unknown): boolean {
	return error instanceof ClientResponseError && error.status === 0 && !error.isAbort;
}

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

	async #restore(): Promise<void> {
		const pb = getPocketBase();
		if (!pb.authStore.isValid) {
			pb.authStore.clear();
			return;
		}
		try {
			await pb.collection('users').authRefresh();
			this.user = toUser(pb.authStore.record);
			await this.loadMemberships();
		} catch (error) {
			if (isOffline(error)) {
				// Offline: mit den zuletzt bekannten Daten weiterarbeiten.
				this.user = toUser(pb.authStore.record);
				this.memberships = readCache<Membership[]>(MEMBERSHIPS_KEY) ?? [];
			} else {
				// Anmeldung ungültig: auch lokale Daten verwerfen, ein anderes Konto könnte sich anmelden.
				await this.#clear();
			}
		}
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
		await stopSync();
		await deleteLocalData();
	}
}

export const session = new Session();
