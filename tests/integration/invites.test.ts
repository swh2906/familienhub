// Prüft die eigenen Routen aus Schritt 3: Einladungen erzeugen und einlösen, Drosselung, Kinderkonten.
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createHousehold,
	createInvite,
	expectDenied,
	PASSWORD,
	redeem,
	signUp
} from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

let server: TestServer;
let admin: PocketBase;
let household: string;
let counter = 0;

/** Neues Konto ohne Familie, damit Fehlversuche verschiedener Tests sich nicht addieren. */
async function newcomer(name = 'Neu') {
	counter += 1;
	return signUp(server.url, { email: `neu${counter}@familie.test`, name: `${name} ${counter}` });
}

beforeAll(async () => {
	server = await startPocketBase();
	admin = (await signUp(server.url, { email: 'admin@familie.test', name: 'Julia' })).pb;
	household = (await createHousehold(admin, 'Familie Test')).household.id;
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

describe('Einladung erzeugen', () => {
	it('liefert Link-Token und 8-stelligen Code einmalig im Klartext', async () => {
		const invite = await createInvite(admin, household, 'adult');
		expect(invite.token).toMatch(/^[A-Za-z0-9]{40}$/);
		expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
		expect(invite.uses_left).toBe(1);

		const linkDays = (Date.parse(invite.expires_at) - Date.now()) / 86_400_000;
		const codeHours = (Date.parse(invite.code_expires_at) - Date.now()) / 3_600_000;
		expect(linkDays).toBeGreaterThan(6.9);
		expect(linkDays).toBeLessThanOrEqual(7);
		expect(codeHours).toBeGreaterThan(23.9);
		expect(codeHours).toBeLessThanOrEqual(24);
	});

	it('prüft Rolle und Anzahl der Nutzungen', async () => {
		await expectDenied(createInvite(admin, household, 'chef'), [400]);
		await expectDenied(createInvite(admin, household, 'adult', 0), [400]);
		await expectDenied(createInvite(admin, household, 'adult', 21), [400]);
	});

	it('nur für Admins des Haushalts', async () => {
		const { pb } = await newcomer();
		await expectDenied(createInvite(pb, household, 'adult'), [403]);
		await expectDenied(createInvite(new PocketBase(server.url), household, 'adult'), [401]);
	});
});

describe('Einladung einlösen', () => {
	it('per Link: Mitgliedschaft mit Rolle, Name und freier Farbe', async () => {
		const invite = await createInvite(admin, household, 'adult');
		const { pb, id } = await newcomer('Tom');

		const result = await redeem(pb, { token: invite.token });
		expect(result.household).toBe(household);
		expect(result.membership).toMatchObject({ user: id, role: 'adult', deleted_at: '' });
		expect(result.membership.display_name).toMatch(/^Tom/);
		expect(result.membership.color).toMatch(/^#[0-9a-f]{6}$/);
		expect(result.membership.color).not.toBe('#2453c7'); // die Farbe des Admins

		// Danach sieht das neue Mitglied den Haushalt.
		expect((await pb.collection('households').getOne(household)).name).toBe('Familie Test');
	});

	it('per Code, unabhängig von Groß-/Kleinschreibung und Bindestrich', async () => {
		const invite = await createInvite(admin, household, 'child');
		const { pb } = await newcomer();
		const typed = `${invite.code.slice(0, 4).toLowerCase()}-${invite.code.slice(4)}`;
		const result = await redeem(pb, { code: typed });
		expect(result.membership.role).toBe('child');
	});

	it('mehrfach nutzbare Einladung zählt herunter und ist dann aufgebraucht', async () => {
		const invite = await createInvite(admin, household, 'adult', 2);
		await redeem((await newcomer()).pb, { token: invite.token });
		await redeem((await newcomer()).pb, { token: invite.token });
		await expectDenied(redeem((await newcomer()).pb, { token: invite.token }), [400]);
		expect((await admin.collection('invites').getOne(invite.id)).uses_left).toBe(0);
	});

	it('erneutes Einlösen durch ein Mitglied verbraucht keine Nutzung', async () => {
		const invite = await createInvite(admin, household, 'adult', 2);
		const { pb } = await newcomer();
		await redeem(pb, { token: invite.token });
		await redeem(pb, { token: invite.token });
		expect((await admin.collection('invites').getOne(invite.id)).uses_left).toBe(1);
	});

	it('abgelaufene Links und Codes funktionieren nicht', async () => {
		const invite = await createInvite(admin, household, 'adult', 5);
		const past = new Date(Date.now() - 60_000).toISOString();

		await admin.collection('invites').update(invite.id, { code_expires_at: past });
		await expectDenied(redeem((await newcomer()).pb, { code: invite.code }), [400]);
		// Der Link (7 Tage) gilt noch.
		await redeem((await newcomer()).pb, { token: invite.token });

		await admin.collection('invites').update(invite.id, { expires_at: past });
		await expectDenied(redeem((await newcomer()).pb, { token: invite.token }), [400]);
	});

	it('widerrufene Einladungen funktionieren nicht', async () => {
		const invite = await createInvite(admin, household, 'adult');
		await admin.collection('invites').update(invite.id, { revoked: true });
		await expectDenied(redeem((await newcomer()).pb, { token: invite.token }), [400]);
	});

	it('ein entferntes Mitglied kann mit neuer Einladung zurückkehren', async () => {
		const first = await createInvite(admin, household, 'adult');
		const { pb } = await newcomer();
		const joined = await redeem(pb, { token: first.token });
		await admin
			.collection('memberships')
			.update(joined.membership.id, { deleted_at: new Date().toISOString() });
		await expectDenied(pb.collection('households').getOne(household));

		const second = await createInvite(admin, household, 'child');
		const back = await redeem(pb, { token: second.token });
		expect(back.membership).toMatchObject({
			id: joined.membership.id,
			role: 'child',
			deleted_at: ''
		});
	});

	it('verlangt Anmeldung und ein Token oder einen Code', async () => {
		await expectDenied(redeem(new PocketBase(server.url), { token: 'x' }), [401]);
		await expectDenied(redeem((await newcomer()).pb, {}), [400]);
	});
});

describe('Drosselung von Fehlversuchen', () => {
	it('nach 5 Fehlversuchen sperrt das Konto, auch für gültige Codes', async () => {
		const { pb } = await newcomer();
		for (let i = 0; i < 5; i++) {
			await expectDenied(redeem(pb, { code: 'FALSCH99' }), [400]);
		}
		const invite = await createInvite(admin, household, 'adult');
		await expectDenied(redeem(pb, { code: invite.code }), [429]);

		// Andere Konten sind nicht betroffen.
		const other = await newcomer();
		expect((await redeem(other.pb, { code: invite.code })).household).toBe(household);
	});
});

describe('Kinderkonto anlegen', () => {
	it('Admin legt Kind mit Benutzername und Passwort an, das Kind kann sich anmelden', async () => {
		const result = await admin.send('/api/fh/children', {
			method: 'POST',
			body: { household, username: 'Leo', password: PASSWORD, display_name: 'Leo' }
		});
		expect(result.user).toMatchObject({ username: 'leo', name: 'Leo' });
		expect(result.membership).toMatchObject({ role: 'child', display_name: 'Leo' });

		const child = new PocketBase(server.url);
		await child.collection('users').authWithPassword('leo', PASSWORD);
		expect((await child.collection('households').getOne(household)).id).toBe(household);
	});

	it('prüft Benutzername, Passwort und Namen', async () => {
		const send = (body: object) =>
			admin.send('/api/fh/children', { method: 'POST', body: { household, ...body } });
		await expectDenied(send({ username: 'x', password: PASSWORD, display_name: 'X' }), [400]);
		await expectDenied(send({ username: 'mila', password: 'kurz', display_name: 'Mila' }), [400]);
		await expectDenied(send({ username: 'mila', password: PASSWORD, display_name: '' }), [400]);
		await expectDenied(send({ username: 'leo', password: PASSWORD, display_name: 'Leo 2' }), [400]);
	});

	it('nur Admins des Haushalts', async () => {
		const invite = await createInvite(admin, household, 'adult');
		const { pb } = await newcomer();
		await redeem(pb, { token: invite.token });
		await expectDenied(
			pb.send('/api/fh/children', {
				method: 'POST',
				body: { household, username: 'nina', password: PASSWORD, display_name: 'Nina' }
			}),
			[403]
		);
	});
});
