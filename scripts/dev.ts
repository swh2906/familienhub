// Startet PocketBase (Port 8090) und den Vite-Dev-Server parallel.
// Strg+C beendet beide; stürzt einer ab, wird auch der andere beendet.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PB_BINARY, PB_DIR, PB_PORT, ROOT } from './lib/paths.ts';

if (!existsSync(PB_BINARY)) {
	console.error('PocketBase fehlt. Bitte zuerst ausführen: pnpm pb:download');
	process.exit(1);
}

const children: ChildProcess[] = [];
let shuttingDown = false;

start('pb', PB_BINARY, [
	'serve',
	`--http=127.0.0.1:${PB_PORT}`,
	`--dir=${path.join(PB_DIR, 'pb_data')}`,
	`--migrationsDir=${path.join(PB_DIR, 'pb_migrations')}`,
	`--hooksDir=${path.join(PB_DIR, 'pb_hooks')}`,
	`--publicDir=${path.join(PB_DIR, 'pb_public')}`
]);

// Vite direkt über Node starten statt über eine Shell: funktioniert überall gleich.
start('web', process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev']);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function start(name: string, command: string, args: string[]): void {
	const child = spawn(command, args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
	children.push(child);
	child.stdout?.on('data', (chunk: Buffer) => write(process.stdout, name, chunk));
	child.stderr?.on('data', (chunk: Buffer) => write(process.stderr, name, chunk));
	child.on('exit', (code) => {
		if (!shuttingDown) {
			console.error(`[${name}] wurde beendet (Code ${code ?? '?'}), stoppe alles.`);
			shutdown(code ?? 1);
		}
	});
}

function write(stream: NodeJS.WriteStream, name: string, chunk: Buffer): void {
	const lines = chunk.toString().split(/\r?\n/);
	if (lines.at(-1) === '') lines.pop();
	for (const line of lines) stream.write(`[${name}] ${line}\n`);
}

function shutdown(code: number): void {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const child of children) {
		if (child.exitCode === null) child.kill();
	}
	process.exitCode = code;
}
