<script lang="ts">
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Membership, ShoppingItem } from '#lib/db/types.js';
	import ItemDialog from '#lib/features/shopping/ItemDialog.svelte';
	import { formatQuantity, groupItems, parseQuickInput } from '#lib/features/shopping/list.js';
	import {
		addItem,
		itemsOf,
		membersOf,
		removeItems,
		restoreItems,
		toggleItem
	} from '#lib/features/shopping/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';

	const household = session.householdId ?? '';
	const membership = session.membership?.id ?? '';

	const data = live(
		() => household,
		async (h) => ({ items: await itemsOf(h), members: await membersOf(h) }),
		{ items: [] as ShoppingItem[], members: [] as Membership[] }
	);

	const list = $derived(groupItems(data.current.items));
	const openCount = $derived(list.open.reduce((sum, group) => sum + group.items.length, 0));
	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));

	/** Admins und Erwachsene ändern alles, Kinder nur eigene Artikel. */
	function canChange(item: ShoppingItem): boolean {
		return session.canEdit || item.added_by === membership;
	}
	const clearable = $derived(list.done.filter(canChange));

	let quick = $state('');
	let quickInput: HTMLInputElement | undefined = $state();
	let editing: ShoppingItem | null = $state(null);
	let undo: { ids: string[]; timer: ReturnType<typeof setTimeout> } | null = $state(null);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const input = parseQuickInput(quick);
		if (!input) return;
		// Sofort leeren, damit schnell getippte nächste Artikel nicht verloren gehen.
		quick = '';
		quickInput?.focus();
		await addItem(household, membership, input, data.current.items);
	}

	async function remove(items: ShoppingItem[]) {
		if (items.length === 0) return;
		await removeItems(items);
		if (undo) clearTimeout(undo.timer);
		undo = { ids: items.map((i) => i.id), timer: setTimeout(() => (undo = null), 8000) };
	}

	async function undoRemove() {
		if (!undo) return;
		clearTimeout(undo.timer);
		const ids = undo.ids;
		undo = null;
		await restoreItems(ids);
	}
</script>

<svelte:head>
	<title>{m.shopping_title()} · {m.app_name()}</title>
</svelte:head>

<div class="head">
	<h1>{m.shopping_title()}</h1>
	{#if openCount > 0}<span class="count">{m.shopping_open_count({ count: openCount })}</span>{/if}
</div>

<form class="quick" onsubmit={add}>
	<label class="visually-hidden" for="quick-add">{m.shopping_quick_label()}</label>
	<input
		id="quick-add"
		bind:this={quickInput}
		bind:value={quick}
		placeholder={m.shopping_quick_placeholder()}
		autocomplete="off"
		enterkeyhint="done"
		maxlength="200"
	/>
	<button class="btn btn-primary" type="submit" aria-label={m.shopping_quick_submit()}>
		<Icon name="plus" size={20} />
		<span class="quick-text">{m.shopping_quick_submit()}</span>
	</button>
</form>

{#if data.loaded && openCount === 0 && list.done.length === 0}
	<section class="card empty">
		<h2>{m.shopping_empty_title()}</h2>
		<p class="hint">{m.shopping_empty_text()}</p>
	</section>
{/if}

{#snippet row(item: ShoppingItem)}
	{@const adder = members.get(item.added_by)}
	{@const quantity = formatQuantity(item)}
	<li class="item" class:done={item.checked}>
		<button
			type="button"
			class="toggle"
			aria-pressed={item.checked}
			aria-label={item.checked
				? m.shopping_toggle_done({ name: [quantity, item.name].filter(Boolean).join(' ') })
				: m.shopping_toggle_open({ name: [quantity, item.name].filter(Boolean).join(' ') })}
			onclick={() => toggleItem(item, membership)}
		>
			<span class="box" aria-hidden="true"></span>
			<span class="text">
				<span class="name">{item.name}</span>
				{#if quantity}<span class="quantity">{quantity}</span>{/if}
			</span>
		</button>
		{#if adder}
			<span class="adder" title={m.shopping_added_by({ name: adder.display_name })}>
				<MemberAvatar name={adder.display_name} color={adder.color} size={28} />
				<span class="visually-hidden">{m.shopping_added_by({ name: adder.display_name })}</span>
			</span>
		{/if}
		{#if canChange(item)}
			<button
				type="button"
				class="edit"
				aria-label={m.shopping_edit({ name: item.name })}
				onclick={() => (editing = item)}
			>
				<Icon name="edit" size={20} />
			</button>
		{/if}
	</li>
{/snippet}

{#each list.open as group, index (group.category)}
	<!-- IDs aus der Position, nicht aus dem Namen („Obst & Gemüse“ enthält Leerzeichen). -->
	<section class="group" aria-labelledby="category-{index}">
		<h2 id="category-{index}">{group.category}</h2>
		<ul class="items" aria-labelledby="category-{index}">
			{#each group.items as item (item.id)}{@render row(item)}{/each}
		</ul>
	</section>
{/each}

{#if list.done.length > 0}
	<details class="group done-group">
		<summary>{m.shopping_done({ count: list.done.length })}</summary>
		<ul class="items">
			{#each list.done as item (item.id)}{@render row(item)}{/each}
		</ul>
		{#if clearable.length > 0}
			<button class="btn clear" type="button" onclick={() => remove(clearable)}>
				{m.shopping_clear_done()}
			</button>
		{/if}
	</details>
{/if}

{#if undo}
	<div class="toast" role="status">
		<span>{m.shopping_removed({ count: undo.ids.length })}</span>
		<button class="btn" type="button" onclick={undoRemove}>{m.shopping_undo()}</button>
	</div>
{/if}

<ItemDialog item={editing} onclose={() => (editing = null)} ondelete={(item) => remove([item])} />

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.count {
		color: var(--color-text-muted);
		font-weight: 600;
	}

	/* Schnell-Eingabe bleibt beim Scrollen unter der Kopfzeile sichtbar. */
	.quick {
		position: sticky;
		top: calc(var(--header-height) + env(safe-area-inset-top));
		z-index: 5;
		display: flex;
		gap: var(--space-2);
		margin: 0 calc(-1 * var(--space-2)) var(--space-4);
		padding: var(--space-2);
		border-radius: var(--radius-card);
		background: var(--color-bg);
	}

	.quick input {
		flex: 1;
		min-width: 0;
		min-height: 52px;
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: 1.0625rem;
	}

	.quick input:focus-visible {
		border-color: var(--color-primary);
	}

	.quick .btn {
		min-height: 52px;
		padding: 0 var(--space-4);
	}

	.empty h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.group {
		margin-bottom: var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.group h2 {
		margin: var(--space-2) 0 var(--space-1);
		color: var(--color-shopping);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.items {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.items .item:first-child {
		border-top: 0;
	}

	/* Die ganze Zeile hakt ab. */
	.toggle {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		min-height: 56px;
		padding: var(--space-2) 0;
		border: 0;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.box {
		display: grid;
		place-items: center;
		flex: none;
		width: 26px;
		height: 26px;
		border: 2px solid var(--color-text-muted);
		border-radius: 999px;
	}

	.done .box {
		border-color: var(--color-primary);
		background: var(--color-primary);
	}

	/* Häkchen als Rahmen-Ecke (kein Bild nötig). */
	.done .box::after {
		content: '';
		width: 6px;
		height: 11px;
		margin-top: -3px;
		border: solid var(--color-primary-text);
		border-width: 0 2.5px 2.5px 0;
		transform: rotate(45deg);
	}

	.text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		min-width: 0;
	}

	.name {
		font-size: 1.0625rem;
		font-weight: 550;
		overflow-wrap: break-word;
		hyphens: auto;
	}

	.quantity {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		font-variant-numeric: tabular-nums;
	}

	.done .name {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	.adder {
		display: inline-flex;
		flex: none;
	}

	.edit {
		display: inline-grid;
		place-items: center;
		flex: none;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.edit:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
	}

	.done-group summary {
		display: flex;
		align-items: center;
		min-height: var(--touch-target);
		color: var(--color-text-muted);
		font-weight: 650;
		cursor: pointer;
	}

	.clear {
		margin: var(--space-2) 0 var(--space-3);
	}

	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(var(--nav-height) + var(--space-4) + env(safe-area-inset-bottom));
		z-index: 20;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: max-content;
		max-width: calc(100vw - 2 * var(--space-4));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--color-text);
		color: var(--color-bg);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
		transform: translateX(-50%);
	}

	.toast .btn {
		min-height: 40px;
	}

	@media (max-width: 459px) {
		.quick-text {
			display: none;
		}
	}

	@media (min-width: 700px) {
		.toast {
			bottom: var(--space-6);
		}
	}

	@media (min-width: 1100px) {
		.group,
		.quick {
			max-width: 760px;
		}
	}
</style>
