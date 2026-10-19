<script lang="ts">
	// Kochansicht: das Rezept als linierte Karteikarte (Prinzip aus der COOK-App), bildschirmfüllend,
	// große Schrift, Zutaten abhakbar, Bildschirm bleibt an. Escape oder „Fertig“ führt zurück.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import { repo } from '#lib/db/index.js';
	import type { RecipeIngredient } from '#lib/db/types.js';
	import ChefHat from '#lib/features/meals/ChefHat.svelte';
	import {
		clampDifficulty,
		DIFFICULTY_LEVELS,
		ingredientExtras,
		ingredientLine,
		recipeCategory,
		difficultyName,
		formatDuration
	} from '#lib/features/meals/cooking.js';
	import { ingredientsOf, setDifficulty } from '#lib/features/meals/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
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
	const back = $derived(resolve('/(app)/essen/rezepte/[id]', { id: params.id }));
	const baseServings = $derived(Math.max(1, recipe?.servings || 1));
	let chosen: number | null = $state(null);
	const portions = $derived(chosen ?? baseServings);
	const difficulty = $derived(clampDifficulty(recipe?.difficulty));
	const duration = $derived(formatDuration(recipe?.prep_minutes) || '–');
	const category = $derived(recipe ? recipeCategory(recipe) : '');
	let done: string[] = $state([]);
	let awake = $state(false);

	function toggle(id: string) {
		done = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
	}

	// Bildschirm anlassen, solange die Kochansicht offen und sichtbar ist (wo der Browser es kann).
	onMount(() => {
		let lock: WakeLockSentinel | null = null;
		let closed = false;
		async function request() {
			if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
			try {
				lock = await navigator.wakeLock.request('screen');
				if (closed) await lock.release();
				awake = !closed;
				lock.addEventListener('release', () => (awake = false));
			} catch {
				awake = false;
			}
		}
		const onVisible = () => void request();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !event.defaultPrevented) void goto(back);
		};
		void request();
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('keydown', onKey);
		return () => {
			closed = true;
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('keydown', onKey);
			void lock?.release().catch(() => {});
		};
	});
</script>

<svelte:head>
	<title
		>{recipe ? m.cook_title({ title: recipe.title }) : m.recipes_title()} · {m.app_name()}</title
	>
</svelte:head>

<div class="cook">
	<div class="bar">
		<a class="btn" href={back}><Icon name="close" size={20} /> {m.cook_close()}</a>
		{#if awake}<span class="awake" role="status">{m.cook_awake()}</span>{/if}
		{#if recipe && session.canEdit}
			<a
				class="btn icon"
				href={resolve('/(app)/essen/rezepte/[id]/bearbeiten', { id: recipe.id })}
				aria-label={m.recipe_edit()}
				title={m.recipe_edit()}
			>
				<Icon name="edit" size={20} />
			</a>
		{/if}
	</div>

	{#if data.loaded && !recipe}
		<p class="hint">{m.recipe_not_found()}</p>
	{:else if recipe}
		<article class="card">
			<header class="card-head">
				<h1>{recipe.title}</h1>
				{#if recipe.is_favorite}<span class="star" title={m.recipe_favorite()}>★</span>{/if}
			</header>

			<div class="body">
				<figure class="photo" aria-hidden="true">
					<span class="tape"></span>
					<span class="placeholder"><Icon name="meals" size={36} /></span>
				</figure>

				<dl class="meta">
					<div class="meta-row">
						<dt>{m.cook_difficulty()}</dt>
						<dd>
							{#if session.canEdit}
								<div class="hats" role="group" aria-label={m.editor_difficulty()}>
									{#each DIFFICULTY_LEVELS as level (level)}
										<button
											type="button"
											aria-label={m.cook_difficulty_set({ level: difficultyName(level) })}
											aria-pressed={difficulty === level}
											onclick={() => setDifficulty(recipe, level)}
										>
											<ChefHat filled={level <= difficulty} />
										</button>
									{/each}
								</div>
							{:else}
								<span class="hats static" role="img" aria-label={difficultyName(difficulty)}>
									{#each DIFFICULTY_LEVELS as level (level)}<ChefHat
											filled={level <= difficulty}
										/>{/each}
								</span>
							{/if}
						</dd>
					</div>
					<div class="meta-row">
						<dt>{m.cook_duration()}</dt>
						<dd>{duration}</dd>
					</div>
					<div class="meta-row">
						<dt>{m.cook_servings()}</dt>
						<dd class="portions">
							<button
								type="button"
								aria-label={m.recipe_portions_less()}
								disabled={portions <= 1}
								onclick={() => (chosen = Math.max(1, portions - 1))}
								><span class="pill" aria-hidden="true">−</span></button
							>
							<output aria-live="polite">
								<span aria-hidden="true">{portions}</span>
								<span class="visually-hidden"
									>{portions === 1
										? m.recipe_servings_one()
										: m.recipe_servings({ count: portions })}</span
								>
							</output>
							<button
								type="button"
								aria-label={m.recipe_portions_more()}
								disabled={portions >= 99}
								onclick={() => (chosen = Math.min(99, portions + 1))}
								><span class="pill" aria-hidden="true">+</span></button
							>
						</dd>
					</div>
					<div class="meta-row">
						<dt>{m.cook_category()}</dt>
						<dd>{category || m.cook_category_none()}</dd>
					</div>
				</dl>

				<h2 id="cook-ingredients">{m.cook_ingredients()}</h2>
				{#if data.current.ingredients.length === 0}
					<p>{m.cook_no_ingredients()}</p>
				{:else}
					<ul class="ingredients" aria-labelledby="cook-ingredients">
						{#each data.current.ingredients as ingredient (ingredient.id)}
							{@const extras = ingredientExtras(ingredient)}
							{@const extraText = [
								...extras.tags.map((tag) => `(${tag})`),
								extras.alternatives ? `– ${extras.alternatives}` : ''
							]
								.filter(Boolean)
								.join(' ')}
							<li>
								<label class:done={done.includes(ingredient.id)}>
									<input
										type="checkbox"
										checked={done.includes(ingredient.id)}
										onchange={() => toggle(ingredient.id)}
									/>
									<span
										>{ingredientLine(ingredient, baseServings, portions)}{#if extraText}
											<em class="extra">{` ${extraText}`}</em>{/if}</span
									>
								</label>
							</li>
						{/each}
					</ul>
				{/if}

				<h2>{m.cook_instructions()}</h2>
				<p class="instructions">{recipe.instructions || m.cook_no_instructions()}</p>
			</div>
		</article>
	{/if}
</div>

<style>
	/* Liegt über Kopfzeile und Navigation: beim Kochen zählt nur das Rezept. */
	.cook {
		--line: 3rem;
		--margin: 3rem;
		position: fixed;
		inset: 0;
		z-index: 40;
		overflow-y: auto;
		padding: var(--space-3) var(--space-3) calc(var(--space-6) + env(safe-area-inset-bottom));
		background: var(--color-bg);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		max-width: 48rem;
		margin: 0 auto var(--space-3);
	}

	.bar .icon {
		margin-left: auto;
		padding: 0;
		width: var(--touch-target);
	}

	.awake {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	/* Karteikarte: Papier, blaue Linien im Zeilenabstand, rote Randlinie links. */
	.card {
		max-width: 48rem;
		margin: 0 auto;
		border-radius: 12px;
		box-shadow: 2px 4px 12px rgb(0 0 0 / 0.18);
		color: var(--paper-text);
		background-color: var(--paper);
		background-image:
			linear-gradient(
				to right,
				transparent calc(var(--margin) - 1px),
				var(--paper-margin) calc(var(--margin) - 1px),
				var(--paper-margin) calc(var(--margin) + 1px),
				transparent calc(var(--margin) + 1px)
			),
			linear-gradient(to bottom, transparent calc(100% - 2px), var(--paper-line) calc(100% - 2px));
		background-size:
			100% 100%,
			100% var(--line);
		background-repeat: no-repeat, repeat-y;
		/* Linien auf die Grundlinie der Schrift schieben, damit der Text auf ihnen steht. */
		background-position:
			0 0,
			0 calc(var(--line) * -0.26);
		font-size: 1.25rem;
		line-height: var(--line);
		overflow: hidden;
	}

	.card-head {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		min-height: calc(var(--line) * 2);
		padding: 0 var(--space-4) 0 calc(var(--margin) + var(--space-3));
	}

	h1,
	h2 {
		font-family: var(--font-hand);
		font-weight: 400;
		line-height: var(--line);
		margin: 0;
	}

	h1 {
		font-size: 2.125rem;
		text-wrap: balance;
	}

	h2 {
		margin-top: var(--line);
		color: var(--paper-heading);
		font-size: 1.75rem;
	}

	.star {
		color: var(--paper-heading);
		font-size: 1.5rem;
	}

	.body {
		padding: 0 var(--space-4) var(--line) calc(var(--margin) + var(--space-3));
	}

	.body p {
		margin: 0;
	}

	.meta {
		margin: 0;
		color: var(--paper-meta);
		font-family: var(--font-hand);
		font-size: 1.375rem;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--line);
	}

	.meta dt {
		flex: none;
		width: 8.5rem;
	}

	.meta dd {
		margin: 0;
	}

	.hats {
		display: flex;
		align-items: center;
	}

	.hats button {
		display: grid;
		place-items: center;
		width: var(--touch-target);
		height: var(--line);
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: none;
		cursor: pointer;
	}

	.hats.static {
		gap: var(--space-1);
	}

	.portions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* Tippfläche bleibt 48 × 48 px; sichtbar ist nur ein kleiner Rahmen, der auf der Linie steht. */
	.portions button {
		position: relative;
		width: var(--touch-target);
		height: var(--line);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--paper-meta);
		font: inherit;
		cursor: pointer;
	}

	.pill {
		position: absolute;
		left: 50%;
		bottom: calc(var(--line) * 0.26 + 4px);
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1.5px solid currentColor;
		border-radius: 999px;
		font-family: var(--font-body, inherit);
		font-size: 1.125rem;
		line-height: 1;
		transform: translateX(-50%);
	}

	.portions button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.portions output {
		min-width: 2.5rem;
		text-align: center;
	}

	/* Polaroid mit Klebeband (Platzhalter, bis Fotos kommen). */
	.photo {
		position: relative;
		float: right;
		display: grid;
		place-items: center;
		width: 9rem;
		height: calc(var(--line) * 3.5);
		margin: calc(var(--line) * 0.25) 0 0 var(--space-3);
		padding: 0.6rem;
		background: #fff;
		box-shadow: 1px 1px 4px rgb(0 0 0 / 0.15);
		transform: rotate(2deg);
	}

	.placeholder {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		background: #efefef;
		color: #8a8a8a;
	}

	.tape {
		position: absolute;
		top: -0.6rem;
		left: 50%;
		width: 4.5rem;
		height: 1.4rem;
		background: var(--paper-tape);
		transform: translateX(-50%) rotate(-3deg);
	}

	.ingredients {
		clear: both;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ingredients label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--line);
		cursor: pointer;
	}

	.ingredients input {
		flex: none;
		width: 1.4rem;
		height: 1.4rem;
		accent-color: var(--paper-heading);
	}

	.extra {
		font-style: normal;
		opacity: 0.75;
	}

	.ingredients .done span {
		text-decoration: line-through;
		opacity: 0.6;
	}

	.instructions {
		white-space: pre-line;
	}

	@media (max-width: 30rem) {
		.cook {
			--margin: 2rem;
		}

		.photo {
			display: none;
		}

		.meta dt {
			width: 7rem;
		}
	}
</style>
