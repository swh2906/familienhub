import { describe, expect, it } from 'vitest';
import { isId, newId } from './ids.js';

describe('newId', () => {
	it('erzeugt IDs im PocketBase-Format', () => {
		for (let i = 0; i < 200; i++) expect(newId()).toMatch(/^[a-z0-9]{15}$/);
	});

	it('erzeugt keine Doppelten', () => {
		const ids = new Set(Array.from({ length: 5_000 }, () => newId()));
		expect(ids.size).toBe(5_000);
	});

	it('nutzt alle 36 Zeichen', () => {
		const chars = new Set(Array.from({ length: 300 }, () => newId()).join(''));
		expect(chars.size).toBe(36);
	});
});

describe('isId', () => {
	it('erkennt gültige und ungültige IDs', () => {
		expect(isId('abc123def456ghi')).toBe(true);
		expect(isId('ABC123def456ghi')).toBe(false);
		expect(isId('zu-kurz')).toBe(false);
		expect(isId(42)).toBe(false);
	});
});
