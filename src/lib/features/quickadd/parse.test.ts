import { describe, expect, it } from 'vitest';
import { parseQuick, type QuickResult } from './parse.js';

// Mittwoch, 21. Oktober 2026
const today = '2026-10-21';
const people = [
	{ id: 'j', name: 'Julia' },
	{ id: 't', name: 'Tom' },
	{ id: 'm', name: 'Mia' }
];

function parse(text: string): QuickResult | null {
	return parseQuick(text, { today, people });
}

describe('Termine', () => {
	it.each([
		['Morgen 15 Uhr Zahnarzt Mia', '2026-10-22', '15:00', '16:00', 'Zahnarzt Mia', ['m']],
		['Zahnarzt Mia morgen um 15:30', '2026-10-22', '15:30', '16:30', 'Zahnarzt Mia', ['m']],
		['Elternabend Donnerstag 19.30 Uhr', '2026-10-22', '19:30', '20:30', 'Elternabend', []],
		[
			'Schwimmkurs Tom Freitag 15–16:30 Uhr',
			'2026-10-23',
			'15:00',
			'16:30',
			'Schwimmkurs Tom',
			['t']
		],
		['Friseur am 3.11. um 9', '2026-11-03', '09:00', '10:00', 'Friseur', []],
		['Kinderarzt 14:00-14:45', '', '14:00', '14:45', 'Kinderarzt', []],
		[
			'Fußball nächsten Samstag 10 Uhr Tom und Mia',
			'2026-10-24',
			'10:00',
			'11:00',
			'Fußball Tom und Mia',
			['t', 'm']
		]
	])('„%s“', (text, date, start, end, title, who) => {
		expect(parse(text)).toEqual({
			kind: 'event',
			title,
			date,
			startTime: start,
			endTime: end,
			people: who,
			explicit: false
		});
	});

	it('mit Datum, ohne Uhrzeit und ohne Tätigkeit: ganztägig', () => {
		expect(parse('Oma Geburtstag Samstag')).toMatchObject({
			kind: 'event',
			title: 'Oma Geburtstag',
			date: '2026-10-24',
			startTime: ''
		});
	});

	it('Wochentag von heute ist heute, „nächsten“ eine Woche später', () => {
		expect(parse('Chor Mittwoch 18 Uhr')?.date).toBe('2026-10-21');
		expect(parse('Chor nächsten Mittwoch 18 Uhr')?.date).toBe('2026-10-28');
	});

	it('vergangenes Datum ohne Jahr liegt im nächsten Jahr', () => {
		expect(parse('Zeugnis 3.2. 10 Uhr')?.date).toBe('2027-02-03');
		expect(parse('Urlaub 1.8.2027')?.date).toBe('2027-08-01');
	});

	it('übermorgen und Kurzform mit Punkt', () => {
		expect(parse('Training übermorgen 17 Uhr')?.date).toBe('2026-10-23');
		expect(parse('Training Fr. 17 Uhr')?.date).toBe('2026-10-23');
	});

	it('ungültige Uhrzeit ist keine Uhrzeit', () => {
		expect(parse('Meeting 25 Uhr')?.startTime).toBe('');
	});
});

describe('Aufgaben', () => {
	it('Tätigkeit mit Person und Tag: Name nicht im Titel', () => {
		expect(parse('Mia Zimmer aufräumen Samstag')).toEqual({
			kind: 'task',
			title: 'Zimmer aufräumen',
			date: '2026-10-24',
			startTime: '',
			endTime: '',
			people: ['m'],
			explicit: false
		});
	});

	it.each([
		['Müll rausbringen', 'Müll rausbringen', ''],
		['Blumen gießen morgen', 'Blumen gießen', '2026-10-22'],
		['Elternbrief unterschreiben für Tom', 'Elternbrief unterschreiben', ''],
		['Spülmaschine ausräumen heute', 'Spülmaschine ausräumen', today],
		['Hausaufgaben Mia', 'Hausaufgaben Mia', '']
	])('„%s“', (text, title, date) => {
		expect(parse(text)).toMatchObject({ kind: 'task', title, date });
	});

	it('mit Uhrzeit wird es ein Termin, auch mit Tätigkeit', () => {
		expect(parse('Auto abholen morgen 16 Uhr')?.kind).toBe('event');
	});
});

describe('Einkauf', () => {
	it.each([
		['2 l Milch', '2 l Milch'],
		['Milch', 'Milch'],
		['500 g Mehl', '500 g Mehl'],
		['12 Eier', '12 Eier'],
		['Brot kaufen', 'Brot'],
		['Batterien besorgen', 'Batterien']
	])('„%s“', (text, title) => {
		expect(parse(text)).toMatchObject({ kind: 'shopping', title, date: '', startTime: '' });
	});
});

describe('Präfix legt die Art fest', () => {
	it.each([
		['Termin: Oma anrufen', 'event', 'Oma anrufen'],
		['Aufgabe: Geschenk für Oma', 'task', 'Geschenk für Oma'],
		['Einkauf: Geschenkpapier', 'shopping', 'Geschenkpapier'],
		['einkauf:Kaffee', 'shopping', 'Kaffee']
	])('„%s“', (text, kind, title) => {
		expect(parse(text)).toMatchObject({ kind, title, explicit: true });
	});
});

describe('Ränder', () => {
	it('leer oder nur Datum ergibt nichts', () => {
		expect(parse('   ')).toBeNull();
		expect(parse('morgen')).toBeNull();
	});

	it('Namen nur als ganzes Wort (Tomate ist nicht Tom)', () => {
		expect(parse('Tomaten')).toMatchObject({ kind: 'shopping', people: [] });
	});
});
