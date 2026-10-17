// PWA offline: Nach dem ersten Besuch startet die App ohne Netz (Service Worker), alle Bereiche
// sind bedienbar, Änderungen warten in der Outbox und gehen beim Wiederverbinden raus.
import { expect, test } from '@playwright/test';
import { createFamily, login } from './helpers.ts';

const AREAS = [
	{ link: 'Heute', heading: 'Heute', url: /\/$/ },
	{ link: 'Essen', heading: 'Wochenplan', url: /\/essen\/wochenplan/ },
	{ link: 'Einkauf', heading: 'Einkauf', url: /\/einkauf/ },
	{ link: 'Kalender', heading: 'Kalender', url: /\/kalender/ },
	{ link: 'Aufgaben', heading: 'Aufgaben', url: /\/aufgaben/ }
];

test('App startet ohne Netz und alle Bereiche sind nutzbar', async ({ page, context }) => {
	const family = await createFamily();
	await login(page, family.email);
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();

	// Warten, bis der Service Worker installiert ist und die Seite steuert.
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	// „Flugmodus“: kompletter Neustart der App auf einer Unterseite.
	await context.setOffline(true);
	await page.goto('/kalender');
	await expect(page.getByRole('heading', { level: 1, name: 'Kalender' })).toBeVisible();
	await expect(page.getByRole('status', { name: 'Abgleich: Offline' })).toBeVisible();

	const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
	for (const area of AREAS) {
		await nav.getByRole('link', { name: area.link, exact: true }).click();
		await expect(page).toHaveURL(area.url);
		await expect(page.getByRole('heading', { level: 1, name: area.heading })).toBeVisible();
	}

	// Offline hinzufügen: landet lokal und in der Outbox.
	await nav.getByRole('link', { name: 'Einkauf', exact: true }).click();
	await page.getByLabel('Was braucht ihr?').fill('Milch');
	await page.getByLabel('Was braucht ihr?').press('Enter');
	await expect(page.getByRole('button', { name: 'Milch als gekauft markieren' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Milch als gekauft markieren' })).toBeVisible();
	await expect(
		page.getByRole('status', { name: /Abgleich: (Offline|1 ausstehend)/ })
	).toBeVisible();

	// Wieder online: Outbox wird gesendet.
	await context.setOffline(false);
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 15_000
	});
});
