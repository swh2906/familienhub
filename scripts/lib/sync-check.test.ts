import { describe, expect, it } from 'vitest';
import { checkMcpConfig, scanText } from './sync-check.ts';

describe('scanText', () => {
	it('findet Tokens und absolute Pfade', () => {
		const token = 'ghp_' + 'a'.repeat(36);
		const winPath = 'C:' + '\\Users\\jemand\\x';
		const issues = scanText('src/a.ts', `const t = '${token}';\nconst p = '${winPath}';`);
		expect(issues.some((i) => i.includes('github-token'))).toBe(true);
		expect(issues.some((i) => i.includes('absoluter Pfad'))).toBe(true);
	});

	it('ignoriert Test-Fixtures und Platzhalter', () => {
		expect(scanText('src/lib/a.test.ts', "join('/Users/a/Vault')")).toEqual([]);
		expect(scanText('docs/x.md', 'C:' + '\\Users\\<name>\\Documents')).toEqual([]);
	});

	it('meldet OS-spezifische Befehle nur außerhalb von docs/', () => {
		expect(scanText('scripts/x.ts', "spawn('brew', ['install'])")).toHaveLength(1);
		expect(scanText('docs/setup.md', 'brew install jq')).toEqual([]);
	});
});

describe('checkMcpConfig', () => {
	it('verlangt Umgebungsvariablen für Auth-Header', () => {
		const literal = { mcpServers: { gh: { headers: { Authorization: 'Bearer abc' } } } };
		const viaEnv = { mcpServers: { gh: { headers: { Authorization: 'Bearer ${TOKEN}' } } } };
		expect(checkMcpConfig(literal)).toHaveLength(1);
		expect(checkMcpConfig(viaEnv)).toEqual([]);
	});
});
