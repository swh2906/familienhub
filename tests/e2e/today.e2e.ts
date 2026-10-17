// Heute-Ansicht: zeigt Daten aus allen vier Bereichen; Schnell-Eingabe und Abhaken direkt auf
// der Startseite kommen live auf dem zweiten Gerät an; Kinder sehen die passende Auswahl.
import { expect, test, type Page } from '@playwright/test';
import { apiCreate, apiToken, createChild, createFamilyWithMember, login } from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const today = iso(new Date());

function card(page: Page, name: string) {
	return page.getByRole('region', { name });
}

async function seed(admin: string, household: string) {
	const token = await apiToken(admin);
	const start = new Date(Date.now() + 2 * 3_600_000);
	await apiCreate(token, 'events', {
		household,
		title: 'Elterngespräch',
		start: start.toISOString(),
		end: new Date(start.getTime() + 3_600_000).toISOString(),
		exdates: []
	});
	await apiCreate(token, 'meal_plan_entries', {
		household,
		date: today,
		slot: 'dinner',
		title: 'Gemüse-Lasagne'
	});
	await apiCreate(token, 'shopping_items', {
		household,
		name: 'Brot',
		category: 'Brot & Backwaren'
	});
	await apiCreate(token, 'tasks', {
		household,
		title: 'Blumen gießen',
		due_date: today,
		status: 'open'
	});
}

test('Heute zeigt alle vier Bereiche; Hinzufügen und Abhaken kommen live an', async ({
	browser
}) => {
	const family = await createFamilyWithMember();
	await seed(family.admin, family.household);
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);

	await expect(a.getByText(/^(Guten Morgen|Hallo|Guten Abend|Gute Nacht), Julia$/)).toBeVisible();
	await expect(card(a, 'Termine heute').getByText('Elterngespräch')).toBeVisible();
	await expect(card(a, 'Termine heute').getByText('als Nächstes')).toBeVisible();
	await expect(card(a, 'Essen heute').getByText('Gemüse-Lasagne')).toBeVisible();
	await expect(
		card(a, 'Einkauf').getByRole('button', { name: 'Brot als gekauft markieren' })
	).toBeVisible();
	await expect(card(a, 'Aufgaben').getByText('Blumen gießen')).toBeVisible();

	// Schnell-Eingabe auf der Startseite; Gerät B sieht den Artikel in der Einkaufsliste.
	await b
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Einkauf' })
		.click();
	await card(a, 'Einkauf').getByLabel('Was braucht ihr?').fill('2 l Milch');
	await card(a, 'Einkauf').getByLabel('Was braucht ihr?').press('Enter');
	await expect(card(a, 'Einkauf').getByText('2 offen')).toBeVisible();
	await expect(b.getByRole('button', { name: /^2 l Milch als gekauft markieren/ })).toBeVisible({
		timeout: 10_000
	});

	// Aufgabe auf der Startseite abhaken, mit Rückgängig.
	await card(a, 'Aufgaben').getByRole('button', { name: 'Blumen gießen erledigen' }).click();
	await expect(card(a, 'Aufgaben').getByText('Heute ist nichts fällig.')).toBeVisible();
	await a.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(card(a, 'Aufgaben').getByText('Blumen gießen')).toBeVisible();

	// Kartenkopf führt in den Bereich.
	await a.getByRole('link', { name: 'Kalender öffnen' }).click();
	await expect(a).toHaveURL(/\/kalender\?ansicht=tag/);
});

test('Leere Zustände und Kinder', async ({ page }) => {
	const family = await createFamilyWithMember();
	const username = await createChild(family.admin, family.household);
	await login(page, username);

	await expect(card(page, 'Termine heute').getByText('Heute keine Termine.')).toBeVisible();
	await expect(
		card(page, 'Termine heute').getByRole('link', { name: 'Termin anlegen' })
	).toHaveCount(0);
	await expect(
		card(page, 'Essen heute').getByRole('link', { name: 'Mahlzeit planen' })
	).toBeVisible();
	await expect(card(page, 'Einkauf').getByText('Alles da – nichts auf der Liste.')).toBeVisible();
	await expect(card(page, 'Aufgaben').getByText('Heute ist nichts fällig.')).toBeVisible();

	// Kinder dürfen auf der Startseite einkaufen gehen (hinzufügen).
	await card(page, 'Einkauf').getByLabel('Was braucht ihr?').fill('Kekse');
	await card(page, 'Einkauf').getByLabel('Was braucht ihr?').press('Enter');
	await expect(
		card(page, 'Einkauf').getByRole('button', { name: 'Kekse als gekauft markieren' })
	).toBeVisible();
});
