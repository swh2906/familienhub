// Tastaturbedienung: Sprunglink als erster Tab-Stopp, Taste N für „Neu“ in allen Bereichen,
// Escape schließt Dialoge, beim Tippen löst N nichts aus.
import { expect, test } from '@playwright/test';
import { createFamily, login } from './helpers.ts';

test('Sprunglink und Taste N für „Neu“', async ({ page }) => {
	const family = await createFamily();
	await login(page, family.email);

	// Erster Tab-Stopp ist „Zum Inhalt springen“ und sichtbar.
	await page.goto('/aufgaben');
	await expect(page.getByRole('heading', { level: 1, name: 'Aufgaben' })).toBeVisible();
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
	await expect(skip).toBeFocused();
	await expect(skip).toBeInViewport();

	// Aufgaben: N öffnet den Dialog, Escape schließt ihn wieder.
	const newTask = page.getByRole('button', { name: 'Neue Aufgabe' });
	await expect(newTask).toHaveAttribute('aria-keyshortcuts', 'N');
	await page.keyboard.press('n');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	// Im Dialog tippt man normal, ohne dass N etwas auslöst.
	await page.keyboard.type('Neuer Plan');
	await expect(dialog.getByLabel('Aufgabe', { exact: true })).toHaveValue('Neuer Plan');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	// Kalender: N öffnet „Neuer Termin“.
	await page.goto('/kalender');
	await expect(page.getByRole('heading', { level: 1, name: 'Kalender' })).toBeVisible();
	await page.keyboard.press('n');
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');

	// Einkauf: N springt ins Eingabefeld, ohne ein „n“ hineinzuschreiben.
	await page.goto('/einkauf');
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
	await page.keyboard.press('n');
	const quick = page.getByLabel('Was braucht ihr?');
	await expect(quick).toBeFocused();
	await expect(quick).toHaveValue('');

	// Rezepte: N öffnet „Neues Rezept“.
	await page.goto('/essen/rezepte');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.keyboard.press('n');
	await expect(page).toHaveURL(/\/essen\/rezepte\/neu$/);
});
