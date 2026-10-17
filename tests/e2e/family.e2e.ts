// Kompletter Ablauf über die Oberfläche: Admin registriert sich und legt die Familie an,
// lädt per Link ein, ein zweiter Nutzer tritt bei; dazu ein Kinderkonto mit Benutzername.
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, unique } from './helpers.ts';

async function register(page: Page, name: string, email: string) {
	await page.getByLabel('Dein Name').fill(name);
	await page.getByLabel('E-Mail', { exact: true }).fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
}

test('Admin registriert sich, lädt ein, zweiter Nutzer tritt per Link bei', async ({
	page,
	browser
}) => {
	// Ohne Anmeldung landet man bei der Anmeldung.
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);

	// Admin: registrieren und Familie anlegen.
	await page.getByRole('link', { name: 'Registrieren' }).click();
	await register(page, 'Julia', `${unique('julia')}@e2e.test`);
	await expect(page).toHaveURL(/\/onboarding$/);
	await page.getByLabel('Name des Familienraums').fill('Familie Sonnenschein');
	await page.getByRole('button', { name: 'Anlegen' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();

	// Einladung als Erwachsener erstellen.
	await page.getByRole('link', { name: 'Einstellungen' }).click();
	await expect(page.getByRole('heading', { name: /Familie: Familie Sonnenschein/ })).toBeVisible();
	await page.getByRole('button', { name: 'Einladung erstellen' }).click();
	const link = (await page.getByTestId('invite-link').textContent())?.trim() ?? '';
	expect(link).toMatch(/\/join\/[A-Za-z0-9]{40}$/);
	await expect(page.getByTestId('invite-code')).toHaveText(/^[A-Z0-9]{8}$/);

	// Zweiter Nutzer in eigenem Browser-Kontext: Link öffnen, registrieren, beitreten.
	const context = await browser.newContext();
	const tom = await context.newPage();
	await tom.goto(link);
	await expect(tom.getByRole('heading', { name: 'Einladung in einen Familienraum' })).toBeVisible();
	await tom.getByRole('link', { name: 'Konto erstellen' }).click();
	await register(tom, 'Tom', `${unique('tom')}@e2e.test`);
	await expect(tom).toHaveURL(/\/join\//);
	await tom.getByRole('button', { name: 'Beitreten' }).click();
	await expect(tom.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();

	// Tom sieht beide Mitglieder, aber keine Admin-Funktionen.
	await tom.getByRole('link', { name: 'Einstellungen' }).click();
	const family = tom.getByRole('region', { name: /^Familie:/ });
	await expect(family.getByRole('listitem').filter({ hasText: 'Julia' })).toBeVisible();
	await expect(family.getByRole('listitem').filter({ hasText: 'Tom' })).toBeVisible();
	await expect(tom.getByRole('heading', { name: 'Einladen' })).toHaveCount(0);

	// Der Link ist verbraucht: ein dritter Nutzer kann nicht mehr beitreten.
	const third = await (await browser.newContext()).newPage();
	await third.goto(link);
	await third.getByRole('link', { name: 'Konto erstellen' }).click();
	await register(third, 'Max', `${unique('max')}@e2e.test`);
	await third.getByRole('button', { name: 'Beitreten' }).click();
	await expect(third.getByRole('alert')).toHaveText(/ungültig, abgelaufen oder wurde widerrufen/);

	// Admin legt ein Kinderkonto an; das Kind meldet sich mit Benutzername an.
	const username = unique('mia').toLowerCase().slice(0, 30);
	await page.reload();
	await page.getByLabel('Name', { exact: true }).fill('Mia');
	await page.getByLabel('Benutzername').fill(username);
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Kind anlegen' }).click();
	await expect(page.getByRole('status').filter({ hasText: username })).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Rolle von Tom' })).toHaveValue('adult');

	const mia = await (await browser.newContext()).newPage();
	await mia.goto('/login');
	await mia.getByLabel('E-Mail oder Benutzername').fill(username);
	await mia.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await mia.getByRole('button', { name: 'Anmelden' }).click();
	await expect(mia.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();

	await context.close();
});

test('Beitritt per Code im Onboarding', async ({ page, browser }) => {
	await page.goto('/register');
	await register(page, 'Anna', `${unique('anna')}@e2e.test`);
	await page.getByLabel('Name des Familienraums').fill('Familie Code');
	await page.getByRole('button', { name: 'Anlegen' }).click();
	await page.getByRole('link', { name: 'Einstellungen' }).click();
	await page.getByRole('combobox', { name: 'Rolle', exact: true }).selectOption('child');
	await page.getByRole('button', { name: 'Einladung erstellen' }).click();
	const code = (await page.getByTestId('invite-code').textContent())?.trim() ?? '';

	const ben = await (await browser.newContext()).newPage();
	await ben.goto('/register');
	await register(ben, 'Ben', `${unique('ben')}@e2e.test`);
	await ben.getByLabel('Einladungscode').fill('FALSCH99');
	await ben.getByRole('button', { name: 'Beitreten' }).click();
	await expect(ben.getByRole('alert')).toHaveText(/ungültig/);

	await ben.getByLabel('Einladungscode').fill(code.toLowerCase());
	await ben.getByRole('button', { name: 'Beitreten' }).click();
	await expect(ben.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
});
