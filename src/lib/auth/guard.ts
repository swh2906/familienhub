// Wohin muss jemand umgeleitet werden? Reine Funktionen, damit sie gut testbar sind.

export interface SessionState {
	loggedIn: boolean;
	hasHousehold: boolean;
}

export type PageKind = 'app' | 'guest' | 'onboarding';

/**
 * Nur interne Pfade als Rücksprungziel zulassen (kein `//andere-seite.de`, keine absolute URL),
 * damit ein präparierter Link nicht auf fremde Seiten weiterleitet.
 */
export function safeNext(value: string | null | undefined): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
		return null;
	}
	return value;
}

/**
 * Ziel der Umleitung oder null, wenn die Seite angezeigt werden darf.
 * - app: braucht Anmeldung und Familienraum
 * - guest (Anmelden, Registrieren): nur ohne Anmeldung
 * - onboarding (Familie anlegen/beitreten): braucht Anmeldung, aber noch keinen Familienraum
 */
export function redirectFor(
	kind: PageKind,
	state: SessionState,
	current: string,
	next: string | null = null
): string | null {
	const target = safeNext(next);
	// Ein Einladungslink führt auch ohne Familienraum direkt zum Beitritt.
	const afterLogin =
		target && (state.hasHousehold || target.startsWith('/join/'))
			? target
			: state.hasHousehold
				? '/'
				: '/onboarding';

	switch (kind) {
		case 'app':
			if (!state.loggedIn) return `/login?next=${encodeURIComponent(current)}`;
			if (!state.hasHousehold) return '/onboarding';
			return null;
		case 'guest':
			return state.loggedIn ? afterLogin : null;
		case 'onboarding':
			if (!state.loggedIn) return `/login?next=${encodeURIComponent(current)}`;
			return state.hasHousehold ? (safeNext(next) ?? '/') : null;
	}
}
