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

onRecordAfterCreateSuccess((e) => {
	require(`${__hooks}/lib/familienhub.js`).addCreatorAsAdmin(e);
	e.next();
}, 'households');

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
