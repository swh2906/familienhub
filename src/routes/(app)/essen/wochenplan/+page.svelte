<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.meals_tab_plan()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.meals_tab_plan()}</h1>
<p class="hint">{m.plan_coming()}</p>

<style>
	h1 {
		margin: 0 0 var(--space-2);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}
</style>
