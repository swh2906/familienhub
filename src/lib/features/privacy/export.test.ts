import { describe, expect, it } from 'vitest';
import { buildExport, exportFileName } from './export.js';

describe('Datenexport', () => {
	const now = new Date('2026-10-17T10:00:00Z');

	it('enthält alle Bereiche, aber keine gelöschten Einträge', () => {
		const result = buildExport(
			'h1',
			{
				shopping_items: [
					{ id: 'a', name: 'Milch', deleted_at: '' },
					{ id: 'b', name: 'Weg', deleted_at: '2026-10-01 10:00:00.000Z' }
				],
				tasks: [{ id: 't', title: 'Müll' }]
			},
			now
		);
		expect(result).toMatchObject({
			format: 'familienhub-export',
			version: 1,
			exported_at: '2026-10-17T10:00:00.000Z',
			household: 'h1'
		});
		expect(result.data.shopping_items).toEqual([{ id: 'a', name: 'Milch', deleted_at: '' }]);
		expect(result.data.tasks).toEqual([{ id: 't', title: 'Müll' }]);
		expect(result.data.events).toEqual([]);
		expect(Object.keys(result.data)).not.toContain('invites');
	});

	it('Dateiname aus Familienname und Datum', () => {
		expect(exportFileName('Familie Müller & Söhne', now)).toBe(
			'homi-familie-mueller-soehne-2026-10-17.json'
		);
		expect(exportFileName('!!!', now)).toBe('homi-familie-2026-10-17.json');
	});
});
