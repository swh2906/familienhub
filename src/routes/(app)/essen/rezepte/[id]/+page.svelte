<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import { repo } from '#lib/db/index.js';
	import type { RecipeIngredient } from '#lib/db/types.js';
	import {
		difficultyName,
		formatDuration,
		ingredientAmount,
		ingredientExtras
	} from '#lib/features/meals/cooking.js';
	import { deleteRecipe, ingredientsOf } from '#lib/features/meals/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const data = live(
		() => params.id,
		async (id) => ({
			recipe: await repo('recipes').get(id),
			ingredients: await ingredientsOf(id)
		}),
		{ recipe: undefined, ingredients: [] as RecipeIngredient[] }
	);

	const recipe = $derived(data.current.recipe?.deleted_at ? undefined : data.current.recipe);
	const baseServings = $derived(Math.max(1, recipe?.servings || 1));
	let chosen: number | null = $state(null);
	const portions = $derived(chosen ?? baseServings);
	let confirming = $state(false);
	const facts = $derived(
		recipe
			? [
					formatDuration(recipe.prep_minutes),
					recipe.difficulty ? difficultyName(recipe.difficulty) : ''
				].filter(Boolean)
			: []
	);

	async function remove() {
		if (!recipe) return;
		await deleteRecipe(recipe);
		await goto(resolve('/(app)/essen/rezepte'));
	}
</script>

<svelte:head>
	<title>{recipe?.title ?? m.recipes_title()} · {m.app_name()}</title>
</svelte:head>

<a class="back link" href={resolve('/(app)/essen/rezepte')}>← {m.recipe_back()}</a>

{#if data.loaded && !recipe}
	<p class="hint">{m.recipe_not_found()}</p>
{:else if recipe}
	<article class="recipe">
		<header class="head">
			<h1>
				{recipe.title}
				{#if recipe.is_favorite}<span class="star" title={m.recipe_favorite()}>★</span>{/if}
			</h1>
			{#if facts.length > 0}<p class="facts">{facts.join(' · ')}</p>{/if}
			{#if (recipe.tags ?? []).length > 0}
				<ul class="tags">
					{#each recipe.tags ?? [] as tag (tag)}<li>{tag}</li>{/each}
				</ul>
			{/if}
			<div class="actions">
				<a
					class="btn btn-primary"
					href={resolve('/(app)/essen/rezepte/[id]/kochen', { id: recipe.id })}>{m.cook_start()}</a
				>
				{#if session.canEdit}
					<a class="btn" href={resolve('/(app)/essen/rezepte/[id]/bearbeiten', { id: recipe.id })}
						>{m.recipe_edit()}</a
					>
				{/if}
			</div>
		</header>

		<section class="card" aria-labelledby="ingredients-heading">
			<div class="ingredients-head">
				<h2 id="ingredients-heading">{m.recipe_ingredients()}</h2>
				<div class="portions" role="group" aria-label={m.recipe_portions()}>
					<button
						type="button"
						aria-label={m.recipe_portions_less()}
						disabled={portions <= 1}
						onclick={() => (chosen = Math.max(1, portions - 1))}>−</button
					>
					<output aria-live="polite"
						>{portions === 1
							? m.recipe_servings_one()
							: m.recipe_servings({ count: portions })}</output
					>
					<button
						type="button"
						aria-label={m.recipe_portions_more()}
						disabled={portions >= 99}
						onclick={() => (chosen = Math.min(99, portions + 1))}>+</button
					>
				</div>
			</div>
			{#if data.current.ingredients.length === 0}
				<p class="hint">{m.recipe_no_ingredients()}</p>
			{:else}
				<ul class="ingredients">
					{#each data.current.ingredients as ingredient (ingredient.id)}
						{@const extras = ingredientExtras(ingredient)}
						<li>
							<span class="amount">{ingredientAmount(ingredient, baseServings, portions)}</span>
							<span class="name">
								<span>{ingredient.name}</span>
								{#if extras.note}<span class="muted">{extras.note}</span>{/if}
								{#each extras.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
								{#if extras.alternatives}<span class="muted alt">{extras.alternatives}</span>{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if recipe.instructions}
			<section class="card" aria-labelledby="instructions-heading">
				<h2 id="instructions-heading">{m.recipe_instructions()}</h2>
				<p class="instructions">{recipe.instructions}</p>
			</section>
		{/if}
		{#if session.canEdit}
			<!-- Löschen am Seitenende, abgesetzt von „Kochen“ und „Bearbeiten“. -->
			<div class="danger">
				{#if confirming}
					<div class="confirm" role="group" aria-label={m.recipe_delete()}>
						<p>{m.recipe_delete_confirm({ title: recipe.title })}</p>
						<div class="actions">
							<button class="btn btn-primary" type="button" onclick={remove}
								>{m.recipe_delete_yes()}</button
							>
							<button class="btn" type="button" onclick={() => (confirming = false)}
								>{m.cancel()}</button
							>
						</div>
					</div>
				{:else}
					<button class="btn btn-danger" type="button" onclick={() => (confirming = true)}
						>{m.recipe_delete()}</button
					>
				{/if}
			</div>
		{/if}
	</article>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target);
		margin-bottom: var(--space-2);
		text-decoration: none;
	}

	.recipe {
		display: grid;
		gap: var(--space-4);
		max-width: 760px;
	}

	.head {
		display: grid;
		gap: var(--space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-display);
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.facts {
		margin: 0;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.danger {
		display: grid;
		justify-items: start;
		margin-top: var(--space-2);
	}

	.star {
		color: var(--color-meals);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		padding: var(--space-1) var(--space-3);
		border-radius: 999px;
		background: var(--color-meals-bg);
		color: var(--color-meals);
		font-size: var(--fs-small);
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.confirm {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius);
		background: var(--color-warning-bg);
		color: var(--color-warning);
		font-weight: 600;
	}

	.confirm p {
		margin: 0;
	}

	.ingredients-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.portions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.portions button {
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--fs-title);
		cursor: pointer;
	}

	.portions button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.portions output {
		min-width: 7rem;
		text-align: center;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.ingredients {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ingredients li {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-border);
	}

	.ingredients li:first-child {
		border-top: 0;
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: var(--fs-small);
	}

	.alt {
		flex-basis: 100%;
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: 999px;
		background: var(--color-surface-2);
		color: var(--color-text-muted);
		font-size: var(--fs-mini);
	}

	.amount {
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.instructions {
		margin: 0;
		white-space: pre-line;
		max-width: 65ch;
	}
</style>
