// Vorschläge für Rezepte und Zutaten. Die Kategorien nutzt später auch die Einkaufsliste.

/** Feste Tag-Vorschläge (PLAN.md); eigene Tags kommen dazu. */
export const SUGGESTED_TAGS = ['vegetarisch', 'schnell', 'günstig', 'Reste'] as const;

export const UNITS = [
	'g',
	'kg',
	'ml',
	'l',
	'Stück',
	'EL',
	'TL',
	'Prise',
	'Packung',
	'Dose',
	'Bund',
	'Becher',
	'Zehe',
	'Scheibe'
] as const;

export const CATEGORIES = [
	'Obst & Gemüse',
	'Brot & Backwaren',
	'Kühlregal',
	'Fleisch & Fisch',
	'Trockenware',
	'Konserven',
	'Gewürze & Öle',
	'Tiefkühl',
	'Getränke',
	'Süßes',
	'Haushalt',
	'Sonstiges'
] as const;
