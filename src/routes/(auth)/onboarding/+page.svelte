<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createHousehold, errorStatus, redeemInvite } from '#lib/auth/family.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import { m } from '#lib/paraglide/messages.js';

	let name = $state('');
	let code = $state('');
	let createError = $state('');
	let joinError = $state('');
	let busy = $state(false);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		createError = '';
		try {
			await createHousehold(name);
			await goto(resolve('/(app)'));
		} catch (e) {
			createError = isOffline(e) ? m.error_offline() : m.error_generic();
		} finally {
			busy = false;
		}
	}

	async function join(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		joinError = '';
		try {
			await redeemInvite({ code });
			await goto(resolve('/(app)'));
		} catch (e) {
			joinError = isOffline(e)
				? m.error_offline()
				: errorStatus(e) === 429
					? m.join_throttled()
					: m.join_invalid();
		} finally {
			busy = false;
		}
	}

	function logout() {
		session.logout();
		goto(resolve('/(auth)/login'));
	}
</script>

<svelte:head>
	<title>{m.onboarding_create_title()} · {m.app_name()}</title>
</svelte:head>

<div class="intro">
	<h1>{m.onboarding_title({ name: session.user?.name || session.user?.email || '' })}</h1>
	<p class="hint">{m.onboarding_intro()}</p>
</div>

<section class="card" aria-labelledby="create-heading">
	<h2 id="create-heading">{m.onboarding_create_title()}</h2>
	<form onsubmit={create}>
		<label class="field">
			<span>{m.onboarding_create_name()}</span>
			<input
				id="household-name"
				name="household"
				required
				maxlength="80"
				placeholder={m.onboarding_create_placeholder()}
				bind:value={name}
			/>
		</label>
		{#if createError}
			<p class="form-error" role="alert">{createError}</p>
		{/if}
		<button class="btn btn-primary" type="submit" disabled={busy}>
			{m.onboarding_create_submit()}
		</button>
	</form>
</section>

<section class="card" aria-labelledby="join-heading">
	<h2 id="join-heading">{m.onboarding_join_title()}</h2>
	<form onsubmit={join}>
		<div class="field">
			<label for="invite-code">{m.onboarding_join_code()}</label>
			<input
				id="invite-code"
				name="code"
				required
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				maxlength="12"
				aria-describedby="invite-code-hint"
				bind:value={code}
			/>
			<span class="hint" id="invite-code-hint">{m.onboarding_join_hint()}</span>
		</div>
		{#if joinError}
			<p class="form-error" role="alert">{joinError}</p>
		{/if}
		<button class="btn" type="submit" disabled={busy}>{m.onboarding_join_submit()}</button>
	</form>
</section>

<button class="btn logout" type="button" onclick={logout}>{m.logout()}</button>

<style>
	.intro {
		display: grid;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.logout {
		justify-self: start;
	}
</style>
