// Verfügbarkeit: Das Gerät ist online, aber der Server ist nicht erreichbar (aus, oder unterwegs
// ohne Verbindung ins Heimnetz). Die App startet trotzdem, arbeitet lokal und gleicht später ab.
// Eine abgelaufene Anmeldung kostet keine Daten.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_PB_URL } from '../../playwright.config.ts';
import { apiToken, createFamily, login, PASSWORD } from './helpers.ts';

/** Server „abschalten“: Verbindung abgelehnt oder gar keine Antwort. */
async function serverDown(context: BrowserContext, mode: 'refused' | 'silent'): Promise<void> {
	await context.route('**/api/**', (route) =>
		mode === 'refused' ? route.abort('connectionrefused') : new Promise<void>(() => {})
	);
}

async function serverUp(context: BrowserContext): Promise<void> {
	await context.unroute('**/api/**');
}

/** Angemeldet und abgeglichen; die App ist im Service Worker gespeichert. */
async function prepare(page: Page): Promise<{ email: string; household: string }> {
	const family = await createFamily();
	await login(page, family.email);
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	// Erst weiter, wenn die Anmeldung nach dem Neuladen verlängert ist – sonst überschreibt die
	// späte Antwort ein im Test abgelaufenes Token wieder.
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();
	return family;
}

async function addItem(page: Page, text: string): Promise<void> {
	await page.getByLabel('Was braucht ihr?').fill(text);
	await page.getByLabel('Was braucht ihr?').press('Enter');
}

/** Artikelnamen auf dem Server (mit den Rechten des Kontos). */
async function serverItems(email: string): Promise<string[]> {
	const response = await fetch(`${E2E_PB_URL}/api/collections/shopping_items/records`, {
		headers: { authorization: await apiToken(email) }
	});
	const { items } = (await response.json()) as { items: { name: string }[] };
	return items.map((item) => item.name);
}

/** Anmeldung künstlich ablaufen lassen: Ablaufdatum in der Vergangenheit, Signatur ungültig. */
async function expireLogin(page: Page): Promise<void> {
	await page.evaluate(() => {
		const raw = JSON.parse(localStorage.getItem('pocketbase_auth') ?? '{}') as {
			token: string;
			record: { id: string };
		};
		const [header, , signature] = raw.token.split('.');
		const payload = btoa(
			JSON.stringify({ id: raw.record.id, type: 'auth', exp: Math.floor(Date.now() / 1000) - 60 })
		)
			.replace(/=+$/, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_');
		raw.token = `${header}.${payload}.${signature}`;
		localStorage.setItem('pocketbase_auth', JSON.stringify(raw));
	});
}

for (const mode of ['refused', 'silent'] as const) {
	test(`Server nicht erreichbar (${mode === 'refused' ? 'abgelehnt' : 'keine Antwort'}): App startet, arbeitet lokal, gleicht später ab`, async ({
		page,
		context
	}) => {
		test.setTimeout(60_000);
		const family = await prepare(page);
		await serverDown(context, mode);

		const started = Date.now();
		await page.goto('/einkauf');
		await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
		// Ohne Antwort startet die App nach dem Start-Zeitlimit (4 s) mit den gespeicherten Daten.
		expect(Date.now() - started).toBeLessThan(8_000);

		await addItem(page, 'Milch');
		await expect(page.getByRole('button', { name: 'Milch als gekauft markieren' })).toBeVisible();
		await page
			.getByRole('navigation', { name: 'Hauptnavigation' })
			.getByRole('link', { name: 'Kalender', exact: true })
			.click();
		await expect(page.getByRole('heading', { level: 1, name: 'Kalender' })).toBeVisible();

		await serverUp(context);
		await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
			timeout: 40_000
		});
		await expect.poll(() => serverItems(family.email), { timeout: 10_000 }).toContain('Milch');
	});
}

test('Anmeldung abgelaufen: lokal weiterarbeiten, neu anmelden ohne Datenverlust', async ({
	page,
	context
}) => {
	const family = await prepare(page);
	// Erst den Server weg, dann ablaufen lassen: so kann die offene App nichts mehr verlängern.
	await serverDown(context, 'refused');
	await expireLogin(page);

	// Kein Rauswurf: Die App startet mit den lokalen Daten, Änderungen werden gespeichert.
	await page.goto('/einkauf');
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
	await addItem(page, 'Brot');
	await expect(page.getByRole('button', { name: 'Brot als gekauft markieren' })).toBeVisible();

	// Server wieder da: Er lehnt die alte Anmeldung ab, die App bittet um eine neue.
	await serverUp(context);
	await page.reload();
	await page.getByRole('button', { name: 'Neu anmelden' }).click();
	await expect(page).toHaveURL(/\/login/);

	await page.getByLabel('E-Mail oder Benutzername').fill(family.email);
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();

	// Die offline gespeicherte Änderung ist noch da und erreicht den Server.
	await page.goto('/einkauf');
	await expect(page.getByRole('button', { name: 'Brot als gekauft markieren' })).toBeVisible();
	await expect.poll(() => serverItems(family.email), { timeout: 15_000 }).toContain('Brot');
});

test('Neu anmelden mit einem anderen Konto: die lokalen Daten des alten Kontos verschwinden', async ({
	page
}) => {
	await prepare(page);
	await page.goto('/einkauf');
	await addItem(page, 'Geheimer Kuchen');
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();

	await expireLogin(page);
	await page.reload();
	await page.getByRole('button', { name: 'Neu anmelden' }).click();
	await expect(page).toHaveURL(/\/login/);

	const other = await createFamily('Max');
	await login(page, other.email);
	await page.goto('/einkauf');
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
	await expect(page.getByText('Geheimer Kuchen')).toHaveCount(0);
});
