<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { safeNext } from '#lib/auth/guard.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import { m } from '#lib/paraglide/messages.js';

	let identity = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	const next = $derived(safeNext(page.url.searchParams.get('next')));
	const registerHref = $derived(
		resolve('/(auth)/register') + (next ? `?next=${encodeURIComponent(next)}` : '')
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await session.login(identity, password);
			// Ein Einladungslink (next = /join/…) führt auch ohne Familie direkt zum Beitritt.
			const fallback = session.householdId ? resolve('/(app)') : resolve('/(auth)/onboarding');
			const target = next && (session.householdId || next.startsWith('/join/')) ? next : fallback;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- Ziel ist geprüft (safeNext)
			await goto(target);
		} catch (e) {
			error = isOffline(e) ? m.error_offline() : m.login_failed();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{m.login_title()} · {m.app_name()}</title>
</svelte:head>

<section class="card">
	<h1>{m.login_title()}</h1>
	<form onsubmit={submit}>
		<label class="field">
			<span>{m.login_identity()}</span>
			<input
				id="login-identity"
				name="identity"
				autocomplete="username"
				autocapitalize="none"
				required
				bind:value={identity}
			/>
		</label>
		<label class="field">
			<span>{m.login_password()}</span>
			<input
				id="login-password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				bind:value={password}
			/>
		</label>
		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}
		<button class="btn btn-primary" type="submit" disabled={busy}>
			{busy ? m.busy() : m.login_submit()}
		</button>
	</form>
	<p class="hint">
		{m.login_no_account()}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- registerHref nutzt resolve() -->
		<a class="link" href={registerHref}>{m.login_register_link()}</a>
	</p>
</section>
