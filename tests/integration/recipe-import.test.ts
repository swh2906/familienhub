// Rezept-Import per Link: Rechte, Heimnetz-Sperre, Seiten mit und ohne Rezeptdaten.
// Eine kleine lokale Testseite ersetzt echte Rezeptseiten (127.0.0.1 ist nur hier erlaubt).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHousehold, createInvite, expectDenied, redeem, signUp } from './helpers.ts';
import { startPocketBase, type TestServer } from './pocketbase-server.ts';

const RECIPE_PAGE = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Test"}</script>
<script type="application/ld+json">{ kaputt </script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
	{"@type":"BreadcrumbList"},
	{"@type":["Recipe","NewsArticle"],"name":"Linsensuppe","recipeYield":"4 Portionen",
	 "totalTime":"PT45M","recipeIngredient":["250 g Linsen","1 Zwiebel"],
	 "recipeInstructions":[{"@type":"HowToStep","text":"Kochen."}],
	 "author":{"@type":"Person","name":"Geheim"},"review":[{"reviewBody":"lang"}]}
]}
</script></head><body>Suppe</body></html>`;

let pb: TestServer;
let site: Server;
let siteUrl: string;

beforeAll(async () => {
	site = createServer((req, res) => {
		if (req.url === '/rezept') {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(RECIPE_PAGE);
		} else if (req.url === '/blog') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end('<html><body><h1>Nur Text</h1></body></html>');
		} else {
			res.writeHead(404);
			res.end();
		}
	});
	await new Promise<void>((done) => site.listen(0, '127.0.0.1', done));
	siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
	pb = await startPocketBase(undefined, { HOMI_IMPORT_ALLOW_HOSTS: '127.0.0.1' });
}, 60_000);

afterAll(async () => {
	await pb?.stop();
	await new Promise((done) => site?.close(done));
});

function importFrom(client: PocketBase, household: string, url: string) {
	return client.send<{ recipe: Record<string, unknown>; url: string }>('/api/fh/recipes/import', {
		method: 'POST',
		body: { household, url }
	});
}

async function family(prefix: string) {
	const admin = await signUp(pb.url, { email: `${prefix}@import.test`, name: 'Julia' });
	const { household } = await createHousehold(admin.pb, 'Familie Import');
	const child = await signUp(pb.url, { username: `${prefix}kind`, name: 'Mia' });
	await redeem(child.pb, { token: (await createInvite(admin.pb, household.id, 'child')).token });
	return { admin: admin.pb, child: child.pb, household: household.id as string };
}

describe('Rezept-Import per Link', () => {
	it('liefert nur die Rezeptfelder aus JSON-LD (@graph, @type als Liste)', async () => {
		const f = await family('a');
		const result = await importFrom(f.admin, f.household, `${siteUrl}/rezept`);
		expect(result.url).toBe(`${siteUrl}/rezept`);
		expect(result.recipe).toEqual({
			name: 'Linsensuppe',
			recipeYield: '4 Portionen',
			totalTime: 'PT45M',
			recipeIngredient: ['250 g Linsen', '1 Zwiebel'],
			recipeInstructions: [{ '@type': 'HowToStep', text: 'Kochen.' }]
		});
	});

	it('Seite ohne Rezept oder nicht erreichbar: verständliche Meldung', async () => {
		const f = await family('b');
		await expect(importFrom(f.admin, f.household, `${siteUrl}/blog`)).rejects.toMatchObject({
			status: 400,
			response: { message: expect.stringContaining('kein Rezept gefunden') }
		});
		await expect(importFrom(f.admin, f.household, `${siteUrl}/fehlt`)).rejects.toMatchObject({
			status: 400,
			response: { message: expect.stringContaining('Fehler 404') }
		});
	});

	it('Kinder und Fremde dürfen nicht, ohne Anmeldung auch nicht', async () => {
		const f = await family('c');
		const other = await family('d');
		await expectDenied(importFrom(f.child, f.household, `${siteUrl}/rezept`), [403]);
		await expectDenied(importFrom(other.admin, f.household, `${siteUrl}/rezept`), [403]);
		const { default: PocketBaseClient } = await import('pocketbase');
		await expectDenied(
			importFrom(new PocketBaseClient(pb.url), f.household, `${siteUrl}/rezept`),
			[401]
		);
	});

	it('sperrt Heimnetz-Adressen, fremde Schemata und Zugangsdaten im Link', async () => {
		const f = await family('e');
		for (const url of [
			'http://localhost/x',
			'http://192.168.1.10/rezept',
			'http://10.0.0.1/',
			'http://172.20.0.5/',
			'http://100.101.102.103/',
			'http://169.254.169.254/latest',
			'http://127.0.0.2/',
			'http://2130706433/',
			'http://0x7f.0.0.1/',
			'http://[::1]/',
			'http://nas.local/',
			'http://homi.tail1234.ts.net/',
			'http://router/',
			'http://example.org:8080/',
			'file:///etc/passwd',
			'ftp://example.org/',
			'https://user:pw@example.org/',
			'kein link'
		]) {
			await expect(importFrom(f.admin, f.household, url), url).rejects.toMatchObject({
				status: 400,
				response: { message: expect.stringMatching(/Heimnetz|vollständigen Link/) }
			});
		}
	});

	it('drosselt nach 20 Abrufen pro Stunde', async () => {
		const f = await family('g');
		for (let i = 0; i < 20; i++) {
			await importFrom(f.admin, f.household, `${siteUrl}/rezept`);
		}
		await expect(importFrom(f.admin, f.household, `${siteUrl}/rezept`)).rejects.toMatchObject({
			status: 429
		});
	});
});
