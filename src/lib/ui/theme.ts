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

// Akzentfarbe für Aktionen (Buttons, aktive Navigation, Häkchen). Terrakotta ist Standard.

// Reihenfolge = Anzeige in den Einstellungen; warme, zum Creme-Hintergrund passende Töne zuerst.
// Liste auch in src/app.html (Startskript) pflegen.
export const ACCENTS = [
	'terrakotta',
	'salbei',
	'petrol',
	'taubenblau',
	'indigo',
	'pflaume',
	'ocker',
	'graphit'
] as const;

export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = 'terrakotta';

export const ACCENT_STORAGE_KEY = 'fh-accent';

/** Wandelt einen gespeicherten Wert sicher in eine gültige Akzentfarbe um. */
export function parseAccent(value: string | null | undefined): Accent {
	return ACCENTS.find((accent) => accent === value) ?? DEFAULT_ACCENT;
}

export function loadAccent(): Accent {
	try {
		return parseAccent(localStorage.getItem(ACCENT_STORAGE_KEY));
	} catch {
		return DEFAULT_ACCENT;
	}
}

/** Speichert die Akzentfarbe und setzt `data-accent` am <html>-Element (Standard: kein Attribut). */
export function applyAccent(accent: Accent): void {
	const root = document.documentElement;
	if (accent === DEFAULT_ACCENT) delete root.dataset.accent;
	else root.dataset.accent = accent;
	try {
		if (accent === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_STORAGE_KEY);
		else localStorage.setItem(ACCENT_STORAGE_KEY, accent);
	} catch {
		// Speicher nicht verfügbar: Einstellung gilt nur bis zum Neuladen.
	}
}
