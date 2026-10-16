// Prüft versionierte Dateien auf Secrets, maschinenspezifische Pfade und OS-spezifische Befehle.
// Reine Funktion, damit sie ohne Dateisystem testbar ist.

const SECRET_PATTERNS: Record<string, RegExp> = {
	'github-token': /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{50,}/,
	'anthropic-key': /\bsk-ant-[A-Za-z0-9_-]{20,}/,
	'aws-key': /\bAKIA[0-9A-Z]{16}\b/,
	'private-key': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
	'bearer-literal': /Bearer [A-Za-z0-9_.-]{20,}/
};
const ABS_PATH =
	/\b[A-Za-z]:[\\/]+(Users|Documents and Settings)[\\/]+\w|\/home\/(?!vscode\/|node\/)[a-z][\w-]*\/|\/Users\/[A-Za-z][\w.-]*\//;
// Test-Fixtures dürfen Beispielpfade enthalten.
const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec|e2e)\.\w+$/;
const OS_SPECIFIC = /\b(winget|choco|brew|apt-get|powershell|pwsh)\b|\.ps1\b|^#!\/bin\/(ba)?sh/i;
const OS_ALLOWED = [
	'docs/',
	'.devcontainer/',
	'.github/',
	'scripts/lib/sync-check',
	'README.md',
	'CLAUDE.md',
	'.claude/settings.json'
];

export const MUST_NOT_TRACK = ['.env', '.claude/settings.local.json', 'CLAUDE.local.md'];

export function scanText(file: string, text: string): string[] {
	const issues: string[] = [];
	const osAllowed = OS_ALLOWED.some((prefix) => file.startsWith(prefix));
	text.split(/\r?\n/).forEach((line, index) => {
		const at = `${file}:${index + 1}`;
		for (const [name, pattern] of Object.entries(SECRET_PATTERNS)) {
			if (pattern.test(line)) issues.push(`${at} secret (${name})`);
		}
		if (!TEST_FILE.test(file) && ABS_PATH.test(line)) issues.push(`${at} absoluter Pfad`);
		if (!osAllowed && OS_SPECIFIC.test(line)) issues.push(`${at} OS-spezifischer Befehl`);
	});
	return issues;
}

type McpConfig = {
	mcpServers?: Record<string, { headers?: Record<string, string>; env?: Record<string, string> }>;
};

export function checkMcpConfig(config: McpConfig): string[] {
	const issues: string[] = [];
	for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
		for (const [key, value] of Object.entries({ ...server.headers, ...server.env })) {
			if (!value.includes('${') && /auth|token|key|secret/i.test(key)) {
				issues.push(`.mcp.json: ${name}.${key} muss eine Umgebungsvariable referenzieren`);
			}
		}
	}
	return issues;
}
