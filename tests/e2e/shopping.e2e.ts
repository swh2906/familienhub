// Einkaufsliste über die echte Oberfläche: zwei Geräte gleichzeitig, Schnell-Eingabe mit Menge und
// Kategorie-Vorschlag, abhaken, leeren mit Rückgängig, Flugmodus, Kinder.
import { expect, test, type Page } from '@playwright/test';
import {
	apiCreate,
	apiToken,
	createChild,
	createFamily,
	createFamilyWithMember,
	login
} from './helpers.ts';

async function openShopping(page: Page) {
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Einkauf' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
}

async function add(page: Page, text: string) {
	await page.getByLabel('Artikel hinzufügen').fill(text);
	await page.getByLabel('Artikel hinzufügen').press('Enter');
}

function category(page: Page, name: string) {
	return page.getByRole('region', { name });
}

test('zwei Geräte bearbeiten die Liste gleichzeitig', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openShopping(a);
	await openShopping(b);
	await expect(a.getByText('Alles erledigt')).toBeVisible();

	// A: Menge und Einheit werden erkannt, Kategorie vorgeschlagen; das Feld bleibt bereit.
	await add(a, '2 l Milch');
	await add(a, 'Äpfel');
	await expect(a.getByLabel('Artikel hinzufügen')).toBeFocused();
	await expect(
		category(a, 'Kühlregal').getByRole('button', { name: '2 l Milch abhaken' })
	).toBeVisible();
	await expect(
		category(a, 'Obst & Gemüse').getByRole('button', { name: 'Äpfel abhaken' })
	).toBeVisible();
	await expect(a.getByText('2 offen')).toBeVisible();

	// B fügt gleichzeitig hinzu; beide sehen beides.
	await add(b, '500 g Hackfleisch');
	await expect(category(a, 'Fleisch & Fisch').getByText('Hackfleisch')).toBeVisible({
		timeout: 10_000
	});
	await expect(category(b, 'Kühlregal').getByText('Milch')).toBeVisible({ timeout: 10_000 });

	// B hakt Milch ab (Tipp auf die ganze Zeile); A sieht es unter „Erledigt“.
	await b.getByRole('button', { name: '2 l Milch abhaken' }).click();
	await expect(a.getByText('Erledigt (1)')).toBeVisible({ timeout: 10_000 });
	await expect(category(a, 'Kühlregal')).toHaveCount(0);

	// A leert die Erledigten und macht es rückgängig.
	await a.getByText('Erledigt (1)').click();
	await a.getByRole('button', { name: 'Erledigte leeren' }).click();
	await expect(a.getByRole('status').filter({ hasText: '1 Artikel entfernt.' })).toBeVisible();
	await expect(b.getByText('Erledigt (1)')).toHaveCount(0, { timeout: 10_000 });
	await a.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(b.getByText('Erledigt (1)')).toBeVisible({ timeout: 10_000 });
});

test('Bearbeiten, Kategorie merken und Löschen', async ({ page }) => {
	const { email } = await createFamily();
	await login(page, email);
	await openShopping(page);

	await add(page, 'Geschenkpapier');
	await expect(category(page, 'Sonstiges').getByText('Geschenkpapier')).toBeVisible();

	await page.getByRole('button', { name: 'Geschenkpapier bearbeiten' }).click();
	const dialog = page.getByRole('dialog', { name: 'Artikel bearbeiten' });
	await dialog.getByLabel('Menge').fill('2');
	await dialog.getByLabel('Einheit').fill('Rollen');
	await dialog.getByLabel('Kategorie').selectOption('Haushalt');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(category(page, 'Haushalt').getByText('2 Rollen')).toBeVisible();

	// Beim nächsten Mal wird die gewählte Kategorie vorgeschlagen.
	await page.getByRole('button', { name: '2 Rollen Geschenkpapier abhaken' }).click();
	await add(page, 'geschenkpapier');
	await expect(category(page, 'Haushalt').getByText('geschenkpapier')).toBeVisible();

	await page.getByRole('button', { name: 'geschenkpapier bearbeiten' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
	await expect(category(page, 'Haushalt')).toHaveCount(0);
	await expect(page.getByRole('status').filter({ hasText: '1 Artikel entfernt.' })).toBeVisible();
});

test('im Flugmodus hinzufügen und abhaken, danach gleicht es ab', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const contextA = await browser.newContext();
	const a = await contextA.newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openShopping(a);
	await openShopping(b);
	await add(a, 'Brot');
	await expect(b.getByRole('button', { name: 'Brot abhaken' })).toBeVisible({ timeout: 10_000 });

	await contextA.setOffline(true);
	await add(a, '6 Eier');
	await a.getByRole('button', { name: 'Brot abhaken' }).click();
	await expect(a.getByRole('status', { name: /Abgleich: (Offline|\d+ ausstehend)/ })).toBeVisible();
	await expect(category(a, 'Kühlregal').getByText('Eier')).toBeVisible();
	await b.waitForTimeout(1_000);
	await expect(b.getByText('Eier')).toHaveCount(0);

	await contextA.setOffline(false);
	await expect(category(b, 'Kühlregal').getByText('Eier')).toBeVisible({ timeout: 15_000 });
	await expect(b.getByText('Erledigt (1)')).toBeVisible({ timeout: 15_000 });
	await expect(a.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 15_000
	});
});

test('Kinder haken fremde Artikel ab, bearbeiten aber nur eigene', async ({ page }) => {
	const { email, household } = await createFamily();
	await apiCreate(await apiToken(email), 'shopping_items', {
		household,
		name: 'Kaffee',
		category: 'Getränke'
	});
	const username = await createChild(email, household);
	await login(page, username);
	await openShopping(page);

	await expect(page.getByRole('button', { name: 'Kaffee bearbeiten' })).toHaveCount(0);
	await add(page, 'Kekse');
	await expect(page.getByRole('button', { name: 'Kekse bearbeiten' })).toBeVisible();

	await page.getByRole('button', { name: 'Kaffee abhaken' }).click();
	await expect(page.getByText('Erledigt (1)')).toBeVisible();
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 10_000
	});
	// Kein Hinweis auf abgelehnte Änderungen: Abhaken ist für Kinder erlaubt.
	await expect(page.getByText(/vom Server abgelehnt/)).toHaveCount(0);
	// „Erledigte leeren“ gibt es nur für eigene erledigte Artikel – hier keine.
	await page.getByText('Erledigt (1)').click();
	await expect(page.getByRole('button', { name: 'Erledigte leeren' })).toHaveCount(0);
});
