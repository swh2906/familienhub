// Einkaufsliste im Bring-Stil: Kacheln antippen = gekauft, „Zuletzt gekauft“ zum Wiederhinzufügen,
// Vorschläge beim Tippen, Bearbeiten-Modus, zwei Geräte, Flugmodus, Kinder.
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
	await page.getByLabel('Was braucht ihr?').fill(text);
	await page.getByLabel('Was braucht ihr?').press('Enter');
}

function category(page: Page, name: string) {
	return page.getByRole('region', { name });
}

/** Offene Kachel (Name ohne Menge reicht, die Menge steht vorne im Label). */
function openTile(page: Page, name: string) {
	return page.getByRole('button', { name: new RegExp(`^${name}( [^,]+)? als gekauft markieren`) });
}

function recentTile(page: Page, name: string) {
	return category(page, 'Zuletzt gekauft').getByRole('button', {
		name: `${name} wieder auf die Liste`
	});
}

test('zwei Geräte: hinzufügen, kaufen, wieder auf die Liste', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openShopping(a);
	await openShopping(b);
	await expect(a.getByText('Alles da!')).toBeVisible();

	// A: Menge und Einheit werden erkannt, Kategorie vorgeschlagen; das Feld bleibt bereit.
	await add(a, '2 l Milch');
	await add(a, 'Äpfel');
	await expect(a.getByLabel('Was braucht ihr?')).toBeFocused();
	await expect(
		category(a, 'Kühlregal').getByRole('button', { name: /^Milch 2 l als gekauft markieren/ })
	).toBeVisible();
	await expect(category(a, 'Obst & Gemüse').getByText('Äpfel')).toBeVisible();
	await expect(a.getByText('2 offen')).toBeVisible();

	// B fügt gleichzeitig hinzu; beide sehen beides, inklusive wer es hinzugefügt hat.
	await add(b, '500 g Hackfleisch');
	await expect(openTile(a, 'Hackfleisch')).toHaveAccessibleName(/von Tom$/, { timeout: 10_000 });
	await expect(openTile(b, 'Milch')).toHaveAccessibleName(/von Julia$/, { timeout: 10_000 });

	// B kauft Milch (Tipp auf die Kachel); bei A wandert sie nach „Zuletzt gekauft“.
	await openTile(b, 'Milch').click();
	await expect(recentTile(a, 'Milch')).toBeVisible({ timeout: 10_000 });
	await expect(category(a, 'Kühlregal')).toHaveCount(0);

	// A setzt sie mit einem Tipp wieder auf die Liste; B sieht sie wieder offen.
	await recentTile(a, 'Milch').click();
	await expect(openTile(b, 'Milch')).toBeVisible({ timeout: 10_000 });
});

test('Vorschläge, Bearbeiten-Modus, Kategorie merken, Löschen mit Rückgängig', async ({ page }) => {
	const { email } = await createFamily();
	await login(page, email);
	await openShopping(page);

	// Gekaufte Milch über einen Vorschlag mit neuer Menge wieder hinzufügen – ohne Duplikat.
	await add(page, 'Milch');
	await openTile(page, 'Milch').click();
	await page.getByLabel('Was braucht ihr?').fill('2 l mil');
	await page
		.getByRole('region', { name: 'Vorschläge' })
		.getByRole('button', { name: 'Milch hinzufügen', exact: true })
		.click();
	await expect(
		page.getByRole('button', { name: /^Milch 2 l als gekauft markieren/ })
	).toBeVisible();
	await expect(page.getByRole('button', { name: /Milch/ })).toHaveCount(1);

	// Unbekannter Artikel landet in „Sonstiges“; im Bearbeiten-Modus Kategorie und Menge ändern.
	await add(page, 'Geschenkpapier');
	await expect(category(page, 'Sonstiges').getByText('Geschenkpapier')).toBeVisible();
	await page.getByRole('button', { name: 'Bearbeiten' }).click();
	await page.getByRole('button', { name: 'Geschenkpapier bearbeiten' }).click();
	const dialog = page.getByRole('dialog', { name: 'Artikel bearbeiten' });
	await dialog.getByLabel('Menge').fill('2');
	await dialog.getByLabel('Einheit').fill('Rollen');
	await dialog.getByLabel('Kategorie').selectOption('Haushalt');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await page.getByRole('button', { name: 'Fertig' }).click();
	await expect(category(page, 'Haushalt').getByText('2 Rollen')).toBeVisible();

	// Neu eingetippt merkt die Liste sich die gewählte Kategorie.
	await openTile(page, 'Geschenkpapier').click();
	await page.getByLabel('Was braucht ihr?').fill('geschenkband');
	await add(page, 'Geschenkband');
	await expect(category(page, 'Sonstiges').getByText('Geschenkband')).toBeVisible();
	await page.getByLabel('Was braucht ihr?').fill('');
	await recentTile(page, 'Geschenkpapier').click();
	await expect(category(page, 'Haushalt').getByText('Geschenkpapier')).toBeVisible();

	// Löschen über die Details (Rechtsklick/langes Drücken), mit Rückgängig.
	await openTile(page, 'Geschenkband').click({ button: 'right' });
	await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
	await expect(page.getByText('Geschenkband')).toHaveCount(0);
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(openTile(page, 'Geschenkband')).toBeVisible();
});

test('im Flugmodus hinzufügen und kaufen, danach gleicht es ab', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const contextA = await browser.newContext();
	const a = await contextA.newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openShopping(a);
	await openShopping(b);
	await add(a, 'Brot');
	await expect(openTile(b, 'Brot')).toBeVisible({ timeout: 10_000 });

	await contextA.setOffline(true);
	await add(a, '6 Eier');
	await openTile(a, 'Brot').click();
	await expect(a.getByRole('status', { name: /Abgleich: (Offline|\d+ ausstehend)/ })).toBeVisible();
	await expect(openTile(a, 'Eier')).toBeVisible();
	await b.waitForTimeout(1_000);
	await expect(openTile(b, 'Eier')).toHaveCount(0);

	await contextA.setOffline(false);
	await expect(openTile(b, 'Eier')).toBeVisible({ timeout: 15_000 });
	await expect(recentTile(b, 'Brot')).toBeVisible({ timeout: 15_000 });
	await expect(a.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 15_000
	});
});

test('Kinder kaufen fremde Artikel, bearbeiten aber nur eigene', async ({ page }) => {
	const { email, household } = await createFamily();
	await apiCreate(await apiToken(email), 'shopping_items', {
		household,
		name: 'Kaffee',
		category: 'Getränke'
	});
	const username = await createChild(email, household);
	await login(page, username);
	await openShopping(page);
	await add(page, 'Kekse');

	// Im Bearbeiten-Modus lässt sich nur die eigene Kachel bearbeiten.
	await page.getByRole('button', { name: 'Bearbeiten' }).click();
	await expect(page.getByRole('button', { name: 'Kekse bearbeiten' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Kaffee bearbeiten' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Fertig' }).click();

	// Fremden Artikel kaufen ist erlaubt (kein Hinweis auf abgelehnte Änderungen).
	await openTile(page, 'Kaffee').click();
	await expect(recentTile(page, 'Kaffee')).toBeVisible();
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 10_000
	});
	await expect(page.getByText(/vom Server abgelehnt/)).toHaveCount(0);
});
