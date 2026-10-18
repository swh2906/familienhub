/// <reference path="../pb_data/types.d.ts" />

// Testphase: Feedback der Familie (Reiter „Feedback“ unter Aufgaben). Nur aktiv, wenn der Server
// mit HOMI_FEEDBACK=1 läuft (siehe pb_hooks); sonst lehnt der Hook neues Feedback ab.
// Alle Mitglieder sehen und schreiben Feedback; Admins und Erwachsene markieren es als erledigt.

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

		const feedback = new Collection({
			type: 'base',
			name: 'feedback',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'text', type: 'text', required: true, max: 4000 },
				{ name: 'area', type: 'text', max: 40 },
				{ name: 'device', type: 'text', max: 120 },
				{ name: 'done', type: 'bool' },
				{ name: 'created_by', type: 'relation', collectionId: memberships.id, maxSelect: 1 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_feedback_household_updated ON feedback (household, updated)'],
			listRule: member('household'),
			viewRule: member('household'),
			// „done“ setzt der Hook beim Anlegen immer auf false.
			createRule: member('household'),
			updateRule:
				'@request.body.household:changed = false && @request.body.created_by:changed = false' +
				` && ${member('household', ['admin', 'adult'])}`,
			deleteRule: null
		});
		app.save(feedback);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('feedback'));
	}
);
