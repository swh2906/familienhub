// Schnelleingabe auf „Heute“: eine Zeile wird zum Termin, zur Aufgabe oder zum Einkauf.
import { expect, test, type Page } from '@playwright/test';
import { createChild, createFamilyWithMember, login } from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const tomorrow = iso(new Date(Date.now() + 86_400_000));

async function quick(page: Page, text: string) {
	await page.getByLabel('Etwas hinzufügen').fill(text);
}

function kind(page: Page, name: string) {
	return page.getByRole('group', { name: 'Art' }).getByRole('button', { name });
}

test('Termin, Aufgabe und Einkauf aus einer Zeile', async ({ page }) => {
	const family = await createFamilyWithMember();
	await login(page, family.admin);

	// Termin mit Uhrzeit und Person
	await quick(page, 'Morgen 15 Uhr Zahnarzt Tom');
	await expect(kind(page, 'Termin')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText(/^Zahnarzt Tom · .* · 15:00–16:00 · Tom$/)).toBeVisible();
	await page.getByLabel('Etwas hinzufügen').press('Enter');
	await expect(
		page.getByRole('status').filter({ hasText: 'Termin „Zahnarzt Tom“ angelegt.' })
	).toBeVisible();

	// Aufgabe: Name nicht im Titel, Tom zugewiesen
	await quick(page, 'Tom Müll rausbringen morgen');
	await expect(kind(page, 'Aufgabe')).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Eintrag hinzufügen' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Aufgabe „Müll rausbringen“ angelegt.' })
	).toBeVisible();

	// Einkauf mit Menge
	await quick(page, '2 l Milch');
	await expect(kind(page, 'Einkauf')).toHaveAttribute('aria-pressed', 'true');
	await page.getByLabel('Etwas hinzufügen').press('Enter');
	await expect(
		page
			.getByRole('region', { name: 'Einkauf' })
			.getByRole('button', { name: /^Milch 2 l als gekauft markieren/ })
	).toBeVisible();

	// Art von Hand umstellen: „Oma anrufen morgen“ wäre eine Aufgabe, wird ein ganztägiger Termin.
	await quick(page, 'Oma anrufen morgen');
	await expect(kind(page, 'Aufgabe')).toHaveAttribute('aria-pressed', 'true');
	await kind(page, 'Termin').click();
	await expect(page.getByText(/^Oma anrufen · .* · ganztägig$/)).toBeVisible();
	await page.getByLabel('Etwas hinzufügen').press('Enter');
	await expect(
		page.getByRole('status').filter({ hasText: 'Termin „Oma anrufen“ angelegt.' })
	).toBeVisible();

	// Alles ist im richtigen Bereich angekommen.
	await page.goto(`/kalender?ansicht=tag&datum=${tomorrow}`);
	await expect(page.getByText('Zahnarzt Tom').first()).toBeVisible();
	await expect(page.getByText('Oma anrufen').first()).toBeVisible();
	await page.goto('/aufgaben');
	await page
		.getByRole('group', { name: 'Aufgaben filtern' })
		.getByRole('button', { name: 'Alle' })
		.click();
	await expect(page.getByText('Müll rausbringen')).toBeVisible();
});

test('Kinder legen über die Schnelleingabe nur Einkäufe an', async ({ page }) => {
	const family = await createFamilyWithMember();
	const username = await createChild(family.admin, family.household);
	await login(page, username);

	await quick(page, 'Morgen 15 Uhr Kekse');
	await expect(page.getByRole('group', { name: 'Art' })).toHaveCount(0);
	await page.getByLabel('Etwas hinzufügen').press('Enter');
	await expect(
		page.getByRole('status').filter({ hasText: 'steht auf der Einkaufsliste' })
	).toBeVisible();
	await expect(
		page
			.getByRole('region', { name: 'Einkauf' })
			.getByRole('button', { name: /als gekauft markieren/ })
	).toHaveCount(1);
});
