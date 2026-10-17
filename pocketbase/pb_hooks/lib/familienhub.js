/// <reference path="../../pb_data/types.d.ts" />

// Hilfsfunktionen für die Hooks in ../familienhub.pb.js.
// PocketBase führt jeden Hook isoliert aus, deshalb werden sie dort per require() geladen.

// Felder, die auf Datensätze desselben Haushalts zeigen müssen (Feld → Collection).
const SAME_HOUSEHOLD_REFS = {
	invites: { created_by: 'memberships' },
	meal_plan_entries: { recipe: 'recipes' },
	shopping_items: {
		added_by: 'memberships',
		checked_by: 'memberships',
		meal_plan_entry: 'meal_plan_entries'
	},
	events: { participants: 'memberships' },
	tasks: { assignees: 'memberships' },
	task_completions: { membership: 'memberships' }
};

/** Ist die Anfrage von einem normalen Konto (nicht Superuser, nicht anonym)? */
function isUser(e) {
	return !!e.auth && e.auth.collection().name === 'users';
}

/** Setzt `updated_by` auf das angemeldete Konto. Clients können es nicht fälschen. */
function stampUpdatedBy(e) {
	if (isUser(e)) e.record.set('updated_by', e.auth.id);
}

/** Aktive Mitgliedschaft eines Kontos in einem Haushalt oder null. */
function findMembership(app, userId, householdId) {
	try {
		return app.findFirstRecordByFilter(
			'memberships',
			"user = {:user} && household = {:household} && deleted_at = ''",
			{ user: userId, household: householdId }
		);
	} catch {
		return null;
	}
}

/**
 * Einkaufsartikel: `added_by` beim Anlegen, `checked_by`/`checked_at` beim (Ab-)Haken setzt der Server.
 * Ohne Änderung an `checked` bleiben die alten Werte erhalten.
 */
function stampShoppingItem(e, isCreate) {
	const record = e.record;
	const original = isCreate ? null : record.original();
	const membership = isUser(e) ? findMembership(e.app, e.auth.id, record.get('household')) : null;

	if (isCreate && membership) record.set('added_by', membership.id);
	if (!isCreate) record.set('added_by', original.get('added_by'));

	const checked = record.getBool('checked');
	const wasChecked = original ? original.getBool('checked') : false;
	if (checked && (isCreate || !wasChecked)) {
		record.set('checked_by', membership ? membership.id : '');
		record.set('checked_at', new DateTime());
	} else if (!checked) {
		record.set('checked_by', '');
		record.set('checked_at', '');
	} else if (original) {
		record.set('checked_by', original.get('checked_by'));
		record.set('checked_at', original.get('checked_at'));
	}
}

/** Wer einen Haushalt anlegt, wird dessen Admin (Konto steht in `updated_by`). */
function addCreatorAsAdmin(e) {
	const userId = e.record.getString('updated_by');
	if (!userId) return;

	const user = e.app.findRecordById('users', userId);
	const membership = new Record(e.app.findCollectionByNameOrId('memberships'));
	membership.set('user', userId);
	membership.set('household', e.record.id);
	membership.set('role', 'admin');
	membership.set('display_name', user.getString('name') || user.getString('username'));
	membership.set('updated_by', userId);
	e.app.save(membership);
}

/** Verknüpfte Datensätze müssen zum selben Haushalt gehören, sonst wird das Speichern abgelehnt. */
function checkSameHousehold(e) {
	const record = e.record;
	const name = record.collection().name;
	const refs = SAME_HOUSEHOLD_REFS[name];
	if (!refs) return;

	const household =
		name === 'task_completions'
			? e.app.findRecordById('tasks', record.getString('task')).getString('household')
			: record.getString('household');

	for (const field of Object.keys(refs)) {
		for (const id of record.getStringSlice(field)) {
			let ref = null;
			try {
				ref = e.app.findRecordById(refs[field], id);
			} catch {
				// Existenz prüft PocketBase selbst; hier geht es nur um den Haushalt.
			}
			if (ref && ref.getString('household') !== household) {
				throw new BadRequestError(`"${field}" gehört zu einem anderen Haushalt.`);
			}
		}
	}
}

module.exports = {
	stampUpdatedBy,
	stampShoppingItem,
	addCreatorAsAdmin,
	checkSameHousehold
};
