import { describe, expect, it } from 'vitest';
import type { HintResponse } from '#lib/db/types.js';
import { kindKey, responseUntil, splitHints, visibleHints, type HintBase } from './engine.js';

const NOW = new Date('2026-10-19T15:00:00');
const base = { created: '', updated: '', updated_by: '', deleted_at: '' };

function response(key: string, answer: HintResponse['response'], until = ''): HintResponse {
	return { ...base, id: key, household: 'h', membership: 'm', key, response: answer, until };
}

const hints: HintBase[] = [
	{ key: 'cooked:a', kind: 'cooked', priority: 3, date: '2026-10-18' },
	{ key: 'stock:reis', kind: 'stock', priority: 2, date: '2026-10-20' },
	{ key: 'conflict:b', kind: 'conflict', priority: 0, date: '2026-10-21' },
	{ key: 'conflict:c', kind: 'conflict', priority: 0, date: '2026-10-20' }
];

describe('Hinweise steuern', () => {
	it('wichtigste zuerst, bei gleicher Art der frühere Tag', () => {
		expect(visibleHints(hints, [], NOW).map((h) => h.key)).toEqual([
			'conflict:c',
			'conflict:b',
			'stock:reis',
			'cooked:a'
		]);
	});

	it('„Später“ und „Nicht heute“ blenden bis zum Zeitpunkt aus', () => {
		const later = responseUntil('later', NOW);
		expect(Date.parse(later) - NOW.getTime()).toBe(3 * 3_600_000);
		const tonight = new Date(responseUntil('not_today', NOW));
		expect([tonight.getHours(), tonight.getMinutes(), tonight.getDate()]).toEqual([0, 0, 20]);

		const responses = [
			response('conflict:c', 'later', later),
			response('stock:reis', 'not_today', tonight.toISOString())
		];
		expect(visibleHints(hints, responses, NOW).map((h) => h.key)).toEqual([
			'conflict:b',
			'cooked:a'
		]);
		const tomorrow = new Date('2026-10-20T08:00:00');
		expect(visibleHints(hints, responses, tomorrow)).toHaveLength(4);
	});

	it('„Nie wieder so“ blendet die ganze Art aus, „erledigt“ den einen Hinweis', () => {
		const responses = [response(kindKey('conflict'), 'never'), response('cooked:a', 'done')];
		expect(visibleHints(hints, responses, NOW).map((h) => h.key)).toEqual(['stock:reis']);
		expect(responseUntil('never', NOW)).toBe('');
	});

	it('gelöschte Antworten zählen nicht', () => {
		const responses = [{ ...response(kindKey('conflict'), 'never'), deleted_at: 'x' }];
		expect(visibleHints(hints, responses, NOW)).toHaveLength(4);
	});

	it('ein aktiver Hinweis, der Rest gebündelt', () => {
		expect(splitHints([1, 2, 3])).toEqual({ active: 1, more: [2, 3] });
		expect(splitHints([])).toEqual({ active: null, more: [] });
	});
});
