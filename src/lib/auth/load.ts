// Gemeinsamer Teil der `load`-Funktionen: Sitzung wiederherstellen, ggf. umleiten.
import { redirect } from '@sveltejs/kit';
import { redirectFor, type PageKind } from './guard.js';
import { session } from './session.svelte.js';

export async function guardPage(kind: PageKind, url: URL): Promise<void> {
	await session.ready();
	const target = redirectFor(
		kind,
		{ loggedIn: session.user !== null, hasHousehold: session.householdId !== null },
		url.pathname + url.search,
		url.searchParams.get('next')
	);
	if (target) redirect(307, target);
}
