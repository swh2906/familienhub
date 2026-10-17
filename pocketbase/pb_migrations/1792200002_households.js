/// <reference path="../pb_data/types.d.ts" />

// `households`: der Familienraum. Die API-Regeln setzt die Migration für `memberships`,
// weil sie auf Mitgliedschaften verweisen, die es hier noch nicht gibt.
// Wer einen Haushalt anlegt, wird per Hook (pb_hooks/familienhub.pb.js) dessen Admin.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		const households = new Collection({
			type: 'base',
			name: 'households',
			fields: [
				{ name: 'name', type: 'text', required: true, max: 80 },
				{ name: 'timezone', type: 'text', max: 64 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_households_updated ON households (updated)']
		});

		app.save(households);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('households'));
	}
);
