import { describe, expect, it } from 'vitest';
import { nextTheme, parseTheme } from './theme.js';

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
