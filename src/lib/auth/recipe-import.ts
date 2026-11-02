// Rezept-Import per Link: nur online. Der Server holt die Seite und liefert die Rezeptdaten
// (schema.org `Recipe`); das Umwandeln für den Editor macht features/meals/import.ts.
import { getPocketBase } from '#lib/pb/client.js';
import { mapImportedRecipe, type ImportedRecipe } from '#lib/features/meals/import.js';

export async function importRecipeFromLink(
	household: string,
	url: string
): Promise<ImportedRecipe> {
	const result = await getPocketBase().send<{ recipe: unknown; url: string }>(
		'/api/fh/recipes/import',
		{ method: 'POST', body: { household, url } }
	);
	return mapImportedRecipe(result.recipe, result.url);
}
