/// <reference path="../pb_data/types.d.ts" />

// `meal_plan_entries`: Essensplan. `date` als Kalendertag (JJJJ-MM-TT) ohne Uhrzeit, damit
// Zeitzonen keine Rolle spielen. Alle sehen, Admins und Erwachsene bearbeiten.

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
		const recipes = app.findCollectionByNameOrId('recipes');
		const editor = member('household', ['admin', 'adult']);

		const entries = new Collection({
			type: 'base',
			name: 'meal_plan_entries',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'date', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
				{
					name: 'slot',
					type: 'select',
					values: ['breakfast', 'lunch', 'dinner'],
					maxSelect: 1,
					required: true
				},
				{ name: 'recipe', type: 'relation', collectionId: recipes.id, maxSelect: 1 },
				{ name: 'note', type: 'text', max: 500 },
				{ name: 'servings', type: 'number', min: 1, onlyInt: true },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_meal_plan_entries_household_updated ON meal_plan_entries (household, updated)',
				'CREATE INDEX idx_meal_plan_entries_household_date ON meal_plan_entries (household, date)'
			],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: editor,
			updateRule: `@request.body.household:changed = false && ${editor}`,
			deleteRule: editor
		});

		app.save(entries);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('meal_plan_entries'));
	}
);
