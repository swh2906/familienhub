<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { safeNext } from '#lib/auth/guard.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import { m } from '#lib/paraglide/messages.js';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	const next = $derived(safeNext(page.url.searchParams.get('next')));
	const loginHref = $derived(
		resolve('/(auth)/login') + (next ? `?next=${encodeURIComponent(next)}` : '')
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await session.register({ name, email, password });
			// Neues Konto hat noch keine Familie; ein Einladungslink (next) führt direkt zum Beitritt.
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- Ziel ist geprüft (safeNext)
			await goto(next ?? resolve('/(auth)/onboarding'));
		} catch (e) {
			error = isOffline(e) ? m.error_offline() : m.register_failed();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{m.register_title()} · {m.app_name()}</title>
</svelte:head>

<section class="card">
	<h1>{m.register_title()}</h1>
	<form onsubmit={submit}>
		<label class="field">
			<span>{m.register_name()}</span>
			<input
				id="register-name"
				name="name"
				autocomplete="given-name"
				required
				maxlength="40"
				bind:value={name}
			/>
		</label>
		<label class="field">
			<span>{m.register_email()}</span>
			<input
				id="register-email"
				name="email"
				type="email"
				autocomplete="email"
				required
				bind:value={email}
			/>
		</label>
		<div class="field">
			<label for="register-password">{m.register_password()}</label>
			<input
				id="register-password"
				name="password"
				type="password"
				autocomplete="new-password"
				minlength="8"
				required
				aria-describedby="register-password-hint"
				bind:value={password}
			/>
			<span class="hint" id="register-password-hint">{m.register_password_hint()}</span>
		</div>
		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}
		<button class="btn btn-primary" type="submit" disabled={busy}>
			{busy ? m.busy() : m.register_submit()}
		</button>
	</form>
	<p class="hint">
		{m.register_have_account()}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- loginHref nutzt resolve() -->
		<a class="link" href={loginHref}>{m.register_login_link()}</a>
	</p>
</section>
