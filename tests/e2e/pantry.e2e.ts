// Vorrat (Schritt 11 B): „Gekocht?“ und Vorratsfragen auf Heute, Kauf beim Abhaken,
// Reiter „Vorrat“ mit Status und Antworten.
import { expect, test } from '@playwright/test';
import { apiCreate, apiToken, createChild, createFamily, login } from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAY = 86_400_000;

test('Gekocht bestätigen, Vorrat erfragen, Kauf buchen', async ({ page }) => {
	const family = await createFamily();
	const token = await apiToken(family.email);
	const reis = await apiCreate(token, 'ingredients', {
		household: family.household,
		name: 'Reis',
		key: 'reis',
		unit: 'g',
		pack_amount: 1000
	});
	const recipe = await apiCreate(token, 'recipes', {
		household: family.household,
		title: 'Reispfanne',
		servings: 2
	});
	await apiCreate(token, 'recipe_ingredients', {
		recipe: recipe.id,
		name: 'Reis',
		amount: 250,
		unit: 'g',
		ingredient: reis.id
	});
	for (const offset of [-1, 1]) {
		await apiCreate(token, 'meal_plan_entries', {
			household: family.household,
			date: iso(new Date(Date.now() + offset * DAY)),
			slot: 'dinner',
			title: 'Reispfanne',
			recipe: recipe.id
		});
	}
	await login(page, family.email);

	// Heute: zuerst „Gekocht?“ für gestern, dann die Frage nach Reis (für morgen gebraucht).
	const questions = page.getByRole('region', { name: 'Kurze Fragen' });
	await expect(questions.getByText('Habt ihr Reispfanne gekocht?')).toBeVisible();
	await questions.getByRole('button', { name: 'Ja, gekocht' }).click();
	await expect(questions.getByText('Habt ihr Reispfanne gekocht?')).toHaveCount(0);
	await expect(questions.getByText('Habt ihr noch Reis?')).toBeVisible();
	await questions.getByRole('button', { name: 'Nein, ist alle' }).click();
	await expect(page.getByRole('region', { name: 'Kurze Fragen' })).toHaveCount(0);

	// Einkauf: Reis kaufen und abhaken bucht den Kauf.
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Einkauf' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
	await page.getByLabel('Was braucht ihr?').fill('1 kg Reis');
	await page.getByLabel('Was braucht ihr?').press('Enter');
	await page.getByRole('button', { name: /^Reis 1 kg als gekauft markieren/ }).click();

	// Vorrat: Reis ist vorhanden; „Ungefähr die Hälfte“ stellt den Bestand richtig.
	await page
		.getByRole('navigation', { name: 'Bereiche im Einkauf' })
		.getByRole('link', { name: 'Vorrat' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Vorrat' })).toBeVisible();
	const available = page.getByRole('region', { name: 'Vorhanden' });
	await expect(available.getByRole('listitem')).toHaveText(/Reis\s*vorhanden\s*1 kg/);
	await available
		.getByRole('group', { name: 'Bestand von Reis' })
		.getByRole('button', { name: 'Ungefähr die Hälfte' })
		.click();
	await expect(available.getByRole('listitem')).toHaveText(/Reis\s*vorhanden\s*500 g/);
});

test('Kinder sehen keine Gekocht-Frage, aber den Vorrat', async ({ page }) => {
	const family = await createFamily();
	const token = await apiToken(family.email);
	const recipe = await apiCreate(token, 'recipes', {
		household: family.household,
		title: 'Nudeln',
		servings: 2
	});
	await apiCreate(token, 'meal_plan_entries', {
		household: family.household,
		date: iso(new Date(Date.now() - DAY)),
		slot: 'dinner',
		title: 'Nudeln',
		recipe: recipe.id
	});
	await apiCreate(token, 'ingredients', {
		household: family.household,
		name: 'Nudeln',
		key: 'nudel',
		unit: 'g'
	});
	const child = await createChild(family.email, family.household);
	await login(page, child);

	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
	await expect(page.getByText('Habt ihr Nudeln gekocht?')).toHaveCount(0);
	await page.goto('/einkauf/vorrat');
	await expect(
		page.getByRole('region', { name: 'Unsicher oder unbekannt' }).getByText('Nudeln')
	).toBeVisible();
});
