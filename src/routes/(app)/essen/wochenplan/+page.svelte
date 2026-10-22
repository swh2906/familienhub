<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { MealPlanEntry, Recipe } from '#lib/db/types.js';
	import EntryDialog from '#lib/features/meals/EntryDialog.svelte';
	import {
		dishSuggestions,
		groupEntries,
		SLOTS,
		slotKey,
		type DialogTarget,
		type Slot
	} from '#lib/features/meals/plan.js';
	import { allEntries, entriesBetween, moveEntry } from '#lib/features/meals/plan-store.js';
	import { recipesOf } from '#lib/features/meals/store.js';
	import {
		formatDay,
		formatShortDate,
		formatWeekday,
		formatWeekRange,
		isoWeek,
		mondayOf,
		mondayOfWeekKey,
		shiftWeek,
		toDateString,
		weekDays,
		weekKey
	} from '#lib/features/meals/week.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';

	const household = session.householdId ?? '';
	const slotLabels: Record<Slot, () => string> = {
		breakfast: m.slot_breakfast,
		lunch: m.slot_lunch,
		dinner: m.slot_dinner
	};

	const monday = $derived(
		mondayOfWeekKey(page.url.searchParams.get('woche')) ?? mondayOf(new Date())
	);
	const key = $derived(weekKey(monday));
	const days = $derived(weekDays(monday));
	const today = toDateString(new Date());
	const base = resolve('/(app)/essen/wochenplan');

	const week = live(
		() => ({ from: days[0], to: days[6] }),
		({ from, to }) => entriesBetween(household, from, to),
		[] as MealPlanEntry[]
	);
	const extra = live(
		() => household,
		async (h) => ({ entries: await allEntries(h), recipes: await recipesOf(h) }),
		{ entries: [] as MealPlanEntry[], recipes: [] as Recipe[] }
	);

	const groups = $derived(groupEntries(week.current, days));
	const suggestions = $derived(dishSuggestions(extra.current.entries, extra.current.recipes));
	const isEmpty = $derived(groups.size === 0);

	let target: DialogTarget | null = $state(null);
	let dragOver: string | null = $state(null);

	// Handy: Tage stehen untereinander, „heute“ liegt oft weit unten – beim Öffnen dorthin springen.
	onMount(() => {
		if (key !== weekKey(new Date()) || !window.matchMedia('(max-width: 699px)').matches) return;
		document.getElementById(`day-${today}`)?.closest('section')?.scrollIntoView({ block: 'start' });
	});

	function onDrop(event: DragEvent, date: string, slot: Slot) {
		event.preventDefault();
		dragOver = null;
		const id = event.dataTransfer?.getData('text/plain');
		const entry = week.current.find((e) => e.id === id);
		if (entry) void moveEntry(entry, date, slot);
	}
</script>

<svelte:head>
	<title>{m.plan_title()} · {m.app_name()}</title>
</svelte:head>

<div class="head">
	<h1>{m.plan_title()}</h1>
	<nav
		class="weeknav"
		aria-label={m.plan_week_label({ week: isoWeek(monday).week, range: formatWeekRange(monday) })}
	>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- base nutzt resolve(), nur die Woche kommt dazu -->
		<a class="btn icon" href="{base}?woche={shiftWeek(key, -1)}" aria-label={m.plan_prev()}>
			<Icon name="up" size={20} />
		</a>
		<span class="range">
			<strong>{m.plan_week({ week: isoWeek(monday).week })}</strong>
			<span>{formatWeekRange(monday)}</span>
		</span>
		<a class="btn icon" href="{base}?woche={shiftWeek(key, 1)}" aria-label={m.plan_next()}>
			<Icon name="down" size={20} />
		</a>
		{#if key !== weekKey(new Date())}
			<a class="btn" href={base}>{m.plan_today()}</a>
		{/if}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>
</div>

{#if !session.canEdit && week.loaded && isEmpty}
	<p class="hint">{m.plan_empty_child()}</p>
{/if}

<div class="week">
	{#each days as day (day)}
		<section class="day" class:today={day === today} aria-labelledby="day-{day}">
			<h2 id="day-{day}" aria-label={formatDay(day)}>
				<span class="weekday">{formatWeekday(day)}</span>
				<span class="date">{formatShortDate(day)}</span>
				{#if day === today}<span class="badge">{m.plan_today_badge()}</span>{/if}
			</h2>
			{#each SLOTS as slot (slot)}
				{@const entries = groups.get(slotKey(day, slot)) ?? []}
				{@const label = slotLabels[slot]()}
				{@const addLabel = m.plan_add_label({ slot: label, day: formatDay(day) })}
				<div
					class="slot"
					class:over={dragOver === slotKey(day, slot)}
					class:empty={entries.length === 0}
					role="group"
					aria-label="{label}, {formatDay(day)}"
					ondragover={(event) => {
						if (!session.canEdit) return;
						event.preventDefault();
						dragOver = slotKey(day, slot);
					}}
					ondragleave={() => (dragOver = null)}
					ondrop={(event) => onDrop(event, day, slot)}
				>
					<span class="slot-label">{label}</span>
					{#if session.canEdit && entries.length > 0}
						<button
							type="button"
							class="add-small"
							aria-label={addLabel}
							onclick={() => (target = { date: day, slot })}>+</button
						>
					{/if}

					{#each entries as entry (entry.id)}
						<div class="entry">
							{#if session.canEdit}
								<button
									type="button"
									class="dish"
									draggable="true"
									aria-label={m.plan_edit_label({
										title: entry.title,
										slot: label,
										day: formatDay(day)
									})}
									ondragstart={(event) => event.dataTransfer?.setData('text/plain', entry.id)}
									onclick={() => (target = { entry, date: entry.date, slot: entry.slot })}
								>
									{entry.title}
								</button>
							{:else}
								<span class="dish">{entry.title}</span>
							{/if}
							{#if entry.recipe_url}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- externer Link in eine andere App -->
								<a
									class="recipe-link external"
									href={entry.recipe_url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={m.plan_open_recipe_label({ title: entry.title })}
									title={m.plan_open_recipe_label({ title: entry.title })}
								>
									<span aria-hidden="true">↗</span>
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{:else if entry.recipe}
								<a
									class="recipe-link cook"
									href={resolve('/(app)/essen/rezepte/[id]/kochen', { id: entry.recipe })}
									aria-label={m.today_meal_cook({ title: entry.title })}
								>
									{m.cook_start()}
								</a>
							{/if}
						</div>
					{/each}

					{#if session.canEdit && entries.length === 0}
						<button
							type="button"
							class="add"
							aria-label={addLabel}
							onclick={() => (target = { date: day, slot })}
						>
							+ <span class="add-text">{m.plan_add()}</span>
						</button>
					{/if}
				</div>
			{/each}
		</section>
	{/each}
</div>

{#if session.canEdit}
	<p class="hint drag-hint">{m.plan_drag_hint()}</p>
	<EntryDialog
		{target}
		{household}
		{suggestions}
		recipes={extra.current.recipes}
		onclose={() => (target = null)}
	/>
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-display);
		letter-spacing: -0.02em;
	}

	.weeknav {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.weeknav .icon {
		min-width: var(--touch-target);
		padding: 0;
	}

	/* Pfeile nach links/rechts: die vorhandenen Hoch/Runter-Icons gedreht. */
	.weeknav .icon :global(svg) {
		transform: rotate(-90deg);
	}

	.range {
		display: grid;
		min-width: 7.5rem;
		text-align: center;
		line-height: 1.25;
		font-variant-numeric: tabular-nums;
	}

	.range span {
		color: var(--color-text-muted);
		font-size: var(--fs-mini);
	}

	/* ---- Handy: Tage untereinander, Mahlzeiten als Zeilen ---- */

	.week {
		display: grid;
		gap: var(--space-3);
	}

	.day {
		display: grid;
		padding: var(--space-3) var(--space-4) var(--space-2);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.day.today {
		box-shadow:
			0 0 0 2px var(--color-primary),
			var(--shadow-card);
	}

	h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		margin: 0 0 var(--space-1);
		font-size: var(--fs-body);
	}

	.date {
		color: var(--color-text-muted);
		font-weight: 500;
		font-size: var(--fs-small);
	}

	.badge {
		align-self: center;
		padding: 2px var(--space-2);
		border-radius: 999px;
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Handy: eine schlanke Zeile pro Mahlzeit – Bezeichnung, Gericht(e), „+“ am Ende. */
	.slot {
		position: relative;
		display: grid;
		grid-template-columns: 5.5rem minmax(0, 1fr) var(--touch-target);
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-height: var(--touch-target);
		padding: var(--space-1) 0;
		border-top: 1px solid var(--color-border);
	}

	.slot.over {
		border-radius: var(--radius);
		background: var(--color-primary-soft);
		outline: 2px dashed var(--color-primary);
	}

	.slot-label {
		grid-column: 1;
		grid-row: 1;
		color: var(--color-text-muted);
		font-size: var(--fs-mini);
		font-weight: 600;
	}

	.entry {
		grid-column: 2;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-1);
		min-width: 0;
	}

	.dish {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target);
		max-width: 100%;
		padding: var(--space-1) var(--space-3);
		border: 0;
		border-radius: var(--radius);
		background: var(--color-meals-bg);
		color: var(--color-meals);
		font: inherit;
		font-weight: 650;
		line-height: 1.3;
		text-align: left;
		/* Deutsche Silbentrennung statt Umbruch mitten im Wort. */
		hyphens: auto;
		overflow-wrap: break-word;
	}

	button.dish {
		cursor: pointer;
	}

	.recipe-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		color: var(--color-primary-strong);
		font-size: var(--fs-small);
		font-weight: 600;
		text-decoration: none;
	}

	.recipe-link.cook {
		padding: 0 var(--space-2);
	}

	.recipe-link:hover {
		text-decoration: underline;
	}

	.recipe-link.external {
		font-size: var(--fs-body);
	}

	/* „+“: auf dem Handy immer am Zeilenende (leer und gefüllt gleich). */
	.add,
	.add-small {
		grid-column: 3;
		grid-row: 1;
		justify-self: end;
		width: var(--touch-target);
		height: var(--touch-target);
		padding: 0;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text-muted);
		font: inherit;
		font-size: var(--fs-title);
		line-height: 1;
		cursor: pointer;
	}

	.add-small {
		border-color: transparent;
	}

	.add-text {
		display: none;
	}

	.add:hover,
	.add-small:hover {
		border-color: var(--color-primary);
		color: var(--color-primary-strong);
	}

	.drag-hint {
		display: none;
		margin-top: var(--space-3);
	}

	.day {
		scroll-margin-top: calc(var(--header-height, 4rem) + var(--space-3));
	}

	/* ---- Tablet: die drei Mahlzeiten eines Tages nebeneinander, als Kästen ---- */
	@media (min-width: 700px) {
		.day {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: var(--space-2) var(--space-3);
			padding-bottom: var(--space-4);
		}

		h2 {
			grid-column: 1 / -1;
		}

		.slot {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: var(--touch-target);
			grid-auto-rows: auto;
			align-content: start;
			align-items: start;
			padding: var(--space-2);
			border: 1px solid var(--color-border);
			border-radius: var(--radius);
		}

		.slot-label {
			align-self: center;
		}

		.entry {
			grid-column: 1;
		}

		/* Leer: das ganze Feld ist der Hinzufügen-Button. */
		.slot.empty {
			grid-template-rows: var(--touch-target) 1fr;
		}

		.add {
			grid-column: 1;
			grid-row: 2;
			justify-self: stretch;
			align-self: stretch;
			width: auto;
			height: auto;
			min-height: var(--touch-target);
			font-size: var(--fs-body);
		}

		.add-text {
			display: inline;
			font-size: var(--fs-small);
		}

		/* Gefüllt: kleines „+“ oben rechts im Kasten. */
		.add-small {
			position: absolute;
			top: var(--space-1);
			right: var(--space-1);
		}
	}

	/* ---- Desktop: 7 Tage nebeneinander; Kopf- und Mahlzeit-Zeilen über alle Tage gleich hoch ---- */
	@media (min-width: 1100px) {
		.week {
			grid-template-columns: repeat(7, minmax(0, 1fr));
			grid-template-rows: auto repeat(3, minmax(7.5rem, auto));
			gap: var(--space-2);
		}

		.day {
			grid-row: span 4;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: subgrid;
			gap: var(--space-2);
			padding: var(--space-3) var(--space-2);
		}

		h2 {
			display: grid;
			gap: 0;
			font-size: 0.9375rem;
		}

		.badge {
			justify-self: start;
			margin-top: var(--space-1);
		}

		/* Schmale Spalten: etwas kleinere Chips, damit kurze Gerichte in eine Zeile passen. */
		.dish {
			padding: var(--space-1) var(--space-2);
			font-size: var(--fs-small);
		}

		.add-text {
			display: none;
		}

		.drag-hint {
			display: block;
		}
	}
</style>
