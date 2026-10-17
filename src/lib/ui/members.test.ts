import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	FORMER_MEMBER_COLOR,
	initialOf,
	MEMBER_COLORS,
	memberColor,
	withFormerMembers
} from './members.js';

describe('initialOf', () => {
	it('liefert den ersten Buchstaben groß', () => {
		expect(initialOf('mia')).toBe('M');
		expect(initialOf('  Öko ')).toBe('Ö');
		expect(initialOf('😀 Smiley')).toBe('😀');
	});

	it('liefert „?“ für leere Namen', () => {
		expect(initialOf('')).toBe('?');
		expect(initialOf(null)).toBe('?');
	});
});

describe('memberColor', () => {
	it('lässt nur Palettenfarben zu', () => {
		expect(memberColor('#7A3BD1')).toBe('#7a3bd1');
		expect(memberColor('#ff00ff')).toBe(MEMBER_COLORS[0]);
		expect(memberColor('')).toBe(MEMBER_COLORS[0]);
	});

	it('entspricht der Palette des Servers', () => {
		const hooks = readFileSync(
			path.resolve(import.meta.dirname, '../../../pocketbase/pb_hooks/lib/familienhub.js'),
			'utf8'
		);
		const block = /MEMBER_COLORS = \[([^\]]*)\]/.exec(hooks)?.[1] ?? '';
		expect(block.match(/#[0-9a-f]{6}/g)).toEqual([...MEMBER_COLORS]);
	});
});

describe('withFormerMembers', () => {
	it('zeigt entfernte Mitglieder als „Ehemaliges Mitglied“ in Grau', () => {
		const list = withFormerMembers(
			[
				{ id: 'a', display_name: 'Julia', color: '#2453c7', deleted_at: '' },
				{ id: 'b', display_name: '', color: '#18733b', deleted_at: '2026-10-17 10:00:00.000Z' }
			],
			'Ehemaliges Mitglied'
		);
		expect(list[0]).toMatchObject({ display_name: 'Julia', color: '#2453c7' });
		expect(list[1]).toMatchObject({
			id: 'b',
			display_name: 'Ehemaliges Mitglied',
			color: FORMER_MEMBER_COLOR
		});
		expect(memberColor(FORMER_MEMBER_COLOR)).toBe(FORMER_MEMBER_COLOR);
	});
});
