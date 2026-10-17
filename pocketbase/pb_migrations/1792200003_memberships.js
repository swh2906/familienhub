/// <reference path="../pb_data/types.d.ts" />

// `memberships`: verbindet Konten mit Haushalten und legt die Rolle fest (admin, adult, child).
// Grundlage aller Rechte-Regeln. Setzt außerdem die Regeln für `households`.

migrate(
	(app) => {
		// Angemeldetes Konto ist (nicht entferntes) Mitglied des Haushalts `h`, optional mit einer der Rollen.
		const member = (h, roles) =>
			`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
			` && @collection.memberships.deleted_at ?= ""` +
			(roles
				? ` && (${roles.map((r) => `@collection.memberships.role ?= "${r}"`).join(' || ')})`
				: '') +
			')';

		const users = app.findCollectionByNameOrId('users');
		const households = app.findCollectionByNameOrId('households');

		const memberships = new Collection({
			type: 'base',
			name: 'memberships',
			fields: [
				{
					name: 'user',
					type: 'relation',
					collectionId: users.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'role',
					type: 'select',
					values: ['admin', 'adult', 'child'],
					maxSelect: 1,
					required: true
				},
				{ name: 'color', type: 'text', pattern: '^#[0-9a-fA-F]{6}$' },
				{ name: 'display_name', type: 'text', max: 40 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_memberships_user_household ON memberships (user, household)',
				'CREATE INDEX idx_memberships_household_updated ON memberships (household, updated)'
			]
		});
		app.save(memberships);

		// Mitglieder sehen alle Mitgliedschaften ihres Haushalts. Nur Admins legen an, ändern Rollen, entfernen.
		// Jedes Mitglied darf an der eigenen Mitgliedschaft Anzeigename und Farbe ändern.
		const fixed = '@request.body.user:changed = false && @request.body.household:changed = false';
		memberships.listRule = member('household');
		memberships.viewRule = member('household');
		memberships.createRule = member('household', ['admin']);
		memberships.updateRule =
			`${fixed} && (${member('household', ['admin'])} || (user = @request.auth.id` +
			' && @request.body.role:changed = false && @request.body.deleted_at:changed = false))';
		memberships.deleteRule = member('household', ['admin']);
		app.save(memberships);

		households.listRule = member('id');
		households.viewRule = member('id');
		households.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'";
		households.updateRule = member('id', ['admin']);
		households.deleteRule = member('id', ['admin']);
		app.save(households);
	},
	(app) => {
		const households = app.findCollectionByNameOrId('households');
		households.listRule = null;
		households.viewRule = null;
		households.createRule = null;
		households.updateRule = null;
		households.deleteRule = null;
		app.save(households);
		app.delete(app.findCollectionByNameOrId('memberships'));
	}
);
