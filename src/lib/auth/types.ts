// Datentypen für Anmeldung und Familienraum (wie sie PocketBase liefert).

export type Role = 'admin' | 'adult' | 'child';

export const ROLES: readonly Role[] = ['admin', 'adult', 'child'];

export interface User {
	id: string;
	name: string;
	email: string;
	username: string;
}

export interface Household {
	id: string;
	name: string;
	timezone: string;
}

export interface Membership {
	id: string;
	user: string;
	household: string;
	role: Role;
	color: string;
	display_name: string;
	deleted_at: string;
	expand?: { household?: Household };
}

export interface Invite {
	id: string;
	household: string;
	role: Role;
	expires_at: string;
	code_expires_at: string;
	uses_left: number;
	revoked: boolean;
	created: string;
}

/** Antwort beim Erstellen: Token und Code gibt es nur hier im Klartext. */
export interface CreatedInvite {
	id: string;
	role: Role;
	token: string;
	code: string;
	expires_at: string;
	code_expires_at: string;
	uses_left: number;
}
