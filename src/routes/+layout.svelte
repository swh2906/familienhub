<script lang="ts">
	import '#lib/ui/theme.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import favicon from '#lib/assets/favicon.svg';
	import Icon from '#lib/ui/Icon.svelte';
	import ThemeToggle from '#lib/ui/ThemeToggle.svelte';
	import { isActive, type NavId } from '#lib/ui/nav.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const home = resolve('/');
	const items = [
		{ id: 'today', route: '/', label: m.nav_today },
		{ id: 'meals', route: '/essen', label: m.nav_meals },
		{ id: 'shopping', route: '/einkauf', label: m.nav_shopping },
		{ id: 'calendar', route: '/kalender', label: m.nav_calendar },
		{ id: 'tasks', route: '/aufgaben', label: m.nav_tasks }
	] as const satisfies readonly { id: NavId; route: string; label: () => string }[];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip-link" href="#main">{m.skip_to_content()}</a>

<div class="app">
	<header class="header">
		<span class="brand">{m.app_name()}</span>
		<ThemeToggle />
	</header>

	<nav class="nav" aria-label={m.nav_label()}>
		<ul>
			{#each items as item (item.id)}
				<li>
					<a
						href={resolve(item.route)}
						aria-current={isActive(page.url.pathname, resolve(item.route), home)
							? 'page'
							: undefined}
					>
						<Icon name={item.id} />
						<span>{item.label()}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<main id="main" tabindex="-1">
		{@render children()}
	</main>
</div>

<style>
	.skip-link {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		z-index: 100;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius);
		background: var(--color-primary);
		color: var(--color-primary-text);
		transform: translateY(-200%);
	}

	.skip-link:focus {
		transform: none;
	}

	.app {
		min-height: 100dvh;
	}

	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--header-height);
		padding: 0 var(--space-2) 0 var(--space-4);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.brand {
		font-weight: 700;
		font-size: 1.125rem;
	}

	main {
		padding: var(--space-4);
		padding-bottom: calc(var(--nav-height) + var(--space-6) + env(safe-area-inset-bottom));
	}

	main:focus {
		outline: none;
	}

	/* Handy: untere Leiste mit fünf gleich breiten Einträgen */
	.nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 10;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.nav ul {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: var(--nav-height);
		min-width: var(--touch-target);
		padding: var(--space-1);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-decoration: none;
	}

	.nav a[aria-current='page'] {
		color: var(--color-nav-active-text);
		font-weight: 600;
	}

	.nav a[aria-current='page'] :global(svg) {
		background: var(--color-nav-active-bg);
		border-radius: 999px;
		padding: 2px 12px;
		box-sizing: content-box;
	}

	/* Desktop: Seitenleiste links */
	@media (min-width: 768px) {
		.app {
			display: grid;
			grid-template-columns: var(--sidebar-width) 1fr;
			grid-template-rows: var(--header-height) 1fr;
		}

		.header {
			grid-column: 1 / -1;
		}

		.nav {
			position: sticky;
			top: var(--header-height);
			align-self: start;
			height: calc(100dvh - var(--header-height));
			border-top: none;
			border-right: 1px solid var(--color-border);
			padding: var(--space-3) var(--space-2);
		}

		.nav ul {
			display: flex;
			flex-direction: column;
			gap: var(--space-1);
		}

		.nav a {
			flex-direction: row;
			justify-content: flex-start;
			gap: var(--space-3);
			min-height: var(--touch-target);
			padding: 0 var(--space-3);
			border-radius: var(--radius);
			font-size: 1rem;
		}

		.nav a:hover {
			background: var(--color-nav-active-bg);
		}

		.nav a[aria-current='page'] {
			background: var(--color-nav-active-bg);
		}

		.nav a[aria-current='page'] :global(svg) {
			background: none;
			padding: 0;
		}

		main {
			padding: var(--space-6);
		}
	}
</style>
