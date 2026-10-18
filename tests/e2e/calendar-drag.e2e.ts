// Kalender: Termine ziehen (Maus in der Woche, Finger nach langem Drücken in der Tagesansicht),
// Dauer am unteren Rand ändern, Serie „nur dieser Termin“, Kinder ziehen nicht, Sprung zu „jetzt“.
import { expect, test, type Page } from '@playwright/test';
import { E2E_PB_URL } from '../../playwright.config.ts';
import { apiCreate, apiToken, createChild, createFamily, login } from './helpers.ts';

// Feste Woche im November (Winterzeit, UTC+1): Mo 2.11. bis So 8.11.2026.
const WEEK = '/kalender?ansicht=woche&datum=2026-11-02';
const DAY = '/kalender?ansicht=tag&datum=2026-11-03';

async function seed(email: string, household: string, rrule = '') {
	const token = await apiToken(email);
	const event = await apiCreate(token, 'events', {
		household,
		title: 'Zahnarzt',
		start: '2026-11-03T09:00:00.000Z', // Di 10:00
		end: '2026-11-03T10:00:00.000Z', // Di 11:00
		exdates: [],
		rrule
	});
	return { token, id: event.id };
}

async function serverEvents(token: string) {
	const response = await fetch(`${E2E_PB_URL}/api/collections/events/records?perPage=50`, {
		headers: { authorization: token }
	});
	const data = (await response.json()) as {
		items: { id: string; start: string; end: string; exdates: string[] | null }[];
	};
	return data.items;
}

function chip(page: Page, time: string) {
	return page.getByRole('button', { name: new RegExp(`^Zahnarzt, ${time}`) });
}

test('Maus: verschieben auf anderen Tag und andere Uhrzeit, Dauer ändern, Rückgängig', async ({
	page
}, info) => {
	test.skip(info.project.name === 'mobil', 'Wochen-Zeitachse gibt es nur auf breiten Bildschirmen');
	const family = await createFamily();
	const { token, id } = await seed(family.email, family.household);
	await login(page, family.email);
	await page.goto(WEEK);

	const before = chip(page, '10:00–11:00');
	await before.scrollIntoViewIfNeeded();
	const box = (await before.boundingBox())!;
	const column = (await page.locator('.column').nth(1).boundingBox())!;

	// Einen Tag nach rechts, eine Stunde nach unten (48 px = 1 h).
	await page.mouse.move(box.x + box.width / 2, box.y + 10);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + column.width / 2, box.y + 30, { steps: 5 });
	await page.mouse.move(box.x + box.width / 2 + column.width, box.y + 10 + 48, { steps: 5 });
	await page.mouse.up();

	await expect(chip(page, '11:00–12:00')).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Termin verschoben.' })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect
		.poll(async () => (await serverEvents(token)).find((e) => e.id === id)?.start)
		.toBe('2026-11-04 10:00:00.000Z');

	// Dauer: unteren Rand eine halbe Stunde nach unten ziehen.
	const moved = (await chip(page, '11:00–12:00').boundingBox())!;
	const handleY = moved.y + moved.height - 2;
	await page.mouse.move(moved.x + moved.width / 2, handleY);
	await page.mouse.down();
	await page.mouse.move(moved.x + moved.width / 2, handleY + 24, { steps: 5 });
	await page.mouse.up();
	await expect(chip(page, '11:00–12:30')).toBeVisible();

	// Rückgängig stellt die Dauer wieder her.
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(chip(page, '11:00–12:00')).toBeVisible();

	// Ein normaler Klick öffnet weiterhin den Dialog.
	await chip(page, '11:00–12:00').click();
	await expect(page.getByRole('dialog', { name: 'Termin bearbeiten' })).toBeVisible();
});

test('Finger: langes Drücken, dann ziehen (Tagesansicht); Serie nur dieser Termin', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'mobil', 'Touch-Bedienung');
	const family = await createFamily();
	const { token, id } = await seed(family.email, family.household, 'FREQ=WEEKLY');
	await login(page, family.email);
	await page.goto(DAY);

	const event = chip(page, '10:00–11:00');
	await event.scrollIntoViewIfNeeded();
	const box = (await event.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + 10;
	const cdp = await page.context().newCDPSession(page);
	const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', ty: number) =>
		cdp.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty }]
		});
	await touch('touchStart', y);
	await page.waitForTimeout(500); // langes Drücken
	for (let step = 1; step <= 6; step++) await touch('touchMove', y + step * 16); // +96 px = +2 h
	await touch('touchEnd', y + 96);

	const dialog = page.getByRole('dialog', { name: 'Termin verschieben' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Nur dieser Termin' }).click();
	await expect(chip(page, '12:00–13:00')).toBeVisible();
	await expect
		.poll(async () => {
			const events = await serverEvents(token);
			return {
				count: events.length,
				exdates: events.find((e) => e.id === id)?.exdates
			};
		})
		.toEqual({ count: 2, exdates: ['2026-11-03'] });

	// Kurzes Wischen über einen Termin scrollt nur, statt zu ziehen.
	const moved = (await chip(page, '12:00–13:00').boundingBox())!;
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x, y: moved.y + 10 }]
	});
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchMove',
		touchPoints: [{ x, y: moved.y + 60 }]
	});
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect(chip(page, '12:00–13:00')).toBeVisible();
});

test('Kinder können Termine nicht ziehen', async ({ page }) => {
	const family = await createFamily();
	await seed(family.email, family.household);
	await login(page, await createChild(family.email, family.household));
	await page.goto(DAY);
	await expect(page.getByText('Zahnarzt')).toBeVisible();
	await expect(page.locator('.event.draggable')).toHaveCount(0);
	await expect(page.locator('.resize')).toHaveCount(0);
});

test('Tagesansicht springt zur aktuellen Uhrzeit', async ({ page }) => {
	const family = await createFamily();
	await login(page, family.email);
	await page.goto('/kalender?ansicht=tag');
	await expect(page.locator('.now')).toHaveCount(1);
	// Die rote Linie liegt im sichtbaren Bereich der Zeitachse (die selbst scrollt).
	const visible = await page.evaluate(() => {
		const scroller = document.querySelector('.scroller') as HTMLElement;
		const line = (document.querySelector('.now') as HTMLElement).getBoundingClientRect();
		const box = scroller.getBoundingClientRect();
		return line.top >= box.top && line.bottom <= box.bottom;
	});
	expect(visible).toBe(true);
});
