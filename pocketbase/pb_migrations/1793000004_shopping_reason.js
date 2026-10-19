/// <reference path="../pb_data/types.d.ts" />

// Schritt 11 C: Einkaufsartikel aus dem Essensplan.
// - `reason`: kurze Begründung („Für Reispfanne (Mi)“), sichtbar an Kachel und Dialog.
// - `ingredient`: Basisartikel, damit Zusammenführen und Kauf-Buchung nicht raten müssen.

migrate(
	(app) => {
		const ingredients = app.findCollectionByNameOrId('ingredients');
		const items = app.findCollectionByNameOrId('shopping_items');
		items.fields.add(new TextField({ name: 'reason', max: 200 }));
		items.fields.add(
			new RelationField({ name: 'ingredient', collectionId: ingredients.id, maxSelect: 1 })
		);
		app.save(items);
	},
	(app) => {
		const items = app.findCollectionByNameOrId('shopping_items');
		items.fields.removeByName('reason');
		items.fields.removeByName('ingredient');
		app.save(items);
	}
);
