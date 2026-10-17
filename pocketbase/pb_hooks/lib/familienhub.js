/// <reference path="../../pb_data/types.d.ts" />

// Hilfsfunktionen für Hooks und Routen in ../familienhub.pb.js.
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

// Mitgliedsfarben, identisch mit MEMBER_COLORS in src/lib/ui/members.ts (AA-Kontrast mit weißer Initiale).
const MEMBER_COLORS = [
	'#2453c7',
	'#18733b',
	'#7a3bd1',
	'#b4410f',
	'#b42318',
	'#b0236a',
	'#0e6e66',
	'#8a5a00'
];

const ROLES = ['admin', 'adult', 'child'];
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_VALID_MS = 7 * DAY_MS;
const CODE_VALID_MS = DAY_MS;
// Ohne leicht verwechselbare Zeichen (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Fehlversuche beim Einlösen: pro Konto und pro IP innerhalb eines Zeitfensters.
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const THROTTLE_MAX_PER_USER = 5;
const THROTTLE_MAX_PER_IP = 20;

const INVALID_INVITE = 'Die Einladung ist ungültig oder abgelaufen.';

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

/** Bricht mit 403 ab, wenn das Konto nicht Admin des Haushalts ist. */
function requireAdmin(app, userId, householdId) {
	const membership = householdId ? findMembership(app, userId, householdId) : null;
	if (!membership || membership.getString('role') !== 'admin') {
		throw new ForbiddenError('Nur Admins des Familienraums dürfen das.');
	}
	return membership;
}

/** Erste Mitgliedsfarbe, die im Haushalt noch nicht vergeben ist. */
function pickColor(app, householdId) {
	const used = app
		.findRecordsByFilter('memberships', "household = {:h} && deleted_at = ''", '', 0, 0, {
			h: householdId
		})
		.map((m) => m.getString('color'));
	return MEMBER_COLORS.find((c) => used.indexOf(c) === -1) || MEMBER_COLORS[used.length % 8];
}

/** Legt eine Mitgliedschaft an oder reaktiviert eine entfernte. */
function addMember(app, user, householdId, role, displayName) {
	let membership;
	try {
		membership = app.findFirstRecordByFilter(
			'memberships',
			'user = {:user} && household = {:household}',
			{ user: user.id, household: householdId }
		);
	} catch {
		membership = new Record(app.findCollectionByNameOrId('memberships'));
		membership.set('user', user.id);
		membership.set('household', householdId);
	}
	membership.set('role', role);
	membership.set('deleted_at', '');
	membership.set(
		'display_name',
		displayName || membership.getString('display_name') || user.getString('name')
	);
	if (!membership.getString('color')) membership.set('color', pickColor(app, householdId));
	membership.set('updated_by', user.id);
	app.save(membership);
	return membership;
}

/** POST /api/fh/households: Haushalt und Admin-Mitgliedschaft in einer Transaktion. */
function createHousehold(e) {
	const body = e.requestInfo().body;
	const name = String(body.name || '').trim();
	const timezone = String(body.timezone || '').trim() || 'Europe/Berlin';
	if (!name || name.length > 80) {
		throw new BadRequestError('Bitte einen Namen mit 1 bis 80 Zeichen angeben.');
	}

	let household = null;
	let membership = null;
	e.app.runInTransaction((tx) => {
		household = new Record(tx.findCollectionByNameOrId('households'));
		household.set('name', name);
		household.set('timezone', timezone);
		household.set('updated_by', e.auth.id);
		tx.save(household);
		membership = addMember(tx, e.auth, household.id, 'admin', e.auth.getString('name'));
	});
	return e.json(200, { household, membership });
}

/** POST /api/fh/invites: neuer Link (7 Tage) und Code (24 Stunden), nur Hashes werden gespeichert. */
function createInvite(e) {
	const body = e.requestInfo().body;
	const householdId = String(body.household || '');
	const role = String(body.role || '');
	const uses = body.uses === undefined ? 1 : Number(body.uses);
	if (ROLES.indexOf(role) === -1) throw new BadRequestError('Unbekannte Rolle.');
	if (!(uses >= 1 && uses <= 20 && Math.floor(uses) === uses)) {
		throw new BadRequestError('Anzahl der Nutzungen muss zwischen 1 und 20 liegen.');
	}
	const admin = requireAdmin(e.app, e.auth.id, householdId);

	const token = $security.randomString(40);
	const code = $security.randomStringWithAlphabet(8, CODE_ALPHABET);
	const now = Date.now();

	const invite = new Record(e.app.findCollectionByNameOrId('invites'));
	invite.set('household', householdId);
	invite.set('created_by', admin.id);
	invite.set('role', role);
	invite.set('token_hash', $security.sha256(token));
	invite.set('code_hash', $security.sha256(code));
	invite.set('expires_at', new Date(now + LINK_VALID_MS).toISOString());
	invite.set('code_expires_at', new Date(now + CODE_VALID_MS).toISOString());
	invite.set('uses_left', uses);
	invite.set('revoked', false);
	invite.set('updated_by', e.auth.id);
	e.app.save(invite);

	// Klartext nur in dieser Antwort; danach lässt er sich nicht mehr abrufen.
	return e.json(200, {
		id: invite.id,
		role,
		token,
		code,
		expires_at: invite.getString('expires_at'),
		code_expires_at: invite.getString('code_expires_at'),
		uses_left: uses
	});
}

/** Code vereinheitlichen: Großbuchstaben, ohne Leerzeichen und Bindestriche. */
function normalizeCode(value) {
	return String(value || '')
		.toUpperCase()
		.replace(/[\s-]/g, '');
}

function throttleKeys(e) {
	return [
		{ key: 'fh_redeem_user_' + e.auth.id, max: THROTTLE_MAX_PER_USER },
		{ key: 'fh_redeem_ip_' + e.realIP(), max: THROTTLE_MAX_PER_IP }
	];
}

/** Gespeicherter Zähler als "anzahl:ablaufzeitpunkt", abgelaufene zählen als 0. */
function readCounter(store, key) {
	const raw = store.get(key);
	if (!raw) return { count: 0, resetAt: 0 };
	const parts = String(raw).split(':');
	const resetAt = Number(parts[1]);
	if (resetAt < Date.now()) return { count: 0, resetAt: 0 };
	return { count: Number(parts[0]), resetAt };
}

function checkThrottle(e) {
	const store = e.app.store();
	for (const { key, max } of throttleKeys(e)) {
		if (readCounter(store, key).count >= max) {
			throw new TooManyRequestsError(
				'Zu viele Fehlversuche. Bitte in einer Viertelstunde erneut versuchen.'
			);
		}
	}
}

function recordFailure(e) {
	const store = e.app.store();
	for (const { key } of throttleKeys(e)) {
		const counter = readCounter(store, key);
		const resetAt = counter.resetAt || Date.now() + THROTTLE_WINDOW_MS;
		store.set(key, counter.count + 1 + ':' + resetAt);
	}
	return new BadRequestError(INVALID_INVITE);
}

function isExpired(record, field) {
	const value = record.getDateTime(field);
	return value.isZero() || value.unix() * 1000 < Date.now();
}

/** POST /api/fh/invites/redeem: tritt mit Link-Token oder Code einem Haushalt bei. */
function redeemInvite(e) {
	checkThrottle(e);

	const body = e.requestInfo().body;
	const token = String(body.token || '').trim();
	const code = normalizeCode(body.code);
	if (!token && !code) throw recordFailure(e);

	const field = token ? 'token_hash' : 'code_hash';
	const expiryField = token ? 'expires_at' : 'code_expires_at';
	let invite = null;
	try {
		invite = e.app.findFirstRecordByFilter(
			'invites',
			`${field} = {:hash} && revoked = false && deleted_at = ''`,
			{ hash: $security.sha256(token || code) }
		);
	} catch {
		throw recordFailure(e);
	}
	if (invite.getInt('uses_left') < 1 || isExpired(invite, expiryField)) throw recordFailure(e);

	const householdId = invite.getString('household');
	let membership = findMembership(e.app, e.auth.id, householdId);
	if (!membership) {
		e.app.runInTransaction((tx) => {
			const fresh = tx.findRecordById('invites', invite.id);
			if (fresh.getInt('uses_left') < 1) throw new BadRequestError(INVALID_INVITE);
			fresh.set('uses_left', fresh.getInt('uses_left') - 1);
			tx.save(fresh);
			membership = addMember(tx, e.auth, householdId, invite.getString('role'), '');
		});
	}

	for (const { key } of throttleKeys(e)) {
		if (key.indexOf('fh_redeem_user_') === 0) e.app.store().remove(key);
	}
	return e.json(200, { household: householdId, membership });
}

/** POST /api/fh/children: Admin legt ein Kinderkonto (Benutzername + Passwort) mit Mitgliedschaft an. */
function createChild(e) {
	const body = e.requestInfo().body;
	const householdId = String(body.household || '');
	const username = String(body.username || '')
		.trim()
		.toLowerCase();
	const password = String(body.password || '');
	const displayName = String(body.display_name || '').trim();
	requireAdmin(e.app, e.auth.id, householdId);

	if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
		throw new BadRequestError(
			'Benutzername: 3 bis 30 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.'
		);
	}
	if (password.length < 8) throw new BadRequestError('Das Passwort braucht mindestens 8 Zeichen.');
	if (!displayName || displayName.length > 40) {
		throw new BadRequestError('Bitte einen Namen mit 1 bis 40 Zeichen angeben.');
	}
	try {
		e.app.findFirstRecordByData('users', 'username', username);
		throw new BadRequestError('Dieser Benutzername ist schon vergeben.');
	} catch (error) {
		if (error instanceof BadRequestError) throw error;
	}

	let user = null;
	let membership = null;
	e.app.runInTransaction((tx) => {
		user = new Record(tx.findCollectionByNameOrId('users'));
		user.set('username', username);
		user.set('name', displayName);
		user.setPassword(password);
		tx.save(user);
		membership = addMember(tx, user, householdId, 'child', displayName);
		membership.set('updated_by', e.auth.id);
		tx.save(membership);
	});
	return e.json(200, { user: { id: user.id, username, name: displayName }, membership });
}

/** Der letzte aktive Admin eines Haushalts darf weder herabgestuft noch entfernt werden. */
function guardLastAdmin(e, isDelete) {
	const before = isDelete ? e.record : e.record.original();
	if (before.getString('role') !== 'admin' || before.getString('deleted_at')) return;
	const stillAdmin =
		!isDelete && e.record.getString('role') === 'admin' && !e.record.getString('deleted_at');
	if (stillAdmin) return;

	const otherAdmins = e.app.findRecordsByFilter(
		'memberships',
		"household = {:h} && role = 'admin' && deleted_at = '' && id != {:id}",
		'',
		1,
		0,
		{ h: before.getString('household'), id: before.id }
	);
	if (otherAdmins.length === 0) {
		throw new BadRequestError('Der Familienraum braucht mindestens einen Admin.');
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
	checkSameHousehold,
	guardLastAdmin,
	createHousehold,
	createInvite,
	redeemInvite,
	createChild
};
