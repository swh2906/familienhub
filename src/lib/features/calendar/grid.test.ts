import { describe, expect, it } from 'vitest';
import {
	HOUR_PX,
	initialScrollTop,
	minutesToTime,
	moveTo,
	resizeTo,
	slotGeometry,
	snapMinutes
} from './grid.js';

describe('Zeitachse', () => {
	it('springt heute zur aktuellen Uhrzeit (oberes Drittel), sonst 6:30', () => {
		expect(initialScrollTop(false, 14 * 60, 600)).toBe(6.5 * HOUR_PX);
		expect(initialScrollTop(true, 14 * 60, 600)).toBe(14 * HOUR_PX - 200);
		// Früh am Morgen nicht über den Anfang hinaus, spät am Abend nicht über das Ende.
		expect(initialScrollTop(true, 30, 600)).toBe(0);
		expect(initialScrollTop(true, 23 * 60 + 50, 600)).toBe(24 * HOUR_PX - 600);
	});

	it('rundet auf 15 Minuten', () => {
		expect(snapMinutes(HOUR_PX)).toBe(60);
		expect(snapMinutes(HOUR_PX / 4 + 3)).toBe(15);
		expect(snapMinutes(-HOUR_PX / 2)).toBe(-30);
	});

	it('verschiebt mit gleicher Dauer und bleibt im Tag', () => {
		expect(moveTo('2026-10-20', 600, 60, 90)).toEqual({
			date: '2026-10-20',
			start: 690,
			duration: 60
		});
		expect(moveTo('2026-10-21', 60, 60, -120)).toEqual({
			date: '2026-10-21',
			start: 0,
			duration: 60
		});
		expect(moveTo('2026-10-21', 1380, 90, 60)).toEqual({
			date: '2026-10-21',
			start: 1350,
			duration: 90
		});
	});

	it('ändert die Dauer: mindestens 15 Minuten, höchstens bis Mitternacht', () => {
		expect(resizeTo('2026-10-20', 600, 60, 30).duration).toBe(90);
		expect(resizeTo('2026-10-20', 600, 60, -120).duration).toBe(15);
		expect(resizeTo('2026-10-20', 1380, 30, 180).duration).toBe(60);
	});

	it('Minuten als Uhrzeit', () => {
		expect(minutesToTime(0)).toBe('00:00');
		expect(minutesToTime(615)).toBe('10:15');
	});
});

describe('Überlappende Termine', () => {
	it('allein: volle Breite', () => {
		expect(slotGeometry(0, 1)).toEqual({ left: 0, width: 100 });
	});

	it('zwei: der erste breiter und überlappt, der zweite rechts', () => {
		expect(slotGeometry(0, 2)).toEqual({ left: 0, width: 85 });
		expect(slotGeometry(1, 2)).toEqual({ left: 50, width: 50 });
	});

	it('drei: nie über den rechten Rand hinaus', () => {
		for (let column = 0; column < 3; column++) {
			const { left, width } = slotGeometry(column, 3);
			expect(left + width).toBeLessThanOrEqual(100.0001);
			expect(width).toBeGreaterThanOrEqual(100 / 3 - 0.0001);
		}
	});
});
