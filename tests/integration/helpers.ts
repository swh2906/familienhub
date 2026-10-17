// Gemeinsame Helfer für die Integrationstests gegen PocketBase.
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import { expect } from 'vitest';

export const PASSWORD = 'test-passwort-123';

/** Registriert ein Konto und gibt einen angemeldeten Client zurück. */
export async function signUp(
	url: string,
	data: { email?: string; username?: string; name: string }
): Promise<{ pb: PocketBase; id: string }> {
	const pb = new PocketBase(url);
	pb.autoCancellation(false);
	const user = await pb
		.collection('users')
		.create({ ...data, password: PASSWORD, passwordConfirm: PASSWORD });
	await pb.collection('users').authWithPassword(data.email ?? data.username ?? '', PASSWORD);
	return { pb, id: user.id };
}

/** Legt über die eigene Route einen Haushalt an; das Konto wird Admin. */
export async function createHousehold(
	pb: PocketBase,
	name: string
): Promise<{ household: RecordModel; membership: RecordModel }> {
	return pb.send('/api/fh/households', { method: 'POST', body: { name } });
}

export interface InviteResponse {
	id: string;
	role: string;
	token: string;
	code: string;
	expires_at: string;
	code_expires_at: string;
	uses_left: number;
}

export async function createInvite(
	pb: PocketBase,
	household: string,
	role: string,
	uses?: number
): Promise<InviteResponse> {
	return pb.send('/api/fh/invites', { method: 'POST', body: { household, role, uses } });
}

export async function redeem(
	pb: PocketBase,
	body: { token?: string; code?: string }
): Promise<{ household: string; membership: RecordModel }> {
	return pb.send('/api/fh/invites/redeem', { method: 'POST', body });
}

/** Erwartet eine Ablehnung mit einem der angegebenen Statuscodes (Standard: 400, 403, 404). */
export async function expectDenied(request: Promise<unknown>, statuses = [400, 403, 404]) {
	const error = await request.then(
		() => null,
		(e: unknown) => e
	);
	expect(error, 'Anfrage hätte abgelehnt werden müssen').toBeInstanceOf(ClientResponseError);
	expect(statuses).toContain((error as ClientResponseError).status);
	return error as ClientResponseError;
}
