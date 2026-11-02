<script lang="ts">
	// „Aus dem Essensplan“: Vorschau, was für die geplanten Rezepte der nächsten 7 Tage fehlt
	// (Schritt 11 C2). Vorausgewählt ist nur sicher Fehlendes; Unsicheres und Optionales wählt man
	// selbst. Jede Zeile sagt, warum sie da steht. Eingebautes <dialog>.
	import { liveQuery } from 'dexie';
	import type { ShoppingItem } from '#lib/db/types.js';
	import { formatAmount } from '#lib/features/meals/amounts.js';
	import { computeDemand, reasonFor, type DemandLine } from '#lib/features/pantry/demand.js';
	import { loadDemandInput } from '#lib/features/pantry/journal.js';
	import { displayAmount } from '#lib/features/pantry/stock.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addFromPlan } from './store.js';

	let {
		open,
		household,
		membership,
		today,
		history,
		onclose,
		ondone
	}: {
		open: boolean;
		household: string;
		membership: string;
		today: string;
		history: readonly ShoppingItem[];
		onclose: () => void;
		ondone: (count: number) => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let lines = $state.raw<DemandLine[]>([]);
	let loaded = $state(false);
	let selected = $state<string[]>([]);
	let busy = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// Live, solange der Dialog offen ist: kommt der Abgleich erst danach an, erscheint er trotzdem.
	// Neu fehlende Zutaten werden vorausgewählt, die eigene Auswahl bleibt erhalten.
	$effect(() => {
		if (!open) return;
		const input = { household, today };
		const seen: string[] = [];
		loaded = false;
		selected = [];
		const subscription = liveQuery(() => loadDemandInput(input.household, input.today)).subscribe({
			next: (value) => {
				lines = computeDemand(value);
				const fresh = lines.filter((l) => !seen.includes(l.key));
				seen.push(...fresh.map((l) => l.key));
				selected = [
					...selected.filter((key) => lines.some((l) => l.key === key)),
					...fresh.filter((l) => l.status === 'missing').map((l) => l.key)
				];
				loaded = true;
			},
			error: (error: unknown) => console.error('Bedarf nicht berechnet', error)
		});
		return () => subscription.unsubscribe();
	});

	const groups = $derived(
		(['missing', 'check', 'optional'] as const)
			.map((status) => ({ status, lines: lines.filter((l) => l.status === status) }))
			.filter((g) => g.lines.length > 0)
	);
	const covered = $derived(lines.filter((l) => l.status === 'covered'));

	const GROUP_LABEL = {
		missing: m.plan_transfer_group_missing,
		check: m.plan_transfer_group_check,
		optional: m.plan_transfer_group_optional
	};
	const BECAUSE = {
		unknown_stock: m.plan_transfer_because_unknown_stock,
		uncertain_stock: m.plan_transfer_because_uncertain_stock,
		in_stock: m.plan_transfer_because_in_stock,
		on_list: m.plan_transfer_because_on_list,
		no_amount: m.plan_transfer_because_no_amount
	};

	function quantity(amount: number, unit: string): string {
		if (amount <= 0) return '';
		const shown = displayAmount(amount, unit);
		return [formatAmount(shown.amount), shown.unit].filter(Boolean).join(' ');
	}

	function details(line: DemandLine): string {
		const parts = [reasonFor(line.meals)];
		if (line.because) parts.push(BECAUSE[line.because]());
		if (line.stock?.amount && line.stock.unit === line.unit) {
			parts.push(m.plan_transfer_stock({ amount: quantity(line.stock.amount, line.unit) }));
		}
		if (line.buy.packs > 0) parts.push(m.plan_transfer_packs({ count: line.buy.packs }));
		if (line.onList && line.status !== 'covered') {
			parts.push(m.plan_transfer_merge({ name: line.onList.name }));
		}
		return parts.filter(Boolean).join(' · ');
	}

	function toggle(key: string) {
		selected = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
	}

	async function apply() {
		if (busy) return;
		busy = true;
		try {
			const picked = lines.filter((l) => selected.includes(l.key));
			const count = await addFromPlan(household, membership, picked, history);
			dialog?.close();
			ondone(count);
		} finally {
			busy = false;
		}
	}
</script>

<dialog bind:this={dialog} aria-labelledby="plan-transfer-title" {onclose}>
	<div class="body">
		<h2 id="plan-transfer-title">{m.plan_transfer_title()}</h2>
		<p class="hint">{m.plan_transfer_intro()}</p>

		{#if loaded && lines.length === 0}
			<p role="status">{m.plan_transfer_none()}</p>
		{:else if loaded && groups.length === 0}
			<p role="status">{m.plan_transfer_all_covered()}</p>
		{/if}

		{#each groups as group (group.status)}
			<fieldset>
				<legend>{GROUP_LABEL[group.status]()}</legend>
				<ul>
					{#each group.lines as line (line.key)}
						<li>
							<label>
								<input
									type="checkbox"
									checked={selected.includes(line.key)}
									onchange={() => toggle(line.key)}
								/>
								<span class="text">
									<span class="name"
										>{[quantity(line.buy.amount, line.unit), line.name]
											.filter(Boolean)
											.join(' ')}</span
									>
									<span class="details">{details(line)}</span>
								</span>
							</label>
						</li>
					{/each}
				</ul>
			</fieldset>
		{/each}

		{#if covered.length > 0}
			<details>
				<summary>{m.plan_transfer_group_covered({ count: covered.length })}</summary>
				<ul class="covered">
					{#each covered as line (line.key)}
						<li>
							<span class="name">{line.name}</span>
							<span class="details">{details(line)}</span>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>

	<div class="actions">
		<button class="btn" type="button" onclick={() => dialog?.close()}
			>{m.plan_transfer_cancel()}</button
		>
		<button
			class="btn btn-primary"
			type="button"
			disabled={busy || selected.length === 0}
			onclick={apply}>{m.plan_transfer_apply({ count: selected.length })}</button
		>
	</div>
</dialog>

<style>
	dialog {
		width: min(36rem, calc(100vw - 2 * var(--space-4)));
		max-height: calc(100dvh - 2 * var(--space-6));
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg, 16px);
		background: var(--color-surface);
		color: var(--color-text);
	}

	dialog[open] {
		display: flex;
		flex-direction: column;
	}

	dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}

	.body {
		display: grid;
		gap: var(--space-4);
		overflow-y: auto;
		padding: var(--space-6) var(--space-6) var(--space-4);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-title);
	}

	.hint,
	p {
		margin: 0;
	}

	.hint,
	.details {
		color: var(--color-text-muted);
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--space-2);
		padding: 0;
		font-weight: 700;
	}

	ul {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	label {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		min-height: var(--touch-target);
		padding: var(--space-2) 0;
		cursor: pointer;
	}

	input[type='checkbox'] {
		flex: none;
		width: 22px;
		height: 22px;
		margin: 2px 0 0;
	}

	.text {
		display: grid;
		gap: 2px;
	}

	.name {
		font-weight: 600;
	}

	.details {
		font-size: var(--fs-small);
	}

	summary {
		min-height: var(--touch-target);
		display: flex;
		align-items: center;
		cursor: pointer;
		font-weight: 700;
	}

	.covered li {
		display: grid;
		gap: 2px;
		padding: var(--space-2) 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-6) var(--space-6);
		border-top: 1px solid var(--color-border);
	}
</style>
