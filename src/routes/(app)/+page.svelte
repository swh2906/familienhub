<script lang="ts">
	// Heute-Ansicht: ein Blick am Morgen genügt – Termine, Essen, Einkauf, Aufgaben.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type {
		CalendarEvent,
		MealPlanEntry,
		Membership,
		ShoppingItem,
		Task
	} from '#lib/db/types.js';
	import { findConflicts } from '#lib/features/calendar/conflicts.js';
	import { addDaysTo, expandEvents, onDay } from '#lib/features/calendar/expand.js';
	import { occurrenceColor, timeRange } from '#lib/features/calendar/label.js';
	import { eventsOf } from '#lib/features/calendar/store.js';
	import { deviceTimeZone } from '#lib/features/calendar/tz.js';
	import { SLOTS, type Slot } from '#lib/features/meals/plan.js';
	import { entriesBetween } from '#lib/features/meals/plan-store.js';
	import { formatCompactDay, formatDay, toDateString } from '#lib/features/meals/week.js';
	import { formatQuantity, groupItems, parseQuickInput } from '#lib/features/shopping/list.js';
	import ShoppingTile from '#lib/features/shopping/ShoppingTile.svelte';
	import { addItem, itemsOf, membersOf, toggleItem } from '#lib/features/shopping/store.js';
	import { canComplete, dueKind } from '#lib/features/tasks/list.js';
	import {
		completeTask,
		tasksOf,
		undoCompletion,
		type CompletionUndo
	} from '#lib/features/tasks/store.js';
	import {
		greetingFor,
		isPast,
		nextOccurrence,
		tasksForToday
	} from '#lib/features/today/summary.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';

	const household = session.householdId ?? '';
	const membership = session.membership?.id ?? '';
	const timeZone = session.membership?.expand?.household?.timezone || deviceTimeZone();
	const today = toDateString(new Date());
	const tomorrow = addDaysTo(today, 1);

	const data = live(
		() => household,
		async (h) => ({
			events: await eventsOf(h),
			meals: await entriesBetween(h, today, today),
			items: await itemsOf(h),
			tasks: await tasksOf(h),
			members: await membersOf(h)
		}),
		{
			events: [] as CalendarEvent[],
			meals: [] as MealPlanEntry[],
			items: [] as ShoppingItem[],
			tasks: [] as Task[],
			members: [] as Membership[]
		}
	);

	let now = $state(Date.now());
	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));
	const occurrences = $derived(expandEvents(data.current.events, today, tomorrow, timeZone));
	const todayEvents = $derived(onDay(occurrences, today));
	const tomorrowCount = $derived(onDay(occurrences, tomorrow).length);
	const conflicts = $derived(findConflicts(todayEvents));
	const next = $derived(nextOccurrence(todayEvents, now));

	const meals = $derived(data.current.meals.filter((entry) => !entry.deleted_at));
	const openItems = $derived(groupItems(data.current.items).open.flatMap((group) => group.items));
	const due = $derived(tasksForToday(data.current.tasks, membership, today));

	const name = $derived(
		session.membership?.display_name || session.user?.name || session.user?.username || ''
	);
	const greeting = $derived(
		{
			morning: m.today_greeting_morning,
			day: m.today_greeting_day,
			evening: m.today_greeting_evening,
			night: m.today_greeting_night
		}[greetingFor(new Date(now).getHours())]({ name })
	);

	const slotLabels: Record<Slot, () => string> = {
		breakfast: m.slot_breakfast,
		lunch: m.slot_lunch,
		dinner: m.slot_dinner
	};

	let quick = $state('');
	let toast: {
		text: string;
		undo: () => Promise<void>;
		timer: ReturnType<typeof setTimeout>;
	} | null = $state(null);

	async function addQuick(event: SubmitEvent) {
		event.preventDefault();
		const input = parseQuickInput(quick);
		if (!input) return;
		quick = '';
		await addItem(household, membership, input, data.current.items);
	}

	async function complete(task: Task) {
		const result: CompletionUndo = await completeTask(task, membership, today);
		if (toast) clearTimeout(toast.timer);
		toast = {
			text: m.task_completed({ title: task.title }),
			undo: () => undoCompletion(result),
			timer: setTimeout(() => (toast = null), 8000)
		};
	}

	async function runUndo() {
		if (!toast) return;
		clearTimeout(toast.timer);
		const undo = toast.undo;
		toast = null;
		await undo();
	}

	const calendarToday = `${resolve('/(app)/kalender')}?ansicht=tag&datum=${today}`;
</script>

<svelte:head>
	<title>{m.nav_today()} · {m.app_name()}</title>
</svelte:head>

<header class="intro">
	<h1>{m.nav_today()}</h1>
	<p class="greeting">{greeting}</p>
	<p class="date">{formatDay(today)}</p>
</header>

<div class="cards">
	<!-- Termine -->
	<section class="card events" aria-labelledby="today-events">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- calendarToday nutzt resolve() -->
		<a class="card-head" href={calendarToday}>
			<span class="icon calendar"><Icon name="calendar" size={20} /></span>
			<h2 id="today-events">{m.today_events()}</h2>
			<span class="arrow" aria-hidden="true">›</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{#if todayEvents.length === 0}
			<p class="empty">{m.today_events_empty()}</p>
			{#if session.canEdit}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- calendarToday nutzt resolve() -->
				<a class="btn" href={calendarToday}>{m.today_events_add()}</a>
			{/if}
		{:else}
			<ul class="list">
				{#each todayEvents as o (o.key)}
					<li
						class="event"
						class:past={isPast(o, now)}
						class:next={o.key === next}
						style:--event-color={occurrenceColor(o, members)}
					>
						<span class="time">{timeRange(o)}</span>
						<span class="what">
							<span class="title">
								{o.event.title}
								{#if conflicts.has(o.key)}<span class="warn" title={m.cal_conflict()}
										>⚠<span class="visually-hidden">{m.cal_conflict()}</span></span
									>{/if}
							</span>
							{#if o.key === next}<span class="badge">{m.today_next()}</span>{/if}
						</span>
						<span class="people">
							{#each o.event.participants ?? [] as id (id)}
								{@const person = members.get(id)}
								{#if person}<MemberAvatar
										name={person.display_name}
										color={person.color}
										size={24}
									/>{/if}
							{/each}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="hint">
			{tomorrowCount === 0
				? m.today_tomorrow_none()
				: tomorrowCount === 1
					? m.today_tomorrow_one()
					: m.today_tomorrow({ count: tomorrowCount })}
		</p>
	</section>

	<!-- Essen -->
	<section class="card" aria-labelledby="today-meals">
		<a class="card-head" href={resolve('/(app)/essen/wochenplan')}>
			<span class="icon meals"><Icon name="meals" size={20} /></span>
			<h2 id="today-meals">{m.today_meals()}</h2>
			<span class="arrow" aria-hidden="true">›</span>
		</a>
		{#if meals.length === 0}
			<p class="empty">{m.today_meals_empty()}</p>
			<a class="btn" href={resolve('/(app)/essen/wochenplan')}>{m.today_meals_open()}</a>
		{:else}
			<ul class="list meals-list">
				{#each SLOTS as slot (slot)}
					{@const entries = meals.filter((e) => e.slot === slot)}
					{#if entries.length > 0}
						<li class="meal">
							<span class="slot">{slotLabels[slot]()}</span>
							<span class="dishes">
								{#each entries as entry (entry.id)}
									{#if entry.recipe}
										<a
											class="dish"
											href={resolve('/(app)/essen/rezepte/[id]/kochen', { id: entry.recipe })}
											aria-label={m.today_meal_cook({ title: entry.title })}
											>{entry.title}<span class="go" aria-hidden="true">›</span></a
										>
									{:else if entry.recipe_url}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- externer Link -->
										<a
											class="dish"
											href={entry.recipe_url}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={m.today_meal_external({ title: entry.title })}
											>{entry.title}<span class="go" aria-hidden="true">↗</span></a
										>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{:else}
										<span class="dish plain">{entry.title}</span>
									{/if}
								{/each}
							</span>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Einkauf -->
	<section class="card" aria-labelledby="today-shopping">
		<a class="card-head" href={resolve('/(app)/einkauf')}>
			<span class="icon shopping"><Icon name="shopping" size={20} /></span>
			<h2 id="today-shopping">{m.today_shopping()}</h2>
			{#if openItems.length > 0}<span class="count"
					>{m.shopping_open_count({ count: openItems.length })}</span
				>{/if}
			<span class="arrow" aria-hidden="true">›</span>
		</a>
		<form class="quick" onsubmit={addQuick}>
			<label class="visually-hidden" for="today-quick">{m.shopping_quick_label()}</label>
			<input
				id="today-quick"
				bind:value={quick}
				placeholder={m.today_shopping_placeholder()}
				autocomplete="off"
				enterkeyhint="done"
			/>
			<button class="btn btn-primary" type="submit" aria-label={m.shopping_quick_submit()}>
				<Icon name="plus" size={20} />
			</button>
		</form>
		{#if openItems.length === 0}
			<p class="empty">{m.today_shopping_empty()}</p>
		{:else}
			<ul class="tiles">
				{#each openItems.slice(0, 6) as item (item.id)}
					<li>
						<ShoppingTile
							variant="open"
							name={item.name}
							quantity={formatQuantity(item)}
							category={item.category}
							label={m.shopping_tile_buy({
								name: [item.name, formatQuantity(item)].filter(Boolean).join(' ')
							})}
							onactivate={() => toggleItem(item, membership)}
						/>
					</li>
				{/each}
			</ul>
			{#if openItems.length > 6}
				<p class="hint">{m.today_shopping_more({ count: openItems.length - 6 })}</p>
			{/if}
		{/if}
	</section>

	<!-- Aufgaben -->
	<section class="card" aria-labelledby="today-tasks">
		<a class="card-head" href={resolve('/(app)/aufgaben')}>
			<span class="icon tasks"><Icon name="tasks" size={20} /></span>
			<h2 id="today-tasks">{m.today_tasks()}</h2>
			<span class="arrow" aria-hidden="true">›</span>
		</a>
		{#if due.tasks.length === 0}
			<p class="empty">{m.today_tasks_empty()}</p>
			<a class="btn" href={resolve('/(app)/aufgaben')}>{m.today_tasks_open()}</a>
		{:else}
			<ul class="list">
				{#each due.tasks as task (task.id)}
					{@const allowed = canComplete(task, membership, session.canEdit)}
					<li class="task">
						<button
							type="button"
							class="check"
							disabled={!allowed}
							aria-label={allowed
								? m.task_complete({ title: task.title })
								: m.task_complete_denied({ title: task.title })}
							onclick={() => complete(task)}
						></button>
						<span class="what">
							<span class="title">{task.title}</span>
							{#if dueKind(task.due_date, today) === 'overdue'}
								<span class="overdue"
									>{m.task_due_overdue({ date: formatCompactDay(task.due_date) })}</span
								>
							{/if}
						</span>
						<span class="people">
							{#each task.assignees ?? [] as id (id)}
								{@const person = members.get(id)}
								{#if person}<MemberAvatar
										name={person.display_name}
										color={person.color}
										size={24}
									/>{/if}
							{/each}
						</span>
					</li>
				{/each}
			</ul>
			{#if due.total > due.tasks.length}
				<p class="hint">{m.today_tasks_more({ count: due.total - due.tasks.length })}</p>
			{/if}
		{/if}
	</section>
</div>

{#if toast}
	<div class="toast" role="status">
		<span>{toast.text}</span>
		<button class="btn" type="button" onclick={runUndo}>{m.shopping_undo()}</button>
	</div>
{/if}

<style>
	.intro {
		display: grid;
		gap: 2px;
		margin-bottom: var(--space-6);
	}

	h1 {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.greeting {
		margin: 0;
		font-size: 2rem;
		font-weight: 750;
		letter-spacing: -0.02em;
		line-height: 1.15;
	}

	.date {
		margin: 0;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.cards {
		display: grid;
		gap: var(--space-4);
	}

	.card {
		align-content: start;
		gap: var(--space-3);
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--touch-target);
		margin: calc(-1 * var(--space-2)) 0 0;
		color: var(--color-text);
		text-decoration: none;
	}

	.card-head h2 {
		flex: 1;
		margin: 0;
		font-size: 1.125rem;
	}

	.arrow {
		color: var(--color-text-muted);
		font-size: 1.5rem;
		line-height: 1;
	}

	.count {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
	}

	.icon.calendar {
		background: var(--color-calendar-bg);
		color: var(--color-calendar);
	}

	.icon.meals {
		background: var(--color-meals-bg);
		color: var(--color-meals);
	}

	.icon.shopping {
		background: var(--color-shopping-bg);
		color: var(--color-shopping);
	}

	.icon.tasks {
		background: var(--color-tasks-bg);
		color: var(--color-tasks);
	}

	.empty {
		margin: 0;
		color: var(--color-text-muted);
	}

	.card > .btn {
		justify-self: start;
	}

	.hint {
		margin: 0;
	}

	.list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list > li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 52px;
		padding: var(--space-1) 0;
		border-top: 1px solid var(--color-border);
	}

	.list > li:first-child {
		border-top: 0;
	}

	.event {
		border-left: 4px solid var(--event-color);
		padding-left: var(--space-3) !important;
	}

	.event.past {
		opacity: 0.55;
	}

	.event.next {
		background: var(--color-calendar-bg);
		border-radius: 0 var(--radius) var(--radius) 0;
	}

	.time {
		flex: none;
		width: 5.25rem;
		color: var(--color-calendar);
		font-size: 0.8125rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}

	.what {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.title {
		font-weight: 600;
		overflow-wrap: break-word;
		hyphens: auto;
	}

	.warn {
		color: var(--color-warning);
	}

	.badge {
		justify-self: start;
		color: var(--color-calendar);
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.people {
		display: flex;
		flex: none;
	}

	.people :global(.avatar + .avatar) {
		margin-left: -6px;
	}

	.meal {
		padding: 0 !important;
	}

	.slot {
		flex: none;
		width: 4.75rem;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.dishes {
		display: grid;
		gap: 2px;
	}

	/* Ganzes Gericht antippbar: Homi-Rezept → Kochansicht, externer Link → Rezept-App. */
	.dish {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target);
		color: var(--color-text);
		font-weight: 600;
		text-decoration: none;
	}

	a.dish:hover {
		text-decoration: underline;
	}

	.dish.plain {
		min-height: 0;
	}

	.go {
		color: var(--color-primary-strong);
	}

	.quick {
		display: flex;
		gap: var(--space-2);
	}

	.quick input {
		flex: 1;
		min-width: 0;
		min-height: var(--touch-target);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	.quick .btn {
		min-width: var(--touch-target);
		padding: 0;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.check {
		position: relative;
		flex: none;
		width: var(--touch-target);
		height: var(--touch-target);
		margin: calc(-1 * var(--space-2)) 0;
		border: 0;
		border-radius: 999px;
		background: transparent;
		cursor: pointer;
	}

	.check::before {
		content: '';
		position: absolute;
		inset: 12px;
		border: 2px solid var(--color-tasks);
		border-radius: 999px;
	}

	.check:hover:not(:disabled)::before {
		background: var(--color-tasks-bg);
	}

	.check:disabled {
		cursor: not-allowed;
	}

	.check:disabled::before {
		border-style: dashed;
		border-color: var(--color-text-muted);
	}

	.overdue {
		color: var(--color-warning);
		font-size: 0.8125rem;
		font-weight: 700;
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

	/* Tablet: zwei Spalten; Desktop: Raster 2 × 2. */
	@media (min-width: 700px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		/* Karten einer Reihe gleich hoch, Inhalt oben. */
		.cards > .card {
			align-content: start;
		}

		.toast {
			bottom: var(--space-6);
		}
	}

	@media (min-width: 1100px) {
		.card {
			padding: var(--space-6);
		}
	}
</style>
