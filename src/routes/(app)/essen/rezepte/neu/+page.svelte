<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Recipe } from '#lib/db/types.js';
	import RecipeEditor from '#lib/features/meals/RecipeEditor.svelte';
	import { availableTags } from '#lib/features/meals/recipes.js';
	import { recipesOf } from '#lib/features/meals/store.js';
	import { m } from '#lib/paraglide/messages.js';

	const household = session.householdId ?? '';
	const recipes = live(
		() => household,
		(h) => recipesOf(h),
		[] as Recipe[]
	);
</script>

<svelte:head>
	<title>{m.editor_title_new()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.editor_title_new()}</h1>

{#if session.canEdit}
	<RecipeEditor
		{household}
		tagOptions={availableTags(recipes.current.filter((r) => !r.deleted_at))}
		onsaved={(id) => goto(resolve('/(app)/essen/rezepte/[id]', { id }))}
		oncancel={() => goto(resolve('/(app)/essen/rezepte'))}
	/>
{:else}
	<p class="hint">{m.recipes_empty_child()}</p>
{/if}

<style>
	h1 {
		margin: 0 0 var(--space-6);
		font-size: var(--fs-display);
		letter-spacing: -0.02em;
	}
</style>
