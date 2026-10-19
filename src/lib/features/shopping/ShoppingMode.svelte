<script lang="ts">
	// Einkaufsmodus „Ich gehe einkaufen“ (Schritt 11 E2): oben die Zutaten der nächsten Tage, bei
	// denen der Vorrat unsicher ist – mit „Mitnehmen“ (auf die Liste) oder „Ist noch da“ (Vorrat).
	// Darunter bleibt die normale Liste zum Abhaken; Gekauftes landet über den Kauf im Vorrat.
	import { liveQuery } from 'dexie';
	import type { ShoppingItem } from '#lib/db/types.js';
	import { formatAmount } from '#lib/features/meals/amounts.js';
	import { computeDemand, reasonFor, type DemandLine } from '#lib/features/pantry/demand.js';
	import { answerStock, loadDemandInput } from '#lib/features/pantry/journal.js';
	import { displayAmount } from '#lib/features/pantry/stock.js';
	import { baseIngredientsOf } from '#lib/features/pantry/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addFromPlan } from './store.js';

	let {
		household,
		membership,
		today,
		history,
		onfinish
	}: {
		household: string;
		membership: string;
		today: string;
		history: readonly ShoppingItem[];
		onfinish: () => void;
	} = $props();

	let lines = $state.raw<DemandLine[]>([]);
	let loaded = $state(false);
	let dismissed = $state<string[]>([]);
	let busy = $state(false);

	$effect(() => {
		const input = { household, today };
		const subscription = liveQuery(() => loadDemandInput(input.household, input.today)).subscribe({
			next: (value) => {
				lines = computeDemand(value);
				loaded = true;
			},
			error: (error: unknown) => console.error('Bedarf nicht berechnet', error)
		});
		return () => subscription.unsubscribe();
	});

	const unsure = $derived(
		lines.filter((l) => l.status === 'check' && !l.onList && !dismissed.includes(l.key))
	);

	function quantity(line: DemandLine): string {
		if (line.buy.amount <= 0) return '';
		const shown = displayAmount(line.buy.amount, line.unit);
		return [formatAmount(shown.amount), shown.unit].filter(Boolean).join(' ');
	}

	async function run(task: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await task();
		} finally {
			busy = false;
		}
	}

	function take(line: DemandLine) {
		void run(async () => {
			await addFromPlan(household, membership, [line], history);
		});
	}

	function have(line: DemandLine) {
		void run(async () => {
			const ingredient = line.ingredient;
			if (ingredient && line.stock) {
				const item = (await baseIngredientsOf(household)).find((i) => i.id === ingredient);
				if (item) await answerStock(household, item, line.stock, 'have');
			}
			dismissed = [...dismissed, line.key];
		});
	}
</script>

<section class="card mode" aria-labelledby="shop-mode-title">
	<div class="head">
		<h2 id="shop-mode-title">{m.shop_mode_title()}</h2>
		<button class="btn btn-primary" type="button" onclick={onfinish}>{m.shop_mode_done()}</button>
	</div>
	<p class="hint">{m.shop_mode_intro()}</p>

	<h3>{m.shop_mode_unsure_title()}</h3>
	{#if loaded && unsure.length === 0}
		<p class="hint" role="status">{m.shop_mode_unsure_none()}</p>
	{:else}
		<ul>
			{#each unsure as line (line.key)}
				<li>
					<div class="text">
						<span class="name">{[quantity(line), line.name].filter(Boolean).join(' ')}</span>
						<span class="hint">{reasonFor(line.meals)}</span>
					</div>
					<div
						class="actions"
						role="group"
						aria-label={m.shop_mode_actions_label({ name: line.name })}
					>
						<button class="btn" type="button" disabled={busy} onclick={() => take(line)}
							>{m.shop_mode_take()}</button
						>
						<button class="btn" type="button" disabled={busy} onclick={() => have(line)}
							>{m.shop_mode_have()}</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.mode {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		border: 2px solid var(--color-primary);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	h3 {
		margin: var(--space-2) 0 0;
		font-size: 1rem;
	}

	p {
		margin: 0;
	}

	.hint {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	ul {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-border);
	}

	li:first-child {
		border-top: 0;
	}

	.text {
		display: grid;
		gap: 2px;
	}

	.name {
		font-weight: 600;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
