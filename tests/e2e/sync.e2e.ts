// Zwei Geräte derselben Familie: Änderungen kommen live an, auch nach einer Offline-Phase.
// Daten werden über den Test-Zugang window.__familienhub geschrieben (dieselben Repositories wie die App),
// bis es in Schritt 5 mit der Einkaufsliste eine echte Oberfläche dafür gibt.
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
