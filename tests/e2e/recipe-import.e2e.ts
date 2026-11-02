// Rezept-Import per Link (Schritt 12 A): Link einfügen, Editor ist ausgefüllt, prüfen, speichern;
// die Quelle steht am Rezept. Eine lokale Testseite ersetzt echte Rezeptseiten.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { createChild, createFamily, login } from './helpers.ts';

const PAGE = `<!doctype html><html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Linsensuppe &amp; Brot",
 "recipeYield":["2","2 Portionen"],"prepTime":"PT15M","cookTime":"PT30M",
 "recipeIngredient":["250 g rote Linsen","1 Zwiebel","Salz, nach Geschmack"],
 "recipeInstructions":[{"@type":"HowToStep","text":"Zwiebel würfeln."},{"@type":"HowToStep","text":"Alles 20 Minuten kochen."}],
 "recipeCategory":"Suppe"}
</script></head><body></body></html>`;

let site: Server;
let siteUrl: string;

test.beforeAll(async () => {
	site = createServer((req, res) => {
		res.writeHead(req.url === '/linsensuppe' ? 200 : 404, { 'content-type': 'text/html' });
		res.end(req.url === '/linsensuppe' ? PAGE : '<html><body>Kein Rezept</body></html>');
	});
	await new Promise<void>((done) => site.listen(0, '127.0.0.1', done));
	siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
	await new Promise((done) => site.close(done));
});

test('Rezept per Link übernehmen, prüfen und speichern', async ({ page }) => {
	const family = await createFamily();
	await login(page, family.email);
	await page.goto('/essen/rezepte/neu');
	await expect(page.getByRole('heading', { level: 1, name: 'Neues Rezept' })).toBeVisible();

	const box = page.getByRole('region', { name: 'Rezept aus dem Internet übernehmen' });
	// Seite ohne Rezept: verständliche Meldung, nichts ausgefüllt.
	await box.getByLabel('Link zum Rezept').fill(`${siteUrl}/blog`);
	await box.getByRole('button', { name: 'Holen' }).click();
	await expect(box.getByRole('alert')).toContainText('Fehler 404');
	await expect(page.getByLabel('Titel')).toHaveValue('');

	await box.getByLabel('Link zum Rezept').fill(`${siteUrl}/linsensuppe`);
	await box.getByLabel('Link zum Rezept').press('Enter');
	await expect(box.getByRole('status')).toContainText('Übernommen: 3 Zutaten');
	await expect(page.getByLabel('Titel')).toHaveValue('Linsensuppe & Brot');
	await expect(page.getByLabel('Portionen')).toHaveValue('2');
	await expect(page.getByLabel('Dauer (Minuten)')).toHaveValue('45');
	await expect(page.getByLabel('Zutat 1', { exact: true })).toHaveValue('rote Linsen');
	await expect(page.getByLabel('Menge (Zutat 1)')).toHaveValue('250');
	await expect(page.getByLabel('Zutat 3', { exact: true })).toHaveValue('Salz');
	await expect(page.getByLabel('Zubereitung')).toHaveValue(
		'Zwiebel würfeln.\nAlles 20 Minuten kochen.'
	);
	await expect(page.getByRole('button', { name: 'Suppe' })).toHaveAttribute('aria-pressed', 'true');

	// Prüfen und korrigieren, dann speichern.
	await page.getByLabel('Titel').fill('Linsensuppe');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Linsensuppe' })).toBeVisible();
	await expect(page.getByRole('link', { name: '127.0.0.1' })).toHaveAttribute(
		'href',
		`${siteUrl}/linsensuppe`
	);
	await expect(page.getByText('Quelle:')).toBeVisible();

	// Beim Bearbeiten gibt es kein Link-Feld (nur beim Anlegen).
	await page.getByRole('link', { name: 'Bearbeiten' }).click();
	await expect(page.getByLabel('Titel')).toHaveValue('Linsensuppe');
	await expect(page.getByLabel('Link zum Rezept')).toHaveCount(0);
});

test('Heimnetz-Adressen werden abgelehnt, offline ist das Feld aus', async ({ page, context }) => {
	const family = await createFamily();
	await login(page, family.email);
	await page.goto('/essen/rezepte/neu');
	const box = page.getByRole('region', { name: 'Rezept aus dem Internet übernehmen' });
	await box.getByLabel('Link zum Rezept').fill('http://192.168.1.1/');
	await box.getByRole('button', { name: 'Holen' }).click();
	await expect(box.getByRole('alert')).toContainText('Heimnetz');

	await context.setOffline(true);
	await expect(box.getByText('Ohne Internet kann kein Rezept geholt werden.')).toBeVisible();
	await expect(box.getByLabel('Link zum Rezept')).toBeDisabled();
	await context.setOffline(false);
});

test('Kinder sehen den Editor gar nicht', async ({ page }) => {
	const family = await createFamily();
	const child = await createChild(family.email, family.household);
	await login(page, child);
	await page.goto('/essen/rezepte/neu');
	await expect(page.getByLabel('Link zum Rezept')).toHaveCount(0);
});
