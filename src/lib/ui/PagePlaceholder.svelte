<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';

	let { title }: { title: string } = $props();
</script>

<svelte:head>
	<title>{title} · {m.app_name()}</title>
</svelte:head>

<h1>{title}</h1>
<p class="muted">{m.placeholder_coming_soon()}</p>

<style>
	h1 {
		margin: 0 0 var(--space-2);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.muted {
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
