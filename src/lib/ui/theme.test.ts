import { describe, expect, it } from 'vitest';
import { nextTheme, parseAccent, parseTheme } from './theme.js';

describe('nextTheme', () => {
	it('wechselt System → Hell → Dunkel → System', () => {
		expect(nextTheme('system')).toBe('light');
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('dark')).toBe('system');
	});
});

describe('parseTheme', () => {
	it('akzeptiert nur gültige Werte, sonst System', () => {
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('dark')).toBe('dark');
		expect(parseTheme(null)).toBe('system');
		expect(parseTheme('lila')).toBe('system');
	});
});

describe('parseAccent', () => {
	it('akzeptiert die angebotenen Akzentfarben', () => {
		expect(parseAccent('petrol')).toBe('petrol');
		expect(parseAccent('indigo')).toBe('indigo');
		expect(parseAccent('graphit')).toBe('graphit');
	});

	it('fällt bei fehlenden oder unbekannten Werten auf Petrol zurück', () => {
		expect(parseAccent(null)).toBe('petrol');
		expect(parseAccent(undefined)).toBe('petrol');
		expect(parseAccent('lila')).toBe('petrol');
	});
});
