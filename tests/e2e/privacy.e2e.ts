// Datenschutz: Datenexport, Konto löschen („Ehemaliges Mitglied“ auf dem anderen Gerät),
// letzter Admin, Familienraum löschen (beide Geräte landen im Onboarding).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
	apiCreate,
	apiToken,
	createFamily,
	createFamilyWithMember,
	login,
	openSettingsSection,
	PASSWORD
} from './helpers.ts';

async function openSettings(page: Page) {
	await page.goto('/einstellungen');
	await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
	await openSettingsSection(page, 'Daten');
}

test('Datenexport enthält die Daten der Familie als JSON', async ({ page }) => {
	const family = await createFamily();
	await apiCreate(await apiToken(family.email), 'shopping_items', {
		household: family.household,
		name: 'Brot'
	});
	await login(page, family.email);
	// Erst abwarten, bis der Artikel lokal angekommen ist.
	await page.goto('/einkauf');
	await expect(page.getByRole('button', { name: /^Brot als gekauft markieren/ })).toBeVisible();
	await openSettings(page);

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Daten exportieren' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^homi-familie-e2e-\d{4}-\d{2}-\d{2}\.json$/);
	const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
	expect(data).toMatchObject({ format: 'familienhub-export', household: family.household });
	expect(data.data.shopping_items.map((item: { name: string }) => item.name)).toEqual(['Brot']);
	await expect(page.getByText(/^Export gespeichert:/)).toBeVisible();
});

test('Konto löschen: Einträge zeigen auf dem anderen Gerät „Ehemaliges Mitglied“', async ({
	browser
}) => {
	const family = await createFamilyWithMember();
	await apiCreate(await apiToken(family.member), 'shopping_items', {
		household: family.household,
		name: 'Brot'
	});
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);

	await a.goto('/einkauf');
	const tile = a.getByRole('button', { name: /^Brot als gekauft markieren/ });
	await expect(tile).toHaveAccessibleName(/von Tom$/);

	await openSettings(b);
	await b.getByRole('button', { name: 'Konto löschen', exact: true }).click();
	await b.getByLabel('Passwort zur Bestätigung').fill('falsch');
	await b.getByRole('button', { name: 'Konto endgültig löschen' }).click();
	await expect(b.getByRole('alert')).toHaveText('Das Passwort ist falsch.');
	await b.getByLabel('Passwort zur Bestätigung').fill(PASSWORD);
	await b.getByRole('button', { name: 'Konto endgültig löschen' }).click();
	await expect(b).toHaveURL(/\/login/);

	await expect(tile).toHaveAccessibleName(/von Ehemaliges Mitglied$/, { timeout: 10_000 });
});

test('Der letzte Admin kann sein Konto nicht einfach löschen', async ({ page }) => {
	const family = await createFamilyWithMember();
	await login(page, family.admin);
	await openSettings(page);
	await page.getByRole('button', { name: 'Konto löschen', exact: true }).click();
	await page.getByLabel('Passwort zur Bestätigung').fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
	await expect(page.getByRole('alert')).toContainText('Du bist der letzte Admin.');
	await expect(page).toHaveURL(/\/einstellungen/);
});

test('Familienraum löschen: beide Geräte landen im Onboarding', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await expect(b.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();

	// Erwachsene sehen die Aktion nicht.
	await openSettings(b);
	await expect(b.getByRole('button', { name: 'Familienraum löschen' })).toHaveCount(0);

	await openSettings(a);
	await a.getByRole('button', { name: 'Familienraum löschen' }).click();
	const confirm = a.getByRole('button', { name: 'Familienraum endgültig löschen' });
	await expect(confirm).toBeDisabled();
	await a.getByLabel('Zum Bestätigen den Namen „Familie E2E“ eingeben').fill('Familie E2E');
	await confirm.click();
	await expect(a).toHaveURL(/\/onboarding/);

	// Gerät B merkt es per Live-Update (spätestens beim nächsten Abgleich).
	await expect(b).toHaveURL(/\/onboarding/, { timeout: 15_000 });
});
