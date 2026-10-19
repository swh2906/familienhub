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

test('Fehlendes aus dem Essensplan mit Begründung auf die Liste', async ({ page }) => {
	const family = await createFamily();
	const token = await apiToken(family.email);
	const h = family.household;
	const reis = await apiCreate(token, 'ingredients', {
		household: h,
		name: 'Reis',
		key: 'reis',
		unit: 'g',
		pack_amount: 1000
	});
	const ei = await apiCreate(token, 'ingredients', {
		household: h,
		name: 'Eier',
		key: 'eier',
		unit: 'Stück'
	});
	const petersilie = await apiCreate(token, 'ingredients', {
		household: h,
		name: 'Petersilie',
		key: 'petersilie',
		unit: 'Bund'
	});
	const at = new Date().toISOString();
	await apiCreate(token, 'pantry_events', {
		household: h,
		ingredient: reis.id,
		kind: 'set',
		amount: 0,
		unit: 'g',
		at
	});
	await apiCreate(token, 'pantry_events', {
		household: h,
		ingredient: ei.id,
		kind: 'set',
		amount: 10,
		unit: 'Stück',
		at
	});
	const recipe = await apiCreate(token, 'recipes', {
		household: h,
		title: 'Reispfanne',
		servings: 2
	});
	const add = (data: object) =>
		apiCreate(token, 'recipe_ingredients', { recipe: recipe.id, ...data });
	await add({ name: 'Reis', amount: 250, unit: 'g', ingredient: reis.id, sort: 0 });
	await add({ name: 'Eier', amount: 2, unit: 'Stück', ingredient: ei.id, sort: 1 });
	await add({
		name: 'Petersilie',
		amount: 1,
		unit: 'Bund',
		ingredient: petersilie.id,
		optional: true,
		sort: 2
	});
	await apiCreate(token, 'meal_plan_entries', {
		household: h,
		date: iso(new Date(Date.now() + DAY)),
		slot: 'dinner',
		title: 'Reispfanne',
		recipe: recipe.id,
		servings: 4
	});
	await login(page, family.email);
	await page.goto('/einkauf');
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();

	await page.getByRole('button', { name: 'Aus dem Essensplan' }).click();
	const dialog = page.getByRole('dialog', { name: 'Fehlendes für die nächsten 7 Tage' });
	// 500 g Reis fehlen → eine Packung (1 kg), vorausgewählt; Petersilie nur optional.
	const rice = dialog
		.getByRole('group', { name: 'Fehlt' })
		.getByRole('checkbox', { name: /^1 kg Reis/ });
	await expect(rice).toBeChecked();
	await expect(
		dialog
			.getByRole('group', { name: 'Optional' })
			.getByRole('checkbox', { name: /^2 Bund Petersilie/ })
	).not.toBeChecked();
	await expect(dialog.getByText('Schon da (1)')).toBeVisible();
	await dialog.getByRole('button', { name: 'Auf die Liste (1)' }).click();
	await expect(dialog).toBeHidden();

	await expect(page.getByText('Aus dem Essensplan übernommen: 1')).toBeVisible();
	const tile = page.getByRole('button', {
		name: /^Reis 1 kg als gekauft markieren, .*Für Reispfanne/
	});
	await expect(tile).toBeVisible();

	// Begründung im Bearbeiten-Dialog.
	await page.getByRole('button', { name: 'Bearbeiten' }).click();
	await page.getByRole('button', { name: 'Reis bearbeiten' }).click();
	await expect(page.getByText('Warum auf der Liste:')).toBeVisible();
});
