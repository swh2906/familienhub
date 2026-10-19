import { describe, expect, it } from 'vitest';
import {
	clampDifficulty,
	clampMinutes,
	difficultyName,
	formatDuration,
	ingredientAmount,
	ingredientExtras,
	ingredientLine,
	recipeCategory,
	recipeFacts,
	splitDuration
} from './cooking.js';

describe('Kochansicht', () => {
	it('Schwierigkeit 1–3, sonst keine Angabe', () => {
		expect(clampDifficulty(2)).toBe(2);
		expect(clampDifficulty(2.6)).toBe(3);
		expect(clampDifficulty(0)).toBe(0);
		expect(clampDifficulty(4)).toBe(0);
		expect(clampDifficulty(undefined)).toBe(0);
	});

	it('Dauer begrenzt und in Stunden/Minuten zerlegt', () => {
		expect(clampMinutes(-5)).toBe(0);
		expect(clampMinutes(5000)).toBe(1440);
		expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
		expect(splitDuration(90)).toEqual({ hours: 1, minutes: 30 });
		expect(splitDuration(0)).toBeNull();
		expect(splitDuration(undefined)).toBeNull();
	});

	it('Kategorie ist der erste Tag', () => {
		expect(recipeCategory({ tags: ['Pasta', 'schnell'] })).toBe('Pasta');
		expect(recipeCategory({ tags: [' ', 'Suppe'] })).toBe('Suppe');
		expect(recipeCategory({ tags: null })).toBe('');
	});

	it('Zutaten-Zeile mit umgerechneter Menge', () => {
		const mehl = { amount: 300, unit: 'g', name: 'Mehl' };
		expect(ingredientLine(mehl, 4, 4)).toBe('300 g Mehl');
		expect(ingredientLine(mehl, 4, 2)).toBe('150 g Mehl');
		expect(ingredientLine({ amount: 0, unit: 'g', name: 'Salz' }, 4, 2)).toBe('Salz');
	});

	it('Texte für Dauer, Schwierigkeit und Kurzinfo', () => {
		expect(formatDuration(45)).toBe('45 Min.');
		expect(formatDuration(60)).toBe('1 Std.');
		expect(formatDuration(75)).toBe('1 Std. 15 Min.');
		expect(formatDuration(0)).toBe('');
		expect(difficultyName(2)).toBe('mittel');
		expect(difficultyName(0)).toBe('keine Angabe');
		expect(recipeFacts({ servings: 4, prep_minutes: 75, difficulty: 2 }, '4 Portionen')).toEqual([
			'4 Portionen',
			'1 Std. 15 Min.',
			'mittel'
		]);
		expect(recipeFacts({ servings: 4 }, '4 Portionen')).toEqual(['4 Portionen']);
	});
});

describe('Zusatzangaben in der Anzeige', () => {
	it('„ca.“ nur bei ungefähren Mengen mit Menge', () => {
		const oil = { amount: 2, unit: 'EL', name: 'Öl', amount_kind: 'approx' as const };
		expect(ingredientAmount(oil, 2, 4)).toBe('ca. 4 EL');
		expect(ingredientLine(oil, 2, 2)).toBe('ca. 2 EL Öl');
		expect(ingredientLine({ ...oil, amount: 0 }, 2, 2)).toBe('Öl');
	});

	it('optional, nach Geschmack und Alternativen als Hinweise', () => {
		expect(
			ingredientExtras({
				amount_kind: 'to_taste',
				optional: true,
				alternatives: ['Chili', ' '],
				note: ' gemahlen '
			})
		).toEqual({
			tags: ['nach Geschmack', 'optional'],
			alternatives: 'oder Chili',
			note: 'gemahlen'
		});
		expect(ingredientExtras({})).toEqual({ tags: [], alternatives: '', note: '' });
	});
});
