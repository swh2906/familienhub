<script lang="ts">
	// „Woche vorschlagen“: Abendessen aus den Homi-Rezepten für die freien Abende. Nichts wird
	// gespeichert, bevor man „Übernehmen“ drückt; jeder Vorschlag lässt sich tauschen oder abwählen.
	import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import { addEntry } from './plan-store.js';
	import { alternativeFor, suggestWeek, type SuggestInput, type Suggestion } from './suggest.js';
	import { formatDay } from './week.js';

	let {
		open,
		household,
		days,
		weekEntries,
		entries,
		recipes,
		onclose
	}: {
		open: boolean;
		household: string;
		/** Tage der angezeigten Woche (Mo–So). */
		days: readonly string[];
		/** Einträge der angezeigten Woche (für die freien Abende). */
		weekEntries: readonly MealPlanEntry[];
		/** Alle Einträge der Familie (Verlauf). */
		entries: readonly MealPlanEntry[];
		recipes: readonly Recipe[];
		onclose: () => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let suggestions: Suggestion[] = $state([]);
	let chosen: boolean[] = $state([]);
	let freeDays = $state(0);
	let busy = $state(false);
	let error = $state('');

	function input(): SuggestInput {
		const taken = new Set(
			weekEntries.filter((e) => !e.deleted_at && e.slot === 'dinner').map((e) => e.date)
		);
		return {
			dates: days.filter((d) => !taken.has(d)),
			week: { from: days[0], to: days[days.length - 1] },
			recipes,
			entries
		};
	}

	// Beim Öffnen neu vorschlagen (nur einmal je Öffnen, nicht bei jeder Sync-Änderung).
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			const current = input();
			freeDays = current.dates.length;
			suggestions = suggestWeek(current);
			chosen = suggestions.map(() => true);
			error = '';
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	function swap(index: number) {
		const recipe = alternativeFor(suggestions, index, input());
		if (recipe) suggestions[index] = { ...suggestions[index], recipe };
	}

	const count = $derived(chosen.filter(Boolean).length);

	async function apply(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			for (const [index, s] of suggestions.entries()) {
				if (!chosen[index]) continue;
				await addEntry(household, {
					date: s.date,
					slot: 'dinner',
					title: s.recipe.title,
					recipe_url: '',
					recipe: s.recipe.id
				});
			}
			dialog?.close();
		} catch {
			error = m.error_generic();
		} finally {
			busy = false;
		}
	}
</script>

<dialog bind:this={dialog} aria-labelledby="suggest-title" {onclose}>
	<form onsubmit={apply} novalidate>
		<h2 id="suggest-title">{m.plan_suggest_title()}</h2>

		{#if freeDays === 0}
			<p class="hint">{m.plan_suggest_full()}</p>
		{:else if suggestions.length === 0}
			<p class="hint">{m.plan_suggest_no_recipes()}</p>
		{:else}
			<p class="hint">{m.plan_suggest_hint()}</p>
			<ul class="list">
				{#each suggestions as s, index (s.date)}
					{@const day = formatDay(s.date)}
					<li class:off={!chosen[index]}>
						<label class="pick">
							<input
								type="checkbox"
								bind:checked={chosen[index]}
								aria-label={m.plan_suggest_include({ day, title: s.recipe.title })}
							/>
							<span class="text">
								<span class="day">{day}</span>
								<strong>{s.recipe.title}</strong>
							</span>
						</label>
						<button
							type="button"
							class="btn"
							aria-label={m.plan_suggest_other_label({ day })}
							onclick={() => swap(index)}>{m.plan_suggest_other()}</button
						>
					</li>
				{/each}
			</ul>
			{#if suggestions.length < freeDays}
				<p class="hint">{m.plan_suggest_some()}</p>
			{/if}
		{/if}

		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			{#if suggestions.length > 0}
				<button class="btn btn-primary" type="submit" disabled={busy || count === 0}
					>{m.plan_suggest_apply({ count })}</button
				>
			{/if}
			<button class="btn" type="button" onclick={() => dialog?.close()}>{m.cancel()}</button>
		</div>
	</form>
</dialog>

<style>
	dialog {
		width: min(32rem, calc(100vw - 2 * var(--space-4)));
		max-height: calc(100dvh - 2 * var(--space-4));
		padding: var(--space-6);
		border: 0;
		border-radius: var(--radius-card);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 20px 50px rgb(0 0 0 / 0.3);
	}

	dialog::backdrop {
		background: rgb(0 0 0 / 0.45);
	}

	form {
		display: grid;
		gap: var(--space-4);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-title);
	}

	.hint {
		margin: 0;
	}

	.list {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-block: var(--space-1);
		border-bottom: 1px solid var(--color-border);
	}

	li.off .text {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	.pick {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-3);
		min-height: 48px;
		min-width: 0;
		cursor: pointer;
	}

	.pick input {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
	}

	.text {
		display: grid;
		min-width: 0;
	}

	.day {
		color: var(--color-text-muted);
		font-size: var(--fs-small);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
