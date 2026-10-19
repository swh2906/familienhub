<script lang="ts">
	// Hinweise auf Heute (Schritt 11 D2): oben genau ein aktiver Hinweis, der Rest gebündelt
	// darunter. Jeder Hinweis lässt sich erledigen oder ausblenden („Später“, „Nicht heute“,
	// „Nie wieder so“); nichts passiert still – erst die Antwort ändert Plan, Vorrat oder Aufgaben.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import { repo } from '#lib/db/index.js';
	import type {
		HintResponse,
		Ingredient,
		MealPlanEntry,
		PantryEvent,
		Recipe,
		RecipeIngredient,
		ShoppingItem
	} from '#lib/db/types.js';
	import { addDaysTo, expandEvents } from '#lib/features/calendar/expand.js';
	import { eventsOf as calendarEventsOf } from '#lib/features/calendar/store.js';
	import { deviceTimeZone } from '#lib/features/calendar/tz.js';
	import { entriesBetween } from '#lib/features/meals/plan-store.js';
	import { formatCompactDay, formatShortWeekday } from '#lib/features/meals/week.js';
	import { reasonFor } from '#lib/features/pantry/demand.js';
	import { answerCooked, answerStock, eventsOf } from '#lib/features/pantry/journal.js';
	import { addFromPlan, itemsOf } from '#lib/features/shopping/store.js';
	import type { StockAnswer } from '#lib/features/pantry/stock.js';
	import { baseIngredientsOf } from '#lib/features/pantry/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		buildHints,
		type ConflictHint,
		type Hint,
		type ShoppingHint,
		type StockHint
	} from './build.js';
	import { kindKey, splitHints, visibleHints, type HintAnswer } from './engine.js';
	import { prepareAhead, replaceRecipe, respond, responsesOf, swapEntries } from './store.js';

	let { household, today }: { household: string; today: string } = $props();

	const membership = $derived(session.membership?.id ?? '');
	const timeZone = $derived(session.membership?.expand?.household?.timezone || deviceTimeZone());

	const data = live(
		() => ({ household, today, membership, timeZone }),
		async ({ household, today, membership, timeZone }) => {
			const entries = await entriesBetween(household, addDaysTo(today, -3), addDaysTo(today, 7));
			const planned = [...new Set(entries.map((e) => e.recipe).filter(Boolean))];
			const rows = planned.length
				? await repo('recipe_ingredients').table.where('recipe').anyOf(planned).toArray()
				: [];
			const recipes = (
				await repo('recipes').table.where('household').equals(household).toArray()
			).filter((r) => !r.deleted_at);
			const members = await repo('memberships')
				.table.where('household')
				.equals(household)
				.toArray();
			const events = await calendarEventsOf(household);
			return {
				entries,
				rows,
				recipes,
				ingredients: await baseIngredientsOf(household),
				pantryEvents: await eventsOf(household),
				occurrences: expandEvents(events, today, addDaysTo(today, 6), timeZone),
				adults: members.filter((mb) => !mb.deleted_at && mb.role !== 'child').map((mb) => mb.id),
				responses: membership ? await responsesOf(household, membership) : [],
				openItems: (await itemsOf(household)).filter((i) => !i.deleted_at && !i.checked)
			};
		},
		{
			entries: [] as MealPlanEntry[],
			rows: [] as RecipeIngredient[],
			recipes: [] as Recipe[],
			ingredients: [] as Ingredient[],
			pantryEvents: [] as PantryEvent[],
			occurrences: [] as ReturnType<typeof expandEvents>,
			adults: [] as string[],
			responses: [] as HintResponse[],
			openItems: [] as ShoppingItem[]
		}
	);

	// Uhrzeit nur minütlich – reicht für „Später“ und vergangene Kochzeiten heute.
	let now = $state(new Date());
	$effect(() => {
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});

	const hints = $derived(
		visibleHints(
			buildHints({
				today,
				now,
				nowMinutes: now.getHours() * 60 + now.getMinutes(),
				canEdit: session.canEdit,
				...data.current
			}),
			data.current.responses,
			now
		)
	);
	const split = $derived(splitHints(hints));

	const SLOT_LABEL = { breakfast: m.slot_breakfast, lunch: m.slot_lunch, dinner: m.slot_dinner };
	let busy = $state(false);

	async function run(task: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await task();
		} finally {
			busy = false;
		}
	}

	function answer(hint: Hint, value: HintAnswer) {
		if (!membership) return;
		const key = value === 'never' ? kindKey(hint.kind) : hint.key;
		void run(() => respond(household, membership, key, value));
	}

	/** Aktion ausführen und den Hinweis als erledigt merken. */
	function act(hint: Hint, task: () => Promise<void>) {
		void run(async () => {
			await task();
			if (membership) await respond(household, membership, hint.key, 'done');
		});
	}

	function stock(hint: StockHint, value: StockAnswer) {
		void run(() => answerStock(household, hint.question.ingredient, hint.question.stock, value));
	}

	function shoppingText(hint: ShoppingHint): string {
		const names = hint.need.missing.map((l) => l.name).join(', ');
		return hint.date === today
			? m.hint_shopping_today({ names })
			: m.hint_shopping_tomorrow({ names });
	}

	function shoppingReason(hint: ShoppingHint): string {
		const meals = hint.need.missing.flatMap((l) => l.meals);
		const unique = meals.filter((meal, i) => meals.findIndex((x) => x.entry === meal.entry) === i);
		return reasonFor(unique);
	}

	function timingText(hint: ShoppingHint): string {
		const { timing } = hint.need;
		if (timing.when === 'later') return m.hint_shopping_later({ from: timing.from });
		if (timing.when === 'tomorrow') return m.hint_shopping_no_time();
		return m.hint_shopping_now();
	}

	function addMissing(hint: ShoppingHint, thenShop: boolean) {
		act(hint, async () => {
			await addFromPlan(household, membership, hint.need.missing, data.current.openItems);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- Pfad über resolve(), nur mit Query
			if (thenShop) await goto(`${resolve('/(app)/einkauf')}?modus=einkaufen`);
		});
	}

	function conflictText(hint: ConflictHint): string {
		const { conflict } = hint;
		const blocking = conflict.blocking[0];
		return m.hint_conflict_question({
			day: formatCompactDay(conflict.entry.date),
			title: conflict.entry.title,
			minutes: conflict.minutes,
			from: conflict.from,
			to: conflict.to,
			event: blocking.event.title,
			eventFrom: blocking.startTime,
			eventTo: blocking.endTime
		});
	}
</script>

{#snippet body(hint: Hint)}
	{#if hint.kind === 'conflict'}
		{@const c = hint}
		<p class="question">{conflictText(c)}</p>
		{#if c.conflict.estimated}<p class="meta">{m.hint_conflict_estimated()}</p>{/if}
		<div class="answers">
			{#each c.swaps as other (other.id)}
				<button
					class="btn"
					type="button"
					disabled={busy}
					onclick={() => act(hint, () => swapEntries(c.conflict.entry, other))}
					>{m.hint_conflict_swap({
						day: formatShortWeekday(other.date),
						title: other.title
					})}</button
				>
			{/each}
			{#each c.quicker as recipe (recipe.id)}
				<button
					class="btn"
					type="button"
					disabled={busy}
					onclick={() => act(hint, () => replaceRecipe(c.conflict.entry, recipe))}
					>{m.hint_conflict_quicker({
						title: recipe.title,
						minutes: recipe.prep_minutes ?? 0
					})}</button
				>
			{/each}
			{#if c.prepareOn}
				{@const day = c.prepareOn}
				<button
					class="btn"
					type="button"
					disabled={busy}
					onclick={() => act(hint, () => prepareAhead(household, c.conflict, day))}
					>{m.hint_conflict_prepare({ day: formatShortWeekday(day) })}</button
				>
			{/if}
		</div>
	{:else if hint.kind === 'cooked'}
		{@const entry = hint.entry}
		<p class="question">{m.pantry_cooked_question({ title: entry.title })}</p>
		<p class="meta">{formatCompactDay(entry.date)} · {SLOT_LABEL[entry.slot]()}</p>
		<div class="answers">
			<button
				class="btn btn-primary"
				type="button"
				disabled={busy}
				onclick={() => void run(() => answerCooked(household, entry, 'yes'))}
				>{m.pantry_cooked_yes()}</button
			>
			<button
				class="btn"
				type="button"
				disabled={busy}
				onclick={() => void run(() => answerCooked(household, entry, 'no'))}
				>{m.pantry_cooked_no()}</button
			>
		</div>
	{:else if hint.kind === 'shopping'}
		{@const shop = hint}
		<p class="question">{shoppingText(shop)}</p>
		<p class="meta">{shoppingReason(shop)} · {timingText(shop)}</p>
		<div class="answers">
			<button
				class="btn btn-primary"
				type="button"
				disabled={busy}
				onclick={() => addMissing(shop, false)}>{m.hint_shopping_add()}</button
			>
			<button class="btn" type="button" disabled={busy} onclick={() => addMissing(shop, true)}
				>{m.hint_shopping_go()}</button
			>
		</div>
	{:else}
		{@const s = hint}
		<p class="question">{m.pantry_stock_question({ name: s.question.ingredient.name })}</p>
		<p class="meta">{m.pantry_needed_on({ day: formatCompactDay(s.question.date) })}</p>
		<div class="answers">
			<button class="btn" type="button" disabled={busy} onclick={() => stock(s, 'have')}
				>{m.pantry_answer_have()}</button
			>
			<button class="btn" type="button" disabled={busy} onclick={() => stock(s, 'empty')}
				>{m.pantry_answer_empty()}</button
			>
			<button class="btn" type="button" disabled={busy} onclick={() => stock(s, 'half')}
				>{m.pantry_answer_half()}</button
			>
		</div>
	{/if}
	<div class="dismiss" role="group" aria-label={m.hint_responses_label()}>
		<button class="link" type="button" disabled={busy} onclick={() => answer(hint, 'later')}
			>{m.hint_later()}</button
		>
		<button class="link" type="button" disabled={busy} onclick={() => answer(hint, 'not_today')}
			>{m.hint_not_today()}</button
		>
		<button class="link" type="button" disabled={busy} onclick={() => answer(hint, 'never')}
			>{m.hint_never()}</button
		>
	</div>
{/snippet}

{#if split.active}
	<section class="card hints" aria-labelledby="today-hints">
		<h2 id="today-hints">{m.hint_title()}</h2>
		<div class="active">{@render body(split.active)}</div>
		{#if split.more.length > 0}
			<details>
				<summary>{m.hint_more({ count: split.more.length })}</summary>
				<ul>
					{#each split.more as hint (hint.key)}
						<li>{@render body(hint)}</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>
{/if}

<style>
	.hints {
		grid-column: 1 / -1;
		display: grid;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.question {
		margin: 0;
		font-weight: 600;
	}

	.meta {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.answers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.dismiss {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
		margin-top: var(--space-1);
	}

	.link {
		min-height: var(--touch-target);
		padding: 0 var(--space-2);
		border: 0;
		background: none;
		color: var(--color-text-muted);
		font: inherit;
		font-size: 0.875rem;
		text-decoration: underline;
		cursor: pointer;
	}

	.link:first-child {
		padding-left: 0;
	}

	summary {
		display: flex;
		align-items: center;
		min-height: var(--touch-target);
		cursor: pointer;
		font-weight: 600;
	}

	ul {
		display: grid;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}
</style>
