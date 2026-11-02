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

<nav class="pills" aria-label={m.shopping_sections_label()}>
	<a href={listHref} aria-current={onPantry ? undefined : 'page'}>{m.shopping_tab_list()}</a>
	<a href={pantryHref} aria-current={onPantry ? 'page' : undefined}>{m.shopping_tab_pantry()}</a>
</nav>

{@render children()}

<style>
	.pills {
		margin-bottom: var(--space-6);
	}
</style>
