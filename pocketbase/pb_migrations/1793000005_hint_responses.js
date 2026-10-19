/// <reference path="../pb_data/types.d.ts" />

// Schritt 11 D2: Antworten auf Hinweise („Später“, „Nicht heute“, „Nie wieder so“), je Mitglied.
// Synchronisiert, damit „Nie wieder so“ auf allen Geräten gilt. Jede Person sieht und ändert nur
// ihre eigenen Antworten (Mitgliedschaft muss zum angemeldeten Konto und zum Haushalt gehören).
// Schlüssel je Mitglied eindeutig, feste ID daraus (siehe features/hints/store.ts).

migrate(
	(app) => {
		const own =
			'(membership.user = @request.auth.id && membership.household = household' +
			' && membership.deleted_at = "")';
		const users = app.findCollectionByNameOrId('users');
		const households = app.findCollectionByNameOrId('households');
		const memberships = app.findCollectionByNameOrId('memberships');

		const responses = new Collection({
			type: 'base',
			name: 'hint_responses',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'membership',
					type: 'relation',
					collectionId: memberships.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				// „conflict:<Planeintrag>“ für einen Hinweis bzw. „kind:conflict“ für „Nie wieder so“.
				{ name: 'key', type: 'text', required: true, max: 120 },
				{
					name: 'response',
					type: 'select',
					values: ['done', 'later', 'not_today', 'never'],
					maxSelect: 1,
					required: true
				},
				{ name: 'until', type: 'date' },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_hint_responses_household_updated ON hint_responses (household, updated)',
				'CREATE UNIQUE INDEX idx_hint_responses_membership_key ON hint_responses (membership, key)'
			],
			listRule: own,
			viewRule: own,
			createRule: own,
			updateRule: `@request.body.household:changed = false && @request.body.membership:changed = false && ${own}`,
			deleteRule: null
		});
		app.save(responses);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('hint_responses'));
	}
);
