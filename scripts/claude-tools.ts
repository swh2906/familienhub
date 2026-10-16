// Hilfsbefehle für Claude Code und neue Geräte: doctor, sync-check, clean, index.
// Aufruf über pnpm (z. B. `pnpm run doctor`), plattformneutral und ohne Abhängigkeiten.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PB_BINARY, ROOT } from './lib/paths.ts';
import { checkMcpConfig, MUST_NOT_TRACK, scanText } from './lib/sync-check.ts';

const [command = '', ...args] = process.argv.slice(2);

function run(cmd: string, cmdArgs: string[]): { code: number; out: string } {
	const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8' });
	return { code: result.status ?? 127, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function hasTool(name: string): boolean {
	const exts =
		process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD').split(';') : [''];
	const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
	return dirs.some((dir) => exts.some((ext) => existsSync(path.join(dir, name + ext))));
}

function readJson<T>(file: string): T | undefined {
	const full = path.join(ROOT, file);
	return existsSync(full) ? (JSON.parse(readFileSync(full, 'utf8')) as T) : undefined;
}

function dirSize(dir: string): number {
	return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
		const full = path.join(dir, entry.name);
		return sum + (entry.isDirectory() ? dirSize(full) : statSync(full).size);
	}, 0);
}

function doctor(): void {
	const tools = ['git', 'gh', 'node', 'pnpm', 'rg', 'fd', 'jq', 'docker', 'podman', 'claude'];
	console.log('tools   ', tools.map((t) => `${t}:${hasTool(t) ? 'ok' : '-'}`).join(' '));
	const engines = readJson<{ engines?: { node?: string } }>('package.json')?.engines?.node ?? '-';
	console.log('node    ', `${process.version} (engines: ${engines})`);
	const inContainer =
		existsSync('/.dockerenv') || Boolean(process.env.REMOTE_CONTAINERS || process.env.CODESPACES);
	console.log('env     ', `os=${process.platform} container=${inContainer ? 'yes' : 'no'}`);
	for (const name of ['GITHUB_PERSONAL_ACCESS_TOKEN', 'ANTHROPIC_API_KEY']) {
		console.log('secret  ', `${name}=${process.env[name] ? 'set' : 'unset'}`);
	}
	const user = run('git', ['config', '--get', 'user.name']).out;
	const email = run('git', ['config', '--get', 'user.email']).out;
	// ssh-add -l: 0 = Schlüssel geladen, 1 = Agent ohne Schlüssel, sonst kein Agent
	const agent = Boolean(process.env.SSH_AUTH_SOCK) || [0, 1].includes(run('ssh-add', ['-l']).code);
	console.log('git     ', `user=${user && email ? 'ok' : 'FEHLT'} ssh-agent=${agent ? 'ok' : '-'}`);
	console.log('github  ', `gh-auth=${run('gh', ['auth', 'status']).code === 0 ? 'ok' : '-'}`);
	console.log(
		'projekt ',
		`node_modules=${existsSync(path.join(ROOT, 'node_modules')) ? 'ok' : '-'} pocketbase=${existsSync(PB_BINARY) ? 'ok' : '- (pnpm pb:download)'}`
	);
	const gitignore = existsSync(path.join(ROOT, '.gitignore'))
		? readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
		: '';
	console.log(
		'index   ',
		`.code-graph ignoriert=${gitignore.includes('.code-graph') ? 'ja' : 'NEIN'}`
	);
	const mcp = readJson<{ mcpServers?: Record<string, unknown> }>('.mcp.json')?.mcpServers ?? {};
	const plugins =
		readJson<{ enabledPlugins?: Record<string, boolean> }>('.claude/settings.json')
			?.enabledPlugins ?? {};
	const enabled = Object.keys(plugins).filter((name) => plugins[name]);
	console.log(
		'claude  ',
		`plugins=${enabled.join(',') || 'keine'} projekt-mcp=${Object.keys(mcp).join(',') || 'keine'}`
	);
}

function syncCheck(): void {
	const listed = run('git', ['ls-files', '--cached', '--others', '--exclude-standard']);
	const files = listed.code === 0 ? listed.out.split('\n').filter(Boolean) : [];
	const issues = files
		.filter((f) => MUST_NOT_TRACK.includes(f))
		.map((f) => `${f} darf nicht versioniert werden`);
	for (const file of files) {
		const full = path.join(ROOT, file);
		if (!existsSync(full) || statSync(full).size > 1_000_000) continue;
		const text = readFileSync(full, 'utf8');
		if (text.includes('\u0000')) continue; // Binärdatei
		issues.push(...scanText(file, text));
	}
	const mcp = readJson<Parameters<typeof checkMcpConfig>[0]>('.mcp.json');
	if (mcp) issues.push(...checkMcpConfig(mcp));
	console.log(`sync-check: ${files.length} Dateien, ${issues.length} Problem(e)`);
	for (const issue of issues.slice(0, 30)) console.log(`  ${issue}`);
	process.exitCode = issues.length ? 1 : 0;
}

function clean(): void {
	const dirs = ['build', '.svelte-kit', 'test-results', 'playwright-report', 'blob-report'];
	if (args.includes('--all')) dirs.push('node_modules', '.code-graph');
	for (const dir of dirs) {
		const full = path.join(ROOT, dir);
		if (existsSync(full)) {
			rmSync(full, { recursive: true, force: true });
			console.log(`entfernt: ${dir}`);
		}
	}
}

function index(): void {
	const db = path.join(ROOT, '.code-graph');
	if (args.includes('--rebuild') && existsSync(db)) {
		rmSync(db, { recursive: true, force: true });
		console.log(
			'.code-graph/ entfernt (wird beim nächsten Start des code-graph-MCP neu aufgebaut)'
		);
	} else if (existsSync(db)) {
		console.log(`.code-graph/ vorhanden (${Math.round(dirSize(db) / 1024)} KiB)`);
	} else {
		console.log('.code-graph/ fehlt (wird beim Start des code-graph-MCP angelegt)');
	}
}

const commands: Record<string, () => void> = { doctor, 'sync-check': syncCheck, clean, index };
const selected = commands[command];
if (!selected) {
	console.log(`Befehle: ${Object.keys(commands).join(', ')}`);
	process.exitCode = 2;
} else {
	selected();
}
