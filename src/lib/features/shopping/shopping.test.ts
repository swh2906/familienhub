import { describe, expect, it } from 'vitest';
import type { ShoppingItem } from '#lib/db/types.js';
import { categoryFromKeywords, suggestCategory } from './categorize.js';
import { formatQuantity, groupItems, parseQuickInput } from './list.js';

const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function item(id: string, name: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
	return {
		...base,
		id,
		household: 'h',
		name,
		amount: 0,
		unit: '',
		category: '',
		checked: false,
		checked_at: '',
		added_by: '',
		checked_by: '',
		meal_plan_entry: '',
		...extra
	};
}

describe('Schnell-Eingabe', () => {
	it.each([
		['2 l Milch', { name: 'Milch', amount: 2, unit: 'l' }],
		['500 g Hackfleisch', { name: 'Hackfleisch', amount: 500, unit: 'g' }],
		['Brot', { name: 'Brot', amount: 0, unit: '' }],
		['6 Eier', { name: 'Eier', amount: 6, unit: '' }],
		['1,5 kg Kartoffeln', { name: 'Kartoffeln', amount: 1.5, unit: 'kg' }],
		['2 Pck. Butter', { name: 'Butter', amount: 2, unit: 'Packung' }]
	])('„%s“', (input, expected) => {
		expect(parseQuickInput(input)).toEqual(expected);
	});

	it('ignoriert leere Eingaben', () => {
		expect(parseQuickInput('   ')).toBeNull();
	});

	it('zeigt Mengen deutsch an', () => {
		expect(formatQuantity({ amount: 1.5, unit: 'kg' })).toBe('1,5 kg');
		expect(formatQuantity({ amount: 3, unit: '' })).toBe('3');
		expect(formatQuantity({ amount: 0, unit: 'g' })).toBe('');
	});
});

describe('Kategorie aus Stichworten', () => {
	it.each([
		['Äpfel', 'Obst & Gemüse'],
		['Hafermilch', 'Kühlregal'],
		['Kokosmilch', 'Konserven'],
		['Thunfisch', 'Konserven'],
		['Lachsfilet', 'Fleisch & Fisch'],
		['Olivenöl', 'Gewürze & Öle'],
		['Paprikapulver', 'Gewürze & Öle'],
		['Rote Paprika', 'Obst & Gemüse'],
		['Vollkornbrot', 'Brot & Backwaren'],
		['Basmatireis', 'Trockenware'],
		['Eisbergsalat', 'Obst & Gemüse'],
		['Vanilleeis', 'Tiefkühl'],
		['TK Spinat', 'Tiefkühl'],
		['Spülmittel', 'Haushalt'],
		['Gummibärchen', 'Süßes'],
		['Mineralwasser', 'Getränke'],
		['Geschenkpapier', '']
	])('„%s“ → %s', (name, category) => {
		expect(categoryFromKeywords(name)).toBe(category);
	});
});

describe('Kategorie-Vorschlag', () => {
	it('nimmt zuerst die früher im Haushalt gewählte Kategorie', () => {
		const history = [
			item('1', 'Milch', { category: 'Getränke', updated: '2026-10-01 10:00:00.000Z' }),
			item('2', 'milch', { category: 'Kühlregal', updated: '2026-10-10 10:00:00.000Z' }),
			item('3', 'Brot', { category: '' })
		];
		expect(suggestCategory('MILCH', history)).toBe('Kühlregal');
		expect(suggestCategory('Brot', history)).toBe('Brot & Backwaren');
		expect(suggestCategory('Geschenkpapier', history)).toBe('');
	});
});

describe('groupItems', () => {
	it('gruppiert offene Artikel in Ladenreihenfolge, Erledigte separat', () => {
		const { open, done } = groupItems([
			item('a', 'Zucchini', { category: 'Obst & Gemüse' }),
			item('b', 'Äpfel', { category: 'Obst & Gemüse' }),
			item('c', 'Spülmittel', { category: 'Haushalt' }),
			item('d', 'Milch', { category: 'Kühlregal' }),
			item('e', 'Geschenkpapier'),
			item('f', 'Kerzen', { category: 'Deko' }),
			item('g', 'Brot', { checked: true, checked_at: '2026-10-10 09:00:00.000Z' }),
			item('h', 'Eier', { checked: true, checked_at: '2026-10-10 10:00:00.000Z' }),
			item('i', 'Gelöscht', { deleted_at: 'x' })
		]);
		expect(open.map((g) => g.category)).toEqual([
			'Obst & Gemüse',
			'Kühlregal',
			'Haushalt',
			'Deko',
			'Sonstiges'
		]);
		expect(open[0].items.map((i) => i.name)).toEqual(['Äpfel', 'Zucchini']);
		expect(done.map((i) => i.name)).toEqual(['Eier', 'Brot']);
	});
});
