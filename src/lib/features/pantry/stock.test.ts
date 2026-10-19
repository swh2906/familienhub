import { describe, expect, it } from 'vitest';
import {
	answerEntry,
	computeStock,
	convertAmount,
	isUncertain,
	type PantryEntry,
	type PantryKind
} from './stock.js';

const NOW = new Date('2026-10-19T12:00:00Z');
let n = 0;
function entry(kind: PantryKind, amount: number, unit: string, daysAgo: number, ref?: string) {
	n += 1;
	const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
	return { id: `e${String(n).padStart(4, '0')}`, kind, amount, unit, at, ref } as PantryEntry;
}

describe('Einheiten umrechnen', () => {
	it('rechnet innerhalb von Gewicht, Volumen und Stück', () => {
		expect(convertAmount(1, 'kg', 'g')).toBe(1000);
		expect(convertAmount(500, 'g', 'kg')).toBe(0.5);
		expect(convertAmount(2, 'EL', 'ml')).toBe(30);
		expect(convertAmount(1, 'l', 'ml')).toBe(1000);
		expect(convertAmount(3, '', 'Stück')).toBe(3);
	});

	it('Packung über die Packungsgröße, sonst nicht umrechenbar', () => {
		expect(convertAmount(2, 'Packung', 'g', 500)).toBe(1000);
		expect(convertAmount(2, 'Packung', 'g')).toBeNull();
		expect(convertAmount(1, 'Bund', 'g')).toBeNull();
		expect(convertAmount(100, 'g', 'ml')).toBeNull();
	});
});

describe('Bestand berechnen', () => {
	it('ohne Buchungen unbekannt', () => {
		expect(computeStock([], { unit: 'g', now: NOW })).toMatchObject({
			amount: null,
			status: 'unknown',
			confidence: 'none'
		});
	});

	it('Bestand setzen, kaufen und verbrauchen', () => {
		const stock = computeStock(
			[entry('set', 200, 'g', 5), entry('purchase', 1, 'kg', 4), entry('consume', 300, 'g', 2)],
			{ unit: 'g', pack: 1000, now: NOW }
		);
		expect(stock.amount).toBe(900);
		expect(stock.status).toBe('ok');
		// Verbrauch aus Rezepten ist geschätzt.
		expect(stock.confidence).toBe('medium');
	});

	it('frisch gezählt ist sicher; alte Angaben werden unsicher', () => {
		expect(computeStock([entry('set', 500, 'g', 3)], { unit: 'g', now: NOW }).confidence).toBe(
			'high'
		);
		expect(computeStock([entry('set', 500, 'g', 30)], { unit: 'g', now: NOW }).confidence).toBe(
			'medium'
		);
		const old = computeStock([entry('set', 500, 'g', 90)], { unit: 'g', now: NOW });
		expect(old.confidence).toBe('low');
		expect(isUncertain(old)).toBe(true);
	});

	it('Verbrauch geht nie unter null; leer ist leer', () => {
		const stock = computeStock([entry('set', 100, 'g', 3), entry('consume', 250, 'g', 1)], {
			unit: 'g',
			now: NOW
		});
		expect(stock).toMatchObject({ amount: 0, status: 'empty' });
	});

	it('wenig, wenn unter einem Viertel Packung oder dem Wochenverbrauch', () => {
		const stock = computeStock([entry('set', 200, 'g', 1)], { unit: 'g', pack: 1000, now: NOW });
		expect(stock.status).toBe('low');
		const weekly = computeStock(
			[
				entry('set', 2000, 'g', 50),
				...Array.from({ length: 8 }, (_, i) => entry('consume', 200, 'g', 49 - i * 6)),
				entry('set', 150, 'g', 0)
			],
			{ unit: 'g', now: NOW }
		);
		expect(weekly.weekly).toBe(200);
		expect(weekly.status).toBe('low');
	});

	it('„noch da“ ohne Menge zählt als vorhanden, aber nicht ganz sicher', () => {
		const stock = computeStock([entry('present', 0, '', 1)], { unit: 'g', now: NOW });
		expect(stock).toMatchObject({ amount: null, present: true, status: 'ok' });
		expect(stock.confidence).toBe('medium');
	});

	it('Kauf ohne umrechenbare Menge macht vorhanden, aber geschätzt', () => {
		const stock = computeStock([entry('purchase', 1, 'Bund', 1)], { unit: 'g', now: NOW });
		expect(stock).toMatchObject({ amount: null, present: true, status: 'ok' });
	});

	it('stornierte und gelöschte Buchungen zählen nicht', () => {
		const buy = entry('purchase', 500, 'g', 2);
		const stock = computeStock(
			[
				entry('set', 100, 'g', 3),
				buy,
				entry('undo', 0, '', 1, buy.id),
				{ ...entry('purchase', 900, 'g', 1), deleted_at: NOW.toISOString() }
			],
			{ unit: 'g', now: NOW }
		);
		expect(stock.amount).toBe(100);
	});

	it('Einheit aus den Buchungen, wenn der Artikel keine hat', () => {
		const stock = computeStock([entry('purchase', 6, 'Stück', 1), entry('consume', 2, '', 0)], {
			now: NOW
		});
		expect(stock).toMatchObject({ amount: 4, unit: 'Stück' });
	});
});

describe('Antworten im Vorrat', () => {
	const stock = computeStock([entry('set', 800, 'g', 60)], { unit: 'g', now: NOW });

	it('„ist alle“ setzt 0, „habe ich noch“ bestätigt', () => {
		expect(answerEntry('empty', stock)).toEqual({ kind: 'set', amount: 0, unit: 'g' });
		expect(answerEntry('have', stock)).toEqual({ kind: 'present', amount: 0, unit: 'g' });
	});

	it('„ungefähr die Hälfte“ der bekannten Menge, sonst einer Packung', () => {
		expect(answerEntry('half', stock)).toEqual({ kind: 'set', amount: 400, unit: 'g' });
		const unknown = computeStock([], { unit: 'g', now: NOW });
		expect(answerEntry('half', unknown, 500)).toEqual({ kind: 'set', amount: 250, unit: 'g' });
		expect(answerEntry('half', unknown)).toEqual({ kind: 'present', amount: 0, unit: 'g' });
	});
});
