// Prüft die Rechte-Tabelle aus CLAUDE.md gegen ein echtes PocketBase mit allen Migrationen und Hooks.
// Familie A: Admin, Erwachsener, Kind und ein entferntes Mitglied. Familie B: ein fremder Admin.
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

const PASSWORD = 'test-passwort-123';

type Role = 'admin' | 'adult' | 'child';

let server: TestServer;
const as: Record<Role | 'outsider' | 'removed', PocketBase> = {} as never;
const userId: Record<Role | 'outsider' | 'removed', string> = {} as never;
const membership: Record<Role | 'removed', string> = {} as never;
let householdA: string;
let householdB: string;
let recipeA: RecordModel;
let recipeB: RecordModel;

async function signUp(data: { email?: string; username?: string; name: string }) {
	const pb = new PocketBase(server.url);
	pb.autoCancellation(false);
	const user = await pb
		.collection('users')
		.create({ ...data, password: PASSWORD, passwordConfirm: PASSWORD });
	await pb.collection('users').authWithPassword(data.email ?? data.username ?? '', PASSWORD);
	return { pb, id: user.id };
}

/** Erwartet, dass PocketBase die Anfrage ablehnt (400, 403 oder 404 je nach Regelart). */
async function expectDenied(request: Promise<unknown>) {
	const error = await request.then(
		() => null,
		(e: unknown) => e
	);
	expect(error, 'Anfrage hätte abgelehnt werden müssen').toBeInstanceOf(ClientResponseError);
	expect([400, 403, 404]).toContain((error as ClientResponseError).status);
}

beforeAll(async () => {
	server = await startPocketBase();

	for (const [key, data] of [
		['admin', { email: 'admin@familie-a.test', name: 'Julia' }],
		['adult', { email: 'tom@familie-a.test', name: 'Tom' }],
		['child', { username: 'mia', name: 'Mia' }],
		['removed', { email: 'ex@familie-a.test', name: 'Ex' }],
		['outsider', { email: 'admin@familie-b.test', name: 'Fremd' }]
	] as const) {
		const { pb, id } = await signUp(data);
		as[key] = pb;
		userId[key] = id;
	}

	householdA = (await as.admin.collection('households').create({ name: 'Familie A' })).id;
	householdB = (await as.outsider.collection('households').create({ name: 'Familie B' })).id;

	membership.admin = (
		await as.admin.collection('memberships').getFirstListItem(`user = "${userId.admin}"`)
	).id;
	for (const role of ['adult', 'child'] as const) {
		membership[role] = (
			await as.admin
				.collection('memberships')
				.create({ user: userId[role], household: householdA, role })
		).id;
	}
	membership.removed = (
		await as.admin
			.collection('memberships')
			.create({ user: userId.removed, household: householdA, role: 'adult' })
	).id;
	await as.admin
		.collection('memberships')
		.update(membership.removed, { deleted_at: new Date().toISOString() });

	recipeA = await as.adult
		.collection('recipes')
		.create({ household: householdA, title: 'Gemüse-Lasagne', servings: 4 });
	recipeB = await as.outsider
		.collection('recipes')
		.create({ household: householdB, title: 'Geheimrezept' });
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

describe('Haushalt anlegen', () => {
	it('macht das anlegende Konto zum Admin', async () => {
		const own = await as.admin.collection('memberships').getOne(membership.admin);
		expect(own).toMatchObject({ household: householdA, role: 'admin', display_name: 'Julia' });
	});

	it('setzt updated_by serverseitig, auch wenn der Client etwas anderes schickt', async () => {
		const recipe = await as.adult.collection('recipes').create({
			household: householdA,
			title: 'Pfannkuchen',
			updated_by: userId.admin
		});
		expect(recipe.updated_by).toBe(userId.adult);
		const updated = await as.admin.collection('recipes').update(recipe.id, { title: 'Crêpes' });
		expect(updated.updated_by).toBe(userId.admin);
	});
});

describe('Fremder Haushalt und entfernte Mitglieder', () => {
	it('Haushalt B sieht nichts aus Haushalt A', async () => {
		await expectDenied(as.outsider.collection('households').getOne(householdA));
		await expectDenied(as.outsider.collection('recipes').getOne(recipeA.id));
		for (const name of [
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
		]) {
			const items = await as.outsider.collection(name).getFullList();
			const leaked = items.filter(
				(item) =>
					item.household === householdA || item.id === householdA || item.recipe === recipeA.id
			);
			expect(leaked, name).toEqual([]);
		}
	});

	it('Haushalt A sieht nichts aus Haushalt B', async () => {
		await expectDenied(as.admin.collection('recipes').getOne(recipeB.id));
		const recipes = await as.admin.collection('recipes').getFullList();
		expect(recipes.map((r) => r.household)).not.toContain(householdB);
	});

	it('niemand legt Daten in einem fremden Haushalt an', async () => {
		await expectDenied(
			as.outsider.collection('recipes').create({ household: householdA, title: 'Einbruch' })
		);
		await expectDenied(
			as.outsider.collection('shopping_items').create({ household: householdA, name: 'Einbruch' })
		);
		await expectDenied(
			as.admin.collection('recipes').create({ household: householdB, title: 'Einbruch' })
		);
	});

	it('Datensätze lassen sich nicht in einen anderen Haushalt verschieben', async () => {
		await expectDenied(
			as.adult.collection('recipes').update(recipeA.id, { household: householdB })
		);
	});

	it('Verknüpfungen auf Datensätze anderer Haushalte werden abgelehnt', async () => {
		await expectDenied(
			as.adult.collection('meal_plan_entries').create({
				household: householdA,
				date: '2026-10-20',
				slot: 'dinner',
				recipe: recipeB.id
			})
		);
		const outsiderMembership = await as.outsider
			.collection('memberships')
			.getFirstListItem(`user = "${userId.outsider}"`);
		await expectDenied(
			as.adult.collection('tasks').create({
				household: householdA,
				title: 'Fremde Aufgabe',
				assignees: [outsiderMembership.id]
			})
		);
	});

	it('ein entferntes Mitglied verliert den Zugriff', async () => {
		await expectDenied(as.removed.collection('households').getOne(householdA));
		expect(await as.removed.collection('recipes').getFullList()).toEqual([]);
		await expectDenied(
			as.removed.collection('shopping_items').create({ household: householdA, name: 'Milch' })
		);
	});
});

describe('Familienraum (households)', () => {
	it.each(['admin', 'adult', 'child'] as const)('%s sieht den Haushalt', async (role) => {
		expect((await as[role].collection('households').getOne(householdA)).name).toBe('Familie A');
	});

	it('nur der Admin benennt um', async () => {
		await expectDenied(as.adult.collection('households').update(householdA, { name: 'X' }));
		await expectDenied(as.child.collection('households').update(householdA, { name: 'X' }));
		const renamed = await as.admin
			.collection('households')
			.update(householdA, { name: 'Familie A.' });
		expect(renamed.name).toBe('Familie A.');
	});

	it('nur der Admin löscht', async () => {
		await expectDenied(as.adult.collection('households').delete(householdA));
		await expectDenied(as.child.collection('households').delete(householdA));
		const temp = await as.admin.collection('households').create({ name: 'Ferienhaus' });
		await expect(as.admin.collection('households').delete(temp.id)).resolves.toBe(true);
	});
});

describe('Mitglieder (memberships)', () => {
	it.each(['admin', 'adult', 'child'] as const)(
		'%s sieht alle Mitglieder der Familie',
		async (role) => {
			const list = await as[role].collection('memberships').getFullList();
			expect(list.map((m) => m.id).sort()).toEqual(Object.values(membership).sort());
		}
	);

	it('nur der Admin lädt Mitglieder ein', async () => {
		for (const role of ['adult', 'child'] as const) {
			await expectDenied(
				as[role]
					.collection('memberships')
					.create({ user: userId.outsider, household: householdA, role: 'adult' })
			);
		}
		const added = await as.admin
			.collection('memberships')
			.create({ user: userId.outsider, household: householdA, role: 'child' });
		await expect(as.admin.collection('memberships').delete(added.id)).resolves.toBe(true);
	});

	it('nur der Admin ändert Rollen', async () => {
		await expectDenied(
			as.adult.collection('memberships').update(membership.adult, { role: 'admin' })
		);
		await expectDenied(
			as.child.collection('memberships').update(membership.child, { role: 'adult' })
		);
		await as.admin.collection('memberships').update(membership.child, { role: 'adult' });
		const back = await as.admin
			.collection('memberships')
			.update(membership.child, { role: 'child' });
		expect(back.role).toBe('child');
	});

	it('jedes Mitglied ändert eigenen Anzeigenamen und Farbe, aber keine fremden', async () => {
		const own = await as.child
			.collection('memberships')
			.update(membership.child, { display_name: 'Mia', color: '#7a3bd1' });
		expect(own).toMatchObject({ display_name: 'Mia', color: '#7a3bd1' });
		await expectDenied(
			as.child.collection('memberships').update(membership.adult, { display_name: 'Papa' })
		);
	});

	it('nur der Admin entfernt Mitglieder', async () => {
		await expectDenied(as.adult.collection('memberships').delete(membership.child));
		await expectDenied(
			as.adult
				.collection('memberships')
				.update(membership.adult, { deleted_at: new Date().toISOString() })
		);
	});
});

describe('Einladungen (invites)', () => {
	const invite = () => ({
		household: householdA,
		role: 'adult',
		token_hash: 'hash-' + Math.random(),
		expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
		uses_left: 1
	});

	it('nur der Admin legt an, Hashes bleiben unsichtbar', async () => {
		await expectDenied(as.adult.collection('invites').create(invite()));
		await expectDenied(as.child.collection('invites').create(invite()));
		const created = await as.admin.collection('invites').create(invite());
		expect(created.token_hash).toBeUndefined();
	});

	it.each(['adult', 'child'] as const)('%s sieht keine Einladungen', async (role) => {
		expect(await as[role].collection('invites').getFullList()).toEqual([]);
	});
});

// Termine, Rezepte und Essensplan: alle sehen, Admin und Erwachsene bearbeiten, Kinder nicht.
describe.each([
	{
		name: 'recipes',
		create: () => ({ household: householdA, title: 'Suppe' }),
		change: { title: 'Linsensuppe' }
	},
	{
		name: 'recipe_ingredients',
		create: () => ({ recipe: recipeA.id, name: 'Zucchini', amount: 2, unit: 'Stück' }),
		change: { amount: 3 }
	},
	{
		name: 'meal_plan_entries',
		create: () => ({
			household: householdA,
			date: '2026-10-17',
			slot: 'dinner',
			recipe: recipeA.id
		}),
		change: { note: 'mit Salat' }
	},
	{
		name: 'events',
		create: () => ({
			household: householdA,
			title: 'Zahnarzt',
			start: '2026-10-17 14:00:00.000Z',
			participants: [membership.child]
		}),
		change: { location: 'Praxis Dr. Haas' }
	}
])('$name', ({ name, create, change }) => {
	let record: RecordModel;

	beforeAll(async () => {
		record = await as.adult.collection(name).create(create());
	});

	it.each(['admin', 'adult', 'child'] as const)('%s sieht Einträge', async (role) => {
		expect((await as[role].collection(name).getOne(record.id)).id).toBe(record.id);
	});

	it('Admin und Erwachsene legen an, ändern und löschen', async () => {
		for (const role of ['admin', 'adult'] as const) {
			const created = await as[role].collection(name).create(create());
			await as[role].collection(name).update(created.id, change);
			await expect(as[role].collection(name).delete(created.id)).resolves.toBe(true);
		}
	});

	it('Kinder legen nicht an, ändern nicht und löschen nicht', async () => {
		await expectDenied(as.child.collection(name).create(create()));
		await expectDenied(as.child.collection(name).update(record.id, change));
		await expectDenied(
			as.child.collection(name).update(record.id, { deleted_at: new Date().toISOString() })
		);
		await expectDenied(as.child.collection(name).delete(record.id));
	});
});

describe('Einkaufsliste (shopping_items)', () => {
	const item = (name: string) => ({ household: householdA, name });

	it.each(['admin', 'adult', 'child'] as const)('%s fügt Artikel hinzu', async (role) => {
		const created = await as[role]
			.collection('shopping_items')
			.create({ ...item('Milch'), added_by: membership.admin });
		expect(created.added_by).toBe(membership[role]);
	});

	it.each(['admin', 'adult', 'child'] as const)(
		'%s hakt fremde Artikel ab, der Server setzt checked_by und checked_at',
		async (role) => {
			const other = role === 'adult' ? 'admin' : 'adult';
			const created = await as[other].collection('shopping_items').create(item('Brot'));
			const checked = await as[role]
				.collection('shopping_items')
				.update(created.id, { checked: true, checked_by: membership.admin });
			expect(checked.checked_by).toBe(membership[role]);
			expect(checked.checked_at).not.toBe('');

			const unchecked = await as[role]
				.collection('shopping_items')
				.update(created.id, { checked: false });
			expect(unchecked).toMatchObject({ checked_by: '', checked_at: '' });
		}
	);

	it('Admin und Erwachsene ändern und löschen alle Artikel', async () => {
		const fromChild = await as.child.collection('shopping_items').create(item('Saft'));
		await as.adult.collection('shopping_items').update(fromChild.id, { name: 'Apfelsaft' });
		await expect(as.admin.collection('shopping_items').delete(fromChild.id)).resolves.toBe(true);
	});

	it('Kinder ändern und löschen nur eigene Artikel', async () => {
		const own = await as.child.collection('shopping_items').create(item('Kekse'));
		const renamed = await as.child
			.collection('shopping_items')
			.update(own.id, { name: 'Haferkekse', amount: 2 });
		expect(renamed.name).toBe('Haferkekse');
		await expect(as.child.collection('shopping_items').delete(own.id)).resolves.toBe(true);

		const foreign = await as.adult.collection('shopping_items').create(item('Kaffee'));
		await expectDenied(as.child.collection('shopping_items').update(foreign.id, { name: 'Kakao' }));
		await expectDenied(
			as.child.collection('shopping_items').update(foreign.id, { checked: true, amount: 5 })
		);
		await expectDenied(
			as.child
				.collection('shopping_items')
				.update(foreign.id, { deleted_at: new Date().toISOString() })
		);
		await expectDenied(as.child.collection('shopping_items').delete(foreign.id));
	});

	it('added_by lässt sich nachträglich nicht ändern', async () => {
		const foreign = await as.adult.collection('shopping_items').create(item('Tee'));
		const result = await as.child
			.collection('shopping_items')
			.update(foreign.id, { checked: true })
			.then((r) => r.added_by);
		expect(result).toBe(membership.adult);
		await expectDenied(
			as.child.collection('shopping_items').update(foreign.id, { added_by: membership.child })
		);
	});
});

describe('Aufgaben (tasks, task_completions)', () => {
	let unassigned: RecordModel;
	let forChild: RecordModel;
	let forAdult: RecordModel;

	beforeAll(async () => {
		const tasks = as.adult.collection('tasks');
		unassigned = await tasks.create({ household: householdA, title: 'Blumen gießen' });
		forChild = await tasks.create({
			household: householdA,
			title: 'Zimmer aufräumen',
			assignees: [membership.child]
		});
		forAdult = await tasks.create({
			household: householdA,
			title: 'Steuer',
			assignees: [membership.adult]
		});
	});

	it('Admin und Erwachsene legen an und weisen zu, Kinder nicht', async () => {
		const created = await as.admin.collection('tasks').create({
			household: householdA,
			title: 'Müll',
			assignees: [membership.child, membership.adult]
		});
		await as.adult.collection('tasks').update(created.id, { assignees: [membership.child] });
		await expectDenied(
			as.child.collection('tasks').create({ household: householdA, title: 'Eis essen' })
		);
		await expectDenied(
			as.child.collection('tasks').update(unassigned.id, { assignees: [membership.child] })
		);
	});

	it('Kinder haken eigene und nicht zugewiesene Aufgaben ab', async () => {
		for (const task of [unassigned, forChild]) {
			const done = await as.child.collection('tasks').update(task.id, { status: 'done' });
			expect(done.status).toBe('done');
		}
	});

	it('Kinder haken keine Aufgaben anderer ab und ändern sonst nichts', async () => {
		await expectDenied(as.child.collection('tasks').update(forAdult.id, { status: 'done' }));
		await expectDenied(
			as.child.collection('tasks').update(unassigned.id, { status: 'open', title: 'Kakteen' })
		);
		await expectDenied(as.child.collection('tasks').delete(unassigned.id));
	});

	it('Erledigt-Einträge: Kinder nur für sich und erlaubte Aufgaben', async () => {
		const now = new Date().toISOString();
		const completions = as.child.collection('task_completions');

		const own = await completions.create({
			task: unassigned.id,
			membership: membership.child,
			completed_at: now
		});
		await completions.create({
			task: forChild.id,
			membership: membership.child,
			completed_at: now
		});
		await expectDenied(
			completions.create({ task: forAdult.id, membership: membership.child, completed_at: now })
		);
		await expectDenied(
			completions.create({ task: unassigned.id, membership: membership.adult, completed_at: now })
		);
		await expect(completions.delete(own.id)).resolves.toBe(true);
	});

	it('Erwachsene tragen für jedes Mitglied ein, Kinder löschen keine fremden Einträge', async () => {
		const forMia = await as.adult.collection('task_completions').create({
			task: forAdult.id,
			membership: membership.child,
			completed_at: new Date().toISOString()
		});
		const byAdult = await as.adult.collection('task_completions').create({
			task: forAdult.id,
			membership: membership.adult,
			completed_at: new Date().toISOString()
		});
		await expectDenied(as.child.collection('task_completions').delete(byAdult.id));
		await expect(as.adult.collection('task_completions').delete(forMia.id)).resolves.toBe(true);
	});
});
