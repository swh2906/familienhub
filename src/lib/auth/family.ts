// Familienraum verwalten: anlegen, einladen, beitreten, Mitglieder und Kinderkonten.
// Alles läuft online direkt gegen PocketBase; die Rechte prüft der Server.
import { ClientResponseError } from 'pocketbase';
import { getPocketBase } from '#lib/pb/client.js';
import { session } from './session.svelte.js';
import type { CreatedInvite, Household, Invite, Membership, Role } from './types.js';

/** Fehlertext des Servers (bei 400 aus unseren Routen bereits auf Deutsch) oder null. */
export function serverMessage(error: unknown): string | null {
	if (!(error instanceof ClientResponseError)) return null;
	const message = (error.response as { message?: unknown }).message;
	return typeof message === 'string' && message ? message : null;
}

export function errorStatus(error: unknown): number {
	return error instanceof ClientResponseError ? error.status : -1;
}

export async function createHousehold(name: string): Promise<Household> {
	const result = await getPocketBase().send<{ household: Household }>('/api/fh/households', {
		method: 'POST',
		body: { name: name.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
	});
	await session.loadMemberships();
	session.selectHousehold(result.household.id);
	return result.household;
}

export async function renameHousehold(id: string, name: string): Promise<void> {
	await getPocketBase().collection('households').update(id, { name: name.trim() });
	await session.loadMemberships();
}

/** Tritt per Link-Token oder Code bei und wechselt in den neuen Familienraum. */
export async function redeemInvite(input: { token?: string; code?: string }): Promise<string> {
	const result = await getPocketBase().send<{ household: string }>('/api/fh/invites/redeem', {
		method: 'POST',
		body: input
	});
	await session.loadMemberships();
	session.selectHousehold(result.household);
	return result.household;
}

export async function createInvite(household: string, role: Role): Promise<CreatedInvite> {
	return getPocketBase().send<CreatedInvite>('/api/fh/invites', {
		method: 'POST',
		body: { household, role }
	});
}

/** Offene Einladungen: nicht widerrufen, nicht aufgebraucht, Link noch gültig. */
export async function listInvites(household: string): Promise<Invite[]> {
	const pb = getPocketBase();
	return pb.collection('invites').getFullList<Invite>({
		filter: pb.filter(
			"household = {:household} && revoked = false && deleted_at = '' && uses_left > 0 && expires_at > @now",
			{ household }
		),
		sort: '-created'
	});
}

export async function revokeInvite(id: string): Promise<void> {
	await getPocketBase().collection('invites').update(id, { revoked: true });
}

/** Aktive Mitglieder eines Familienraums, älteste zuerst. */
export async function listMembers(household: string): Promise<Membership[]> {
	const pb = getPocketBase();
	return pb.collection('memberships').getFullList<Membership>({
		filter: pb.filter("household = {:household} && deleted_at = ''", { household }),
		sort: 'created'
	});
}

export async function updateMember(
	id: string,
	data: Partial<Pick<Membership, 'display_name' | 'color' | 'role'>>
): Promise<Membership> {
	const updated = await getPocketBase().collection('memberships').update<Membership>(id, data);
	if (updated.user === session.user?.id) await session.loadMemberships();
	return updated;
}

/** Entfernt ein Mitglied (weiches Löschen, damit Geräte die Änderung mitbekommen). */
export async function removeMember(id: string): Promise<void> {
	await getPocketBase()
		.collection('memberships')
		.update(id, { deleted_at: new Date().toISOString() });
}

export async function createChild(data: {
	household: string;
	username: string;
	password: string;
	display_name: string;
}): Promise<void> {
	await getPocketBase().send('/api/fh/children', { method: 'POST', body: data });
}

/** Hat der Server das Konto-Löschen abgelehnt, weil es der letzte Admin ist? */
export function isLastAdminError(error: unknown): boolean {
	if (!(error instanceof ClientResponseError)) return false;
	const data = (error.response as { data?: { household?: { code?: unknown } } }).data;
	return data?.household?.code === 'last_admin';
}

/** Löscht das eigene Konto (Passwort zur Bestätigung) und meldet ab; lokale Daten werden gelöscht. */
export async function deleteAccount(password: string): Promise<void> {
	await getPocketBase().send('/api/fh/account/delete', { method: 'POST', body: { password } });
	await session.logout();
}

/** Admin: Familienraum mit allen Daten löschen (Name zur Bestätigung). */
export async function deleteHousehold(household: string, name: string): Promise<void> {
	await getPocketBase().send('/api/fh/households/delete', {
		method: 'POST',
		body: { household, name }
	});
	await session.leaveHousehold();
}
