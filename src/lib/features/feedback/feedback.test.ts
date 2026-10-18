import { describe, expect, it } from 'vitest';
import type { Feedback } from '#lib/db/types.js';
import { deviceSummary, sortFeedback } from './feedback.js';

describe('Feedback', () => {
	it('beschreibt das Gerät grob', () => {
		const android =
			'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
		const iphone =
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
		const windows =
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';
		expect(deviceSummary(android, 412)).toBe('Handy · Android · Chrome');
		expect(deviceSummary(iphone, 390)).toBe('Handy · iOS · Safari');
		expect(deviceSummary(windows, 1280)).toBe('Desktop · Windows · Edge');
		expect(deviceSummary('', 800)).toBe('Tablet · Unbekannt · Browser');
	});

	it('offene zuerst, dann neueste; gelöschte weg', () => {
		const base = {
			household: 'h',
			text: '',
			area: '',
			device: '',
			created_by: '',
			updated: '',
			updated_by: ''
		};
		const list = [
			{ ...base, id: 'a', done: true, created: '2026-10-19', deleted_at: '' },
			{ ...base, id: 'b', done: false, created: '2026-10-17', deleted_at: '' },
			{ ...base, id: 'c', done: false, created: '2026-10-18', deleted_at: '' },
			{ ...base, id: 'd', done: false, created: '2026-10-20', deleted_at: '2026-10-20' }
		] satisfies Feedback[];
		expect(sortFeedback(list).map((f) => f.id)).toEqual(['c', 'b', 'a']);
	});
});
