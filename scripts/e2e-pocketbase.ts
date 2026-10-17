// Startet für die E2E-Tests ein leeres PocketBase (temporärer Datenordner) und hält es am Laufen,
// bis Playwright den Prozess beendet. Aufruf: node scripts/e2e-pocketbase.ts [port]
import { startPocketBase } from '../tests/integration/pocketbase-server.ts';

const port = Number(process.argv[2] ?? 8091);
const server = await startPocketBase(port);
console.log(`E2E-PocketBase läuft auf ${server.url}`);

async function stop(): Promise<void> {
	await server.stop();
	process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Hält den Prozess offen, bis ein Signal kommt.
setInterval(() => {}, 1 << 30);
