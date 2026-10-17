<script lang="ts">
	// Reiter im Bereich Essen: Rezepte und Wochenplan.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const tabs = [
		{ href: resolve('/(app)/essen/rezepte'), label: m.meals_tab_recipes },
		{ href: resolve('/(app)/essen/wochenplan'), label: m.meals_tab_plan }
	];
</script>

<nav class="tabs" aria-label={m.meals_tabs_label()}>
	{#each tabs as tab (tab.href)}
		<a href={tab.href} aria-current={page.url.pathname.startsWith(tab.href) ? 'page' : undefined}
			>{tab.label()}</a
		>
	{/each}
</nav>

{@render children()}

<style>
	.tabs {
		display: inline-flex;
		gap: 2px;
		margin-bottom: var(--space-6);
		padding: 3px;
		border-radius: 12px;
		background: var(--color-surface-2);
	}

	.tabs a {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border-radius: 9px;
		color: var(--color-text-muted);
		font-weight: 600;
		text-decoration: none;
	}

	.tabs a[aria-current='page'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}
</style>
