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
				'/kalender?ansicht=tag',
				'/kalender?ansicht=woche',
				'/kalender?ansicht=monat',
				'/aufgaben',
				'/einstellungen'
			];
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
		});
	});
}
