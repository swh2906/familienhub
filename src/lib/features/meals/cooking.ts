// Reine Logik der Kochansicht (Karteikarte): Dauer, Schwierigkeit, Kategorie, Zutaten-Zeilen.
import type { Recipe, RecipeIngredient } from '#lib/db/types.js';
import { m } from '#lib/paraglide/messages.js';
import { formatAmount, scaleAmount } from './amounts.js';

export const DIFFICULTY_LEVELS = [1, 2, 3] as const;
export type Difficulty = 0 | (typeof DIFFICULTY_LEVELS)[number];

/** 0–3, ganzzahlig; alles andere wird 0 (keine Angabe). */
export function clampDifficulty(value: number | null | undefined): Difficulty {
	const n = Math.round(Number(value));
	return n >= 1 && n <= 3 ? (n as Difficulty) : 0;
}

/** 0–1440 Minuten, ganzzahlig; Ungültiges wird 0. */
export function clampMinutes(value: number | null | undefined): number {
	const n = Math.round(Number(value));
	return Number.isFinite(n) && n > 0 ? Math.min(n, 1440) : 0;
}

/** Stunden und Minuten für die Anzeige, z. B. { hours: 1, minutes: 30 }; null ohne Angabe. */
export function splitDuration(minutes: number | null | undefined): {
	hours: number;
	minutes: number;
} | null {
	const total = clampMinutes(minutes);
	if (total === 0) return null;
	return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Kategorie der Karte: der erste Tag, sonst leer. */
export function recipeCategory(recipe: Pick<Recipe, 'tags'>): string {
	return (recipe.tags ?? []).find((tag) => tag.trim())?.trim() ?? '';
}

/** Menge für die Portionenzahl: „300 g“, „ca. 2 EL“ oder leer. */
export function ingredientAmount(
	ingredient: Pick<RecipeIngredient, 'amount' | 'unit'> &
		Partial<Pick<RecipeIngredient, 'amount_kind'>>,
	baseServings: number,
	servings: number
): string {
	if (!ingredient.amount) return '';
	const amount = scaleAmount(ingredient.amount, baseServings, servings);
	const approx = ingredient.amount_kind === 'approx' ? m.paste_badge_approx() : '';
	return [approx, formatAmount(amount), ingredient.unit].filter(Boolean).join(' ');
}

/** Zutaten-Zeile für die Portionenzahl: „300 g Mehl“, „ca. 2 EL Öl“. */
export function ingredientLine(
	ingredient: Pick<RecipeIngredient, 'amount' | 'unit' | 'name'> &
		Partial<Pick<RecipeIngredient, 'amount_kind'>>,
	baseServings: number,
	servings: number
): string {
	return [ingredientAmount(ingredient, baseServings, servings), ingredient.name]
		.filter(Boolean)
		.join(' ');
}

/**
 * Zusatzangaben für die Anzeige: Hinweis, „nach Geschmack“, „optional“ und Alternativen.
 * Optionale Zutaten sind nur ein Hinweis, nie eine Warnung.
 */
export function ingredientExtras(
	ingredient: Partial<Pick<RecipeIngredient, 'amount_kind' | 'optional' | 'alternatives' | 'note'>>
): { tags: string[]; alternatives: string; note: string } {
	const tags: string[] = [];
	if (ingredient.amount_kind === 'to_taste') tags.push(m.paste_badge_to_taste());
	if (ingredient.optional) tags.push(m.paste_badge_optional());
	const names = (ingredient.alternatives ?? []).filter((a) => a.trim());
	return {
		tags,
		alternatives: names.length ? m.paste_badge_alternatives({ names: names.join(', ') }) : '',
		note: (ingredient.note ?? '').trim()
	};
}

const LEVEL_LABELS = [m.cook_difficulty_1, m.cook_difficulty_2, m.cook_difficulty_3];

/** „leicht“, „mittel“, „schwer“ oder „keine Angabe“. */
export function difficultyName(level: number | null | undefined): string {
	const n = clampDifficulty(level);
	return n === 0 ? m.cook_difficulty_none() : LEVEL_LABELS[n - 1]();
}

/** „45 Min.“, „1 Std.“, „1 Std. 30 Min.“ oder leer ohne Angabe. */
export function formatDuration(minutes: number | null | undefined): string {
	const d = splitDuration(minutes);
	if (!d) return '';
	if (d.hours === 0) return m.cook_minutes({ minutes: d.minutes });
	if (d.minutes === 0) return m.cook_hours({ hours: d.hours });
	return m.cook_hours_minutes({ hours: d.hours, minutes: d.minutes });
}

/** Kurzinfo für Liste und Rezeptseite: „4 Portionen · 1 Std. 15 Min. · mittel“. */
export function recipeFacts(
	recipe: Pick<Recipe, 'servings' | 'prep_minutes' | 'difficulty'>,
	servingsText: string
): string[] {
	const level = clampDifficulty(recipe.difficulty);
	return [
		servingsText,
		formatDuration(recipe.prep_minutes),
		level ? difficultyName(level) : ''
	].filter(Boolean);
}
