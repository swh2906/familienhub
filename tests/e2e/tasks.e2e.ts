// Aufgaben über die echte Oberfläche: anlegen, zuweisen, abhaken (live auf Gerät B),
// Wiederholung rückt weiter, Rückgängig, Kinder.
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
const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12);
const nextWeekLabel = new Intl.DateTimeFormat('de-DE', {
	weekday: 'short',
	day: 'numeric',
	month: 'short'
}).format(nextWeek);

async function openTasks(page: Page) {
	await page
		.getByRole('navigation', { name: 'Hauptnavigation' })
		.getByRole('link', { name: 'Aufgaben' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Aufgaben' })).toBeVisible();
}

function tab(page: Page, name: string) {
	return page.getByRole('group', { name: 'Aufgaben filtern' }).getByRole('button', { name });
}

test('anlegen, zuweisen, abhaken – live auf Gerät B', async ({ browser }) => {
	const family = await createFamilyWithMember();
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	await login(a, family.admin);
	await login(b, family.member);
	await openTasks(a);
	await openTasks(b);
	await expect(b.getByText('Nichts zu tun – schön!')).toBeVisible();

	// A legt eine Aufgabe für Tom an.
	await a.getByRole('button', { name: 'Neue Aufgabe' }).click();
	const dialog = a.getByRole('dialog', { name: 'Neue Aufgabe' });
	await dialog.getByLabel('Aufgabe').fill('Spülmaschine ausräumen');
	await dialog.getByRole('button', { name: 'Tom' }).click();
	await dialog.getByLabel('Fällig am').fill(today);
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await tab(a, 'Alle').click();
	await expect(a.getByText('Spülmaschine ausräumen')).toBeVisible();

	// Tom sieht sie unter „Meine“ und hakt ab.
	await expect(b.getByText('Spülmaschine ausräumen')).toBeVisible({ timeout: 10_000 });
	await expect(b.getByText('heute', { exact: true })).toBeVisible();
	await b.getByRole('button', { name: 'Spülmaschine ausräumen erledigen' }).click();
	await expect(
		b.getByRole('status').filter({ hasText: '„Spülmaschine ausräumen“ erledigt.' })
	).toBeVisible();

	// Bei A verschwindet sie aus „Alle“ und steht unter „Erledigt“ mit Tom.
	await expect(a.getByText('Spülmaschine ausräumen')).toHaveCount(0, { timeout: 10_000 });
	await tab(a, 'Erledigt').click();
	const doneList = a.getByRole('list', { name: 'Erledigt' });
	await expect(doneList.getByText('Spülmaschine ausräumen')).toBeVisible();
	await expect(doneList.getByText(/^Tom ·/)).toBeVisible();
});

test('wiederkehrende Aufgabe rückt weiter, Rückgängig setzt zurück', async ({ page }) => {
	const { email } = await createFamily();
	await login(page, email);
	await openTasks(page);

	await page.getByRole('button', { name: 'Neue Aufgabe' }).click();
	const dialog = page.getByRole('dialog', { name: 'Neue Aufgabe' });
	await dialog.getByLabel('Aufgabe').fill('Müll rausbringen');
	await dialog.getByLabel('Fällig am').fill(today);
	await dialog.getByLabel('Wiederholung').selectOption('weekly');
	// Der Wochentag des Fälligkeitsdatums ist vorausgewählt.
	await expect(
		dialog.getByRole('group', { name: 'An diesen Tagen' }).getByRole('button', { pressed: true })
	).toHaveCount(1);
	await dialog.getByRole('button', { name: 'Speichern' }).click();

	await expect(page.getByText(/^wöchentlich: /)).toBeVisible();
	await expect(page.getByText('heute', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Müll rausbringen erledigen' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: `nächstes Mal: ${nextWeekLabel}` })
	).toBeVisible();
	await expect(page.getByText(nextWeekLabel, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(page.getByText('heute', { exact: true })).toBeVisible();
	await tab(page, 'Erledigt').click();
	await expect(page.getByText('Noch nichts erledigt.')).toBeVisible();
});

test('Kinder haken eigene und nicht zugewiesene ab, fremde nicht', async ({ page }) => {
	const { email, household } = await createFamily();
	const token = await apiToken(email);
	const username = await createChild(email, household);
	const members = (await (
		await fetch(`http://127.0.0.1:8091/api/collections/memberships/records`, {
			headers: { authorization: token }
		})
	).json()) as { items: { id: string; role: string }[] };
	const child = members.items.find((m) => m.role === 'child')!.id;
	const admin = members.items.find((m) => m.role === 'admin')!.id;

	await apiCreate(token, 'tasks', {
		household,
		title: 'Zimmer aufräumen',
		due_date: today,
		rrule: 'FREQ=DAILY',
		status: 'open',
		assignees: [child]
	});
	await apiCreate(token, 'tasks', { household, title: 'Blumen gießen', status: 'open' });
	await apiCreate(token, 'tasks', {
		household,
		title: 'Steuererklärung',
		status: 'open',
		assignees: [admin]
	});

	await login(page, username);
	await openTasks(page);
	await expect(page.getByRole('button', { name: 'Neue Aufgabe' })).toHaveCount(0);
	await expect(page.getByText('Steuererklärung')).toHaveCount(0); // nicht unter „Meine“

	// Eigene wiederkehrende Aufgabe rückt weiter (der Server erlaubt das Datum nur hier).
	await page.getByRole('button', { name: 'Zimmer aufräumen erledigen' }).click();
	await expect(page.getByText('morgen', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Blumen gießen erledigen' }).click();
	await expect(page.getByRole('button', { name: 'Blumen gießen erledigen' })).toHaveCount(0);

	// Fremde Aufgabe: Knopf deaktiviert.
	await tab(page, 'Alle').click();
	await expect(
		page.getByRole('button', { name: 'Steuererklärung ist jemand anderem zugewiesen.' })
	).toBeDisabled();

	await expect(page.getByRole('status', { name: 'Abgleich: Synchron' })).toBeVisible({
		timeout: 10_000
	});
	await expect(page.getByText(/vom Server abgelehnt/)).toHaveCount(0);
});

test('Erledigtes zurücknehmen und bearbeiten', async ({ page }) => {
	const { email, household } = await createFamily();
	const token = await apiToken(email);
	await apiCreate(token, 'tasks', { household, title: 'Fenster putzen', status: 'open' });
	await apiCreate(token, 'tasks', {
		household,
		title: 'Müll rausbringen',
		due_date: today,
		rrule: 'FREQ=WEEKLY',
		status: 'open'
	});

	await login(page, email);
	await openTasks(page);
	await page.getByRole('button', { name: 'Fenster putzen erledigen' }).click();
	await page.getByRole('button', { name: 'Müll rausbringen erledigen' }).click();
	await expect(page.getByText(nextWeekLabel, { exact: true })).toBeVisible();

	// Nach Ablauf von „Rückgängig“: im Reiter „Erledigt“ zurücknehmen.
	await tab(page, 'Erledigt').click();
	const doneList = page.getByRole('list', { name: 'Erledigt' });
	await doneList.getByRole('button', { name: 'Fenster putzen: Erledigt zurücknehmen' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'ist wieder offen' })).toBeVisible();
	await doneList.getByRole('button', { name: 'Müll rausbringen: Erledigt zurücknehmen' }).click();
	await expect(page.getByText('Noch nichts erledigt.')).toBeVisible();

	await tab(page, 'Alle').click();
	await expect(page.getByRole('button', { name: 'Fenster putzen erledigen' })).toBeEnabled();
	// Die Serie ist wieder am Tag des Abhakens fällig.
	await expect(page.getByText('heute', { exact: true })).toBeVisible();

	// Erledigtes lässt sich auch bearbeiten.
	await page.getByRole('button', { name: 'Fenster putzen erledigen' }).click();
	await tab(page, 'Erledigt').click();
	await doneList.getByRole('button', { name: 'Fenster putzen bearbeiten' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Aufgabe').fill('Fenster putzen (innen)');
	await dialog.getByRole('button', { name: 'Speichern' }).click();
	await expect(doneList.getByText('Fenster putzen (innen)')).toBeVisible();
});
