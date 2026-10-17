/// <reference path="../pb_data/types.d.ts" />

// Serverseitige Ergänzungen zu den API-Regeln. Die Logik steht in lib/familienhub.js.

const FAMILY_COLLECTIONS = [
	'households',
	'memberships',
	'invites',
	'recipes',
	'recipe_ingredients',
	'meal_plan_entries',
	'shopping_items',
	'events',
	'tasks',
	'task_completions'
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
	'meal_plan_entries',
	'shopping_items',
	'events',
	'tasks',
	'task_completions'
);
