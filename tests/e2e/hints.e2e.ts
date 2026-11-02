// Hinweise auf Heute (Schritt 11 D): Kochzeit-Konflikt mit Vorschlägen, Ausblenden mit
// „Später“ und „Nie wieder so“, Zurücknehmen in den Einstellungen.
import { expect, test, type Page } from '@playwright/test';
import { apiCreate, apiToken, createFamily, login, openSettingsSection } from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAY = 86_400_000;

async function seed(email: string, household: string) {
	const token = await apiToken(email);
	const tomorrow = iso(new Date(Date.now() + DAY));
	const lasagne = await apiCreate(token, 'recipes', {
		household,
		title: 'Lasagne',
		servings: 4,
		prep_minutes: 90
	});
	await apiCreate(token, 'recipes', {
		household,
		title: 'Omelett',
		servings: 2,
		prep_minutes: 15,
		is_favorite: true
	});
	await apiCreate(token, 'meal_plan_entries', {
		household,
		date: tomorrow,
		slot: 'dinner',
		title: 'Lasagne',
		recipe: lasagne.id
	});
	await apiCreate(token, 'meal_plan_entries', {
		household,
		date: iso(new Date(Date.now() + 2 * DAY)),
		slot: 'dinner',
		title: 'Nudeln'
	});
	await apiCreate(token, 'events', {
		household,
		title: 'Training',
		start: new Date(`${tomorrow}T17:00:00`).toISOString(),
		end: new Date(`${tomorrow}T18:15:00`).toISOString(),
		exdates: []
	});
}

function hints(page: Page) {
	return page.getByRole('region', { name: 'Hinweise' });
}

test('Kochzeit-Konflikt: Vorschläge, schnelleres Rezept übernehmen', async ({ page }) => {
	const family = await createFamily();
	await seed(family.email, family.household);
	await login(page, family.email);

	const region = hints(page);
	await expect(
		region.getByText(
			/Lasagne braucht etwa 90 Min\. Kochzeit \(17:00–18:30\), aber Training ist von 17:00 bis 18:15\./
		)
	).toBeVisible();
	await expect(region.getByRole('button', { name: /^Mit .* tauschen \(Nudeln\)$/ })).toBeVisible();
	await expect(region.getByRole('button', { name: /^Am .* vorbereiten$/ })).toBeVisible();
	await region.getByRole('button', { name: 'Stattdessen Omelett (15 Min.)' }).click();
	await expect(page.getByRole('region', { name: 'Hinweise' })).toHaveCount(0);

	await page.goto('/essen/wochenplan');
	await expect(page.getByText('Omelett').first()).toBeVisible();
	await expect(page.getByText('Lasagne')).toHaveCount(0);
});

test('Ausblenden: „Später“ bleibt nach dem Neuladen, „Nie wieder so“ lässt sich zurücknehmen', async ({
	page
}) => {
	const family = await createFamily();
	await seed(family.email, family.household);
	await login(page, family.email);

	await hints(page).getByRole('button', { name: 'Später' }).click();
	await expect(hints(page)).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
	await expect(hints(page)).toHaveCount(0);

	// „Später“ ist kein dauerhaftes Ausblenden: die Einstellungen zeigen nichts zum Zurücknehmen.
	await page.goto('/einstellungen');
	await openSettingsSection(page, 'Hinweise');
	await expect(page.getByText('Keine Hinweise ausgeblendet.')).toBeVisible();
});

test('„Nie wieder so“ blendet Konflikt-Hinweise aus, Einstellungen zeigen sie wieder', async ({
	page
}) => {
	const family = await createFamily();
	await seed(family.email, family.household);
	await login(page, family.email);

	await hints(page).getByRole('button', { name: 'Nie wieder so' }).click();
	await expect(hints(page)).toHaveCount(0);

	await page.goto('/einstellungen');
	await openSettingsSection(page, 'Hinweise');
	await page.getByRole('button', { name: 'Ausgeblendete Hinweise wieder zeigen' }).click();
	await expect(page.getByText('Hinweise werden wieder gezeigt.')).toBeVisible();

	await page.goto('/');
	await expect(hints(page).getByText(/Lasagne braucht etwa 90 Min\./)).toBeVisible();
});
