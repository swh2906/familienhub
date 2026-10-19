// Barrierefreiheit: automatische axe-Prüfung (WCAG 2.1 A/AA) aller Seiten in Hell und Dunkel,
// mit Beispieldaten, damit Listen, Kacheln und Termine wirklich gerendert sind.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { apiCreate, apiToken, createFamilyWithMember, login } from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function seed(admin: string, household: string): Promise<string> {
	const token = await apiToken(admin);
	const today = iso(new Date());
	const start = new Date(Date.now() + 3_600_000);
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
	await apiCreate(token, 'shopping_items', {
		household,
		name: 'Milch',
		category: 'Milchprodukte',
		checked: true
	});
	await apiCreate(token, 'shopping_items', {
		household,
		name: 'Mehl',
		amount: 500,
		unit: 'g',
		category: 'Vorrat'
	});
	await apiCreate(token, 'tasks', {
		household,
		title: 'Blumen gießen',
		due_date: today,
		status: 'open'
	});
	const recipe = await apiCreate(token, 'recipes', {
		household,
		title: 'Pfannkuchen',
		servings: 4,
		instructions: 'Alles verrühren und ausbacken.',
		tags: ['schnell']
	});
	// Zutaten mit Zusatzangaben, damit Hinweise (ca., optional, Alternativen) mitgeprüft werden.
	await apiCreate(token, 'recipe_ingredients', {
		recipe: recipe.id,
		name: 'Mehl',
		amount: 300,
		unit: 'g',
		amount_kind: 'approx',
		alternatives: ['Dinkelmehl'],
		sort: 0
	});
	await apiCreate(token, 'recipe_ingredients', {
		recipe: recipe.id,
		name: 'Zimt',
		optional: true,
		amount_kind: 'to_taste',
		note: 'gemahlen',
		sort: 1
	});
	// Vorrat: zwei Basisartikel mit verschiedenem Status und eine offene „Gekocht?“-Frage.
	const mehl = await apiCreate(token, 'ingredients', {
		household,
		name: 'Mehl',
		key: 'mehl',
		unit: 'g',
		pack_amount: 1000
	});
	await apiCreate(token, 'ingredients', { household, name: 'Zimt', key: 'zimt' });
	await apiCreate(token, 'pantry_events', {
		household,
		ingredient: mehl.id,
		kind: 'set',
		amount: 100,
		unit: 'g',
		at: new Date().toISOString()
	});
	await apiCreate(token, 'meal_plan_entries', {
		household,
		date: iso(new Date(Date.now() + 86_400_000)),
		slot: 'lunch',
		title: 'Pfannkuchen',
		recipe: recipe.id
	});
	// Termin im Kochfenster des Mittagessens → Hinweis mit Vorschlägen auf Heute.
	const tomorrow = iso(new Date(Date.now() + 86_400_000));
	await apiCreate(token, 'events', {
		household,
		title: 'Zahnarzt',
		start: new Date(`${tomorrow}T11:30:00`).toISOString(),
		end: new Date(`${tomorrow}T12:15:00`).toISOString(),
		exdates: []
	});
	await apiCreate(token, 'meal_plan_entries', {
		household,
		date: iso(new Date(Date.now() - 86_400_000)),
		slot: 'dinner',
		title: 'Pfannkuchen',
		recipe: recipe.id
	});
	return recipe.id;
}

async function audit(page: Page, label: string) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	const summary = results.violations.map(
		(v) => `${label}: ${v.id} (${v.impact}) – ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
	);
	expect(summary).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
	test.describe(`axe ${scheme}`, () => {
		test.use({ colorScheme: scheme });

		test('Anmelde-Seiten', async ({ page }) => {
			await page.goto('/login');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await audit(page, 'login');
			await page.goto('/register');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await audit(page, 'register');
		});

		test('App-Seiten', async ({ page }) => {
			const family = await createFamilyWithMember();
			const recipe = await seed(family.admin, family.household);
			await login(page, family.admin);
			await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible();

			const pages = [
				'/',
				'/essen/wochenplan',
				'/essen/rezepte',
				`/essen/rezepte/${recipe}`,
				`/essen/rezepte/${recipe}/bearbeiten`,
				`/essen/rezepte/${recipe}/kochen`,
				'/essen/rezepte/neu',
				'/einkauf',
				'/einkauf/vorrat',
				'/einkauf?modus=einkaufen',
				'/kalender?ansicht=tag',
				'/kalender?ansicht=woche',
				'/kalender?ansicht=monat',
				'/aufgaben',
				'/aufgaben/feedback',
				'/einstellungen'
			];
			await expect(page.getByRole('region', { name: 'Hinweise' })).toBeVisible();
			for (const path of pages) {
				await page.goto(path);
				await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
				await audit(page, path);
			}
		});

		test('Dialoge', async ({ page }) => {
			const family = await createFamilyWithMember();
			await seed(family.admin, family.household);
			await login(page, family.admin);

			await page.goto('/aufgaben');
			await page.getByRole('button', { name: 'Neue Aufgabe' }).first().click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await audit(page, 'Aufgaben-Dialog');

			await page.goto('/kalender');
			await page.getByRole('button', { name: 'Neuer Termin' }).first().click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await audit(page, 'Termin-Dialog');

			await page.goto('/einkauf');
			await page.getByRole('button', { name: 'Aus dem Essensplan' }).click();
			const transfer = page.getByRole('dialog', { name: 'Fehlendes für die nächsten 7 Tage' });
			await expect(transfer.getByRole('group').first()).toBeVisible();
			await audit(page, 'Essensplan-Dialog');
		});
	});
}
