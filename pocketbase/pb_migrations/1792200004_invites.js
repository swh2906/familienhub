/// <reference path="../pb_data/types.d.ts" />

// `invites`: Einladungslinks und -codes. Nur Admins verwalten sie; gespeichert werden nur Hashes,
// und die sind auch für Admins über die API unsichtbar (`hidden`). Das Einlösen kommt in Schritt 3.

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
		const admin = member('household', ['admin']);

		const invites = new Collection({
			type: 'base',
			name: 'invites',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'created_by', type: 'relation', collectionId: memberships.id, maxSelect: 1 },
				{ name: 'token_hash', type: 'text', max: 128, hidden: true },
				{ name: 'code_hash', type: 'text', max: 128, hidden: true },
				{
					name: 'role',
					type: 'select',
					values: ['admin', 'adult', 'child'],
					maxSelect: 1,
					required: true
				},
				{ name: 'expires_at', type: 'date', required: true },
				{ name: 'uses_left', type: 'number', min: 0, onlyInt: true },
				{ name: 'revoked', type: 'bool' },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_invites_household_updated ON invites (household, updated)',
				"CREATE UNIQUE INDEX idx_invites_token_hash ON invites (token_hash) WHERE token_hash != ''",
				"CREATE INDEX idx_invites_code_hash ON invites (code_hash) WHERE code_hash != ''"
			],
			listRule: admin,
			viewRule: admin,
			createRule: admin,
			updateRule: `@request.body.household:changed = false && ${admin}`,
			deleteRule: admin
		});

		app.save(invites);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('invites'));
	}
);
