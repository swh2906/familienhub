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
	const settings = resolve('/einstellungen');
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
		<a class="brand" href={home}>
			<span class="logo" aria-hidden="true">F</span>
			<span>{m.app_name()}</span>
		</a>
		<div class="header-actions">
			<ThemeToggle />
			<a
				class="icon-link"
				href={settings}
				aria-label={m.settings_title()}
				title={m.settings_title()}
				aria-current={isActive(page.url.pathname, settings, home) ? 'page' : undefined}
			>
				<Icon name="settings" />
			</a>
		</div>
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
						<span class="nav-icon"><Icon name={item.id} /></span>
						<span>{item.label()}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<main id="main" tabindex="-1">
		<div class="content">
			{@render children()}
		</div>
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

	/* Kopfzeile: Logo links, Schnellaktionen rechts */
	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: calc(var(--header-height) + env(safe-area-inset-top));
		padding: env(safe-area-inset-top) var(--space-2) 0 var(--space-4);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--touch-target);
		color: var(--color-text);
		font-weight: 700;
		font-size: 1.0625rem;
		text-decoration: none;
	}

	.logo {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 800;
		font-size: 0.9375rem;
	}

	.header-actions {
		display: flex;
		gap: var(--space-1);
	}

	.icon-link {
		display: inline-grid;
		place-items: center;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border-radius: var(--radius);
		color: var(--color-text);
	}

	.icon-link:hover {
		background: var(--color-surface-2);
	}

	.icon-link[aria-current='page'] {
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
	}

	main {
		padding: var(--space-6) var(--space-4);
		padding-bottom: calc(var(--nav-height) + var(--space-8) + env(safe-area-inset-bottom));
	}

	main:focus {
		outline: none;
	}

	.content {
		max-width: var(--content-max-width);
		margin: 0 auto;
	}

	/* Handy: untere Leiste mit fünf gleich breiten Einträgen */
	.nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 10;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		padding: var(--space-1) var(--space-1) env(safe-area-inset-bottom);
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
		border-radius: var(--radius);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 500;
		text-decoration: none;
	}

	.nav-icon {
		display: grid;
		place-items: center;
		padding: 2px 16px;
		border-radius: 999px;
	}

	.nav a[aria-current='page'] {
		color: var(--color-primary-strong);
		font-weight: 700;
	}

	.nav a[aria-current='page'] .nav-icon {
		background: var(--color-primary-soft);
	}

	/* Tablet (z. B. iPad hochkant): schmale Leiste links, Icon über Beschriftung */
	@media (min-width: 700px) {
		.app {
			display: grid;
			grid-template-columns: var(--rail-width) 1fr;
			grid-template-rows: auto 1fr;
		}

		.header {
			grid-column: 1 / -1;
			padding-left: var(--space-6);
		}

		.nav {
			position: sticky;
			top: var(--header-height);
			align-self: start;
			height: calc(100dvh - var(--header-height));
			padding: var(--space-4) var(--space-2);
			border-top: none;
			border-right: 1px solid var(--color-border);
		}

		.nav ul {
			display: flex;
			flex-direction: column;
			gap: var(--space-2);
		}

		.nav a:hover {
			color: var(--color-text);
		}

		.nav a:hover .nav-icon {
			background: var(--color-surface-2);
		}

		.nav a[aria-current='page'] .nav-icon {
			background: var(--color-primary-soft);
		}

		main {
			padding: var(--space-8) var(--space-8) var(--space-8);
			min-width: 0;
		}
	}

	/* Laptop, iPad quer: Seitenleiste mit Beschriftung neben dem Icon */
	@media (min-width: 1100px) {
		.app {
			grid-template-columns: var(--sidebar-width) 1fr;
		}

		.nav {
			padding: var(--space-4) var(--space-3);
		}

		.nav ul {
			gap: var(--space-1);
		}

		.nav a {
			flex-direction: row;
			justify-content: flex-start;
			gap: var(--space-3);
			min-height: var(--touch-target);
			padding: 0 var(--space-3);
			font-size: 0.9375rem;
		}

		.nav-icon,
		.nav a[aria-current='page'] .nav-icon,
		.nav a:hover .nav-icon {
			padding: 0;
			background: none;
		}

		.nav a:hover {
			background: var(--color-surface-2);
		}

		.nav a[aria-current='page'] {
			background: var(--color-primary-soft);
		}

		main {
			padding: var(--space-8) 40px;
		}
	}
</style>
