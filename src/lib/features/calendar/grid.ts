// Reine Logik der Zeitachse (Tag/Woche): Startposition beim Öffnen, Raster und Ziehen von Terminen.

/** Höhe einer Stunde in der Zeitachse (px). */
export const HOUR_PX = 48;
/** Raster beim Ziehen und Ändern der Dauer. */
export const SNAP_MINUTES = 15;
/** Kürzeste Dauer nach dem Ändern. */
export const MIN_DURATION = 15;
const DAY_MINUTES = 24 * 60;

/**
 * Scrollposition beim Öffnen: Ist heute zu sehen, steht die aktuelle Uhrzeit im oberen Drittel,
 * sonst beginnt die Ansicht bei 6:30 (7 Uhr sichtbar, mit etwas Luft darüber).
 */
export function initialScrollTop(
	showsToday: boolean,
	nowMinutes: number,
	viewportHeight: number
): number {
	if (!showsToday) return 6.5 * HOUR_PX;
	const target = (nowMinutes / 60) * HOUR_PX - viewportHeight / 3;
	const max = 24 * HOUR_PX - viewportHeight;
	return Math.round(Math.max(0, Math.min(target, Math.max(0, max))));
}

/** Pixel → Minuten, auf das Raster gerundet. */
export function snapMinutes(px: number, step = SNAP_MINUTES): number {
	return Math.round(((px / HOUR_PX) * 60) / step) * step;
}

export interface DragResult {
	/** Tag (YYYY-MM-DD) des neuen Beginns. */
	date: string;
	/** Neuer Beginn in Minuten seit Mitternacht. */
	start: number;
	/** Neue Dauer in Minuten. */
	duration: number;
}

/**
 * Verschieben: Beginn um `deltaMinutes` verschieben und auf `targetDay` legen; die Dauer bleibt.
 * Der Beginn bleibt im Tag (0:00 bis 24:00 minus Dauer, mindestens bei 0).
 */
export function moveTo(
	targetDay: string,
	start: number,
	duration: number,
	deltaMinutes: number
): DragResult {
	const latest = Math.max(0, DAY_MINUTES - Math.min(duration, DAY_MINUTES));
	const moved = Math.min(Math.max(start + deltaMinutes, 0), latest);
	return { date: targetDay, start: moved, duration };
}

/** Dauer ändern (unteren Rand ziehen): mindestens 15 Minuten, höchstens bis Mitternacht. */
export function resizeTo(
	day: string,
	start: number,
	duration: number,
	deltaMinutes: number
): DragResult {
	const max = Math.max(MIN_DURATION, DAY_MINUTES - start);
	const next = Math.min(Math.max(duration + deltaMinutes, MIN_DURATION), max);
	return { date: day, start, duration: next };
}

/** Minuten seit Mitternacht → „HH:MM“. */
export function minutesToTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Unter dieser Dauer (Minuten) zeigt ein Termin nur eine Zeile: Uhrzeit und Titel. */
export const COMPACT_MINUTES = 50;

/**
 * Lage eines Termins in einer Gruppe überlappender Termine (Prozent der Spaltenbreite).
 * Statt gleich schmaler Streifen überlappen sich die Termine leicht: jeder außer dem letzten ist
 * 1,7-mal so breit wie sein Anteil, spätere liegen darüber. So bleibt mehr Platz für den Titel.
 */
export function slotGeometry(column: number, columns: number): { left: number; width: number } {
	if (columns <= 1) return { left: 0, width: 100 };
	const share = 100 / columns;
	const left = column * share;
	const width = column === columns - 1 ? share : Math.min(100 - left, share * 1.7);
	return { left, width };
}
