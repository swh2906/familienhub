import { describe, expect, it } from 'vitest';
import type { ShoppingItem } from '#lib/db/types.js';
import { emojiFor } from './emoji.js';
import { recentItems, suggestions } from './suggest.js';

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

describe('emojiFor', () => {
	it.each([
		['Äpfel', '🍎'],
		['Hafermilch', '🥛'],
		['Kokosmilch', '🥥'],
		['Vollkornbrot', '🍞'],
		['Brötchen', '🥯'],
		['Eier', '🥚'],
		['Ei', '🥚'],
		['Reis', '🍚'],
		['Eisbergsalat', '🥬'],
		['Eis', '🍦'],
		['Olivenöl', '🫗'],
		['Toilettenpapier', '🧻']
	])('%s → %s', (name, emoji) => {
		expect(emojiFor(name)).toBe(emoji);
	});

	it('nimmt sonst das Emoji der Kategorie oder den Einkaufswagen', () => {
		expect(emojiFor('Kerzen', 'Haushalt')).toBe('🧽');
		expect(emojiFor('Kerzen')).toBe('🛒');
	});
});

describe('recentItems', () => {
	it('zeigt abgehakte Artikel einmal pro Name, neueste zuerst, ohne offene und gelöschte', () => {
		const recent = recentItems([
			item('1', 'Milch', { checked: true, checked_at: '2026-10-01 10:00:00.000Z' }),
			item('2', 'milch', { checked: true, checked_at: '2026-10-05 10:00:00.000Z' }),
			item('3', 'Brot', { checked: true, checked_at: '2026-10-03 10:00:00.000Z' }),
			item('4', 'Eier', { checked: true, checked_at: '2026-10-04 10:00:00.000Z' }),
			item('5', 'Eier'), // steht gerade offen auf der Liste
			item('6', 'Käse', { checked: true, checked_at: '2026-10-06 10:00:00.000Z', deleted_at: 'x' })
		]);
		expect(recent.map((i) => i.id)).toEqual(['2', '3']);
	});
});

describe('suggestions', () => {
	const items = [
		item('1', 'Hafermilch', { checked: true, checked_at: '2026-10-05 10:00:00.000Z' }),
		item('2', 'Milchreis', { checked: true, checked_at: '2026-10-04 10:00:00.000Z' }),
		item('3', 'Brot')
	];

	it('zuletzt gekaufte zuerst, Treffer am Wortanfang vor Treffern im Wort', () => {
		const result = suggestions('milch', items);
		expect(result.map((s) => s.name)).toEqual(['Milchreis', 'Milch', 'Hafermilch']);
		expect(result[0].item?.id).toBe('2');
		expect(result[1].item).toBeUndefined();
	});

	it('schlägt nichts vor, was schon offen ist, und nichts bei leerer Eingabe', () => {
		expect(suggestions('brot', items).map((s) => s.name)).not.toContain('Brot');
		expect(suggestions('  ', items)).toEqual([]);
	});
});
