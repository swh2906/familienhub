<script lang="ts">
	// Artikel bearbeiten: Name, Menge, Einheit, Kategorie; Löschen. Eingebautes <dialog>.
	import type { ShoppingItem } from '#lib/db/types.js';
	import { formatAmount, parseAmount } from '#lib/features/meals/amounts.js';
	import { CATEGORIES, UNITS } from '#lib/features/meals/catalog.js';
	import { m } from '#lib/paraglide/messages.js';
	import { updateItem } from './store.js';

	let {
		item,
		onclose,
		ondelete
	}: {
		item: ShoppingItem | null;
		onclose: () => void;
		ondelete: (item: ShoppingItem) => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let name = $state('');
	let amount = $state('');
	let unit = $state('');
	let category = $state('');
	let error = $state('');

	$effect(() => {
		if (!dialog) return;
		if (item) {
			name = item.name;
			amount = formatAmount(item.amount);
			unit = item.unit ?? '';
			category = item.category ?? '';
			error = '';
			if (!dialog.open) dialog.showModal();
		} else if (dialog.open) {
			dialog.close();
		}
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!item) return;
		if (!name.trim()) {
			error = m.shopping_name_required();
			return;
		}
		await updateItem(item, { name, amount: parseAmount(amount), unit, category });
		dialog?.close();
	}

	function remove() {
		if (!item) return;
		const current = item;
		dialog?.close();
		ondelete(current);
	}
</script>

<dialog bind:this={dialog} aria-labelledby="item-dialog-title" {onclose}>
	<form onsubmit={save} novalidate>
		<h2 id="item-dialog-title">{m.shopping_dialog_title()}</h2>
		{#if item?.reason}
			<p class="reason"><strong>{m.shopping_reason_label()}:</strong> {item.reason}</p>
		{/if}
		<label class="field">
			<span>{m.shopping_name()}</span>
			<input id="item-name" maxlength="200" bind:value={name} />
		</label>
		<div class="row">
			<label class="field">
				<span>{m.shopping_amount()}</span>
				<input id="item-amount" inputmode="decimal" bind:value={amount} />
			</label>
			<label class="field">
				<span>{m.shopping_unit()}</span>
				<input id="item-unit" list="item-units" maxlength="20" bind:value={unit} />
			</label>
		</div>
		<div class="field">
			<label for="item-category">{m.shopping_category()}</label>
			<select id="item-category" bind:value={category}>
				<option value="">{m.shopping_category_none()}</option>
				{#each CATEGORIES.filter((c) => c !== 'Sonstiges') as option (option)}
					<option value={option}>{option}</option>
				{/each}
				{#if category && !(CATEGORIES as readonly string[]).includes(category)}
					<option value={category}>{category}</option>
				{/if}
			</select>
		</div>
		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}
		<div class="actions">
			<button class="btn btn-primary" type="submit">{m.plan_save()}</button>
			<button class="btn" type="button" onclick={() => dialog?.close()}>{m.cancel()}</button>
			<button class="btn btn-danger danger" type="button" onclick={remove}
				>{m.shopping_delete()}</button
			>
		</div>
		<datalist id="item-units">
			{#each UNITS as option (option)}<option value={option}></option>{/each}
		</datalist>
	</form>
</dialog>

<style>
	.reason {
		margin: 0;
		color: var(--color-text-muted);
	}

	dialog {
		width: min(28rem, calc(100vw - 2 * var(--space-4)));
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

	/* Breit genug: rechts in derselben Zeile; schmal (Handy): eigene Zeile, links bündig. */
	.danger {
		margin-left: auto;
	}

	@media (max-width: 30rem) {
		.danger {
			margin-left: 0;
		}
	}
</style>
