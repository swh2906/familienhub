import { expect, test } from '@playwright/test';

test('Startseite lädt und die Leiste hat 5 Einträge', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();

	const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
	await expect(nav).toBeVisible();
	await expect(nav.getByRole('link')).toHaveCount(5);
	await expect(nav.getByRole('link', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
});

test('Navigation wechselt den Bereich', async ({ page }) => {
	await page.goto('/');
	const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });

	await nav.getByRole('link', { name: 'Einkauf' }).click();
	await expect(page).toHaveURL(/\/einkauf$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Einkauf' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Einkauf' })).toHaveAttribute('aria-current', 'page');
});

test('Farbschema-Umschalter bleibt nach dem Neuladen erhalten', async ({ page }) => {
	await page.goto('/');
	const toggle = page.getByRole('button', { name: /Farbschema/ });

	await toggle.click(); // System → Hell
	await toggle.click(); // Hell → Dunkel
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('Akzentfarbe in den Einstellungen wählen und behalten', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Einstellungen' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();

	const accent = page.getByRole('group', { name: 'Akzentfarbe' });
	await expect(accent.getByRole('radio', { name: 'Petrol' })).toBeChecked();
	await expect(page.locator('html')).not.toHaveAttribute('data-accent');

	await accent.getByText('Indigo').click();
	await expect(page.locator('html')).toHaveAttribute('data-accent', 'indigo');

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-accent', 'indigo');
	await expect(accent.getByRole('radio', { name: 'Indigo' })).toBeChecked();

	await page.getByRole('group', { name: 'Farbschema' }).getByText('Dunkel').click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	// Der Umschalter in der Kopfzeile zeigt denselben Stand
	await expect(page.getByRole('button', { name: /Farbschema: Dunkel/ })).toBeVisible();
});
