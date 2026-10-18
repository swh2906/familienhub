// Testphase-Feedback: Reiter unter Aufgaben, schreiben, als erledigt markieren; Kinder schreiben mit.
// Der E2E-Server läuft mit HOMI_FEEDBACK=1 (ohne Schalter: siehe tests/integration/feedback.test.ts).
import { expect, test } from '@playwright/test';
import { createChild, createFamily, login } from './helpers.ts';

test('Feedback schreiben, sehen und erledigen; Kinder schreiben ohne Erledigen', async ({
	browser
}) => {
	const family = await createFamily();
	const child = await createChild(family.email, family.household);
	const a = await (await browser.newContext()).newPage();
	const k = await (await browser.newContext()).newPage();
	await login(a, family.email);
	await login(k, child);

	await a.goto('/aufgaben');
	await a
		.getByRole('navigation', { name: 'Bereiche unter Aufgaben' })
		.getByRole('link', { name: 'Feedback' })
		.click();
	await expect(a).toHaveURL(/\/aufgaben\/feedback$/);
	await a.getByLabel('Was ist dir aufgefallen?').fill('Plus-Knopf im Kalender ist zu klein');
	await a.getByLabel('Bereich', { exact: true }).selectOption('Kalender');
	await a.getByRole('button', { name: 'Senden' }).click();
	await expect(a.getByRole('status').filter({ hasText: 'Danke!' })).toBeVisible();
	await expect(a.getByText('Plus-Knopf im Kalender ist zu klein')).toBeVisible();

	// Kind sieht es live und schreibt selbst, kann aber nichts als erledigt markieren.
	await k.goto('/aufgaben/feedback');
	await expect(k.getByText('Plus-Knopf im Kalender ist zu klein')).toBeVisible({ timeout: 10_000 });
	await expect(k.getByRole('button', { name: /als erledigt markieren/ })).toHaveCount(0);
	await k.getByLabel('Was ist dir aufgefallen?').fill('Mehr Emojis bitte');
	await k.getByRole('button', { name: 'Senden' }).click();
	await expect(a.getByText('Mehr Emojis bitte')).toBeVisible({ timeout: 10_000 });

	// Erwachsene markieren als erledigt.
	await a
		.getByRole('button', { name: '„Plus-Knopf im Kalender ist zu klein“ als erledigt markieren' })
		.click();
	await expect(
		a.getByRole('button', { name: '„Plus-Knopf im Kalender ist zu klein“ wieder öffnen' })
	).toHaveAttribute('aria-pressed', 'true');
});
