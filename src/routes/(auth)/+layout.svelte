<script lang="ts">
	// Schlichter Rahmen für Anmelden, Registrieren, Onboarding und Beitreten: ohne Navigation.
	import { m } from '#lib/paraglide/messages.js';
	import ThemeToggle from '#lib/ui/ThemeToggle.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="auth">
	<header class="top">
		<ThemeToggle />
	</header>

	<main id="main" tabindex="-1">
		<div class="brand">
			<span class="logo" aria-hidden="true">F</span>
			<div>
				<p class="name">{m.app_name()}</p>
				<p class="tagline">{m.auth_tagline()}</p>
			</div>
		</div>
		{@render children()}
	</main>
</div>

<style>
	.auth {
		min-height: 100dvh;
		padding: env(safe-area-inset-top) var(--space-4)
			calc(var(--space-8) + env(safe-area-inset-bottom));
	}

	.top {
		display: flex;
		justify-content: flex-end;
		max-width: 480px;
		margin: 0 auto;
		padding-top: var(--space-2);
	}

	main {
		display: grid;
		gap: var(--space-6);
		max-width: 480px;
		margin: 0 auto;
	}

	main:focus {
		outline: none;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.logo {
		display: grid;
		place-items: center;
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: 14px;
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 800;
		font-size: 1.375rem;
	}

	.name {
		margin: 0;
		font-weight: 750;
		font-size: 1.25rem;
	}

	.tagline {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.9375rem;
	}

	main :global(h1) {
		margin: 0;
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	main :global(form) {
		display: grid;
		gap: var(--space-4);
	}

	@media (min-width: 700px) {
		.auth {
			padding-top: calc(env(safe-area-inset-top) + var(--space-8));
		}
	}
</style>
