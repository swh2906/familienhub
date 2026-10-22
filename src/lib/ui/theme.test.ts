import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACCENTS, nextTheme, parseAccent, parseTheme } from './theme.js';

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
		for (const accent of ACCENTS) expect(parseAccent(accent)).toBe(accent);
		expect(parseAccent('terrakotta')).toBe('terrakotta');
		expect(parseAccent('petrol')).toBe('petrol');
		expect(parseAccent('indigo')).toBe('indigo');
		expect(parseAccent('graphit')).toBe('graphit');
	});

	it('fällt bei fehlenden oder unbekannten Werten auf Terrakotta zurück', () => {
		expect(parseAccent(null)).toBe('terrakotta');
		expect(parseAccent(undefined)).toBe('terrakotta');
		expect(parseAccent('lila')).toBe('terrakotta');
	});
});

describe('Akzentfarben', () => {
	const css = readFileSync('src/lib/ui/theme.css', 'utf8');
	const html = readFileSync('src/app.html', 'utf8');

	it('jede Farbe hat einen Farbsatz und eine Vorschau; das Startskript kennt alle', () => {
		for (const accent of ACCENTS) {
			expect(css).toContain(`--swatch-${accent}:`);
			if (accent === 'terrakotta') continue; // Standard: ohne Attribut
			expect(css).toContain(`:root[data-accent='${accent}']`);
			expect(html).toContain(`'${accent}'`);
		}
	});
});
