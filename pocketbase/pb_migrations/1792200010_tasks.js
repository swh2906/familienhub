/// <reference path="../pb_data/types.d.ts" />

// `tasks`: Aufgaben. Admins und Erwachsene legen an und weisen zu.
// Kinder dürfen nur den Status ändern, und nur bei eigenen oder nicht zugewiesenen Aufgaben.

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

		const editor = member('household', ['admin', 'adult']);
		const statusOnly =
			`(${member('household')}` +
			['title', 'notes', 'due_date', 'rrule', 'points', 'assignees', 'deleted_at']
				.map((field) => ` && @request.body.${field}:changed = false`)
				.join('') +
			' && (assignees:length = 0 || assignees.user ?= @request.auth.id))';

		const tasks = new Collection({
			type: 'base',
			name: 'tasks',
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
				{ name: 'notes', type: 'text', max: 2000 },
				{ name: 'due_date', type: 'text', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
				{ name: 'status', type: 'select', values: ['open', 'done'], maxSelect: 1 },
				{ name: 'rrule', type: 'text', max: 500 },
				{ name: 'points', type: 'number', min: 0, onlyInt: true },
				{ name: 'assignees', type: 'relation', collectionId: memberships.id, maxSelect: 50 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_tasks_household_updated ON tasks (household, updated)'],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: editor,
			updateRule: `@request.body.household:changed = false && (${editor} || ${statusOnly})`,
			deleteRule: editor
		});

		app.save(tasks);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('tasks'));
	}
);
