// Legt eine Demo-Familie mit Beispieldaten an (nur für die Entwicklung).
// Voraussetzung: PocketBase läuft (pnpm dev). Aufruf: pnpm seed [URL]
// Läuft über die normale API mit den Rechten der Demo-Konten, nicht als Superuser.
import PocketBase, { ClientResponseError } from 'pocketbase';
import { PB_PORT } from './lib/paths.ts';

const url = process.argv[2] ?? `http://127.0.0.1:${PB_PORT}`;
const PASSWORD = 'demo-passwort';

const accounts = {
	admin: { email: 'julia@demo.familienhub.test', name: 'Julia', color: '#2453c7' },
	adult: { email: 'tom@demo.familienhub.test', name: 'Tom', color: '#18733b' },
	child: { username: 'mia', name: 'Mia', color: '#7a3bd1' }
} as const;

type Role = keyof typeof accounts;

/** Kalendertag in lokaler Zeit als JJJJ-MM-TT, verschoben um `offset` Tage. */
function day(offset = 0): string {
	const date = new Date();
	date.setDate(date.getDate() + offset);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Zeitpunkt heute (lokal) um `hour` Uhr als ISO-String. */
function todayAt(hour: number, minute = 0): string {
	const date = new Date();
	date.setHours(hour, minute, 0, 0);
	return date.toISOString();
}

async function signUp(role: Role): Promise<{ pb: PocketBase; id: string }> {
	const pb = new PocketBase(url);
	pb.autoCancellation(false);
	const account = accounts[role];
	const login = 'email' in account ? account.email : account.username;
	const user = await pb.collection('users').create({
		...account,
		password: PASSWORD,
		passwordConfirm: PASSWORD
	});
	await pb.collection('users').authWithPassword(login, PASSWORD);
	return { pb, id: user.id };
}

async function main(): Promise<void> {
	try {
		await fetch(`${url}/api/health`);
	} catch {
		throw new Error(`PocketBase ist unter ${url} nicht erreichbar. Läuft pnpm dev?`);
	}

	const probe = new PocketBase(url);
	try {
		await probe.collection('users').authWithPassword(accounts.admin.email, PASSWORD);
		console.log('Die Demo-Familie existiert bereits. Nichts zu tun.');
		return;
	} catch {
		// Noch nicht angelegt.
	}

	const admin = await signUp('admin');
	const adult = await signUp('adult');
	const child = await signUp('child');

	const household = await admin.pb
		.collection('households')
		.create({ name: 'Familie Demo', timezone: 'Europe/Berlin' });

	// Die Admin-Mitgliedschaft legt der Server an; Erwachsene und Kinder fügt der Admin hinzu.
	const membership: Record<Role, string> = {
		admin: (await admin.pb.collection('memberships').getFirstListItem(`user = "${admin.id}"`)).id,
		adult: '',
		child: ''
	};
	for (const [role, user] of [
		['adult', adult],
		['child', child]
	] as const) {
		membership[role] = (
			await admin.pb
				.collection('memberships')
				.create({ user: user.id, household: household.id, role })
		).id;
	}
	for (const role of Object.keys(accounts) as Role[]) {
		await admin.pb.collection('memberships').update(membership[role], {
			display_name: accounts[role].name,
			color: accounts[role].color
		});
	}

	const h = household.id;
	const lasagne = await adult.pb.collection('recipes').create({
		household: h,
		title: 'Gemüse-Lasagne',
		servings: 4,
		tags: ['vegetarisch', 'Ofen'],
		is_favorite: true,
		instructions: 'Gemüse anbraten, mit Tomatensoße und Platten schichten, 40 Minuten backen.'
	});
	const ingredients = [
		{ name: 'Lasagneplatten', amount: 500, unit: 'g', category: 'Trockenware' },
		{ name: 'Zucchini', amount: 2, unit: 'Stück', category: 'Obst & Gemüse' },
		{ name: 'Passierte Tomaten', amount: 700, unit: 'g', category: 'Konserven' },
		{ name: 'Mozzarella', amount: 2, unit: 'Stück', category: 'Kühlregal' }
	];
	for (const [sort, ingredient] of ingredients.entries()) {
		await adult.pb
			.collection('recipe_ingredients')
			.create({ ...ingredient, recipe: lasagne.id, sort });
	}
	const pancakes = await admin.pb.collection('recipes').create({
		household: h,
		title: 'Pfannkuchen',
		servings: 4,
		tags: ['schnell', 'Kinder']
	});

	const dinner = await adult.pb
		.collection('meal_plan_entries')
		.create({ household: h, date: day(), slot: 'dinner', recipe: lasagne.id, servings: 4 });
	await admin.pb
		.collection('meal_plan_entries')
		.create({ household: h, date: day(1), slot: 'lunch', recipe: pancakes.id });

	await adult.pb.collection('shopping_items').create({
		household: h,
		name: 'Lasagneplatten',
		amount: 500,
		unit: 'g',
		category: 'Trockenware',
		meal_plan_entry: dinner.id
	});
	await admin.pb
		.collection('shopping_items')
		.create({ household: h, name: 'Hafermilch', amount: 2, unit: 'l', category: 'Kühlregal' });
	await child.pb
		.collection('shopping_items')
		.create({ household: h, name: 'Kekse', category: 'Süßes' });
	await adult.pb
		.collection('shopping_items')
		.create({ household: h, name: 'Zucchini', amount: 2, unit: 'Stück', checked: true });

	await admin.pb.collection('events').create({
		household: h,
		title: 'Zahnarzt Mia',
		start: todayAt(16),
		end: todayAt(16, 45),
		location: 'Praxis Dr. Haas',
		participants: [membership.admin, membership.child],
		reminder_minutes: 60
	});
	await adult.pb.collection('events').create({
		household: h,
		title: 'Schwimmkurs',
		start: todayAt(15),
		end: todayAt(16, 30),
		rrule: 'FREQ=WEEKLY;COUNT=10',
		participants: [membership.adult, membership.child]
	});
	await admin.pb.collection('events').create({
		household: h,
		title: 'Oma Gerdas Geburtstag',
		start: todayAt(0),
		all_day: true,
		rrule: 'FREQ=YEARLY'
	});

	await admin.pb.collection('tasks').create({
		household: h,
		title: 'Spülmaschine ausräumen',
		due_date: day(),
		status: 'open',
		points: 2,
		assignees: [membership.child]
	});
	await admin.pb.collection('tasks').create({
		household: h,
		title: 'Blumen gießen',
		status: 'open',
		rrule: 'FREQ=WEEKLY;BYDAY=MO,TH',
		points: 1
	});
	await adult.pb.collection('tasks').create({
		household: h,
		title: 'Elternbrief unterschreiben',
		due_date: day(),
		status: 'open',
		assignees: [membership.adult]
	});

	console.log(`Demo-Familie angelegt (${url}). Passwort für alle: ${PASSWORD}`);
	console.log(`  Admin:       ${accounts.admin.email}`);
	console.log(`  Erwachsener: ${accounts.adult.email}`);
	console.log(`  Kind:        Benutzername ${accounts.child.username}`);
}

main().catch((error: unknown) => {
	const message =
		error instanceof ClientResponseError
			? `${error.message} ${JSON.stringify(error.response)}`
			: String(error);
	console.error(`Seed fehlgeschlagen: ${message}`);
	process.exitCode = 1;
});
