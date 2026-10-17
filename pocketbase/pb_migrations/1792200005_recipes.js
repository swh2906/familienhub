/// <reference path="../pb_data/types.d.ts" />

// `recipes`: alle Mitglieder sehen, Admins und Erwachsene bearbeiten.

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
		const households = app.findCollectionByNameOrId('households');
		const editor = member('household', ['admin', 'adult']);

		const recipes = new Collection({
			type: 'base',
			name: 'recipes',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'title', type: 'text', required: true, max: 200 },
				{ name: 'servings', type: 'number', min: 1, onlyInt: true },
				{ name: 'instructions', type: 'text', max: 20000 },
				{ name: 'tags', type: 'json', maxSize: 4000 },
				{ name: 'is_favorite', type: 'bool' },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_recipes_household_updated ON recipes (household, updated)'],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: editor,
			updateRule: `@request.body.household:changed = false && ${editor}`,
			deleteRule: editor
		});

		app.save(recipes);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('recipes'));
	}
);
