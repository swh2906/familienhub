/// <reference path="../pb_data/types.d.ts" />

// Kochansicht: Dauer in Minuten und Schwierigkeit (1 leicht, 2 mittel, 3 schwer; 0 = keine Angabe).
// Rechte bleiben unverändert (bearbeiten nur Admins und Erwachsene).

migrate(
	(app) => {
		const recipes = app.findCollectionByNameOrId('recipes');
		recipes.fields.add(new NumberField({ name: 'prep_minutes', min: 0, max: 1440, onlyInt: true }));
		recipes.fields.add(new NumberField({ name: 'difficulty', min: 0, max: 3, onlyInt: true }));
		app.save(recipes);
	},
	(app) => {
		const recipes = app.findCollectionByNameOrId('recipes');
		recipes.fields.removeByName('prep_minutes');
		recipes.fields.removeByName('difficulty');
		app.save(recipes);
	}
);
