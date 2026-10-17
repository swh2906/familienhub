<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { errorStatus, redeemInvite } from '#lib/auth/family.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let error = $state('');
	let busy = $state(false);

	const here = $derived(resolve('/(auth)/join/[token]', { token: data.token }));
	const loginHref = $derived(`${resolve('/(auth)/login')}?next=${encodeURIComponent(here)}`);
	const registerHref = $derived(`${resolve('/(auth)/register')}?next=${encodeURIComponent(here)}`);

	async function join() {
		busy = true;
		error = '';
		try {
			await redeemInvite({ token: data.token });
			await goto(resolve('/(app)'));
		} catch (e) {
			error = isOffline(e)
				? m.error_offline()
				: errorStatus(e) === 429
					? m.join_throttled()
					: m.join_invalid();
		} finally {
			busy = false;
		}
	}

	function switchAccount() {
		session.logout();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- loginHref nutzt resolve()
		goto(loginHref);
	}
</script>

<svelte:head>
	<title>{m.join_title()} · {m.app_name()}</title>
</svelte:head>

<section class="card">
	<h1>{m.join_title()}</h1>

	{#if session.user}
		<p>{m.join_intro_user({ name: session.user.name || session.user.email })}</p>
		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}
		<div class="actions">
			<button class="btn btn-primary" type="button" onclick={join} disabled={busy}>
				{busy ? m.busy() : m.join_submit()}
			</button>
			<button class="btn" type="button" onclick={switchAccount}>{m.join_other_account()}</button>
		</div>
	{:else}
		<p>{m.join_intro_guest()}</p>
		<div class="actions">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- beide Links nutzen resolve() -->
			<a class="btn btn-primary" href={registerHref}>{m.register_submit()}</a>
			<a class="btn" href={loginHref}>{m.login_submit()}</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	{/if}
</section>

<style>
	p {
		margin: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
