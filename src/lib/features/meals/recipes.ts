// Reine Logik rund um Rezepte: Suche, Filter, Sortierung, Tags und Abgleich der Zutaten beim Speichern.
import type { AmountKind, Recipe, RecipeIngredient } from '#lib/db/types.js';
import { SUGGESTED_TAGS } from './catalog.js';

/** Für Vergleiche: klein, ohne Akzente/Umlaut-Punkte („Spätzle“ findet man auch mit „spatzle“). */
export function normalize(text: string): string {
	return text
		.toLocaleLowerCase('de')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.trim();
}

/** Tags bereinigen: trimmen, leere weg, Doppelte (ohne Groß-/Kleinschreibung) weg. */
export function cleanTags(tags: readonly string[] | null | undefined): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const tag of tags ?? []) {
		const trimmed = tag.trim();
		const key = normalize(trimmed);
		if (!trimmed || seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

/** Vorgeschlagene Tags zuerst, danach alle in Rezepten benutzten, alphabetisch. */
export function availableTags(recipes: readonly Recipe[]): string[] {
	const used = cleanTags(recipes.flatMap((recipe) => recipe.tags ?? [])).sort((a, b) =>
		a.localeCompare(b, 'de')
	);
	return cleanTags([...SUGGESTED_TAGS, ...used]);
}

export interface RecipeFilter {
	query: string;
	tag: string | null;
}

/**
 * Sichtbare Rezepte: nicht gelöscht, passend zu Suche (Titel, Tags, Zutaten) und Tag.
 * Favoriten zuerst, sonst alphabetisch.
 */
export function filterRecipes(
	recipes: readonly Recipe[],
	ingredients: readonly RecipeIngredient[],
	filter: RecipeFilter
): Recipe[] {
	const words = normalize(filter.query).split(/\s+/).filter(Boolean);
	const tag = filter.tag ? normalize(filter.tag) : null;

	const ingredientText = new Map<string, string>();
	for (const ingredient of ingredients) {
		if (ingredient.deleted_at) continue;
		const before = ingredientText.get(ingredient.recipe) ?? '';
		ingredientText.set(ingredient.recipe, `${before} ${normalize(ingredient.name)}`);
	}

	return recipes
		.filter((recipe) => !recipe.deleted_at)
		.filter((recipe) => !tag || (recipe.tags ?? []).some((t) => normalize(t) === tag))
		.filter((recipe) => {
			if (words.length === 0) return true;
			const haystack = [
				normalize(recipe.title),
				...(recipe.tags ?? []).map(normalize),
				ingredientText.get(recipe.id) ?? ''
			].join(' ');
			return words.every((word) => haystack.includes(word));
		})
		.sort(
			(a, b) =>
				Number(b.is_favorite) - Number(a.is_favorite) || a.title.localeCompare(b.title, 'de')
		);
}

/** Eine Zutaten-Zeile im Editor (ohne Server-Felder; `id` fehlt bei neuen Zeilen). */
export interface IngredientDraft {
	id?: string;
	name: string;
	amount: number;
	unit: string;
	category: string;
	/** Basisartikel; setzt das Speichern (siehe pantry/store.ts). */
	ingredient?: string;
	/** Von Hand gewählter Basisartikel (Name); leer = automatisch. Wird gelernt, nicht gespeichert. */
	base?: string;
	optional?: boolean;
	alternatives?: string[];
	amount_kind?: AmountKind | '';
	note?: string;
}

type IngredientFields = Pick<RecipeIngredient, 'name' | 'amount' | 'unit' | 'category' | 'sort'> &
	Required<
		Pick<RecipeIngredient, 'ingredient' | 'optional' | 'alternatives' | 'amount_kind' | 'note'>
	>;

export interface IngredientChanges {
	create: IngredientFields[];
	update: { id: string; changes: Partial<IngredientFields> }[];
	remove: string[];
}

/** Gespeicherten Wert mit Standard vergleichbar machen (fehlende Felder älterer Zeilen). */
function stored(before: RecipeIngredient, key: keyof IngredientFields): unknown {
	const value = before[key];
	switch (key) {
		case 'amount':
		case 'sort':
			return value ?? 0;
		case 'optional':
			return value ?? false;
		case 'alternatives':
			return value ?? [];
		case 'amount_kind':
			return value || 'exact';
		default:
			return value ?? '';
	}
}

/**
 * Vergleicht die gespeicherten Zutaten mit dem Editor-Stand. Leere Zeilen zählen nicht;
 * die Reihenfolge im Editor wird zu `sort`. Nur tatsächlich geänderte Felder werden aktualisiert.
 */
export function diffIngredients(
	existing: readonly RecipeIngredient[],
	drafts: readonly IngredientDraft[]
): IngredientChanges {
	const current = new Map(existing.filter((i) => !i.deleted_at).map((i) => [i.id, i]));
	const result: IngredientChanges = { create: [], update: [], remove: [] };
	const kept = new Set<string>();

	drafts
		.filter((draft) => draft.name.trim())
		.forEach((draft, sort) => {
			const fields: IngredientFields = {
				name: draft.name.trim(),
				amount: draft.amount > 0 ? draft.amount : 0,
				unit: draft.unit.trim(),
				category: draft.category.trim(),
				sort,
				ingredient: draft.ingredient ?? '',
				optional: draft.optional ?? false,
				alternatives: (draft.alternatives ?? []).map((a) => a.trim()).filter(Boolean),
				amount_kind: draft.amount_kind || 'exact',
				note: (draft.note ?? '').trim()
			};
			const before = draft.id ? current.get(draft.id) : undefined;
			if (!before || !draft.id) {
				result.create.push(fields);
				return;
			}
			kept.add(draft.id);
			const changes: Partial<IngredientFields> = {};
			for (const key of Object.keys(fields) as (keyof IngredientFields)[]) {
				if (JSON.stringify(stored(before, key)) !== JSON.stringify(fields[key])) {
					Object.assign(changes, { [key]: fields[key] });
				}
			}
			if (Object.keys(changes).length > 0) result.update.push({ id: draft.id, changes });
		});

	for (const id of current.keys()) {
		if (!kept.has(id)) result.remove.push(id);
	}
	return result;
}
