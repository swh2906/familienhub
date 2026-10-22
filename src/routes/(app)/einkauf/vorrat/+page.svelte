<script lang="ts">
	// Vorrat: alle Basisartikel der Familie mit berechnetem Bestand (Schritt 11 B3). Knappes und
	// Unsicheres steht oben; jede Zeile lässt sich mit einer Antwort richtigstellen.
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Ingredient, PantryEvent } from '#lib/db/types.js';
	import { formatAmount } from '#lib/features/meals/amounts.js';
	import { normalize } from '#lib/features/meals/recipes.js';
	import { answerStock, eventsOf, stockMap } from '#lib/features/pantry/journal.js';
	import {
		displayAmount,
		isUncertain,
		type Stock,
		type StockAnswer
	} from '#lib/features/pantry/stock.js';
	import { baseIngredientsOf } from '#lib/features/pantry/store.js';
	import { m } from '#lib/paraglide/messages.js';

	const data = live(
		() => session.householdId,
		async (household) => ({
			ingredients: household ? await baseIngredientsOf(household) : [],
			events: household ? await eventsOf(household) : []
		}),
		{ ingredients: [] as Ingredient[], events: [] as PantryEvent[] }
	);

	let query = $state('');
	let busy = $state(false);

	const stocks = $derived(stockMap(data.current.ingredients, data.current.events));
	const rows = $derived(
		data.current.ingredients
			.filter((i) => !query.trim() || normalize(i.name).includes(normalize(query)))
			.map((ingredient) => ({ ingredient, stock: stocks.get(ingredient.id) as Stock }))
			.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'de'))
	);
	const groups = $derived(
		[
			{
				id: 'short',
				label: m.pantry_group_short(),
				rows: rows.filter((r) => r.stock.status === 'low' || r.stock.status === 'empty')
			},
			{
				id: 'unsure',
				label: m.pantry_group_unsure(),
				rows: rows.filter(
					(r) => r.stock.status !== 'low' && r.stock.status !== 'empty' && isUncertain(r.stock)
				)
			},
			{
				id: 'ok',
				label: m.pantry_group_ok(),
				rows: rows.filter((r) => r.stock.status === 'ok' && !isUncertain(r.stock))
			}
		].filter((g) => g.rows.length > 0)
	);

	const STATUS_LABEL = {
		ok: m.pantry_status_ok,
		low: m.pantry_status_low,
		empty: m.pantry_status_empty,
		unknown: m.pantry_status_unknown
	};

	function amountText(stock: Stock): string {
		if (stock.amount === null || stock.amount <= 0) return '';
		const shown = displayAmount(stock.amount, stock.unit);
		const text = [formatAmount(shown.amount), shown.unit].filter(Boolean).join(' ');
		return stock.confidence === 'high' ? text : m.pantry_amount_about({ amount: text });
	}

	async function answer(ingredient: Ingredient, stock: Stock, value: StockAnswer) {
		const household = session.householdId;
		if (!household || busy) return;
		busy = true;
		try {
			await answerStock(household, ingredient, stock, value);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{m.pantry_title()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.pantry_title()}</h1>
<p class="intro">{m.pantry_intro()}</p>

{#if data.loaded && data.current.ingredients.length === 0}
	<p class="hint">{m.pantry_empty()}</p>
{:else}
	<label class="field search">
		<span>{m.pantry_search()}</span>
		<input type="search" bind:value={query} autocomplete="off" />
	</label>

	{#if rows.length === 0 && data.loaded}
		<p class="hint" role="status">{m.pantry_no_match()}</p>
	{/if}

	{#each groups as group (group.id)}
		<section class="card group" aria-labelledby="pantry-{group.id}">
			<h2 id="pantry-{group.id}">{group.label}</h2>
			<ul>
				{#each group.rows as { ingredient, stock } (ingredient.id)}
					<li>
						<div class="line">
							<span class="name">{ingredient.name}</span>
							<span class="status status-{stock.status}">{STATUS_LABEL[stock.status]()}</span>
							{#if stock.status !== 'unknown' && isUncertain(stock)}
								<span class="status status-unknown">{m.pantry_status_unsure()}</span>
							{/if}
							{#if amountText(stock)}<span class="amount">{amountText(stock)}</span>{/if}
						</div>
						<div
							class="answers"
							role="group"
							aria-label={m.pantry_answers_label({ name: ingredient.name })}
						>
							<button
								class="btn"
								type="button"
								disabled={busy}
								onclick={() => answer(ingredient, stock, 'have')}>{m.pantry_answer_have()}</button
							>
							<button
								class="btn"
								type="button"
								disabled={busy}
								onclick={() => answer(ingredient, stock, 'half')}>{m.pantry_answer_half()}</button
							>
							<button
								class="btn"
								type="button"
								disabled={busy}
								onclick={() => answer(ingredient, stock, 'empty')}>{m.pantry_answer_empty()}</button
							>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style>
	h1 {
		margin: 0 0 var(--space-2);
	}

	.intro,
	.hint {
		margin: 0 0 var(--space-4);
		color: var(--color-text-muted);
	}

	.search {
		margin-bottom: var(--space-4);
	}

	.group {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	ul {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--color-border);
	}

	li:first-child {
		border-top: 0;
		padding-top: 0;
	}

	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
	}

	.name {
		font-weight: 600;
	}

	.amount {
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.status {
		padding: 0 var(--space-2);
		border-radius: 999px;
		font-size: var(--fs-mini);
		font-weight: 600;
	}

	.status-ok {
		background: var(--color-shopping-bg);
		color: var(--color-shopping);
	}

	.status-low {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}

	.status-empty {
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
	}

	.status-unknown {
		background: var(--color-surface-2);
		color: var(--color-text-muted);
	}

	.answers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.answers .btn {
		font-size: var(--fs-small);
	}
</style>
