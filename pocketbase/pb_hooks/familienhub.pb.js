/// <reference path="../pb_data/types.d.ts" />

// Serverseitige Ergänzungen zu den API-Regeln. Die Logik steht in lib/familienhub.js.

const FAMILY_COLLECTIONS = [
	'households',
	'memberships',
	'invites',
	'recipes',
	'recipe_ingredients',
	'ingredients',
	'parse_corrections',
	'meal_plan_entries',
	'shopping_items',
	'events',
	'tasks',
	'task_completions',
	'feedback'
];

// ---- Eigene Routen (nur angemeldete Konten der Collection `users`) ----

routerAdd(
	'POST',
	'/api/fh/households',
	(e) => require(`${__hooks}/lib/familienhub.js`).createHousehold(e),
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/fh/invites',
	(e) => require(`${__hooks}/lib/familienhub.js`).createInvite(e),
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/fh/invites/redeem',
	(e) => require(`${__hooks}/lib/familienhub.js`).redeemInvite(e),
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/fh/children',
	(e) => require(`${__hooks}/lib/familienhub.js`).createChild(e),
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/fh/account/delete',
	(e) => require(`${__hooks}/lib/familienhub.js`).deleteAccount(e),
	$apis.requireAuth('users')
);

routerAdd(
	'POST',
	'/api/fh/households/delete',
	(e) => require(`${__hooks}/lib/familienhub.js`).deleteHousehold(e),
	$apis.requireAuth('users')
);

// ---- Aufräum-Job: gelöschte Einträge nach 30 Tagen endgültig entfernen ----

cronAdd('fh_purge_deleted', '30 3 * * *', () => {
	const removed = require(`${__hooks}/lib/familienhub.js`).purgeDeleted($app);
	$app.logger().info('Gelöschte Einträge entfernt', 'removed', JSON.stringify(removed));
});

// Dasselbe von Hand (nur Superuser), z. B. für Tests oder nach einer Wartung.
routerAdd(
	'POST',
	'/api/fh/purge',
	(e) => e.json(200, require(`${__hooks}/lib/familienhub.js`).purgeDeleted(e.app)),
	$apis.requireSuperuserAuth()
);

// ---- Hooks auf Collections ----

onRecordCreateRequest(
	(e) => {
		require(`${__hooks}/lib/familienhub.js`).stampUpdatedBy(e);
		e.next();
	},
	...FAMILY_COLLECTIONS
);

onRecordUpdateRequest(
	(e) => {
		require(`${__hooks}/lib/familienhub.js`).stampUpdatedBy(e);
		e.next();
	},
	...FAMILY_COLLECTIONS
);

routerAdd('GET', '/api/fh/features', (e) => require(`${__hooks}/lib/familienhub.js`).features(e));

onRecordCreateRequest((e) => {
	require(`${__hooks}/lib/familienhub.js`).stampFeedback(e);
	e.next();
}, 'feedback');

onRecordCreateRequest((e) => {
	require(`${__hooks}/lib/familienhub.js`).stampShoppingItem(e, true);
	e.next();
}, 'shopping_items');

onRecordUpdateRequest((e) => {
	require(`${__hooks}/lib/familienhub.js`).stampShoppingItem(e, false);
	e.next();
}, 'shopping_items');

onRecordUpdateRequest((e) => {
	require(`${__hooks}/lib/familienhub.js`).guardLastAdmin(e, false);
	e.next();
}, 'memberships');

onRecordDeleteRequest((e) => {
	require(`${__hooks}/lib/familienhub.js`).guardLastAdmin(e, true);
	e.next();
}, 'memberships');

onRecordValidate(
	(e) => {
		require(`${__hooks}/lib/familienhub.js`).checkSameHousehold(e);
		e.next();
	},
	'invites',
	'recipe_ingredients',
	'meal_plan_entries',
	'shopping_items',
	'events',
	'tasks',
	'task_completions',
	'feedback'
);
