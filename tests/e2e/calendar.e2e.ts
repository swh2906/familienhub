// Kalender über die echte Oberfläche: Serientermin anlegen (live auf Gerät B), einen einzelnen
// Termin verschieben und löschen, Konfliktwarnung, Monatsansicht, Kinder nur lesend.
import { expect, test, type Page } from '@playwright/test';
import {
	apiCreate,
	apiToken,
	createChild,
	createFamily,
	createFamilyWithMember,
	login
} from './helpers.ts';

function iso(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const now = new Date();
const today = iso(now);

async function openCalendar(page: Page) {
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Kalender' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Kalender' })).toBeVisible();
}

/** Termin-Button in jeder Ansicht: Woche/Tag beginnen mit dem Titel, die Liste (Handy) mit der Zeit. */
function eventButton(page: Page, title: string, time?: string) {
	const name = time ? `^(${title}, ${time}|${time}, ${title}, )` : `(^|, )${title}, `;
	return page.getByRole('button', { name: new RegExp(name) });
}

async function weekForward(page: Page) {
	await page.getByRole('link', { name: 'Weiter' }).click();
}

async function membershipIds(email: string): Promise<Record<string, string>> {
	const token = await apiToken(email);
	const response = await fetch('http://127.0.0.1:8091/api/collections/memberships/records', {
		headers: { authorization: token }
	});
	const { items } = (await response.json()) as { items: { id: string; display_name: string }[] };
	return Object.fromEntries(items.map((m) => [m.display_name, m.id]));
}

test('Serientermin anlegen, einzelnen Termin verschieben und löschen – live auf Gerät B', async ({
	browser
}) => {
	const family = await createFamilyWithMember();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openCalendar(a);
	await openCalendar(b);

	// A legt eine wöchentliche Serie an (der Wochentag des Datums ist vorausgewählt).
	await a.getByRole('button', { name: 'Neuer Termin' }).click();
	const dialog = a.getByRole('dialog', { name: 'Neuer Termin' });
	await dialog.getByLabel('Titel').fill('Schwimmkurs');
	await dialog.getByLabel('Datum').fill(today);
	await dialog.getByLabel('Von').fill('15:00');
	await dialog.getByLabel('Bis').fill('16:30');
	await dialog.getByRole('button', { name: 'Tom' }).click();
	await dialog.getByLabel('Wiederholung').selectOption('weekly');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(dialog).toBeHidden();

	await expect(eventButton(a, 'Schwimmkurs', '15:00–16:30')).toBeVisible();
	// Gerät B sieht den Termin live.
	await expect(eventButton(b, 'Schwimmkurs', '15:00–16:30')).toBeVisible({ timeout: 10_000 });

	// Nächste Woche: nur diesen Termin auf 17:00 verschieben.
	await weekForward(a);
	await eventButton(a, 'Schwimmkurs', '15:00–16:30').click();
	const edit = a.getByRole('dialog', { name: 'Termin bearbeiten' });
	await expect(edit.getByLabel('Nur dieser Termin')).toBeChecked();
	await edit.getByLabel('Von').fill('17:00');
	await edit.getByLabel('Bis').fill('18:00');
	await edit.getByRole('button', { name: 'Speichern' }).click();
	await expect(eventButton(a, 'Schwimmkurs', '17:00–18:00')).toBeVisible();
	await expect(eventButton(a, 'Schwimmkurs', '15:00–16:30')).toHaveCount(0);

	// Die Woche danach ist unverändert; dort einen einzelnen Termin löschen und zurückholen.
	await weekForward(a);
	await eventButton(a, 'Schwimmkurs', '15:00–16:30').click();
	await a
		.getByRole('dialog', { name: 'Termin bearbeiten' })
		.getByRole('button', { name: 'Löschen' })
		.click();
	await expect(
		a.getByRole('status').filter({ hasText: 'Termin an diesem Tag entfernt.' })
	).toBeVisible();
	await expect(eventButton(a, 'Schwimmkurs')).toHaveCount(0);
	await a.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(eventButton(a, 'Schwimmkurs', '15:00–16:30')).toBeVisible();

	// Diese Woche: weiterhin 15:00 (auch auf Gerät B).
	await a.getByRole('link', { name: 'Zu heute' }).click();
	await expect(eventButton(a, 'Schwimmkurs', '15:00–16:30')).toBeVisible();
	await weekForward(b);
	await expect(eventButton(b, 'Schwimmkurs', '17:00–18:00')).toBeVisible({ timeout: 10_000 });
});

test('Konfliktwarnung im Editor und Markierung im Kalender', async ({ page }) => {
	const { email, household } = await createFamily();
	const username = await createChild(email, household);
	const ids = await membershipIds(email);
	const start = new Date(`${today}T16:00:00`);
	await apiCreate(await apiToken(email), 'events', {
		household,
		title: 'Zahnarzt',
		start: start.toISOString(),
		end: new Date(start.getTime() + 45 * 60_000).toISOString(),
		participants: [ids.Mia],
		exdates: []
	});
	expect(username).toBeTruthy();

	await login(page, email);
	await openCalendar(page);
	await page.getByRole('button', { name: 'Neuer Termin' }).click();
	const dialog = page.getByRole('dialog', { name: 'Neuer Termin' });
	await dialog.getByLabel('Titel').fill('Schwimmen');
	await dialog.getByLabel('Datum').fill(today);
	await dialog.getByLabel('Von').fill('16:15');
	await dialog.getByLabel('Bis').fill('17:00');
	await expect(dialog.getByText(/Überschneidung mit/)).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Mia' }).click();
	await expect(dialog.getByText('Überschneidung mit: Zahnarzt 16:00')).toBeVisible();
	await dialog.getByRole('button', { name: 'Speichern' }).click();

	await expect(eventButton(page, 'Schwimmen')).toHaveAccessibleName(/Überschneidung$/);
	await expect(eventButton(page, 'Zahnarzt')).toHaveAccessibleName(/Überschneidung$/);
});

test('Monatsansicht und Kinder nur lesend', async ({ page }) => {
	const { email, household } = await createFamily();
	const start = new Date(`${today}T10:00:00`);
	await apiCreate(await apiToken(email), 'events', {
		household,
		title: 'Flohmarkt',
		start: start.toISOString(),
		end: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
		exdates: []
	});
	const username = await createChild(email, household);
	await login(page, username);
	await openCalendar(page);

	await expect(page.getByRole('button', { name: 'Neuer Termin' })).toHaveCount(0);
	await expect(page.getByText('Flohmarkt').filter({ visible: true }).first()).toBeVisible();
	await expect(eventButton(page, 'Flohmarkt')).toHaveCount(0); // nicht anklickbar

	await page.getByRole('link', { name: 'Monat' }).click();
	await page
		.getByRole('button', { name: /, 1 Termine$/ })
		.first()
		.click();
	await expect(page.getByRole('region').filter({ hasText: 'Flohmarkt' }).first()).toBeVisible();
});
