// Mitgliedsfarben und Initialen. Die Farben sind identisch mit MEMBER_COLORS in
// pocketbase/pb_hooks/lib/familienhub.js und erfüllen mit weißer Initiale WCAG AA in beiden Modi.

export const MEMBER_COLORS = [
	'#2453c7',
	'#18733b',
	'#7a3bd1',
	'#b4410f',
	'#b42318',
	'#b0236a',
	'#0e6e66',
	'#8a5a00'
] as const;

/** Nur Farben aus der Palette anzeigen; Unbekanntes fällt auf die erste Farbe zurück. */
export function memberColor(value: string | null | undefined): string {
	const color = (value ?? '').toLowerCase();
	return MEMBER_COLORS.find((c) => c === color) ?? MEMBER_COLORS[0];
}

/** Erster Buchstabe des Namens in Großschreibung, „?“ bei leerem Namen. */
export function initialOf(name: string | null | undefined): string {
	const first = Array.from((name ?? '').trim())[0];
	return first ? first.toLocaleUpperCase('de') : '?';
}
