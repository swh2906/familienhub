<script lang="ts">
	import { shortcut } from '#lib/ui/shortcut.js';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Recipe, RecipeIngredient } from '#lib/db/types.js';
	import { availableTags, filterRecipes } from '#lib/features/meals/recipes.js';
	import { ingredientsOfRecipes, recipesOf, toggleFavorite } from '#lib/features/meals/store.js';
	import { m } from '#lib/paraglide/messages.js';

	const data = live(
		() => session.householdId ?? '',
		async (household) => {
			const recipes = await recipesOf(household);
			const ingredients = await ingredientsOfRecipes(recipes.map((r) => r.id));
			return { recipes, ingredients };
		},
		{ recipes: [] as Recipe[], ingredients: [] as RecipeIngredient[] }
	);

	let query = $state('');
	let tag: string | null = $state(null);

	const tags = $derived(availableTags(data.current.recipes.filter((r) => !r.deleted_at)));
	const visible = $derived(
		filterRecipes(data.current.recipes, data.current.ingredients, { query, tag })
	);
	const hasAny = $derived(data.current.recipes.some((r) => !r.deleted_at));

	function servings(count: number): string {
		return count === 1 ? m.recipe_servings_one() : m.recipe_servings({ count });
	}
</script>

<svelte:head>
	<title>{m.recipes_title()} · {m.app_name()}</title>
</svelte:head>

<div class="head">
	<h1>{m.recipes_title()}</h1>
	{#if session.canEdit}
		<a class="btn btn-primary" href={resolve('/(app)/essen/rezepte/neu')} {@attach shortcut('n')}
			>{m.recipes_new()}</a
		>
	{/if}
</div>

{#if data.loaded && !hasAny}
	<section class="card empty">
		<h2>{m.recipes_empty_title()}</h2>
		<p class="hint">{session.canEdit ? m.recipes_empty_text() : m.recipes_empty_child()}</p>
	</section>
{:else if hasAny}
	<div class="filters">
		<label class="field search">
			<span class="visually-hidden">{m.recipes_search()}</span>
			<input
				id="recipe-search"
				type="search"
				placeholder={m.recipes_search_placeholder()}
				aria-label={m.recipes_search()}
				bind:value={query}
			/>
		</label>
		<div class="chips" role="group" aria-label={m.recipes_filter_label()}>
			<button type="button" class="chip" aria-pressed={tag === null} onclick={() => (tag = null)}
				>{m.recipes_filter_all()}</button
			>
			{#each tags as option (option)}
				<button
					type="button"
					class="chip"
					aria-pressed={tag === option}
					onclick={() => (tag = tag === option ? null : option)}>{option}</button
				>
			{/each}
		</div>
	</div>

	{#if visible.length === 0}
		<p class="hint">{m.recipes_no_match()}</p>
	{:else}
		<ul class="list" aria-label={m.recipes_title()}>
			{#each visible as recipe (recipe.id)}
				<li class="card item">
					<a class="title" href={resolve('/(app)/essen/rezepte/[id]', { id: recipe.id })}>
						{recipe.title}
					</a>
					<p class="meta">
						{servings(recipe.servings || 1)}
						{#if (recipe.tags ?? []).length > 0}
							· {(recipe.tags ?? []).join(', ')}
						{/if}
					</p>
					{#if session.canEdit}
						<button
							type="button"
							class="star"
							aria-pressed={recipe.is_favorite}
							aria-label={recipe.is_favorite
								? m.recipe_favorite_remove({ title: recipe.title })
								: m.recipe_favorite_add({ title: recipe.title })}
							onclick={() => toggleFavorite(recipe)}>{recipe.is_favorite ? '★' : '☆'}</button
						>
					{:else if recipe.is_favorite}
						<span class="star static" title={m.recipe_favorite()}>★</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.empty h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.filters {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.search input {
		width: 100%;
	}

	/* Handy: Filter in einer Zeile zum Wischen, damit die Rezepte nicht nach unten rutschen. */
	.chips {
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;
		padding-bottom: var(--space-1);
		scrollbar-width: none;
	}

	.chips > * {
		flex: none;
	}

	@media (min-width: 700px) {
		.chips {
			flex-wrap: wrap;
			overflow-x: visible;
		}
	}

	.chip {
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: 0.9375rem;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-weight: 600;
	}

	.list {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	@media (min-width: 900px) {
		.list {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.item {
		position: relative;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-4);
	}

	.title {
		grid-column: 1;
		color: var(--color-text);
		font-size: 1.0625rem;
		font-weight: 650;
		text-decoration: none;
	}

	/* Ganze Karte anklickbar, der Stern bleibt eigener Knopf darüber. */
	.title::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--radius-card);
	}

	.title:focus-visible {
		outline: none;
	}

	.title:focus-visible::after {
		outline: 3px solid var(--color-focus);
		outline-offset: 2px;
	}

	.meta {
		grid-column: 1;
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.star {
		position: relative;
		z-index: 1;
		grid-column: 2;
		grid-row: 1 / span 2;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-meals);
		font-size: 1.5rem;
		cursor: pointer;
	}

	.star:hover {
		background: var(--color-surface-2);
	}

	.static {
		display: grid;
		place-items: center;
		cursor: default;
	}
</style>
