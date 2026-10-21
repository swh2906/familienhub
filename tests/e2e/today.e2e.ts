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
	// In zwei Stunden, aber spätestens 23 Uhr – sonst rutscht der Termin abends auf morgen.
	const lateToday = new Date();
	lateToday.setHours(23, 0, 0, 0);
	const endOfDay = new Date();
	endOfDay.setHours(23, 59, 0, 0);
	const start = new Date(Math.min(Date.now() + 2 * 3_600_000, lateToday.getTime()));
	await apiCreate(token, 'events', {
		household,
		title: 'Elterngespräch',
		start: start.toISOString(),
		// Bis kurz vor Mitternacht: auch spät abends noch unter „Als Nächstes“ (läuft noch).
		end: endOfDay.toISOString(),
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
	await expect(card(a, 'Als Nächstes').getByText('Elterngespräch')).toBeVisible();
	await expect(
		card(a, 'Nächste 7 Tage').getByRole('link', { name: 'Gemüse-Lasagne – im Wochenplan' })
	).toBeVisible();
	const overview = a.getByRole('navigation', { name: 'Überblick für heute' });
	await expect(overview.getByRole('link', { name: /1\s*Termine heute/ })).toBeVisible();
	await expect(overview.getByRole('link', { name: /1\s*Aufgaben fällig/ })).toBeVisible();
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
	await expect(b.getByRole('button', { name: /^Milch 2 l als gekauft markieren/ })).toBeVisible({
		timeout: 10_000
	});

	// Aufgabe auf der Startseite abhaken, mit Rückgängig.
	await card(a, 'Aufgaben').getByRole('button', { name: 'Blumen gießen erledigen' }).click();
	await expect(card(a, 'Aufgaben').getByText('Heute ist nichts fällig.')).toBeVisible();
	await a.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(card(a, 'Aufgaben').getByText('Blumen gießen')).toBeVisible();

	// Kartenkopf und Tage der Woche führen in den Kalender (Name = sichtbare Überschrift, WCAG 2.5.3).
	await a.getByRole('link', { name: 'Als Nächstes' }).click();
	await expect(a).toHaveURL(/\/kalender\?ansicht=tag/);
	await a.goBack();
	await card(a, 'Nächste 7 Tage')
		.getByRole('link', { name: /^Morgen/ })
		.click();
	await expect(a).toHaveURL(/\/kalender\?ansicht=tag&datum=\d{4}-\d{2}-\d{2}/);
});

test('Leere Zustände und Kinder', async ({ page }) => {
	const family = await createFamilyWithMember();
	const username = await createChild(family.admin, family.household);
	await login(page, username);

	await expect(card(page, 'Als Nächstes').getByText('Heute steht nichts mehr an.')).toBeVisible();
	await expect(
		card(page, 'Als Nächstes').getByRole('link', { name: 'Termin anlegen' })
	).toHaveCount(0);
	// Kinder planen kein Essen; sie sehen nur, dass nichts geplant ist.
	await expect(card(page, 'Nächste 7 Tage').getByText('Kein Essen geplant')).toHaveCount(7);
	await expect(page.getByRole('button', { name: 'Nur meins' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(card(page, 'Einkauf').getByText('Alles da – nichts auf der Liste.')).toBeVisible();
	await expect(card(page, 'Aufgaben').getByText('Heute ist nichts fällig.')).toBeVisible();

	// Kinder dürfen auf der Startseite einkaufen gehen (hinzufügen).
	await card(page, 'Einkauf').getByLabel('Was braucht ihr?').fill('Kekse');
	await card(page, 'Einkauf').getByLabel('Was braucht ihr?').press('Enter');
	await expect(
		card(page, 'Einkauf').getByRole('button', { name: 'Kekse als gekauft markieren' })
	).toBeVisible();
});

test('„Alle / Nur meins“ bleibt auf dem Gerät gespeichert', async ({ page }) => {
	const family = await createFamilyWithMember();
	await login(page, family.admin);
	const mine = page.getByRole('button', { name: 'Nur meins' });
	await expect(page.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true');
	await mine.click();
	await expect(mine).toHaveAttribute('aria-pressed', 'true');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Nur meins' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	// Leere Woche: Erwachsene können direkt Essen planen.
	await card(page, 'Nächste 7 Tage').getByRole('link', { name: 'Essen planen' }).first().click();
	await expect(page).toHaveURL(/\/essen\/wochenplan\?woche=/);
});
