// Testlauf für das Docker-Image: bauen, mit 128 MB RAM starten, App und API prüfen, Daten über
// einen Neustart behalten, Speicherverbrauch anzeigen. Räumt Container und Volume danach auf.
// Aufruf: pnpm docker:smoke (Docker muss laufen)
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { ROOT } from './lib/paths.ts';

const IMAGE = 'familienhub:smoke';
const NAME = `familienhub-smoke-${Date.now().toString(36)}`;
const VOLUME = `${NAME}-data`;

function docker(args: string[], options: { quiet?: boolean } = {}): string {
	const result = spawnSync('docker', args, {
		cwd: ROOT,
		encoding: 'utf8',
		stdio: options.quiet ? 'pipe' : ['ignore', 'pipe', 'inherit']
	});
	if (result.status !== 0) {
		throw new Error(`docker ${args.join(' ')} fehlgeschlagen:\n${result.stderr ?? ''}`);
	}
	return result.stdout.trim();
}

async function freePort(): Promise<number> {
	const server = createServer().listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	server.close();
	if (address === null || typeof address === 'string') throw new Error('Kein freier Port.');
	return address.port;
}

async function waitHealthy(url: string): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(`${url}/api/health`)).ok) return;
		} catch {
			// Startet noch.
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	throw new Error('Container ist nicht rechtzeitig gestartet.');
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: { 'content-type': 'application/json', ...init.headers }
	});
	if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
	return (await response.json()) as T;
}

function check(label: string, ok: boolean): void {
	if (!ok) throw new Error(`Fehlgeschlagen: ${label}`);
	console.log(`✓ ${label}`);
}

console.log('Baue Image …');
docker(['build', '-q', '-t', IMAGE, '.']);
const port = await freePort();
const url = `http://127.0.0.1:${port}`;

try {
	docker(['volume', 'create', VOLUME], { quiet: true });
	docker(
		[
			'run',
			'-d',
			'--name',
			NAME,
			'--memory',
			'128m',
			'-p',
			`127.0.0.1:${port}:8090`,
			'-v',
			`${VOLUME}:/pb/pb_data`,
			IMAGE
		],
		{ quiet: true }
	);
	await waitHealthy(url);
	check('PocketBase startet mit 128 MB RAM', true);

	const html = await (await fetch(`${url}/einkauf`)).text();
	check('App wird ausgeliefert (auch Unterseiten)', html.toLowerCase().includes('<!doctype html'));
	check('Manifest vorhanden', (await fetch(`${url}/manifest.webmanifest`)).ok);
	check('Service Worker vorhanden', (await fetch(`${url}/service-worker.js`)).ok);

	const email = 'smoke@familienhub.test';
	const password = 'smoke-passwort-123';
	await request(`${url}/api/collections/users/records`, {
		method: 'POST',
		body: JSON.stringify({ email, name: 'Smoke', password, passwordConfirm: password })
	});
	const login = async () =>
		(
			await request<{ token: string }>(`${url}/api/collections/users/auth-with-password`, {
				method: 'POST',
				body: JSON.stringify({ identity: email, password })
			})
		).token;
	await request(`${url}/api/fh/households`, {
		method: 'POST',
		headers: { authorization: await login() },
		body: JSON.stringify({ name: 'Familie Smoke' })
	});
	check('Migrationen und Hooks aktiv (Familienraum angelegt)', true);

	docker(['restart', NAME], { quiet: true });
	await waitHealthy(url);
	const list = await request<{ items: { name: string }[] }>(
		`${url}/api/collections/households/records`,
		{ headers: { authorization: await login() } }
	);
	check(
		'Daten überstehen einen Neustart',
		list.items.some((h) => h.name === 'Familie Smoke')
	);

	const memory = docker(['stats', '--no-stream', '--format', '{{.MemUsage}}', NAME], {
		quiet: true
	});
	console.log(`Speicher: ${memory}`);
} finally {
	spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' });
	spawnSync('docker', ['volume', 'rm', VOLUME], { stdio: 'ignore' });
}
