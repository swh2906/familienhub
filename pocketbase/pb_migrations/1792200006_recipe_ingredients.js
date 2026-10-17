/// <reference path="../pb_data/types.d.ts" />

// `recipe_ingredients`: Zutaten eines Rezepts. Rechte wie beim Rezept, der Haushalt kommt über `recipe`.

migrate(
	(app) => {
		const member = (h, roles) =>
			`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
			` && @collection.memberships.deleted_at ?= ""` +
			(roles
				? ` && (${roles.map((r) => `@collection.memberships.role ?= "${r}"`).join(' || ')})`
				: '') +
			')';

		const users = app.findCollectionByNameOrId('users');
		const recipes = app.findCollectionByNameOrId('recipes');
		const editor = member('recipe.household', ['admin', 'adult']);

		const ingredients = new Collection({
			type: 'base',
			name: 'recipe_ingredients',
			fields: [
				{
					name: 'recipe',
					type: 'relation',
					collectionId: recipes.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'amount', type: 'number', min: 0 },
				{ name: 'unit', type: 'text', max: 20 },
				{ name: 'category', type: 'text', max: 40 },
				{ name: 'sort', type: 'number', onlyInt: true },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_recipe_ingredients_recipe_updated ON recipe_ingredients (recipe, updated)'
			],
			listRule: member('recipe.household'),
			viewRule: member('recipe.household'),
			createRule: editor,
			updateRule: `@request.body.recipe:changed = false && ${editor}`,
			deleteRule: editor
		});

		app.save(ingredients);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('recipe_ingredients'));
	}
);
