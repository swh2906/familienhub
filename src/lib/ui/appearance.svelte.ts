// Gemeinsamer Zustand für Farbschema und Akzentfarbe, damit Kopfzeile und Einstellungen synchron bleiben.

import {
	applyAccent,
	applyTheme,
	loadAccent,
	loadTheme,
	type Accent,
	type ThemePreference
} from './theme.js';

class Appearance {
	#theme: ThemePreference = $state(loadTheme());
	#accent: Accent = $state(loadAccent());

	get theme(): ThemePreference {
		return this.#theme;
	}

	set theme(value: ThemePreference) {
		this.#theme = value;
		applyTheme(value);
	}

	get accent(): Accent {
		return this.#accent;
	}

	set accent(value: Accent) {
		this.#accent = value;
		applyAccent(value);
	}
}

export const appearance = new Appearance();
