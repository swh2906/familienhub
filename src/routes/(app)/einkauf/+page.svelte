<script lang="ts">
	import { shortcut } from '#lib/ui/shortcut.js';
	// Einkaufsliste im Bring-Stil: Kacheln nach Kategorien, Antippen = gekauft,
	// „Zuletzt gekauft“ zum schnellen Wiederhinzufügen, Vorschläge beim Tippen.
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Membership, ShoppingItem } from '#lib/db/types.js';
	import { normalize } from '#lib/features/meals/recipes.js';
	import ItemDialog from '#lib/features/shopping/ItemDialog.svelte';
	import { formatQuantity, groupItems, parseQuickInput } from '#lib/features/shopping/list.js';
	import ShoppingTile from '#lib/features/shopping/ShoppingTile.svelte';
	import {
		addItem,
		itemsOf,
		membersOf,
		removeItems,
		reopenItem,
		restoreItems,
		toggleItem
	} from '#lib/features/shopping/store.js';
	import { recentItems, suggestions, type Suggestion } from '#lib/features/shopping/suggest.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';

	const household = session.householdId ?? '';
	const membership = session.membership?.id ?? '';

	const data = live(
		() => household,
		async (h) => ({ items: await itemsOf(h), members: await membersOf(h) }),
		{ items: [] as ShoppingItem[], members: [] as Membership[] }
	);

	const list = $derived(groupItems(data.current.items));
	const recent = $derived(recentItems(data.current.items));
	const openCount = $derived(list.open.reduce((sum, group) => sum + group.items.length, 0));
	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));

	let query = $state('');
	let queryInput: HTMLInputElement | undefined = $state();
	let editMode = $state(false);
	let editing: ShoppingItem | null = $state(null);
	let undo: { ids: string[]; timer: ReturnType<typeof setTimeout> } | null = $state(null);

	const parsed = $derived(parseQuickInput(query));
	const proposals = $derived(parsed ? suggestions(parsed.name, data.current.items, 7) : []);

	/** Admins und Erwachsene ändern alles, Kinder nur eigene Artikel. */
	function canChange(item: ShoppingItem): boolean {
		return session.canEdit || item.added_by === membership;
	}

	function adderOf(item: ShoppingItem) {
		const member = members.get(item.added_by);
		return member ? { name: member.display_name, color: member.color } : null;
	}

	function tileLabel(item: ShoppingItem, action: (args: { name: string }) => string): string {
		const quantity = formatQuantity(item);
		const adder = adderOf(item);
		// Reihenfolge wie auf der Kachel (Name, dann Menge), damit der Name zum sichtbaren Text passt.
		const name = [item.name, quantity].filter(Boolean).join(' ');
		return [action({ name }), adder ? m.shopping_tile_added_by({ person: adder.name }) : '']
			.filter(Boolean)
			.join(', ');
	}

	function clearQuery() {
		query = '';
		queryInput?.focus();
	}

	/** Eingabe direkt übernehmen (Enter oder „… hinzufügen“). */
	async function addTyped(event?: SubmitEvent) {
		event?.preventDefault();
		const input = parsed;
		if (!input) return;
		clearQuery();
		// Gibt es den Artikel in „Zuletzt gekauft“, wird er wieder geöffnet statt doppelt angelegt.
		const known = recent.find((item) => normalize(item.name) === normalize(input.name));
		if (known) await reopenItem(known, input);
		else await addItem(household, membership, input, data.current.items);
	}

	async function addSuggestion(suggestion: Suggestion) {
		// Eine getippte Menge gilt für den gewählten Vorschlag („2 l mil“ → „Milch“ = 2 l Milch).
		const typed = parsed;
		clearQuery();
		const input = {
			name: suggestion.name,
			amount: typed?.amount ?? 0,
			unit: typed?.amount ? typed.unit : ''
		};
		if (suggestion.item) await reopenItem(suggestion.item, input);
		else await addItem(household, membership, input, data.current.items);
	}

	/** Im Bearbeiten-Modus öffnet ein Tipp die Details – außer bei Artikeln, die man nicht ändern darf. */
	function editsOnTap(item: ShoppingItem): boolean {
		return editMode && canChange(item);
	}

	function openTile(item: ShoppingItem) {
		if (editsOnTap(item)) editing = item;
		else void toggleItem(item, membership);
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
	<button
		type="button"
		class="btn mode"
		aria-pressed={editMode}
		onclick={() => (editMode = !editMode)}
	>
		{#if !editMode}<Icon name="edit" size={18} />{/if}
		{editMode ? m.shopping_edit_mode_done() : m.shopping_edit_mode()}
	</button>
</div>

{#if editMode}
	<p class="hint edit-hint" role="status">{m.shopping_edit_hint()}</p>
{/if}

<div class="search">
	<form class="quick" onsubmit={addTyped}>
		<label class="visually-hidden" for="quick-add">{m.shopping_quick_label()}</label>
		<input
			id="quick-add"
			{@attach shortcut('n')}
			bind:this={queryInput}
			bind:value={query}
			type="search"
			placeholder={m.shopping_quick_placeholder()}
			autocomplete="off"
			enterkeyhint="done"
			maxlength="200"
		/>
		<button class="btn btn-primary" type="submit" aria-label={m.shopping_quick_submit()}>
			<Icon name="plus" size={22} />
		</button>
	</form>

	{#if parsed}
		<section class="suggest" aria-label={m.shopping_suggestions()}>
			<ul class="grid">
				<li>
					<ShoppingTile
						variant="suggestion"
						name={parsed.name}
						quantity={formatQuantity(parsed)}
						label={m.shopping_add_custom({ text: query.trim() })}
						onactivate={() => addTyped()}
					/>
				</li>
				{#each proposals as suggestion (suggestion.name)}
					<li>
						<ShoppingTile
							variant="recent"
							name={suggestion.name}
							category={suggestion.item?.category ?? ''}
							label={m.shopping_tile_add({ name: suggestion.name })}
							onactivate={() => addSuggestion(suggestion)}
						/>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#if data.loaded && openCount === 0 && !parsed}
	<section class="card empty">
		<h2>{m.shopping_empty_title()}</h2>
		<p class="hint">{m.shopping_empty_text()}</p>
	</section>
{/if}

{#each list.open as group, index (group.category)}
	<!-- IDs aus der Position, nicht aus dem Namen („Obst & Gemüse“ enthält Leerzeichen). -->
	<section class="group" aria-labelledby="category-{index}">
		<h2 id="category-{index}">{group.category}</h2>
		<ul class="grid">
			{#each group.items as item (item.id)}
				<li>
					<ShoppingTile
						variant="open"
						name={item.name}
						quantity={formatQuantity(item)}
						category={item.category}
						adder={adderOf(item)}
						editable={editsOnTap(item)}
						label={editsOnTap(item)
							? m.shopping_edit({ name: item.name })
							: tileLabel(item, m.shopping_tile_buy)}
						onactivate={() => openTile(item)}
						onlongpress={canChange(item) ? () => (editing = item) : undefined}
					/>
				</li>
			{/each}
		</ul>
	</section>
{/each}

{#if recent.length > 0}
	<section class="group recent" aria-labelledby="recent-heading">
		<h2 id="recent-heading">{m.shopping_recent()}</h2>
		<ul class="grid">
			{#each recent as item (item.id)}
				<li>
					<ShoppingTile
						variant="recent"
						name={item.name}
						category={item.category}
						label={editsOnTap(item)
							? m.shopping_edit({ name: item.name })
							: m.shopping_tile_readd({ name: item.name })}
						editable={editsOnTap(item)}
						onactivate={() => (editsOnTap(item) ? (editing = item) : reopenItem(item))}
						onlongpress={canChange(item) ? () => (editing = item) : undefined}
					/>
				</li>
			{/each}
		</ul>
	</section>
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
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
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

	.mode {
		margin-left: auto;
		padding: 0 var(--space-4);
	}

	.mode[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
	}

	.edit-hint {
		margin-bottom: var(--space-3);
	}

	/* Eingabe und Vorschläge bleiben beim Scrollen unter der Kopfzeile sichtbar. */
	.search {
		position: sticky;
		top: calc(var(--header-height) + env(safe-area-inset-top));
		z-index: 5;
		display: grid;
		gap: var(--space-3);
		margin: 0 calc(-1 * var(--space-2)) var(--space-4);
		padding: var(--space-2);
		border-radius: var(--radius-card);
		background: var(--color-bg);
	}

	.quick {
		display: flex;
		gap: var(--space-2);
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
		min-width: 52px;
		min-height: 52px;
		padding: 0;
	}

	.empty h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.group {
		margin-bottom: var(--space-4);
	}

	@media (min-width: 700px) {
		.group {
			margin-bottom: var(--space-6);
		}
	}

	.group h2 {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.recent h2 {
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	/* Bring-Raster: 3 Kacheln nebeneinander auf dem Handy, mehr auf größeren Bildschirmen. */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
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

	@media (min-width: 700px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
		}

		.toast {
			bottom: var(--space-6);
		}
	}
</style>
