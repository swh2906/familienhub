import { describe, expect, it } from 'vitest';
import {
	STARTER_INGREDIENTS,
	ingredientId,
	ingredientKey,
	matchIngredient,
	normalizeName
} from './catalog.js';

describe('Basisartikel: Normalisierung', () => {
	it('vereinheitlicht Schreibweisen', () => {
		expect(normalizeName('Weizenmehl Typ 405')).toBe('weizenmehl');
		expect(normalizeName('Mehl 405')).toBe('mehl');
		expect(normalizeName('Crème fraîche')).toBe('creme fraiche');
		expect(normalizeName('frische Petersilie, gehackt')).toBe('petersilie');
		expect(normalizeName('Süßkartoffel')).toBe('susskartoffel');
	});

	it('nimmt die Einzahl', () => {
		expect(ingredientKey('Tomaten')).toBe(ingredientKey('Tomate'));
		expect(ingredientKey('Kartoffeln')).toBe(ingredientKey('Kartoffel'));
		expect(ingredientKey('Zwiebeln')).toBe(ingredientKey('Zwiebel'));
		expect(ingredientKey('Champignons')).toBe(ingredientKey('Champignon'));
		expect(ingredientKey('Kichererbsen')).toBe(ingredientKey('Kichererbse'));
	});
});

describe('Basisartikel: Zuordnung', () => {
	it.each([
		['Mehl', 'Mehl'],
		['Weizenmehl Typ 405', 'Mehl'],
		['Mehl 405', 'Mehl'],
		['Weizenmehl', 'Mehl'],
		['Dinkelmehl', 'Dinkelmehl'],
		['Kartoffeln', 'Kartoffel'],
		['Karotten', 'Möhre'],
		['Knoblauchzehe', 'Knoblauch'],
		['Passata', 'Passierte Tomaten'],
		['frische Hefe', 'Hefe'],
		['frische Petersilie', 'Petersilie'],
		['Gehackte Tomaten', 'Gehackte Tomaten'],
		['Tomaten, gehackt', 'Gehackte Tomaten'],
		['Tomaten', 'Tomate'],
		['Ei', 'Eier'],
		['Sojasauce', 'Sojasoße']
	])('„%s“ → %s', (input, expected) => {
		expect(matchIngredient(input, []).name).toBe(expected);
	});

	it('Artikel der Familie haben Vorrang, inklusive gelernter Schreibweisen', () => {
		const known = [{ id: 'a', name: 'Mehl', aliases: ['Pizzamehl'] }];
		expect(matchIngredient('Pizzamehl', known)).toMatchObject({ name: 'Mehl', source: 'known' });
		expect(matchIngredient('Weizenmehl', known)).toMatchObject({ name: 'Mehl', source: 'known' });
	});

	it('Unbekanntes wird ein neuer Artikel mit eigenem Namen', () => {
		expect(matchIngredient('Za’atar', [])).toMatchObject({ source: 'new', name: 'Za’atar' });
		expect(matchIngredient('tahini', [])).toMatchObject({ source: 'new', name: 'Tahini' });
	});

	it('Startwörterbuch: kein Schlüssel zeigt auf zwei verschiedene Artikel', () => {
		const owner = new Map<string, string>();
		const clashes: string[] = [];
		for (const item of STARTER_INGREDIENTS) {
			for (const key of new Set([item.name, ...item.aliases].map(ingredientKey))) {
				const other = owner.get(key);
				if (other && other !== item.name) clashes.push(`${key}: ${other} / ${item.name}`);
				owner.set(key, item.name);
			}
		}
		expect(clashes).toEqual([]);
	});
});

describe('Basisartikel: feste IDs', () => {
	it('gleiche Familie + Schlüssel → gleiche ID, sonst verschieden', () => {
		const a = ingredientId('household000001', 'mehl');
		expect(a).toMatch(/^[a-z0-9]{15}$/);
		expect(ingredientId('household000001', 'mehl')).toBe(a);
		expect(ingredientId('household000002', 'mehl')).not.toBe(a);
		expect(ingredientId('household000001', 'zucker')).not.toBe(a);
	});
});
