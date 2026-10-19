/// <reference path="../pb_data/types.d.ts" />

// Schritt 11 A2: Basisartikel. Verschiedene Schreibweisen („Mehl“, „Weizenmehl Typ 405“) gehören
// zu einem Artikel je Familie. Grundlage für Vorrat und Einkaufsliste. Nur hinzufügend:
// - neue Collection `ingredients` (Name, Schlüssel, Schreibweisen, Einheit, Packungsgröße)
// - `recipe_ingredients` bekommt `ingredient`, `optional`, `alternatives`, `amount_kind`, `note`
// Die Zuordnung bestehender Rezepte macht die App (gleiche Logik wie beim Einfügen).

migrate(
	(app) => {
		const member = (h, roles) =>
			`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
			` && @collection.memberships.deleted_at ?= ""` +
			(roles
				? ` && (${roles.map((r) => `@collection.memberships.role ?= "${r}"`).join(' || ')})`
				: '') +
			')';
		const editor = member('household', ['admin', 'adult']);

		const users = app.findCollectionByNameOrId('users');
		const households = app.findCollectionByNameOrId('households');

		const ingredients = new Collection({
			type: 'base',
			name: 'ingredients',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'name', type: 'text', required: true, max: 100 },
				// Normalisierter Schlüssel (siehe src/lib/features/pantry/catalog.ts), je Familie eindeutig.
				{ name: 'key', type: 'text', required: true, max: 100 },
				{ name: 'aliases', type: 'json', maxSize: 4000 },
				{ name: 'unit', type: 'text', max: 20 },
				{ name: 'category', type: 'text', max: 40 },
				{ name: 'pack_amount', type: 'number', min: 0 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_ingredients_household_updated ON ingredients (household, updated)',
				'CREATE UNIQUE INDEX idx_ingredients_household_key ON ingredients (household, key)'
			],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: editor,
			updateRule: `@request.body.household:changed = false && ${editor}`,
			deleteRule: null
		});
		app.save(ingredients);

		const recipeIngredients = app.findCollectionByNameOrId('recipe_ingredients');
		recipeIngredients.fields.add(
			new RelationField({ name: 'ingredient', collectionId: ingredients.id, maxSelect: 1 })
		);
		recipeIngredients.fields.add(new BoolField({ name: 'optional' }));
		recipeIngredients.fields.add(new JSONField({ name: 'alternatives', maxSize: 2000 }));
		// '' oder 'exact' = genau, 'approx' = ungefähr, 'to_taste' = nach Geschmack (nicht messbar).
		recipeIngredients.fields.add(
			new SelectField({
				name: 'amount_kind',
				maxSelect: 1,
				values: ['exact', 'approx', 'to_taste']
			})
		);
		recipeIngredients.fields.add(new TextField({ name: 'note', max: 200 }));
		app.save(recipeIngredients);
	},
	(app) => {
		const recipeIngredients = app.findCollectionByNameOrId('recipe_ingredients');
		for (const name of ['ingredient', 'optional', 'alternatives', 'amount_kind', 'note']) {
			recipeIngredients.fields.removeByName(name);
		}
		app.save(recipeIngredients);
		app.delete(app.findCollectionByNameOrId('ingredients'));
	}
);
