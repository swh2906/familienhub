// Wochenplan über die echte Oberfläche: planen mit Link, live auf Gerät B, verschieben (Dialog und
// Ziehen), entfernen, Wochen blättern; Kinder nur lesend.
import { expect, test, type Page } from '@playwright/test';
import {
	apiCreate,
	apiToken,
	createChild,
	createFamily,
	createFamilyWithMember,
	login
} from './helpers.ts';

const DAY_MS = 86_400_000;

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Montag und Dienstag der aktuellen Woche (lokal). */
function thisWeek(): {
	monday: string;
	tuesday: string;
	mondayLabel: RegExp;
	tuesdayLabel: RegExp;
} {
	const now = new Date();
	const monday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() - ((now.getDay() + 6) % 7),
		12
	);
	const tuesday = new Date(monday.getTime() + DAY_MS);
	const label = (d: Date) =>
		new RegExp(
			new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
		);
	return {
		monday: iso(monday),
		tuesday: iso(tuesday),
		mondayLabel: label(monday),
		tuesdayLabel: label(tuesday)
	};
}

async function openPlan(page: Page) {
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Essen' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Wochenplan' })).toBeVisible();
}

function slot(page: Page, meal: string, day: RegExp) {
	return page.getByRole('group', { name: new RegExp(`^${meal}, ${day.source}`) });
}

test('planen mit Link, live auf Gerät B, verschieben und entfernen', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const week = thisWeek();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openPlan(a);
	await openPlan(b);

	// Montag Abend planen, mit Link zur eigenen Rezept-App.
	await slot(a, 'Abend', week.mondayLabel)
		.getByRole('button', { name: /hinzufügen/ })
		.click();
	const dialog = a.getByRole('dialog', { name: 'Mahlzeit planen' });
	await dialog.getByLabel('Gericht').fill('Gemüse-Lasagne');
	await dialog.getByLabel('Link zum Rezept (optional)').fill('javascript:alert(1)');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog.getByRole('alert')).toHaveText(/http:\/\/ oder https:\/\//);
	await dialog.getByLabel('Link zum Rezept (optional)').fill('rezepte.example.de/lasagne');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();

	const mondayDinner = slot(a, 'Abend', week.mondayLabel);
	await expect(mondayDinner.getByRole('button', { name: /Gemüse-Lasagne/ })).toBeVisible();
	await expect(
		mondayDinner.getByRole('link', { name: 'Rezept für Gemüse-Lasagne öffnen' })
	).toHaveAttribute('href', 'https://rezepte.example.de/lasagne');

	// Gerät B sieht den Eintrag live.
	await expect(
		slot(b, 'Abend', week.mondayLabel).getByRole('button', { name: /Gemüse-Lasagne/ })
	).toBeVisible({
		timeout: 10_000
	});

	// Über den Dialog auf Dienstag Mittag verschieben.
	await mondayDinner.getByRole('button', { name: /Gemüse-Lasagne/ }).click();
	const edit = a.getByRole('dialog', { name: 'Mahlzeit bearbeiten' });
	await edit.getByLabel('Tag').fill(week.tuesday);
	await edit.getByLabel('Mahlzeit').selectOption('lunch');
	await edit.getByRole('button', { name: 'Speichern' }).click();
	await expect(
		slot(a, 'Mittag', week.tuesdayLabel).getByRole('button', { name: /Gemüse-Lasagne/ })
	).toBeVisible();
	await expect(
		slot(b, 'Mittag', week.tuesdayLabel).getByRole('button', { name: /Gemüse-Lasagne/ })
	).toBeVisible({
		timeout: 10_000
	});
	await expect(
		slot(b, 'Abend', week.mondayLabel).getByRole('button', { name: /Gemüse-Lasagne/ })
	).toHaveCount(0);

	// Entfernen.
	await slot(a, 'Mittag', week.tuesdayLabel)
		.getByRole('button', { name: /Gemüse-Lasagne/ })
		.click();
	await a
		.getByRole('dialog', { name: 'Mahlzeit bearbeiten' })
		.getByRole('button', { name: 'Entfernen' })
		.click();
	await expect(
		slot(b, 'Mittag', week.tuesdayLabel).getByRole('button', { name: /Gemüse-Lasagne/ })
	).toHaveCount(0, {
		timeout: 10_000
	});
});

test('Ziehen auf einen anderen Platz (Desktop)', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Ziehen gibt es nur mit der Maus');
	const { email, household } = await createFamily();
	const week = thisWeek();
	await apiCreate(await apiToken(email), 'meal_plan_entries', {
		household,
		date: week.monday,
		slot: 'breakfast',
		title: 'Müsli'
	});
	await login(page, email);
	await openPlan(page);

	const muesli = slot(page, 'Frühstück', week.mondayLabel).getByRole('button', { name: /Müsli/ });
	await muesli.dragTo(slot(page, 'Frühstück', week.tuesdayLabel));
	await expect(
		slot(page, 'Frühstück', week.tuesdayLabel).getByRole('button', { name: /Müsli/ })
	).toBeVisible();
	await expect(
		slot(page, 'Frühstück', week.mondayLabel).getByRole('button', { name: /Müsli/ })
	).toHaveCount(0);
});

test('Wochen blättern und Kinder nur lesend', async ({ page }) => {
	const { email, household } = await createFamily();
	const week = thisWeek();
	await apiCreate(await apiToken(email), 'meal_plan_entries', {
		household,
		date: week.monday,
		slot: 'dinner',
		title: 'Pizza',
		recipe_url: 'https://rezepte.example.de/pizza'
	});
	const username = await createChild(email, household);
	await login(page, username);
	await openPlan(page);

	// Kind sieht den Eintrag und den Link, aber keine Knöpfe zum Ändern.
	const dinner = slot(page, 'Abend', week.mondayLabel);
	await expect(dinner.getByText('Pizza')).toBeVisible();
	await expect(dinner.getByRole('link', { name: 'Rezept für Pizza öffnen' })).toBeVisible();
	await expect(page.getByRole('button', { name: /hinzufügen/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Pizza/ })).toHaveCount(0);

	// Nächste Woche ist leer, „Diese Woche“ führt zurück.
	await page.getByRole('link', { name: 'Nächste Woche' }).click();
	await expect(page).toHaveURL(/woche=\d{4}-W\d{2}/);
	await expect(page.getByText('Pizza')).toHaveCount(0);
	await expect(page.getByText('Für diese Woche ist noch nichts geplant.')).toBeVisible();
	await page.getByRole('link', { name: 'Diese Woche' }).click();
	await expect(page.getByText('Pizza')).toBeVisible();
});
