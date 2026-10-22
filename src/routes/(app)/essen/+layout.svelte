<script lang="ts">
	// Reiter im Bereich Essen: Rezepte und Wochenplan.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const tabs = [
		{ href: resolve('/(app)/essen/wochenplan'), label: m.meals_tab_plan },
		{ href: resolve('/(app)/essen/rezepte'), label: m.meals_tab_recipes }
	];
</script>

<nav class="pills" aria-label={m.meals_tabs_label()}>
	{#each tabs as tab (tab.href)}
		<a href={tab.href} aria-current={page.url.pathname.startsWith(tab.href) ? 'page' : undefined}
			>{tab.label()}</a
		>
	{/each}
</nav>

{@render children()}

<style>
	.pills {
		margin-bottom: var(--space-6);
	}
</style>
