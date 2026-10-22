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

test('Ziehen mit dem Finger: lange drücken, dann auf einen anderen Tag (iPhone/iPad)', async ({
	page
}) => {
	const { email, household } = await createFamily();
	const week = thisWeek();
	await apiCreate(await apiToken(email), 'meal_plan_entries', {
		household,
		date: week.monday,
		slot: 'dinner',
		title: 'Suppe'
	});
	await login(page, email);
	await openPlan(page);

	const dish = slot(page, 'Abend', week.mondayLabel).getByRole('button', { name: /Suppe/ });
	const target = slot(page, 'Abend', week.tuesdayLabel);
	await target.scrollIntoViewIfNeeded();
	await dish.scrollIntoViewIfNeeded();
	const from = (await dish.boundingBox())!;
	const touch = { pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, bubbles: true };
	await dish.dispatchEvent('pointerdown', {
		...touch,
		clientX: from.x + from.width / 2,
		clientY: from.y + from.height / 2
	});
	// Langes Drücken: danach erscheint die Vorschau am Finger.
	await page.waitForTimeout(550);
	const to = (await target.boundingBox())!;
	const point = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
	await page.evaluate(
		({ x, y, touch }) =>
			window.dispatchEvent(new PointerEvent('pointermove', { ...touch, clientX: x, clientY: y })),
		{ ...point, touch }
	);
	await expect(page.locator('.ghost')).toHaveText('Suppe');
	await page.evaluate(
		({ x, y, touch }) =>
			window.dispatchEvent(new PointerEvent('pointerup', { ...touch, clientX: x, clientY: y })),
		{ ...point, touch }
	);

	await expect(target.getByRole('button', { name: /Suppe/ })).toBeVisible();
	await expect(
		slot(page, 'Abend', week.mondayLabel).getByRole('button', { name: /Suppe/ })
	).toHaveCount(0);
});

test('Finger, der sich vor dem langen Drücken bewegt, scrollt nur (kein Ziehen)', async ({
	page
}) => {
	const { email, household } = await createFamily();
	const week = thisWeek();
	await apiCreate(await apiToken(email), 'meal_plan_entries', {
		household,
		date: week.monday,
		slot: 'dinner',
		title: 'Suppe'
	});
	await login(page, email);
	await openPlan(page);
	const dish = slot(page, 'Abend', week.mondayLabel).getByRole('button', { name: /Suppe/ });
	await dish.scrollIntoViewIfNeeded();
	const from = (await dish.boundingBox())!;
	const touch = { pointerType: 'touch', pointerId: 8, isPrimary: true, button: 0, bubbles: true };
	const x = from.x + from.width / 2;
	const y = from.y + from.height / 2;
	await dish.dispatchEvent('pointerdown', { ...touch, clientX: x, clientY: y });
	await page.evaluate(
		({ x, y, touch }) =>
			window.dispatchEvent(
				new PointerEvent('pointermove', { ...touch, clientX: x, clientY: y + 40 })
			),
		{ x, y, touch }
	);
	await page.waitForTimeout(550);
	await expect(page.locator('.ghost')).toHaveCount(0);
	await page.evaluate(
		({ x, y, touch }) =>
			window.dispatchEvent(
				new PointerEvent('pointerup', { ...touch, clientX: x, clientY: y + 40 })
			),
		{ x, y, touch }
	);
	await expect(dish).toBeVisible();
});

test('Geplante Mahlzeiten einstellen: gilt für die Familie, nichts verschwindet', async ({
	page
}) => {
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

	await page.getByRole('button', { name: 'Mahlzeiten' }).click();
	const choice = page.getByRole('group', { name: 'Geplante Mahlzeiten' });
	await choice.getByRole('button', { name: 'Frühstück' }).click();
	await choice.getByRole('button', { name: 'Mittag' }).click();
	await expect(choice.getByRole('button', { name: 'Abend' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	// Die letzte Mahlzeit bleibt (gesperrt, damit der Plan nie leer ist).
	await expect(choice.getByRole('button', { name: 'Abend' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);

	// Mittag ist ausgeblendet, Frühstück bleibt sichtbar, weil am Montag schon Müsli geplant ist.
	await expect(slot(page, 'Mittag', week.tuesdayLabel)).toHaveCount(0);
	await expect(slot(page, 'Abend', week.tuesdayLabel)).toBeVisible();
	await expect(
		slot(page, 'Frühstück', week.mondayLabel).getByRole('button', { name: /Müsli/ })
	).toBeVisible();

	// Bleibt nach dem Neuladen (in der Familie gespeichert und abgeglichen).
	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 10_000
	});
	await page.reload();
	await expect(slot(page, 'Mittag', week.tuesdayLabel)).toHaveCount(0);
	await expect(slot(page, 'Abend', week.tuesdayLabel)).toBeVisible();
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
