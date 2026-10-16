// PostToolUse: format + lint only the edited file. Silent on success and when tools are missing;
// on lint errors reports at most 15 lines (exit 2) so Claude can fix them without log floods.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const file = input.tool_input?.file_path;
if (!file || !existsSync(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const isWin = process.platform === 'win32';

function localBin(name) {
	const p = join(root, 'node_modules', '.bin', isWin ? `${name}.cmd` : name);
	return existsSync(p) ? p : null;
}

function exec(cmd, args) {
	if (!cmd) return null;
	const shell = isWin && cmd.endsWith('.cmd');
	const argv = shell ? args.map((a) => `"${a}"`) : args;
	const r = spawnSync(shell ? `"${cmd}"` : cmd, argv, {
		cwd: root,
		encoding: 'utf8',
		shell,
		timeout: 30000
	});
	return r.error ? null : r; // missing tool -> skip silently
}

const ext = extname(file).toLowerCase();
const PRETTIER = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.jsx',
	'.ts',
	'.tsx',
	'.svelte',
	'.vue',
	'.json',
	'.css',
	'.scss',
	'.html',
	'.yml',
	'.yaml'
]);
let lint = null;

if (ext === '.py') {
	exec('ruff', ['format', '-q', file]);
	lint = exec('ruff', ['check', '--fix', '-q', file]);
} else if (PRETTIER.has(ext)) {
	exec(localBin('prettier'), ['--write', '--log-level', 'warn', file]);
	if (/\.([cm]?[jt]sx?|svelte|vue)$/.test(ext)) lint = exec(localBin('eslint'), ['--fix', file]);
} else if (ext === '.go') {
	exec('gofmt', ['-w', file]);
} else if (ext === '.rs') {
	exec('rustfmt', ['--edition', '2021', file]);
} else if (ext === '.sh') {
	exec('shfmt', ['-w', file]);
	lint = exec('shellcheck', ['-f', 'gcc', file]);
}

if (lint && lint.status !== 0) {
	const lines = `${lint.stdout ?? ''}${lint.stderr ?? ''}`.trim().split('\n');
	process.stderr.write(
		lines.slice(0, 15).join('\n') + (lines.length > 15 ? `\n… ${lines.length - 15} more` : '')
	);
	process.exit(2);
}
