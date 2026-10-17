/// <reference path="../pb_data/types.d.ts" />

// Auth-Collection `users`: Login per E-Mail (Erwachsene) oder Benutzername (Kinder, ohne E-Mail).
// Jeder sieht und ändert nur das eigene Konto; Namen anderer kommen aus `memberships.display_name`.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		users.fields.getByName('email').required = false;
		users.fields.add(
			new TextField({
				name: 'username',
				max: 30,
				pattern: '^[a-z0-9._-]{3,30}$'
			})
		);
		users.passwordAuth.identityFields = ['email', 'username'];
		users.addIndex('idx_users_username', true, 'username', "username != ''");

		users.listRule = 'id = @request.auth.id';
		users.viewRule = 'id = @request.auth.id';
		users.createRule = '';
		users.updateRule = 'id = @request.auth.id';
		users.deleteRule = 'id = @request.auth.id';

		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.removeIndex('idx_users_username');
		users.fields.removeByName('username');
		users.fields.getByName('email').required = true;
		users.passwordAuth.identityFields = ['email'];
		app.save(users);
	}
);
