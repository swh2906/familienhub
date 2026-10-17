/// <reference path="../pb_data/types.d.ts" />

// Wochenplan: Gericht als Text (`title`) und Link zum Rezept in einer anderen App (`recipe_url`).
// `title` ist serverseitig optional (Einträge nur mit FamilienHub-Rezept bleiben gültig);
// die Oberfläche verlangt es. Bestehende Einträge bekommen den Rezepttitel bzw. die Notiz.

migrate(
	(app) => {
		const entries = app.findCollectionByNameOrId('meal_plan_entries');
		entries.fields.add(new TextField({ name: 'title', max: 200 }));
		// Nur gültige Webadressen; der Client lässt zusätzlich nur http/https zu.
		entries.fields.add(new URLField({ name: 'recipe_url' }));
		app.save(entries);

		for (const entry of app.findAllRecords('meal_plan_entries')) {
			if (entry.getString('title')) continue;
			let title = entry.getString('note');
			const recipeId = entry.getString('recipe');
			if (recipeId) {
				try {
					title = app.findRecordById('recipes', recipeId).getString('title') || title;
				} catch {
					// Rezept gibt es nicht mehr: Notiz behalten.
				}
			}
			if (title) {
				entry.set('title', title.slice(0, 200));
				app.saveNoValidate(entry);
			}
		}
	},
	(app) => {
		const entries = app.findCollectionByNameOrId('meal_plan_entries');
		entries.fields.removeByName('title');
		entries.fields.removeByName('recipe_url');
		app.save(entries);
	}
);
