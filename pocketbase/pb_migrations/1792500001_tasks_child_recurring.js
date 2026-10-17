/// <reference path="../pb_data/types.d.ts" />

// Schritt 6: Kinder haken wiederkehrende Aufgaben ab. Dabei rückt `due_date` auf das nächste Datum,
// deshalb dürfen Kinder bei eigenen oder nicht zugewiesenen Aufgaben zusätzlich zum Status auch
// `due_date` ändern – aber nur, wenn die Aufgabe eine Wiederholung hat (`rrule` gesetzt).

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
		const completeOnly =
			`(${member('household')}` +
			['title', 'notes', 'rrule', 'points', 'assignees', 'deleted_at']
				.map((field) => ` && @request.body.${field}:changed = false`)
				.join('') +
			" && (@request.body.due_date:changed = false || rrule != '')" +
			' && (assignees:length = 0 || assignees.user ?= @request.auth.id))';

		const tasks = app.findCollectionByNameOrId('tasks');
		tasks.updateRule = `@request.body.household:changed = false && (${editor} || ${completeOnly})`;
		app.save(tasks);
	},
	(app) => {
		const member = (h, roles) =>
			`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
			` && @collection.memberships.deleted_at ?= ""` +
			(roles
				? ` && (${roles.map((r) => `@collection.memberships.role ?= "${r}"`).join(' || ')})`
				: '') +
			')';
		const editor = member('household', ['admin', 'adult']);
		const statusOnly =
			`(${member('household')}` +
			['title', 'notes', 'due_date', 'rrule', 'points', 'assignees', 'deleted_at']
				.map((field) => ` && @request.body.${field}:changed = false`)
				.join('') +
			' && (assignees:length = 0 || assignees.user ?= @request.auth.id))';
		const tasks = app.findCollectionByNameOrId('tasks');
		tasks.updateRule = `@request.body.household:changed = false && (${editor} || ${statusOnly})`;
		app.save(tasks);
	}
);
