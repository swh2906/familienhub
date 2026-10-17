// Rezepte lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
import { repo } from '#lib/db/index.js';
import type { Recipe, RecipeIngredient } from '#lib/db/types.js';
import { cleanTags, diffIngredients, type IngredientDraft } from './recipes.js';

export interface RecipeForm {
	title: string;
	servings: number;
	tags: string[];
	is_favorite: boolean;
	instructions: string;
}

/** Alle Rezepte des Haushalts (auch gelöschte; die Liste filtert selbst). */
export function recipesOf(household: string): Promise<Recipe[]> {
	return repo('recipes').table.where('household').equals(household).toArray();
}

/** Zutaten mehrerer Rezepte (für die Suche in der Liste). */
export function ingredientsOfRecipes(recipeIds: string[]): Promise<RecipeIngredient[]> {
	return repo('recipe_ingredients').table.where('recipe').anyOf(recipeIds).toArray();
}

/** Aktive Zutaten eines Rezepts in der gespeicherten Reihenfolge. */
export async function ingredientsOf(recipeId: string): Promise<RecipeIngredient[]> {
	const all = await repo('recipe_ingredients').table.where('recipe').equals(recipeId).toArray();
	return all.filter((i) => !i.deleted_at).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/** Legt ein Rezept an oder speichert Änderungen; schreibt nur geänderte Zutaten. Gibt die ID zurück. */
export async function saveRecipe(
	household: string,
	existing: Recipe | null,
	form: RecipeForm,
	drafts: IngredientDraft[]
): Promise<string> {
	const recipes = repo('recipes');
	const ingredients = repo('recipe_ingredients');
	const fields = {
		title: form.title.trim(),
		servings: Math.max(1, Math.round(form.servings) || 1),
		tags: cleanTags(form.tags),
		is_favorite: form.is_favorite,
		instructions: form.instructions.trim()
	};

	let id: string;
	let before: RecipeIngredient[] = [];
	if (existing) {
		id = existing.id;
		const changed = Object.fromEntries(
			Object.entries(fields).filter(
				([key, value]) =>
					JSON.stringify(existing[key as keyof Recipe] ?? null) !== JSON.stringify(value)
			)
		);
		await recipes.update(id, changed);
		before = await ingredientsOf(id);
	} else {
		id = (await recipes.create({ household, ...fields })).id;
	}

	const changes = diffIngredients(before, drafts);
	for (const fieldsOfNew of changes.create) {
		await ingredients.create({ recipe: id, ...fieldsOfNew });
	}
	for (const { id: ingredientId, changes: changed } of changes.update) {
		await ingredients.update(ingredientId, changed);
	}
	for (const ingredientId of changes.remove) {
		await ingredients.remove(ingredientId);
	}
	return id;
}

/** Löscht ein Rezept samt Zutaten (weich, über `deleted_at`). */
export async function deleteRecipe(recipe: Recipe): Promise<void> {
	for (const ingredient of await ingredientsOf(recipe.id)) {
		await repo('recipe_ingredients').remove(ingredient.id);
	}
	await repo('recipes').remove(recipe.id);
}

export async function toggleFavorite(recipe: Recipe): Promise<void> {
	await repo('recipes').update(recipe.id, { is_favorite: !recipe.is_favorite });
}
