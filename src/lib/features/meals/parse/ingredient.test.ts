import { describe, expect, it } from 'vitest';
import { parseIngredient, parseIngredients, type ParsedIngredient } from './ingredient.js';

/** Erwartung: nur die genannten Felder, Rest = Standard. */
function like(partial: Partial<ParsedIngredient> & { name: string }): ParsedIngredient {
	return {
		amount: 0,
		unit: '',
		amountKind: 'exact',
		optional: false,
		alternatives: [],
		note: '',
		confidence: 'high',
		...partial
	};
}

describe('Zutaten-Parser: Mengen und Einheiten', () => {
	it.each<[string, Partial<ParsedIngredient> & { name: string }]>([
		['500 g Mehl', { name: 'Mehl', amount: 500, unit: 'g' }],
		['300g Mehl', { name: 'Mehl', amount: 300, unit: 'g' }],
		['1,5 kg Kartoffeln', { name: 'Kartoffeln', amount: 1.5, unit: 'kg' }],
		['1.5 kg Kartoffeln', { name: 'Kartoffeln', amount: 1.5, unit: 'kg' }],
		['2 EL Olivenöl', { name: 'Olivenöl', amount: 2, unit: 'EL' }],
		['2 Essl. Olivenöl', { name: 'Olivenöl', amount: 2, unit: 'EL' }],
		['1/2 TL Salz', { name: 'Salz', amount: 0.5, unit: 'TL' }],
		['½ Liter Milch', { name: 'Milch', amount: 0.5, unit: 'l' }],
		['1 ½ Tassen Reis', { name: 'Reis', amount: 1.5, unit: 'Tasse' }],
		['1½ Tassen Reis', { name: 'Reis', amount: 1.5, unit: 'Tasse' }],
		['250 ml Sahne', { name: 'Sahne', amount: 250, unit: 'ml' }],
		['3 Eier', { name: 'Eier', amount: 3 }],
		['1 Zwiebel', { name: 'Zwiebel', amount: 1 }],
		['2 Zehen Knoblauch', { name: 'Knoblauch', amount: 2, unit: 'Zehe' }],
		['1 Pck. Backpulver', { name: 'Backpulver', amount: 1, unit: 'Packung' }],
		['1 Päckchen Vanillezucker', { name: 'Vanillezucker', amount: 1, unit: 'Packung' }],
		['200 gr. Zucker', { name: 'Zucker', amount: 200, unit: 'g' }],
		['1 Bund Petersilie', { name: 'Petersilie', amount: 1, unit: 'Bund' }],
		['2 Zweige Rosmarin', { name: 'Rosmarin', amount: 2, unit: 'Zweig' }],
		['4 Scheiben Toast', { name: 'Toast', amount: 4, unit: 'Scheibe' }],
		['1 Glas Gurken', { name: 'Gurken', amount: 1, unit: 'Glas' }],
		['1 Würfel Hefe', { name: 'Hefe', amount: 1, unit: 'Würfel' }],
		['2 Stangen Lauch', { name: 'Lauch', amount: 2, unit: 'Stange' }],
		['1 Kopf Salat', { name: 'Salat', amount: 1, unit: 'Kopf' }],
		['5 Blätter Basilikum', { name: 'Basilikum', amount: 5, unit: 'Blatt' }],
		['2 Stk. Paprika', { name: 'Paprika', amount: 2, unit: 'Stück' }],
		['1 Liter Wasser', { name: 'Wasser', amount: 1, unit: 'l' }],
		['10 g frische Hefe', { name: 'frische Hefe', amount: 10, unit: 'g' }],
		['eine Zwiebel', { name: 'Zwiebel', amount: 1 }],
		['zwei Eier', { name: 'Eier', amount: 2 }],
		['eine halbe Zitrone', { name: 'Zitrone', amount: 0.5 }],
		['Mehl 500 g', { name: 'Mehl', amount: 500, unit: 'g' }],
		['Mehl: 500 g', { name: 'Mehl', amount: 500, unit: 'g' }],
		['Eier 3', { name: 'Eier', amount: 3 }]
	])('„%s“', (line, expected) => {
		expect(parseIngredient(line)).toEqual([like(expected)]);
	});
});

describe('Zutaten-Parser: Bereiche und ungefähre Mengen', () => {
	it.each<[string, Partial<ParsedIngredient> & { name: string }]>([
		['2-3 Tomaten', { name: 'Tomaten', amount: 3, note: '2–3' }],
		['2 – 3 Tomaten', { name: 'Tomaten', amount: 3, note: '2–3' }],
		['2 bis 3 Tomaten', { name: 'Tomaten', amount: 3, note: '2–3' }],
		['100-150 g Butter', { name: 'Butter', amount: 150, unit: 'g', note: '100–150' }],
		['ca. 200 g Mehl', { name: 'Mehl', amount: 200, unit: 'g', amountKind: 'approx' }],
		['circa 1 l Brühe', { name: 'Brühe', amount: 1, unit: 'l', amountKind: 'approx' }],
		['etwa 50 ml Wein', { name: 'Wein', amount: 50, unit: 'ml', amountKind: 'approx' }],
		['1 Prise Salz', { name: 'Salz', amount: 1, unit: 'Prise', amountKind: 'approx' }],
		['eine Prise Zucker', { name: 'Zucker', amount: 1, unit: 'Prise', amountKind: 'approx' }],
		['Prise Muskat', { name: 'Muskat', amount: 1, unit: 'Prise', amountKind: 'approx' }],
		['1 Msp. Zimt', { name: 'Zimt', amount: 1, unit: 'Msp.', amountKind: 'approx' }],
		['1 Schuss Milch', { name: 'Milch', amount: 1, unit: 'Schuss', amountKind: 'approx' }],
		['1 Handvoll Rucola', { name: 'Rucola', amount: 1, unit: 'Handvoll', amountKind: 'approx' }],
		['etwas Salz', { name: 'Salz', amountKind: 'to_taste' }],
		['ein paar Blätter Minze', { name: 'Blätter Minze', amountKind: 'to_taste' }],
		['einige Cherrytomaten', { name: 'Cherrytomaten', amountKind: 'to_taste' }]
	])('„%s“', (line, expected) => {
		expect(parseIngredient(line)).toEqual([like(expected)]);
	});
});

describe('Zutaten-Parser: optional, nach Geschmack, Alternativen, Hinweise', () => {
	it.each<[string, Partial<ParsedIngredient> & { name: string }]>([
		['Petersilie, optional', { name: 'Petersilie', optional: true }],
		['Petersilie (optional)', { name: 'Petersilie', optional: true }],
		['optional: Petersilie', { name: 'Petersilie', optional: true }],
		[
			'1 Bund Petersilie, optional',
			{ name: 'Petersilie', amount: 1, unit: 'Bund', optional: true }
		],
		['Parmesan zum Bestreuen', { name: 'Parmesan', optional: true }],
		['evtl. Chili', { name: 'Chili', optional: true }],
		['Sesam, falls vorhanden', { name: 'Sesam', optional: true }],
		['Salz nach Geschmack', { name: 'Salz', amountKind: 'to_taste', note: 'nach Geschmack' }],
		[
			'Pfeffer, nach Geschmack',
			{ name: 'Pfeffer', amountKind: 'to_taste', note: 'nach Geschmack' }
		],
		['Zucker nach Belieben', { name: 'Zucker', amountKind: 'to_taste', optional: true }],
		['Wasser bei Bedarf', { name: 'Wasser', amountKind: 'to_taste', optional: true }],
		[
			'200 g Mehl oder Dinkelmehl',
			{ name: 'Mehl', amount: 200, unit: 'g', alternatives: ['Dinkelmehl'] }
		],
		['Butter/Margarine', { name: 'Butter', alternatives: ['Margarine'] }],
		[
			'100 g Butter oder Margarine oder Öl',
			{ name: 'Butter', amount: 100, unit: 'g', alternatives: ['Margarine', 'Öl'] }
		],
		['1 Zwiebel, fein gehackt', { name: 'Zwiebel', amount: 1, note: 'fein gehackt' }],
		[
			'1,5 kg Kartoffeln, festkochend',
			{ name: 'Kartoffeln', amount: 1.5, unit: 'kg', note: 'festkochend' }
		],
		['1 Dose (400 g) Tomaten', { name: 'Tomaten', amount: 1, unit: 'Dose', note: '400 g' }],
		['500 g Mehl (Typ 405)', { name: 'Mehl', amount: 500, unit: 'g', note: 'Typ 405' }],
		['250 g Weizenmehl Typ 405', { name: 'Weizenmehl Typ 405', amount: 250, unit: 'g' }]
	])('„%s“', (line, expected) => {
		expect(parseIngredient(line)).toEqual([like(expected)]);
	});
});

describe('Zutaten-Parser: Aufzählungen, Format, Unsicherheit', () => {
	it('teilt „Salz und Pfeffer“ in zwei Zutaten', () => {
		expect(parseIngredient('Salz und Pfeffer')).toEqual([
			like({ name: 'Salz' }),
			like({ name: 'Pfeffer' })
		]);
		expect(parseIngredient('Salz, Pfeffer, Paprikapulver').map((p) => p.name)).toEqual([
			'Salz',
			'Pfeffer',
			'Paprikapulver'
		]);
		expect(parseIngredient('Salz und Pfeffer nach Geschmack')).toEqual([
			like({ name: 'Salz', amountKind: 'to_taste', note: 'nach Geschmack' }),
			like({ name: 'Pfeffer', amountKind: 'to_taste', note: 'nach Geschmack' })
		]);
	});

	it('teilt nicht, wenn eine Menge davorsteht oder die Teile lang sind', () => {
		expect(parseIngredient('200 g Erbsen und Möhren')).toHaveLength(1);
		expect(parseIngredient('Öl zum Braten und für die Form')).toHaveLength(1);
	});

	it.each([
		['- 300 g Mehl', 'Mehl'],
		['• 200 g Zucker', 'Zucker'],
		['* 2 Eier', 'Eier'],
		['1. 250 ml Sahne', 'Sahne'],
		['2) 1 Zwiebel', 'Zwiebel'],
		['  300 g   Mehl  ', 'Mehl']
	])('Aufzählungszeichen und Leerzeichen: „%s“', (line, name) => {
		expect(parseIngredient(line)[0].name).toBe(name);
	});

	it('überspringt leere Zeilen und Überschriften', () => {
		expect(parseIngredient('')).toEqual([]);
		expect(parseIngredient('Für den Teig:')).toEqual([]);
		const text = 'Für den Teig:\n300 g Mehl\n\n  \nFür die Füllung:\n2 Äpfel\r\n';
		expect(parseIngredients(text).map((p) => p.name)).toEqual(['Mehl', 'Äpfel']);
	});

	it('markiert Unsicheres statt zu raten', () => {
		expect(parseIngredient('Mehl 2x 500g')[0].confidence).toBe('low');
		expect(parseIngredient('500 g Mehl')[0].confidence).toBe('high');
		expect(parseIngredient('250 g Weizenmehl Typ 405')[0].confidence).toBe('high');
	});
});
