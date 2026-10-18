import { describe, expect, it } from 'vitest';
import {
	clampDifficulty,
	clampMinutes,
	ingredientLine,
	recipeCategory,
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
});
