// Kochansicht: Rezept als Karteikarte, Schwierigkeit antippen, Portionen umrechnen, Zutaten
// abhaken, Escape führt zurück; Kinder sehen die Karte, ändern aber nichts.
import { expect, test } from '@playwright/test';
import { apiCreate, apiToken, createChild, createFamily, login } from './helpers.ts';

async function seed(admin: string, household: string): Promise<string> {
	const token = await apiToken(admin);
	const recipe = await apiCreate(token, 'recipes', {
		household,
		title: 'Pfannkuchen',
		servings: 4,
		prep_minutes: 90,
		tags: ['süß'],
		instructions: 'Alles verrühren.\nIn der Pfanne ausbacken.'
	});
	await apiCreate(token, 'recipe_ingredients', {
		recipe: recipe.id,
		name: 'Mehl',
		amount: 300,
		unit: 'g',
		sort: 0
	});
	await apiCreate(token, 'recipe_ingredients', { recipe: recipe.id, name: 'Salz', sort: 1 });
	return recipe.id;
}

test('Kochansicht: Karte, Schwierigkeit, Portionen, Abhaken', async ({ page }) => {
	const family = await createFamily();
	const id = await seed(family.email, family.household);
	await login(page, family.email);

	await page.goto(`/essen/rezepte/${id}`);
	await page.getByRole('link', { name: 'Kochen' }).click();
	await expect(page).toHaveURL(new RegExp(`/essen/rezepte/${id}/kochen$`));
	await expect(page.getByRole('heading', { level: 1, name: 'Pfannkuchen' })).toBeVisible();
	await expect(page.getByText('1 Std. 30 Min.')).toBeVisible();
	await expect(page.getByText('süß', { exact: true })).toBeVisible();
	await expect(page.getByText('In der Pfanne ausbacken.', { exact: false })).toBeVisible();

	// Schwierigkeit direkt auf der Karte setzen; bleibt nach dem Neuladen.
	const schwer = page.getByRole('button', { name: 'Schwierigkeit: schwer' });
	await expect(schwer).toHaveAttribute('aria-pressed', 'false');
	await schwer.click();
	await expect(schwer).toHaveAttribute('aria-pressed', 'true');

	// Portionen halbieren rechnet die Mengen um.
	await expect(page.getByText('300 g Mehl')).toBeVisible();
	await page.getByRole('button', { name: 'Eine Portion weniger' }).click();
	await page.getByRole('button', { name: 'Eine Portion weniger' }).click();
	await expect(page.getByText('150 g Mehl')).toBeVisible();

	// Zutaten abhaken.
	const mehl = page.getByRole('checkbox', { name: '150 g Mehl' });
	await mehl.check();
	await expect(mehl).toBeChecked();

	await page.reload();
	await expect(page.getByRole('button', { name: 'Schwierigkeit: schwer' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// Escape führt zurück zur Rezeptseite.
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(new RegExp(`/essen/rezepte/${id}$`));
});

test('Kinder sehen die Kochansicht ohne Bearbeiten', async ({ page }) => {
	const family = await createFamily();
	const id = await seed(family.email, family.household);
	const child = await createChild(family.email, family.household);
	await login(page, child);

	await page.goto(`/essen/rezepte/${id}/kochen`);
	await expect(page.getByRole('heading', { level: 1, name: 'Pfannkuchen' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'keine Angabe' })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Schwierigkeit:/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
	// Abhaken und Portionen gehen trotzdem (nur lokal).
	await page.getByRole('checkbox', { name: 'Salz' }).check();
	await page.getByRole('button', { name: 'Eine Portion mehr' }).click();
	await expect(page.getByText('375 g Mehl')).toBeVisible();
});
