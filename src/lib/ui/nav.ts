// Die fünf Hauptbereiche der App (untere Leiste auf dem Handy, Seitenleiste am Desktop).

export type NavId = 'today' | 'meals' | 'shopping' | 'calendar' | 'tasks';

/** Ist der Bereich mit `href` für den aktuellen Pfad aktiv? Die Startseite nur exakt. */
export function isActive(pathname: string, href: string, home: string): boolean {
	const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	if (href === home) return normalized === home.replace(/\/+$/, '') || normalized === home;
	return normalized === href || normalized.startsWith(href + '/');
}
