// Helfer für E2E-Tests: Konten und Familien direkt über die API anlegen, Anmeldung über die Oberfläche.
import { expect, type Page } from '@playwright/test';
import { E2E_PB_URL } from '../../playwright.config.ts';

export const PASSWORD = 'e2e-passwort-123';

/** Eindeutiger Wert, damit parallele Tests (Handy/Desktop) sich nicht in die Quere kommen. */
export function unique(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function api<T>(path: string, body: object, token?: string): Promise<T> {
	const response = await fetch(`${E2E_PB_URL}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
	return (await response.json()) as T;
}

/** Legt ein Konto mit eigener Familie an und gibt die Zugangsdaten zurück. */
export async function createFamily(name = 'Julia'): Promise<{ email: string; household: string }> {
	const email = `${unique('admin')}@e2e.test`;
	await api('/api/collections/users/records', {
		email,
		name,
		password: PASSWORD,
		passwordConfirm: PASSWORD
	});
	const { token } = await api<{ token: string }>('/api/collections/users/auth-with-password', {
		identity: email,
		password: PASSWORD
	});
	const { household } = await api<{ household: { id: string } }>(
		'/api/fh/households',
		{ name: 'Familie E2E' },
		token
	);
	return { email, household: household.id };
}

/** Familie mit Admin und einem per Einladung beigetretenen Erwachsenen. */
export async function createFamilyWithMember(): Promise<{
	admin: string;
	member: string;
	household: string;
}> {
	const { email: admin, household } = await createFamily('Julia');
	const { token: adminToken } = await api<{ token: string }>(
		'/api/collections/users/auth-with-password',
		{ identity: admin, password: PASSWORD }
	);
	const invite = await api<{ token: string }>(
		'/api/fh/invites',
		{ household, role: 'adult' },
		adminToken
	);

	const member = `${unique('tom')}@e2e.test`;
	await api('/api/collections/users/records', {
		email: member,
		name: 'Tom',
		password: PASSWORD,
		passwordConfirm: PASSWORD
	});
	const { token } = await api<{ token: string }>('/api/collections/users/auth-with-password', {
		identity: member,
		password: PASSWORD
	});
	await api('/api/fh/invites/redeem', { token: invite.token }, token);
	return { admin, member, household };
}

/** Anmelde-Token für direkte API-Aufrufe im Test. */
export async function apiToken(identity: string): Promise<string> {
	const { token } = await api<{ token: string }>('/api/collections/users/auth-with-password', {
		identity,
		password: PASSWORD
	});
	return token;
}

/** Legt einen Datensatz direkt über die API an (mit den Rechten des Kontos). */
export async function apiCreate<T = { id: string }>(
	token: string,
	collection: string,
	data: object
): Promise<T> {
	return api<T>(`/api/collections/${collection}/records`, data, token);
}

/** Admin legt ein Kinderkonto an; gibt den Benutzernamen zurück. */
export async function createChild(adminEmail: string, household: string): Promise<string> {
	const username = unique('kind')
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, '')
		.slice(0, 30);
	await api(
		'/api/fh/children',
		{ household, username, password: PASSWORD, display_name: 'Mia' },
		await apiToken(adminEmail)
	);
	return username;
}

/** Meldet sich über das Formular an und wartet auf die Heute-Ansicht. */
export async function login(page: Page, identity: string, password = PASSWORD): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('E-Mail oder Benutzername').fill(identity);
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
}

/** Einstellungen: Abschnitt über die Sprungleiste aufklappen (auf dem Handy sind manche zu). */
export async function openSettingsSection(page: Page, name: string): Promise<void> {
	await page
		.getByRole('navigation', { name: 'Bereiche der Einstellungen' })
		.getByRole('button', { name, exact: true })
		.click();
}
