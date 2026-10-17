/// <reference path="../pb_data/types.d.ts" />

// Schritt 10b: Konto löschen. Die Mitgliedschaft bleibt als „Ehemaliges Mitglied“ bestehen
// (Name geleert, `user` leer), damit Verweise wie `added_by`, Teilnehmer und erledigte Aufgaben
// erhalten bleiben. Dafür darf `user` leer sein und wird beim Löschen des Kontos nicht mitgelöscht.
// Mitgliedschaften entstehen nur über die eigenen Routen (Haushalt, Einladung, Kinderkonto); direktes
// Anlegen über die API ist gesperrt, damit keine Mitgliedschaft ohne oder mit fremdem Konto entsteht.
// Familienraum löschen nur über POST /api/fh/households/delete (feste Löschreihenfolge, Name als Bestätigung).

// Regel vor dieser Migration (für das Zurückrollen).
const MEMBER_ADMIN_CREATE =
	'(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= household' +
	' && @collection.memberships.deleted_at ?= "" && (@collection.memberships.role ?= "admin"))';
const HOUSEHOLD_ADMIN_DELETE = MEMBER_ADMIN_CREATE.replace('?= household', '?= id');

migrate(
	(app) => {
		const memberships = app.findCollectionByNameOrId('memberships');
		const user = memberships.fields.getByName('user');
		user.required = false;
		user.cascadeDelete = false;
		memberships.createRule = null;
		app.save(memberships);

		const households = app.findCollectionByNameOrId('households');
		households.deleteRule = null;
		app.save(households);
	},
	(app) => {
		const memberships = app.findCollectionByNameOrId('memberships');
		const user = memberships.fields.getByName('user');
		user.required = true;
		user.cascadeDelete = true;
		memberships.createRule = MEMBER_ADMIN_CREATE;
		app.save(memberships);

		const households = app.findCollectionByNameOrId('households');
		households.deleteRule = HOUSEHOLD_ADMIN_DELETE;
		app.save(households);
	}
);
