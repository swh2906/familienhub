import { describe, expect, it } from 'vitest';
import { isActive } from './nav.js';

describe('isActive', () => {
	it('markiert die Startseite nur exakt', () => {
		expect(isActive('/', '/', '/')).toBe(true);
		expect(isActive('/einkauf', '/', '/')).toBe(false);
	});

	it('markiert Bereiche inklusive Unterseiten', () => {
		expect(isActive('/einkauf', '/einkauf', '/')).toBe(true);
		expect(isActive('/einkauf/', '/einkauf', '/')).toBe(true);
		expect(isActive('/einkauf/123', '/einkauf', '/')).toBe(true);
		expect(isActive('/einkaufen', '/einkauf', '/')).toBe(false);
	});
});
