// Farbschema: "system" folgt prefers-color-scheme, "light"/"dark" sind manuell gewählt.
// Die Wahl wird lokal im Browser gespeichert (kein Server, keine Cookies).

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fh-theme';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

/** Nächste Einstellung beim Tippen auf den Umschalter: System → Hell → Dunkel → System. */
export function nextTheme(current: ThemePreference): ThemePreference {
	return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

/** Wandelt einen gespeicherten Wert sicher in eine gültige Einstellung um. */
export function parseTheme(value: string | null | undefined): ThemePreference {
	return value === 'light' || value === 'dark' ? value : 'system';
}

export function loadTheme(): ThemePreference {
	try {
		return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
	} catch {
		return 'system';
	}
}

/** Speichert die Einstellung und setzt `data-theme` am <html>-Element. */
export function applyTheme(theme: ThemePreference): void {
	const root = document.documentElement;
	if (theme === 'system') delete root.dataset.theme;
	else root.dataset.theme = theme;
	try {
		if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
		else localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Speicher nicht verfügbar: Einstellung gilt nur bis zum Neuladen.
	}
}
