<script lang="ts">
	// Reiter im Bereich Einkauf: Liste und Vorrat.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const listHref = resolve('/(app)/einkauf');
	const pantryHref = resolve('/(app)/einkauf/vorrat');
	const onPantry = $derived(page.url.pathname.startsWith(pantryHref));
</script>

<nav class="tabs" aria-label={m.shopping_sections_label()}>
	<a href={listHref} aria-current={onPantry ? undefined : 'page'}>{m.shopping_tab_list()}</a>
	<a href={pantryHref} aria-current={onPantry ? 'page' : undefined}>{m.shopping_tab_pantry()}</a>
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
