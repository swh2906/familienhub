// Startet ein echtes PocketBase für Tests: leerer temporärer Datenordner, freier Port,
// Migrationen und Hooks aus dem Projekt. Nach den Tests wird alles wieder entfernt.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PB_BINARY, PB_DIR } from '../../scripts/lib/paths.ts';

export interface TestServer {
	url: string;
	stop(): Promise<void>;
}

/** Lässt das Betriebssystem einen freien Port wählen. */
async function freePort(): Promise<number> {
	const server = createServer();
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	server.close();
	if (address === null || typeof address === 'string')
		throw new Error('Kein freier Port gefunden.');
	return address.port;
}

/** Startet PocketBase auf `fixedPort` oder, ohne Angabe, auf einem freien Port. */
export async function startPocketBase(fixedPort?: number): Promise<TestServer> {
	if (!existsSync(PB_BINARY)) {
		throw new Error('PocketBase fehlt. Bitte zuerst ausführen: pnpm pb:download');
	}

	const dataDir = mkdtempSync(path.join(os.tmpdir(), 'familienhub-pb-'));
	const port = fixedPort ?? (await freePort());
	const url = `http://127.0.0.1:${port}`;

	const child = spawn(
		PB_BINARY,
		[
			'serve',
			`--http=127.0.0.1:${port}`,
			`--dir=${dataDir}`,
			`--migrationsDir=${path.join(PB_DIR, 'pb_migrations')}`,
			`--hooksDir=${path.join(PB_DIR, 'pb_hooks')}`
		],
		{ stdio: ['ignore', 'pipe', 'pipe'] }
	);
	let output = '';
	child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
	child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

	const deadline = Date.now() + 20_000;
	while (true) {
		if (child.exitCode !== null) {
			throw new Error(`PocketBase wurde beendet (Code ${child.exitCode}):\n${output}`);
		}
		try {
			const response = await fetch(`${url}/api/health`);
			if (response.ok) break;
		} catch {
			// Server lauscht noch nicht.
		}
		if (Date.now() > deadline) {
			child.kill();
			throw new Error(`PocketBase ist nicht rechtzeitig gestartet:\n${output}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	return {
		url,
		async stop() {
			if (child.exitCode === null) {
				child.kill();
				await once(child, 'exit');
			}
			// Unter Windows ist die Datenbankdatei manchmal noch kurz gesperrt.
			rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
		}
	};
}
