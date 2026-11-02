// Zwei Geräte derselben Familie: Änderungen kommen live an, auch nach einer Offline-Phase.
// Der erste Test schreibt über den Test-Zugang window.__familienhub (dieselben Repositories wie die
// App), die Einkaufs-Tests über die echte Oberfläche.
import { expect, test, type Page } from '@playwright/test';
import { createFamilyWithMember, login } from './helpers.ts';

async function nameOf(page: Page, id: string): Promise<string | null> {
	return page.evaluate(async (itemId) => {
		const items = await window.__familienhub!.list('shopping_items');
		return items.find((item) => item.id === itemId)?.name ?? null;
	}, id);
}

async function waitUntilSynced(page: Page): Promise<void> {
	await page.waitForFunction(() => window.__familienhub !== undefined);
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();
}

test('Änderung auf Gerät A erscheint live auf Gerät B, auch nach Offline-Phase', async ({
	browser
}) => {
	const family = await createFamilyWithMember();

	const contextA = await browser.newContext();
	const a = await contextA.newPage();
	await login(a, family.admin);
	const contextB = await browser.newContext();
	const b = await contextB.newPage();
	await login(b, family.member);
	await waitUntilSynced(a);
	await waitUntilSynced(b);

	// Online: Anlegen auf A kommt per Live-Update bei B an.
	const id = await a.evaluate(
		async (household) =>
			(await window.__familienhub!.create('shopping_items', { household, name: 'Milch' })).id,
		family.household
	);
	await expect.poll(() => nameOf(b, id), { timeout: 10_000 }).toBe('Milch');

	// Offline: A ändert, die Änderung wartet in der Outbox, B sieht noch den alten Stand.
	await contextA.setOffline(true);
	await a.evaluate(
		(itemId) => window.__familienhub!.update('shopping_items', itemId, { name: 'Hafermilch' }),
		id
	);
	expect(await nameOf(a, id)).toBe('Hafermilch');
	await expect(a.getByRole('status', { name: /Abgleich: (Offline|1 ausstehend)/ })).toBeVisible();
	await b.waitForTimeout(1_000);
	expect(await nameOf(b, id)).toBe('Milch');

	// Wieder online: A sendet nach, B bekommt die Änderung.
	await contextA.setOffline(false);
	await expect.poll(() => nameOf(b, id), { timeout: 15_000 }).toBe('Hafermilch');
	await expect(a.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();

	// Löschen auf B kommt bei A an.
	await b.evaluate((itemId) => window.__familienhub!.remove('shopping_items', itemId), id);
	await expect
		.poll(
			() =>
				a.evaluate(async (itemId) => {
					const items = await window.__familienhub!.list('shopping_items');
					return items.find((item) => item.id === itemId)?.deleted_at ?? '';
				}, id),
			{ timeout: 10_000 }
		)
		.not.toBe('');

	await contextA.close();
	await contextB.close();
});

test('Abmelden löscht die lokalen Daten', async ({ page }) => {
	const family = await createFamilyWithMember();
	await login(page, family.admin);
	await waitUntilSynced(page);
	await page.evaluate(
		(household) => window.__familienhub!.create('shopping_items', { household, name: 'Geheim' }),
		family.household
	);

	await page.getByRole('link', { name: 'Einstellungen' }).click();
	await page.getByRole('button', { name: 'Abmelden' }).click();
	await expect(page).toHaveURL(/\/login$/);

	const databases = await page.evaluate(async () =>
		(await indexedDB.databases()).map((db) => db.name)
	);
	expect(databases).not.toContain('familienhub');
});

/** Einkaufsliste über die echte Oberfläche öffnen und warten, bis der Abgleich steht. */
async function openShopping(page: Page): Promise<void> {
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Einkauf', exact: true })
		.click();
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 10_000
	});
}

async function addItem(page: Page, text: string): Promise<void> {
	await page.getByLabel('Was braucht ihr?').fill(text);
	await page.getByLabel('Was braucht ihr?').press('Enter');
}

test('Einkauf: beide Geräte ändern offline, danach haben beide denselben Stand', async ({
	browser
}) => {
	const family = await createFamilyWithMember();
	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openShopping(a);
	await openShopping(b);
	await addItem(a, 'Brot');
	await expect(b.getByRole('button', { name: 'Brot als gekauft markieren' })).toBeVisible({
		timeout: 10_000
	});

	// Beide offline: A legt an und hakt ab, B legt an; alles bleibt lokal gespeichert.
	await contextA.setOffline(true);
	await contextB.setOffline(true);
	await addItem(a, '2 l Milch');
	await a.getByRole('button', { name: 'Brot als gekauft markieren' }).click();
	await expect(a.getByRole('button', { name: 'Brot als gekauft markieren' })).toHaveCount(0);
	await addItem(b, 'Äpfel');
	await expect(b.getByRole('button', { name: /^Äpfel als gekauft markieren/ })).toBeVisible();
	await expect(a.getByRole('status', { name: /Abgleich: (Offline|\d+ ausstehend)/ })).toBeVisible();

	// A startet die App sogar offline neu: die Änderungen sind noch da.
	await a.reload();
	await expect(a.getByRole('button', { name: /^Milch 2 l als gekauft markieren/ })).toBeVisible();

	await contextA.setOffline(false);
	await contextB.setOffline(false);
	for (const page of [a, b]) {
		await expect(
			page.getByRole('button', { name: /^Milch 2 l als gekauft markieren/ })
		).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: /^Äpfel als gekauft markieren/ })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: 'Brot als gekauft markieren' })).toHaveCount(0);
	}

	await contextA.close();
	await contextB.close();
});

test('App offline gestartet: nach dem Wiederverbinden kommen Änderungen sofort live an', async ({
	browser
}) => {
	const family = await createFamilyWithMember();
	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const a = await contextA.newPage();
	const b = await contextB.newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openShopping(a);
	await openShopping(b);

	// Start ohne Netz: die Live-Abos kommen nicht zustande und werden später nachgeholt.
	await contextA.setOffline(true);
	await a.reload();
	await expect(a.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
	await contextA.setOffline(false);
	await expect(a.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 15_000
	});

	// Deutlich schneller als der Abgleich alle 60 Sekunden.
	await addItem(b, 'Käse');
	await expect(a.getByRole('button', { name: 'Käse als gekauft markieren' })).toBeVisible({
		timeout: 10_000
	});

	await contextA.close();
	await contextB.close();
});
