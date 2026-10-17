import { describe, expect, it } from 'vitest';
import { matchesShortcut, type KeyInfo } from './shortcut.js';

const base: KeyInfo = {
	key: 'n',
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	repeat: false,
	defaultPrevented: false,
	typing: false,
	dialogOpen: false
};

describe('matchesShortcut', () => {
	it('reagiert auf die Taste, auch mit Umschalt', () => {
		expect(matchesShortcut(base, 'n')).toBe(true);
		expect(matchesShortcut({ ...base, key: 'N' }, 'n')).toBe(true);
		expect(matchesShortcut({ ...base, key: 'm' }, 'n')).toBe(false);
	});

	it('nicht mit Strg, Cmd oder Alt (Browser-Kürzel wie Strg+N bleiben frei)', () => {
		expect(matchesShortcut({ ...base, ctrlKey: true }, 'n')).toBe(false);
		expect(matchesShortcut({ ...base, metaKey: true }, 'n')).toBe(false);
		expect(matchesShortcut({ ...base, altKey: true }, 'n')).toBe(false);
	});

	it('nicht beim Tippen, hinter einem Dialog, bei gehaltener Taste oder schon behandelt', () => {
		expect(matchesShortcut({ ...base, typing: true }, 'n')).toBe(false);
		expect(matchesShortcut({ ...base, dialogOpen: true }, 'n')).toBe(false);
		expect(matchesShortcut({ ...base, repeat: true }, 'n')).toBe(false);
		expect(matchesShortcut({ ...base, defaultPrevented: true }, 'n')).toBe(false);
	});
});
