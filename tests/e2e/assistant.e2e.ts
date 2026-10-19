// Einkaufsassistent (Schritt 11 E): Hinweis „Für morgen fehlt …“ auf Heute, „Ich gehe einkaufen“
// setzt Fehlendes auf die Liste und öffnet den Einkaufsmodus mit unsicheren Zutaten.
import { expect, test } from '@playwright/test';
import { apiCreate, apiToken, createFamily, login } from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test('Hinweis zum Einkaufen, Einkaufsmodus mit unsicheren Zutaten', async ({ page }) => {
	const family = await createFamily();
	const token = await apiToken(family.email);
	const h = family.household;
	const ingredient = (name: string, key: string, unit: string, pack = 0) =>
		apiCreate(token, 'ingredients', { household: h, name, key, unit, pack_amount: pack });
	const reis = await ingredient('Reis', 'reis', 'g', 1000);
	const milch = await ingredient('Milch', 'milch', 'ml');
	const eier = await ingredient('Eier', 'eier', 'Stück');
	await apiCreate(token, 'pantry_events', {
		household: h,
		ingredient: reis.id,
		kind: 'set',
		amount: 0,
		unit: 'g',
		at: new Date().toISOString()
	});
	const recipe = await apiCreate(token, 'recipes', {
		household: h,
		title: 'Reispfanne',
		servings: 2,
		prep_minutes: 20
	});
	const row = (data: object) =>
		apiCreate(token, 'recipe_ingredients', { recipe: recipe.id, ...data });
	await row({ name: 'Reis', amount: 250, unit: 'g', ingredient: reis.id, sort: 0 });
	await row({ name: 'Milch', amount: 200, unit: 'ml', ingredient: milch.id, sort: 1 });
	await row({ name: 'Eier', amount: 2, unit: 'Stück', ingredient: eier.id, sort: 2 });
	await apiCreate(token, 'meal_plan_entries', {
		household: h,
		date: iso(new Date(Date.now() + 86_400_000)),
		slot: 'dinner',
		title: 'Reispfanne',
		recipe: recipe.id
	});
	await login(page, family.email);

	// Heute: Einkaufs-Hinweis mit Begründung (vor den Vorratsfragen zu Milch und Eiern).
	const hints = page.getByRole('region', { name: 'Hinweise' });
	await expect(hints.getByText('Für morgen fehlt noch: Reis.')).toBeVisible();
	await expect(hints.getByText(/Für Reispfanne/).first()).toBeVisible();
	await hints.getByRole('button', { name: 'Ich gehe einkaufen' }).click();

	// Einkaufsmodus: Reis steht auf der Liste, Milch und Eier sind unsicher.
	await expect(page).toHaveURL(/\/einkauf\?modus=einkaufen$/);
	const mode = page.getByRole('region', { name: 'Einkaufsmodus' });
	await expect(mode).toBeVisible();
	await expect(
		page.getByRole('button', { name: /^Reis 1 kg als gekauft markieren/ })
	).toBeVisible();
	await mode
		.getByRole('group', { name: 'Milch: mitnehmen oder noch da' })
		.getByRole('button', { name: 'Ist noch da' })
		.click();
	await expect(mode.getByRole('group', { name: 'Milch: mitnehmen oder noch da' })).toHaveCount(0);
	await mode
		.getByRole('group', { name: 'Eier: mitnehmen oder noch da' })
		.getByRole('button', { name: 'Mitnehmen' })
		.click();
	await expect(
		page.getByRole('button', { name: /^Eier 2 Stück als gekauft markieren/ })
	).toBeVisible();
	await expect(mode.getByText('Für die geplanten Rezepte ist nichts unsicher.')).toBeVisible();

	// Reis abhaken und den Einkauf beenden.
	await page.getByRole('button', { name: /^Reis 1 kg als gekauft markieren/ }).click();
	await mode.getByRole('button', { name: 'Fertig eingekauft' }).click();
	await expect(page.getByText('Einkauf beendet. Danke!')).toBeVisible();
	await expect(page).toHaveURL(/\/einkauf$/);

	// Zurück auf Heute: nichts fehlt mehr für morgen.
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
	await expect(page.getByText('Für morgen fehlt noch: Reis.')).toHaveCount(0);
});
