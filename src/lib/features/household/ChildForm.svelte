<script lang="ts">
	// Admin legt ein Kinderkonto an: Name, Benutzername, Passwort (keine E-Mail).
	import { createChild, serverMessage } from '#lib/auth/family.js';
	import { isOffline } from '#lib/auth/session.svelte.js';
	import { m } from '#lib/paraglide/messages.js';

	let { household, oncreated }: { household: string; oncreated: () => Promise<void> } = $props();

	let name = $state('');
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let success = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		success = '';
		try {
			const login = username.trim().toLowerCase();
			await createChild({ household, username: login, password, display_name: name.trim() });
			success = m.child_created({ name: name.trim(), username: login });
			name = '';
			username = '';
			password = '';
			await oncreated();
		} catch (e) {
			error = isOffline(e) ? m.error_offline() : (serverMessage(e) ?? m.error_generic());
		} finally {
			busy = false;
		}
	}
</script>

<p class="hint">{m.child_hint()}</p>
<form onsubmit={submit}>
	<label class="field">
		<span>{m.child_name()}</span>
		<input id="child-name" name="child_name" required maxlength="40" bind:value={name} />
	</label>
	<div class="field">
		<label for="child-username">{m.child_username()}</label>
		<input
			id="child-username"
			name="child_username"
			required
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
			minlength="3"
			maxlength="30"
			aria-describedby="child-username-hint"
			bind:value={username}
		/>
		<span class="hint" id="child-username-hint">{m.child_username_hint()}</span>
	</div>
	<div class="field">
		<label for="child-password">{m.child_password()}</label>
		<input
			id="child-password"
			name="child_password"
			type="password"
			autocomplete="new-password"
			minlength="8"
			required
			aria-describedby="child-password-hint"
			bind:value={password}
		/>
		<span class="hint" id="child-password-hint">{m.register_password_hint()}</span>
	</div>
	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}
	{#if success}
		<p class="hint" role="status">{success}</p>
	{/if}
	<button class="btn btn-primary" type="submit" disabled={busy}>{m.child_submit()}</button>
</form>

<style>
	form {
		display: grid;
		gap: var(--space-4);
	}
</style>
