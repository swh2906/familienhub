<script lang="ts">
	// Mahlzeit planen oder bearbeiten: Gericht, Link zum Rezept, Tag und Mahlzeit (zum Verschieben).
	// Eingebautes <dialog>: Fokus bleibt im Dialog, Escape schließt, Screenreader erkennen ihn als Dialog.
	import type { Recipe } from '#lib/db/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import { matchRecipe, normalizeRecipeUrl, SLOTS, type DialogTarget, type Slot } from './plan.js';
	import { addEntry, removeEntry, updateEntry } from './plan-store.js';

	let {
		target,
		household,
		suggestions,
		recipes,
		onclose
	}: {
		target: DialogTarget | null;
		household: string;
		suggestions: string[];
		recipes: Recipe[];
		onclose: () => void;
	} = $props();

	const slotLabels: Record<Slot, () => string> = {
		breakfast: m.slot_breakfast,
		lunch: m.slot_lunch,
		dinner: m.slot_dinner
	};

	let dialog: HTMLDialogElement | undefined = $state();
	let title = $state('');
	let url = $state('');
	let date = $state('');
	let slot: Slot = $state('dinner');
	let error = $state('');
	let busy = $state(false);

	const match = $derived(matchRecipe(title, recipes));

	// Beim Öffnen die Felder aus dem Ziel übernehmen und den Dialog modal zeigen.
	$effect(() => {
		if (!dialog) return;
		if (target) {
			title = target.entry?.title ?? '';
			url = target.entry?.recipe_url ?? '';
			date = target.date;
			slot = target.slot;
			error = '';
			if (!dialog.open) dialog.showModal();
		} else if (dialog.open) {
			dialog.close();
		}
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!target) return;
		if (!title.trim()) {
			error = m.plan_dish_required();
			return;
		}
		const recipeUrl = normalizeRecipeUrl(url);
		if (recipeUrl === null) {
			error = m.plan_link_invalid();
			return;
		}
		busy = true;
		try {
			const form = { date, slot, title, recipe_url: recipeUrl, recipe: match?.id ?? '' };
			if (target.entry) await updateEntry(target.entry, form);
			else await addEntry(household, form);
			dialog?.close();
		} catch {
			error = m.error_generic();
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!target?.entry) return;
		await removeEntry(target.entry);
		dialog?.close();
	}
</script>

<dialog bind:this={dialog} aria-labelledby="plan-dialog-title" {onclose}>
	<form onsubmit={save} novalidate>
		<h2 id="plan-dialog-title">
			{target?.entry ? m.plan_dialog_edit() : m.plan_dialog_new()}
		</h2>

		<label class="field">
			<span>{m.plan_dish()}</span>
			<input
				id="plan-dish"
				list="plan-dish-options"
				maxlength="200"
				autocomplete="off"
				placeholder={m.plan_dish_placeholder()}
				bind:value={title}
			/>
		</label>
		{#if match}
			<p class="hint" role="status">{m.plan_link_internal({ title: match.title })}</p>
		{/if}

		<div class="field">
			<label for="plan-link">{m.plan_link()}</label>
			<input
				id="plan-link"
				type="url"
				inputmode="url"
				autocomplete="off"
				placeholder="https://"
				aria-describedby="plan-link-hint"
				bind:value={url}
			/>
			<span class="hint" id="plan-link-hint">{m.plan_link_hint()}</span>
		</div>

		<div class="row">
			<label class="field">
				<span>{m.plan_day()}</span>
				<input id="plan-date" type="date" required bind:value={date} />
			</label>
			<div class="field">
				<label for="plan-slot">{m.plan_slot()}</label>
				<select id="plan-slot" bind:value={slot}>
					{#each SLOTS as option (option)}
						<option value={option}>{slotLabels[option]()}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-primary" type="submit" disabled={busy}>{m.plan_save()}</button>
			<button class="btn" type="button" onclick={() => dialog?.close()}>{m.cancel()}</button>
			{#if target?.entry}
				<button class="btn danger" type="button" onclick={remove}>{m.plan_delete()}</button>
			{/if}
		</div>

		<datalist id="plan-dish-options">
			{#each suggestions as suggestion (suggestion)}<option value={suggestion}></option>{/each}
		</datalist>
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
		font-size: 1.25rem;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.danger {
		margin-left: auto;
		color: var(--color-warning);
	}
</style>
