<script lang="ts">
	// Gemeinsamer Rahmen für alle Seiten: Theme und Favicon.
	// Die App-Seiten (mit Navigation) liegen in (app), Anmeldung und Beitritt in (auth).
	import '#lib/ui/theme.css';
	import favicon from '#lib/assets/favicon.svg';
	import UpdatePrompt from '#lib/ui/UpdatePrompt.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<UpdatePrompt />
