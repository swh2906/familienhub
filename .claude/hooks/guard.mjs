// PreToolUse guard: denies destructive shell commands, asks before pushes and GitHub writes.
// Silent (no output) when a call is fine, so nothing lands in the context.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = String(input.tool_name ?? '');
const cmd = String(input.tool_input?.command ?? '');

function decide(permissionDecision, reason) {
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision,
				permissionDecisionReason: reason
			}
		})
	);
	process.exit(0);
}

// --- GitHub MCP: read tools pass, everything else needs confirmation
if (tool.startsWith('mcp__github__')) {
	const name = tool.slice('mcp__github__'.length);
	if (!/^(get_|list_|search_)|_read$|^actions_(get|list)$/.test(name))
		decide('ask', `GitHub write action: ${name}`);
	process.exit(0);
}

// --- rm -r with dangerous targets
const ROOT_TARGETS =
	/^(\/|\/\*|~\/?|\$HOME\/?|[A-Za-z]:[\\/]?|\/(bin|boot|etc|usr|var|lib|home|Users|System|opt)\/?)$/;
const BROAD_TARGETS = /^(\.\/?|\.\.\/?|\*|~\/\*|\$HOME\/\*)$/;
for (const seg of cmd.split(/&&|\|\||;|\||\n/)) {
	const t = seg
		.trim()
		.split(/\s+/)
		.map((x) => x.replace(/^["']|["']$/g, ''));
	const i = t.findIndex((x) => x === 'rm' || x.endsWith('/rm'));
	if (i < 0) continue;
	const args = t.slice(i + 1);
	if (!args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) continue;
	const targets = args.filter((a) => !a.startsWith('-'));
	if (targets.some((a) => ROOT_TARGETS.test(a)))
		decide('deny', 'rm -r on a system/home root is blocked');
	if (targets.some((a) => BROAD_TARGETS.test(a))) decide('ask', 'rm -r on ., .. or * – confirm');
}

const DENY = [
	[
		/Remove-Item\b(?=.*-Recurse)(?=.*\s([A-Za-z]:\\?|~|\$env:USERPROFILE|\$HOME)(\s|$))/i,
		'recursive delete of a drive/home root is blocked'
	],
	[/\bmkfs(\.\w+)?\b|\bformat\s+[A-Za-z]:/i, 'formatting disks is blocked'],
	[/\bdd\b.*\bof=\/dev\/(sd|nvme|disk|hd)/, 'dd onto a block device is blocked'],
	[/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, 'fork bomb is blocked'],
	[/\bchmod\s+-R\s+777\s+\/(\s|$)/, 'chmod -R 777 / is blocked'],
	[
		/\bgit\s+push\b(?=.*(\s(-f|--force|--force-with-lease)(\s|=|$)|\s\+\S+))(?=.*\b(main|master)\b)/,
		'force push to main/master is blocked'
	]
];
for (const [re, why] of DENY) if (re.test(cmd)) decide('deny', why);

const ASK = [
	[/\bgit\s+push\b/, 'git push – confirm'],
	[
		/\bgit\s+(reset\s+--hard|clean\s+-\w*f|branch\s+-D|checkout\s+--\s|restore\s+\.)/,
		'discards local work – confirm'
	],
	[
		/\bgh\s+(pr\s+(create|merge|close|reopen|comment|review|edit|ready)|issue\s+(create|close|reopen|comment|edit|delete|transfer|lock)|release\s+(create|delete|edit|upload)|repo\s+(create|delete|edit|rename|archive|fork)|workflow\s+(run|enable|disable)|run\s+(rerun|cancel|delete)|label\s+(create|delete|edit)|secret\s+(set|delete)|variable\s+(set|delete))\b/,
		'GitHub write action – confirm'
	],
	[
		/\bgh\s+api\b(?=.*(-X|--method)\s*(POST|PUT|PATCH|DELETE)|.*\s(-f|-F|--field|--raw-field)\s)/i,
		'GitHub API write – confirm'
	]
];
for (const [re, why] of ASK) if (re.test(cmd)) decide('ask', why);
