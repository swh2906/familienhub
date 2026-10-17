/// <reference path="../pb_data/types.d.ts" />

// Schritt 3: Einladungscodes laufen nach 24 Stunden ab, Links nach 7 Tagen (`expires_at`).
// Haushalte und Einladungen entstehen nur noch über die eigenen Routen (pb_hooks/familienhub.pb.js),
// damit Admin-Mitgliedschaft bzw. Hashes serverseitig und in einer Transaktion entstehen.

migrate(
	(app) => {
		const invites = app.findCollectionByNameOrId('invites');
		invites.fields.add(new DateField({ name: 'code_expires_at' }));
		invites.createRule = null;
		app.save(invites);

		const households = app.findCollectionByNameOrId('households');
		households.createRule = null;
		app.save(households);
	},
	(app) => {
		const invites = app.findCollectionByNameOrId('invites');
		invites.fields.removeByName('code_expires_at');
		invites.createRule = invites.listRule;
		app.save(invites);

		const households = app.findCollectionByNameOrId('households');
		households.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'";
		app.save(households);
	}
);
