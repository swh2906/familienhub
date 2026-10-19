// Rezepte über die echte Oberfläche: anlegen (mit Zutaten aus Text), live auf dem zweiten Gerät,
// bearbeiten und umsortieren, Favorit, löschen; Suche und Filter; Kinder nur lesend.
import { expect, test, type Page } from '@playwright/test';
import {
	apiCreate,
	apiToken,
	createChild,
	createFamily,
	createFamilyWithMember,
	login
} from './helpers.ts';

async function openRecipes(page: Page) {
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Essen' })
		.click();
	await page
		.getByRole('navigation', { name: 'Bereiche im Essen' })
		.getByRole('link', { name: 'Rezepte' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Rezepte' })).toBeVisible();
}

function ingredientRows(page: Page) {
	return page.getByRole('region', { name: 'Zutaten' }).getByRole('listitem');
}

test('Rezept mit Zutaten aus Text anlegen, live auf Gerät B, bearbeiten und löschen', async ({
	browser
}) => {
	const family = await createFamilyWithMember();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);

	// Gerät A: leere Liste, neues Rezept.
	await openRecipes(a);
	await expect(a.getByText('Noch keine Rezepte')).toBeVisible();
	await a.getByRole('link', { name: 'Neues Rezept' }).click();
	await a.getByLabel('Titel').fill('Pfannkuchen');
	await a.getByLabel('Portionen').fill('4');
	await a.getByRole('button', { name: 'schnell' }).click();

	await a.getByRole('button', { name: 'Zutaten aus Text einfügen' }).click();
	await a.getByLabel('Text mit Zutaten').fill('Zutaten:\n300 g Mehl\n0,5 l Milch\n3 Eier');
	await expect(a.getByText('Erkannt: 3 Zutaten')).toBeVisible();
	await a.getByRole('button', { name: 'Übernehmen' }).click();
	await expect(a.getByLabel('Zutat 1', { exact: true })).toHaveValue('Mehl');
	await expect(a.getByLabel('Menge (Zutat 2)')).toHaveValue('0,5');
	await expect(a.getByLabel('Einheit (Zutat 2)')).toHaveValue('l');

	await a.getByLabel('Zubereitung').fill('Alles verrühren und portionsweise ausbacken.');
	await a.getByRole('button', { name: 'Speichern' }).click();

	// Ansicht: Zutaten und Umrechnung der Portionen.
	await expect(a.getByRole('heading', { level: 1, name: 'Pfannkuchen' })).toBeVisible();
	await expect(ingredientRows(a).first()).toHaveText(/300 g\s*Mehl/);
	await a.getByRole('button', { name: 'Eine Portion mehr' }).click();
	await expect(a.getByText('5 Portionen')).toBeVisible();
	await expect(ingredientRows(a).first()).toHaveText(/375 g\s*Mehl/);

	// Gerät B sieht das Rezept live in der Liste.
	await openRecipes(b);
	await expect(b.getByRole('link', { name: 'Pfannkuchen' })).toBeVisible({ timeout: 10_000 });

	// Gerät A bearbeitet: Eier nach oben, Milch entfernen.
	await a.getByRole('link', { name: 'Bearbeiten' }).click();
	await a.getByRole('button', { name: 'Zutat 3 nach oben' }).click();
	await expect(a.getByLabel('Zutat 2', { exact: true })).toHaveValue('Eier');
	await a.getByRole('button', { name: 'Zutat 3 entfernen' }).click();
	await a.getByRole('button', { name: 'Speichern' }).click();
	await expect(ingredientRows(a)).toHaveText([/300 g\s*Mehl/, /3\s*Eier/]);

	// Gerät B öffnet das Rezept und sieht den neuen Stand.
	await b.getByRole('link', { name: 'Pfannkuchen' }).click();
	await expect(ingredientRows(b)).toHaveText([/Mehl/, /Eier/], { timeout: 10_000 });

	// Favorit in der Liste, dann löschen mit Bestätigung.
	await openRecipes(a);
	await a.getByRole('button', { name: 'Pfannkuchen als Favorit markieren' }).click();
	await expect(a.getByRole('button', { name: 'Pfannkuchen nicht mehr als Favorit' })).toBeVisible();
	await a.getByRole('link', { name: 'Pfannkuchen' }).click();
	await a.getByRole('button', { name: 'Rezept löschen' }).click();
	await a.getByRole('button', { name: 'Ja, löschen' }).click();
	await expect(a.getByText('Noch keine Rezepte')).toBeVisible();

	// Auf Gerät B verschwindet es ebenfalls.
	await expect(b.getByText('Dieses Rezept gibt es nicht (mehr).')).toBeVisible({ timeout: 10_000 });
});

test('Korrigierte Zeile beim Einfügen wird gelernt', async ({ page }) => {
	const { email } = await createFamily();
	await login(page, email);
	await openRecipes(page);

	// Erstes Rezept: „1 Schuss Milch“ einfügen und auf 50 ml korrigieren.
	await page.getByRole('link', { name: 'Neues Rezept' }).click();
	await page.getByLabel('Titel').fill('Kakao');
	await page.getByRole('button', { name: 'Zutaten aus Text einfügen' }).click();
	await page.getByLabel('Text mit Zutaten').fill('1 Schuss Milch');
	await page.getByRole('button', { name: 'Übernehmen' }).click();
	await page.getByLabel('Zutat 1', { exact: true }).fill('Milch');
	await page.getByLabel('Menge (Zutat 1)').fill('50');
	await page.getByLabel('Einheit (Zutat 1)').fill('ml');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Kakao' })).toBeVisible();

	// Zweites Rezept: dieselbe Zeile wird gleich richtig erkannt.
	await openRecipes(page);
	await page.getByRole('link', { name: 'Neues Rezept' }).click();
	await page.getByRole('button', { name: 'Zutaten aus Text einfügen' }).click();
	await page.getByLabel('Text mit Zutaten').fill('1 schuss Milch');
	const preview = page.locator('#paste-panel').getByRole('listitem');
	await expect(preview).toHaveText(/50 ml Milch.*gelernt/);
	await page.getByRole('button', { name: 'Übernehmen' }).click();
	await expect(page.getByLabel('Menge (Zutat 1)')).toHaveValue('50');
	await expect(page.getByLabel('Einheit (Zutat 1)')).toHaveValue('ml');
});

test('Suche und Tag-Filter', async ({ page }) => {
	const { email, household } = await createFamily();
	const token = await apiToken(email);
	const curry = await apiCreate(token, 'recipes', {
		household,
		title: 'Gemüsecurry',
		servings: 4,
		tags: ['vegetarisch']
	});
	await apiCreate(token, 'recipe_ingredients', {
		recipe: curry.id,
		name: 'Kokosmilch',
		amount: 400,
		unit: 'ml'
	});
	await apiCreate(token, 'recipes', {
		household,
		title: 'Käsespätzle',
		servings: 4,
		tags: ['schnell'],
		is_favorite: true
	});
	await apiCreate(token, 'recipes', { household, title: 'Apfelkuchen', servings: 12 });

	await login(page, email);
	await openRecipes(page);
	const titles = page.getByRole('list', { name: 'Rezepte' }).getByRole('link');
	// Favorit zuerst, sonst alphabetisch.
	await expect(titles).toHaveText(['Käsespätzle', 'Apfelkuchen', 'Gemüsecurry']);

	await page.getByLabel('Rezepte durchsuchen').fill('kokos');
	await expect(titles).toHaveText(['Gemüsecurry']);
	await page.getByLabel('Rezepte durchsuchen').fill('spatzle');
	await expect(titles).toHaveText(['Käsespätzle']);
	await page.getByLabel('Rezepte durchsuchen').fill('');

	const filter = page.getByRole('group', { name: 'Nach Tag filtern' });
	await filter.getByRole('button', { name: 'vegetarisch' }).click();
	await expect(titles).toHaveText(['Gemüsecurry']);
	await filter.getByRole('button', { name: 'Alle' }).click();
	await expect(titles).toHaveCount(3);
});

test('Kinder sehen Rezepte, können aber nichts ändern', async ({ page }) => {
	const { email, household } = await createFamily();
	const token = await apiToken(email);
	await apiCreate(token, 'recipes', { household, title: 'Nudelauflauf', servings: 4 });
	const username = await createChild(email, household);

	await login(page, username);
	await openRecipes(page);
	await expect(page.getByRole('link', { name: 'Neues Rezept' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /als Favorit markieren/ })).toHaveCount(0);

	await page.getByRole('link', { name: 'Nudelauflauf' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Nudelauflauf' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Rezept löschen' })).toHaveCount(0);
});
