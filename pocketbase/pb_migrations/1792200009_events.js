/// <reference path="../pb_data/types.d.ts" />

// `events`: Termine. Alle sehen, Admins und Erwachsene bearbeiten.
// `start`/`end` als Zeitpunkt (UTC), Wiederholungen als RFC-5545-Regel in `rrule`.

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

		const events = new Collection({
			type: 'base',
			name: 'events',
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
				{ name: 'start', type: 'date', required: true },
				{ name: 'end', type: 'date' },
				{ name: 'all_day', type: 'bool' },
				{ name: 'location', type: 'text', max: 200 },
				{ name: 'rrule', type: 'text', max: 500 },
				{ name: 'exdates', type: 'json', maxSize: 20000 },
				{ name: 'reminder_minutes', type: 'number', min: 0, onlyInt: true },
				{ name: 'participants', type: 'relation', collectionId: memberships.id, maxSelect: 50 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_events_household_updated ON events (household, updated)',
				'CREATE INDEX idx_events_household_start ON events (household, start)'
			],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: editor,
			updateRule: `@request.body.household:changed = false && ${editor}`,
			deleteRule: editor
		});

		app.save(events);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('events'));
	}
);
