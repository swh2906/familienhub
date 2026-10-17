/// <reference path="../pb_data/types.d.ts" />

// `task_completions`: wer hat eine Aufgabe wann erledigt (auch bei Wiederholungen).
// Admins und Erwachsene tragen für jedes Mitglied ein. Kinder nur für sich selbst und nur bei
// eigenen oder nicht zugewiesenen Aufgaben; eigene Einträge dürfen sie wieder löschen.

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
		const tasks = app.findCollectionByNameOrId('tasks');
		const memberships = app.findCollectionByNameOrId('memberships');

		const editor = member('task.household', ['admin', 'adult']);
		const self = `(${member('task.household')} && membership.user = @request.auth.id)`;
		const allowedTask = '(task.assignees:length = 0 || task.assignees.user ?= @request.auth.id)';

		const completions = new Collection({
			type: 'base',
			name: 'task_completions',
			fields: [
				{
					name: 'task',
					type: 'relation',
					collectionId: tasks.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'membership',
					type: 'relation',
					collectionId: memberships.id,
					maxSelect: 1,
					required: true
				},
				{ name: 'completed_at', type: 'date', required: true },
				{ name: 'points', type: 'number', min: 0, onlyInt: true },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_task_completions_task_updated ON task_completions (task, updated)'
			],
			listRule: member('task.household'),
			viewRule: member('task.household'),
			createRule: `${editor} || (${self} && ${allowedTask})`,
			updateRule: `@request.body.task:changed = false && ${editor}`,
			deleteRule: `${editor} || ${self}`
		});

		app.save(completions);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('task_completions'));
	}
);
