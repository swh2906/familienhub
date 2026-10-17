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

/** Grau für ehemalige Mitglieder (mit weißer Initiale ebenfalls AA). */
export const FORMER_MEMBER_COLOR = '#5f6368';

/** Nur Farben aus der Palette anzeigen; Unbekanntes fällt auf die erste Farbe zurück. */
export function memberColor(value: string | null | undefined): string {
	const color = (value ?? '').toLowerCase();
	if (color === FORMER_MEMBER_COLOR) return FORMER_MEMBER_COLOR;
	return MEMBER_COLORS.find((c) => c === color) ?? MEMBER_COLORS[0];
}

/**
 * Entfernte Mitglieder (Konto gelöscht oder aus der Familie entfernt) erscheinen überall einheitlich
 * als „Ehemaliges Mitglied“ in Grau; ihre Einträge bleiben so zuordenbar.
 */
export function withFormerMembers<
	T extends { deleted_at?: string; display_name: string; color: string }
>(members: readonly T[], formerLabel: string): T[] {
	return members.map((member) =>
		member.deleted_at
			? { ...member, display_name: formerLabel, color: FORMER_MEMBER_COLOR }
			: member
	);
}

/** Erster Buchstabe des Namens in Großschreibung, „?“ bei leerem Namen. */
export function initialOf(name: string | null | undefined): string {
	const first = Array.from((name ?? '').trim())[0];
	return first ? first.toLocaleUpperCase('de') : '?';
}
