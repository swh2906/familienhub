<script lang="ts">
	// Kurze Fragen auf Heute: „Habt ihr … gekocht?“ (nur wer den Essensplan bearbeiten darf) und
	// „Habt ihr noch …?“ für bald gebrauchte Zutaten mit unsicherem Bestand. Nichts passiert still:
	// erst die Antwort bucht im Vorrat. „Später“ blendet eine Frage bis zum nächsten Start aus.
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import { repo } from '#lib/db/index.js';
	import type { MealPlanEntry, RecipeIngredient } from '#lib/db/types.js';
	import { addDaysTo } from '#lib/features/calendar/expand.js';
	import { entriesBetween } from '#lib/features/meals/plan-store.js';
	import { formatCompactDay } from '#lib/features/meals/week.js';
	import { m } from '#lib/paraglide/messages.js';
	import { answerCooked, answerStock, eventsOf, stockMap } from './journal.js';
	import { neededSoon, pendingCooked, stockQuestions, type StockQuestion } from './questions.js';
	import type { StockAnswer } from './stock.js';
	import { baseIngredientsOf } from './store.js';

	let { household, today }: { household: string; today: string } = $props();

	const data = live(
		() => ({ household, today }),
		async ({ household, today }) => {
			const entries = await entriesBetween(household, addDaysTo(today, -3), addDaysTo(today, 7));
			const recipes = [...new Set(entries.map((e) => e.recipe).filter(Boolean))];
			const rows = recipes.length
				? await repo('recipe_ingredients').table.where('recipe').anyOf(recipes).toArray()
				: [];
			return {
				entries,
				rows,
				ingredients: await baseIngredientsOf(household),
				events: await eventsOf(household)
			};
		},
		{
			entries: [] as MealPlanEntry[],
			rows: [] as RecipeIngredient[],
			ingredients: [],
			events: []
		}
	);

	let skipped = $state<string[]>([]);
	let busy = $state(false);

	const cooked = $derived(
		session.canEdit
			? pendingCooked(data.current.entries, today).filter((e) => !skipped.includes(e.id))
			: []
	);
	const stock = $derived(
		stockQuestions(
			data.current.ingredients,
			stockMap(data.current.ingredients, data.current.events),
			neededSoon(data.current.entries, data.current.rows, today),
			new Set(skipped)
		)
	);

	const SLOT_LABEL = { breakfast: m.slot_breakfast, lunch: m.slot_lunch, dinner: m.slot_dinner };

	async function run(task: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await task();
		} finally {
			busy = false;
		}
	}

	function cook(entry: MealPlanEntry, answer: 'yes' | 'no') {
		void run(() => answerCooked(household, entry, answer));
	}

	function answer(question: StockQuestion, value: StockAnswer) {
		void run(() => answerStock(household, question.ingredient, question.stock, value));
	}

	function later(id: string) {
		skipped = [...skipped, id];
	}
</script>

{#if cooked.length > 0 || stock.length > 0}
	<section class="card questions" aria-labelledby="today-questions">
		<h2 id="today-questions">{m.pantry_questions_title()}</h2>
		<ul>
			{#each cooked as entry (entry.id)}
				<li>
					<p class="question">{m.pantry_cooked_question({ title: entry.title })}</p>
					<p class="meta">{formatCompactDay(entry.date)} · {SLOT_LABEL[entry.slot]()}</p>
					<div class="answers">
						<button
							class="btn btn-primary"
							type="button"
							disabled={busy}
							onclick={() => cook(entry, 'yes')}>{m.pantry_cooked_yes()}</button
						>
						<button class="btn" type="button" disabled={busy} onclick={() => cook(entry, 'no')}
							>{m.pantry_cooked_no()}</button
						>
						<button class="btn btn-quiet" type="button" onclick={() => later(entry.id)}
							>{m.pantry_later()}</button
						>
					</div>
				</li>
			{/each}
			{#each stock as question (question.ingredient.id)}
				<li>
					<p class="question">{m.pantry_stock_question({ name: question.ingredient.name })}</p>
					<p class="meta">{m.pantry_needed_on({ day: formatCompactDay(question.date) })}</p>
					<div class="answers">
						<button
							class="btn"
							type="button"
							disabled={busy}
							onclick={() => answer(question, 'have')}>{m.pantry_answer_have()}</button
						>
						<button
							class="btn"
							type="button"
							disabled={busy}
							onclick={() => answer(question, 'empty')}>{m.pantry_answer_empty()}</button
						>
						<button
							class="btn"
							type="button"
							disabled={busy}
							onclick={() => answer(question, 'half')}>{m.pantry_answer_half()}</button
						>
						<button
							class="btn btn-quiet"
							type="button"
							onclick={() => later(question.ingredient.id)}>{m.pantry_later()}</button
						>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.questions {
		grid-column: 1 / -1;
		display: grid;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	ul {
		display: grid;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.question {
		margin: 0;
		font-weight: 600;
	}

	.meta {
		margin: var(--space-1) 0 var(--space-3);
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.answers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.btn-quiet {
		border-color: transparent;
		background: none;
		color: var(--color-text-muted);
	}
</style>
