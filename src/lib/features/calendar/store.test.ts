import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData, getDb } from '#lib/db/database.js';
import { expandEvents } from './expand.js';
import {
	createEvent,
	deleteEvent,
	eventsOf,
	formFromEvent,
	updateOnlyThis,
	updateSeries,
	type EventForm
} from './store.js';

const BERLIN = 'Europe/Berlin';
const H = 'household000001';

const swimming: EventForm = {
	title: 'Schwimmen',
	allDay: false,
	date: '2026-10-19',
	endDate: '',
	startTime: '15:00',
	endTime: '16:30',
	location: 'Hallenbad',
	participants: ['mia'],
	reminder_minutes: 60,
	rrule: 'FREQ=WEEKLY;BYDAY=MO'
};

async function occurrences(from = '2026-10-19', to = '2026-11-08') {
	return expandEvents(await eventsOf(H), from, to, BERLIN).map(
		(o) => `${o.event.title} ${o.startDate} ${o.startTime}-${o.endTime}`
	);
}

afterEach(async () => {
	await deleteLocalData();
});

describe('Termine speichern', () => {
	it('legt in UTC an; Ende vor Beginn liegt am Folgetag', async () => {
		await createEvent(
			H,
			{ ...swimming, rrule: '', title: 'Nachtschicht', startTime: '22:00', endTime: '06:00' },
			BERLIN
		);
		const [event] = await eventsOf(H);
		expect(event.start).toBe('2026-10-19T20:00:00.000Z');
		expect(event.end).toBe('2026-10-20T04:00:00.000Z'); // noch Sommerzeit (UTC+2)
		expect(event.exdates).toEqual([]);
	});

	it('„nur dieser Termin“ verschiebt ein Vorkommen, die anderen bleiben', async () => {
		await createEvent(H, swimming, BERLIN);
		const [series] = await eventsOf(H);
		const form = formFromEvent(series, '2026-10-26', BERLIN);
		expect(form).toMatchObject({ date: '2026-10-26', startTime: '15:00', endTime: '16:30' });

		await updateOnlyThis(
			series,
			'2026-10-26',
			{ ...form, date: '2026-10-27', startTime: '17:00', endTime: '18:00' },
			BERLIN
		);
		expect(await occurrences()).toEqual([
			'Schwimmen 2026-10-19 15:00-16:30',
			'Schwimmen 2026-10-27 17:00-18:00',
			'Schwimmen 2026-11-02 15:00-16:30'
		]);
		const single = (await eventsOf(H)).find((e) => !e.rrule);
		expect(single).toMatchObject({ location: 'Hallenbad', participants: ['mia'], rrule: '' });
	});

	it('„alle Termine“: neue Uhrzeit und verschobener Tag gelten für die ganze Serie', async () => {
		await createEvent(H, swimming, BERLIN);
		const [series] = await eventsOf(H);
		const form = formFromEvent(series, '2026-11-02', BERLIN);
		await updateSeries(
			series,
			'2026-11-02',
			{ ...form, date: '2026-11-03', startTime: '16:00', endTime: '17:00' },
			BERLIN
		);
		expect(await occurrences()).toEqual([
			'Schwimmen 2026-10-20 16:00-17:00',
			'Schwimmen 2026-10-27 16:00-17:00',
			'Schwimmen 2026-11-03 16:00-17:00'
		]);
	});

	it('„alle Termine“ sendet nur geänderte Felder', async () => {
		await createEvent(H, swimming, BERLIN);
		await getDb().outbox.clear(); // als wäre das Anlegen schon synchronisiert
		const [series] = await eventsOf(H);
		const form = formFromEvent(series, '2026-10-19', BERLIN);
		await updateSeries(
			series,
			'2026-10-19',
			{ ...form, startTime: '15:30', endTime: '17:00' },
			BERLIN
		);
		const [entry] = await getDb().outbox.toArray();
		expect(Object.keys(entry.fields).sort()).toEqual(['end', 'start']);
	});

	it('ein Vorkommen löschen und rückgängig machen; ganze Serie löschen', async () => {
		await createEvent(H, swimming, BERLIN);
		const [series] = await eventsOf(H);
		const undo = await deleteEvent(series, '2026-10-26');
		expect(await occurrences()).toEqual([
			'Schwimmen 2026-10-19 15:00-16:30',
			'Schwimmen 2026-11-02 15:00-16:30'
		]);
		await undo();
		expect(await occurrences()).toHaveLength(3);

		const [again] = await eventsOf(H);
		await deleteEvent(again, null);
		expect(await occurrences()).toEqual([]);
	});

	it('ganztägig mehrtägig bleibt als Datum erhalten', async () => {
		await createEvent(
			H,
			{ ...swimming, title: 'Urlaub', allDay: true, rrule: '', endDate: '2026-10-23' },
			BERLIN
		);
		const [event] = await eventsOf(H);
		expect(event).toMatchObject({
			all_day: true,
			start: '2026-10-19T00:00:00.000Z',
			end: '2026-10-23T00:00:00.000Z'
		});
		expect(formFromEvent(event, '2026-10-19', BERLIN)).toMatchObject({
			date: '2026-10-19',
			endDate: '2026-10-23'
		});
	});
});
