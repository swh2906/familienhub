<script lang="ts">
	// Einladungen erstellen (Link + Code, nur einmal sichtbar), offene Einladungen widerrufen. Nur Admins.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { createInvite, listInvites, revokeInvite, serverMessage } from '#lib/auth/family.js';
	import { isOffline } from '#lib/auth/session.svelte.js';
	import type { CreatedInvite, Invite, Role } from '#lib/auth/types.js';
	import { m } from '#lib/paraglide/messages.js';

	let { household }: { household: string } = $props();

	const roleLabels: Record<Role, () => string> = {
		admin: m.role_admin,
		adult: m.role_adult,
		child: m.role_child
	};

	let role: Role = $state('adult');
	let created = $state<CreatedInvite | null>(null);
	let invites: Invite[] = $state([]);
	let copied: 'link' | 'code' | null = $state(null);
	let error = $state('');
	let busy = $state(false);

	const link = $derived(
		created
			? new URL(resolve('/(auth)/join/[token]', { token: created.token }), window.location.origin)
					.href
			: ''
	);

	function fail(e: unknown) {
		error = isOffline(e) ? m.error_offline() : (serverMessage(e) ?? m.error_generic());
	}

	async function load() {
		try {
			invites = await listInvites(household);
		} catch (e) {
			fail(e);
		}
	}

	onMount(load);

	async function create() {
		busy = true;
		error = '';
		copied = null;
		try {
			created = await createInvite(household, role);
			await load();
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function revoke(id: string) {
		error = '';
		try {
			await revokeInvite(id);
			if (created?.id === id) created = null;
			await load();
		} catch (e) {
			fail(e);
		}
	}

	async function copy(kind: 'link' | 'code', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = kind;
		} catch {
			// Kein Zugriff auf die Zwischenablage: Text bleibt sichtbar und markierbar.
		}
	}

	function formatDate(value: string): string {
		return new Date(value.replace(' ', 'T')).toLocaleString('de-DE', {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}
</script>

<p class="hint">{m.invite_hint()}</p>

<div class="create">
	<div class="field">
		<label for="invite-role">{m.invite_role()}</label>
		<select id="invite-role" bind:value={role}>
			<option value="adult">{m.role_adult()}</option>
			<option value="child">{m.role_child()}</option>
			<option value="admin">{m.role_admin()}</option>
		</select>
	</div>
	<button class="btn btn-primary" type="button" onclick={create} disabled={busy}>
		{m.invite_create()}
	</button>
</div>

{#if error}
	<p class="form-error" role="alert">{error}</p>
{/if}

{#if created}
	<div class="result" role="status">
		<div class="secret">
			<span class="label">{m.invite_link()}</span>
			<code data-testid="invite-link">{link}</code>
			<button class="btn" type="button" onclick={() => copy('link', link)}>
				{copied === 'link' ? m.invite_copied() : m.invite_copy()}
			</button>
		</div>
		<div class="secret">
			<span class="label">{m.invite_code()}</span>
			<code class="code" data-testid="invite-code">{created.code}</code>
			<button class="btn" type="button" onclick={() => copy('code', created?.code ?? '')}>
				{copied === 'code' ? m.invite_copied() : m.invite_copy()}
			</button>
		</div>
		<p class="hint">{m.invite_once()}</p>
	</div>
{/if}

<h3>{m.invite_open()}</h3>
{#if invites.length === 0}
	<p class="hint">{m.invite_none()}</p>
{:else}
	<ul class="invites">
		{#each invites as invite (invite.id)}
			<li>
				<span>
					{m.invite_item({ role: roleLabels[invite.role](), date: formatDate(invite.expires_at) })}
				</span>
				<button class="btn" type="button" onclick={() => revoke(invite.id)}>
					{m.invite_revoke()}
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.create {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}

	.result {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--radius);
		background: var(--color-primary-soft);
	}

	.secret {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}

	.label {
		grid-column: 1 / -1;
		font-weight: 600;
		font-size: 0.875rem;
	}

	code {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 0.875rem;
		user-select: all;
	}

	.code {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		font-variant-numeric: tabular-nums;
	}

	h3 {
		margin: 0;
		font-size: 1rem;
	}

	.invites {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.invites li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-border);
	}

	.invites li:first-child {
		border-top: 0;
	}
</style>
