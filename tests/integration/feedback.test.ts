// Testphase: Feedback nur mit Schalter HOMI_FEEDBACK=1; alle Mitglieder schreiben, Erwachsene erledigen.
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHousehold, createInvite, expectDenied, redeem, signUp } from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

let on: TestServer;
let off: TestServer;

beforeAll(async () => {
	[on, off] = await Promise.all([
		startPocketBase(),
		startPocketBase(undefined, { HOMI_FEEDBACK: '0' })
	]);
}, 60_000);

afterAll(async () => {
	await Promise.all([on?.stop(), off?.stop()]);
});

async function family(server: TestServer) {
	const admin = await signUp(server.url, { email: 'admin@fb.test', name: 'Julia' });
	const { household, membership } = await createHousehold(admin.pb, 'Familie Feedback');
	const child = await signUp(server.url, { username: 'kind', name: 'Mia' });
	const invite = await createInvite(admin.pb, household.id, 'child');
	const joined = await redeem(child.pb, { token: invite.token });
	return {
		admin: admin.pb,
		child: child.pb,
		household: household.id as string,
		adminMembership: membership.id as string,
		childMembership: joined.membership.id as string
	};
}

describe('Feedback eingeschaltet', () => {
	it('Schalter wird gemeldet; Kind schreibt, Absender setzt der Server, Admin erledigt', async () => {
		expect(await new PocketBase(on.url).send('/api/fh/features', {})).toEqual({ feedback: true });
		const f = await family(on);
		const entry = await f.child.collection('feedback').create({
			household: f.household,
			text: 'Der Plus-Knopf ist zu klein',
			area: 'Einkauf',
			created_by: f.adminMembership
		});
		expect(entry.created_by).toBe(f.childMembership);
		expect(entry.done).toBe(false);

		// Kinder können nicht als erledigt markieren, Admins schon.
		await expectDenied(f.child.collection('feedback').update(entry.id, { done: true }));
		const done = await f.admin.collection('feedback').update(entry.id, { done: true });
		expect(done.done).toBe(true);
		expect((await f.child.collection('feedback').getFullList()).length).toBe(1);
	});
});

describe('Feedback ausgeschaltet', () => {
	it('meldet den Schalter aus und nimmt nichts an', async () => {
		expect(await new PocketBase(off.url).send('/api/fh/features', {})).toEqual({ feedback: false });
		const f = await family(off);
		await expectDenied(
			f.admin.collection('feedback').create({ household: f.household, text: 'Test' }),
			[400]
		);
	});
});
