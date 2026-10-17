/// <reference path="../pb_data/types.d.ts" />

// `shopping_items`: Einkaufsliste. Alle Mitglieder legen an und haken ab.
// Kinder ändern oder löschen nur eigene Artikel; bei fremden dürfen sie nur abhaken.
// `added_by`, `checked_by` und `checked_at` setzt der Server (pb_hooks/familienhub.pb.js).

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
		const memberships = app.findCollectionByNameOrId('memberships');
		const entries = app.findCollectionByNameOrId('meal_plan_entries');

		const editor = member('household', ['admin', 'adult']);
		const own = `(${member('household')} && added_by.user = @request.auth.id)`;
		const checkOnly =
			`(${member('household')}` +
			['name', 'amount', 'unit', 'category', 'added_by', 'meal_plan_entry', 'deleted_at']
				.map((field) => ` && @request.body.${field}:changed = false`)
				.join('') +
			')';

		const items = new Collection({
			type: 'base',
			name: 'shopping_items',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'amount', type: 'number', min: 0 },
				{ name: 'unit', type: 'text', max: 20 },
				{ name: 'category', type: 'text', max: 40 },
				{ name: 'checked', type: 'bool' },
				{ name: 'checked_at', type: 'date' },
				{ name: 'added_by', type: 'relation', collectionId: memberships.id, maxSelect: 1 },
				{ name: 'checked_by', type: 'relation', collectionId: memberships.id, maxSelect: 1 },
				{ name: 'meal_plan_entry', type: 'relation', collectionId: entries.id, maxSelect: 1 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_shopping_items_household_updated ON shopping_items (household, updated)'
			],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: member('household'),
			updateRule: `@request.body.household:changed = false && (${editor} || ${own} || ${checkOnly})`,
			deleteRule: `${editor} || ${own}`
		});

		app.save(items);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('shopping_items'));
	}
);
