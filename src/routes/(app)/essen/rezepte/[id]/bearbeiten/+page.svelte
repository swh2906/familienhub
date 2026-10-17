<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import { repo } from '#lib/db/index.js';
	import type { Recipe, RecipeIngredient } from '#lib/db/types.js';
	import RecipeEditor from '#lib/features/meals/RecipeEditor.svelte';
	import { availableTags } from '#lib/features/meals/recipes.js';
	import { ingredientsOf, recipesOf } from '#lib/features/meals/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
	const household = session.householdId ?? '';

	const data = live(
		() => params.id,
		async (id) => ({
			recipe: await repo('recipes').get(id),
			ingredients: await ingredientsOf(id),
			all: await recipesOf(household)
		}),
		{ recipe: undefined, ingredients: [] as RecipeIngredient[], all: [] as Recipe[] }
	);
	const recipe = $derived(data.current.recipe?.deleted_at ? undefined : data.current.recipe);
	const detail = $derived(resolve('/(app)/essen/rezepte/[id]', { id: params.id }));
</script>

<svelte:head>
	<title>{m.editor_title_edit()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.editor_title_edit()}</h1>

{#if data.loaded && !recipe}
	<p class="hint">{m.recipe_not_found()}</p>
{:else if recipe && session.canEdit}
	<!-- Einmal mit dem geladenen Stand starten; spätere Sync-Änderungen überschreiben die Eingaben nicht. -->
	{#key recipe.id}
		<RecipeEditor
			{household}
			{recipe}
			ingredients={data.current.ingredients}
			tagOptions={availableTags(data.current.all.filter((r) => !r.deleted_at))}
			onsaved={(id) => goto(resolve('/(app)/essen/rezepte/[id]', { id }))}
			oncancel={() => goto(detail)}
		/>
	{/key}
{/if}

<style>
	h1 {
		margin: 0 0 var(--space-6);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}
</style>
