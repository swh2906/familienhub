/// <reference path="../pb_data/types.d.ts" />

// Schritt 12 A: Rezept-Import per Link. `source_url` merkt sich die Webseite, von der ein Rezept
// übernommen wurde („Quelle: chefkoch.de“). Nur hinzufügend, Rechte bleiben unverändert.

migrate(
	(app) => {
		const recipes = app.findCollectionByNameOrId('recipes');
		recipes.fields.add(new URLField({ name: 'source_url' }));
		app.save(recipes);
	},
	(app) => {
		const recipes = app.findCollectionByNameOrId('recipes');
		recipes.fields.removeByName('source_url');
		app.save(recipes);
	}
);
