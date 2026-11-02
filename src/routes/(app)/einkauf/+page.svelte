<script lang="ts">
	import { shortcut } from '#lib/ui/shortcut.js';
	// Einkaufsliste im Bring-Stil: Kacheln nach Kategorien, Antippen = gekauft,
	// „Zuletzt gekauft“ zum schnellen Wiederhinzufügen, Vorschläge beim Tippen.
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Membership, ShoppingItem } from '#lib/db/types.js';
	import { normalize } from '#lib/features/meals/recipes.js';
	import { toDateString } from '#lib/features/meals/week.js';
	import ItemDialog from '#lib/features/shopping/ItemDialog.svelte';
	import PlanTransferDialog from '#lib/features/shopping/PlanTransferDialog.svelte';
	import ShoppingMode from '#lib/features/shopping/ShoppingMode.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatQuantity, groupItems, parseQuickInput } from '#lib/features/shopping/list.js';
	import ShoppingRow from '#lib/features/shopping/ShoppingRow.svelte';
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
	let transferOpen = $state(false);

	// Einkaufsmodus über die Adresse (?modus=einkaufen), damit der Hinweis auf Heute hineinführt.
	const shopping = $derived(page.url.searchParams.get('modus') === 'einkaufen');
	let finished = $state(false);

	function setShopping(on: boolean) {
		const url = new URL(page.url.href);
		if (on) url.searchParams.set('modus', 'einkaufen');
		else url.searchParams.delete('modus');
		finished = !on;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- gleiche Seite, nur Query
		void goto(url, { replace: true, reset: false });
	}
	let transferred: { count: number; timer: ReturnType<typeof setTimeout> } | null = $state(null);

	function showTransferred(count: number) {
		if (transferred) clearTimeout(transferred.timer);
		transferred = { count, timer: setTimeout(() => (transferred = null), 6000) };
	}

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
		return [
			action({ name }),
			adder ? m.shopping_tile_added_by({ person: adder.name }) : '',
			item.reason ?? ''
		]
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
	{#if !shopping}
		<button type="button" class="btn shop" onclick={() => setShopping(true)}>
			<Icon name="shopping" size={18} />
			{m.shop_mode_start()}
		</button>
	{/if}
	<button type="button" class="btn plan" onclick={() => (transferOpen = true)}>
		<Icon name="meals" size={18} />
		{m.plan_transfer_open()}
	</button>
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

{#if shopping}
	<ShoppingMode
		{household}
		{membership}
		today={toDateString(new Date())}
		history={data.current.items}
		onfinish={() => setShopping(false)}
	/>
{:else if finished}
	<p class="hint finished" role="status">{m.shop_mode_finished()}</p>
{/if}

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

<div class="groups">
	{#each list.open as group, index (group.category)}
		<!-- IDs aus der Position, nicht aus dem Namen („Obst & Gemüse“ enthält Leerzeichen). -->
		<section class="group" aria-labelledby="category-{index}">
			<h2 id="category-{index}">{group.category}</h2>
			<ul class="rows">
				{#each group.items as item (item.id)}
					<li>
						<ShoppingRow
							variant="open"
							name={item.name}
							quantity={formatQuantity(item)}
							category={item.category}
							detail={item.reason ?? ''}
							adder={adderOf(item)}
							fromPlan={!!item.reason}
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
</div>

{#if recent.length > 0}
	<section class="group recent" aria-labelledby="recent-heading">
		<h2 id="recent-heading">{m.shopping_recent()}</h2>
		<ul class="rows">
			{#each recent as item (item.id)}
				<li>
					<ShoppingRow
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

{#if transferred}
	<div class="toast" role="status">
		<span>{m.plan_transfer_done({ count: transferred.count })}</span>
	</div>
{/if}

<PlanTransferDialog
	open={transferOpen}
	{household}
	{membership}
	today={toDateString(new Date())}
	history={data.current.items}
	onclose={() => (transferOpen = false)}
	ondone={showTransferred}
/>

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
		font-size: var(--fs-display);
	}

	.count {
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.shop {
		margin-left: auto;
		padding: 0 var(--space-4);
	}

	.plan {
		padding: 0 var(--space-4);
	}

	.finished {
		margin-bottom: var(--space-3);
	}

	.mode {
		padding: 0 var(--space-4);
	}

	.mode[aria-pressed='true'] {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-on-ink);
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
		padding: 0 var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--fs-lead);
		font-weight: 600;
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
		margin: 0 var(--space-1) var(--space-2);
		font-size: var(--fs-lead);
	}

	.recent h2 {
		color: var(--color-text-muted);
	}

	/* Liste je Kategorie als Karte mit Trennlinien (Entwurf C). */
	.rows {
		margin: 0;
		padding: 0 var(--space-4);
		list-style: none;
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.rows > li + li {
		border-top: 1px solid var(--color-border);
	}

	.recent .rows {
		background: var(--color-surface-2);
		box-shadow: none;
	}

	/* Breite Bildschirme: Kategorien nebeneinander. */
	@media (min-width: 900px) {
		.groups {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
			gap: 0 var(--space-6);
			align-items: start;
		}
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
