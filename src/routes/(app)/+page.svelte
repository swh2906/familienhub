<script lang="ts">
	// Heute-Dashboard: Überblick in Zahlen, was als Nächstes ansteht, die nächsten 7 Tage,
	// dazu Einkauf und Aufgaben zum direkten Erledigen.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type {
		CalendarEvent,
		MealPlanEntry,
		Membership,
		Recipe,
		ShoppingItem,
		Task
	} from '#lib/db/types.js';
	import { addDaysTo, expandEvents, onDay } from '#lib/features/calendar/expand.js';
	import { occurrenceColor, timeRange } from '#lib/features/calendar/label.js';
	import { eventsOf } from '#lib/features/calendar/store.js';
	import { deviceTimeZone, utcToZoned } from '#lib/features/calendar/tz.js';
	import { entriesBetween } from '#lib/features/meals/plan-store.js';
	import { recipesOf } from '#lib/features/meals/store.js';
	import {
		formatCompactDay,
		formatDay,
		formatShortDate,
		formatShortWeekday,
		fromDateString,
		toDateString,
		weekKey
	} from '#lib/features/meals/week.js';
	import HintCenter from '#lib/features/hints/HintCenter.svelte';
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
		eventsInScope,
		loadScope,
		saveScope,
		stats,
		tasksInScope,
		upNext,
		weekStrip,
		type Scope
	} from '#lib/features/today/dashboard.js';
	import { greetingFor, tasksForToday } from '#lib/features/today/summary.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';

	const household = session.householdId ?? '';
	const membership = session.membership?.id ?? '';
	const timeZone = session.membership?.expand?.household?.timezone || deviceTimeZone();
	const today = toDateString(new Date());
	const lastDay = addDaysTo(today, 6);

	/** Höchstens so viele Einkaufskacheln, der Rest steht in der Liste. */
	const TILE_LIMIT = 4;

	const data = live(
		() => household,
		async (h) => ({
			events: await eventsOf(h),
			meals: await entriesBetween(h, today, lastDay),
			recipes: await recipesOf(h),
			items: await itemsOf(h),
			tasks: await tasksOf(h),
			members: await membersOf(h)
		}),
		{
			events: [] as CalendarEvent[],
			meals: [] as MealPlanEntry[],
			recipes: [] as Recipe[],
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

	let scope: Scope = $state(loadScope(session.membership?.role === 'child'));
	function setScope(value: Scope) {
		scope = value;
		saveScope(value);
	}

	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));
	const occurrences = $derived(
		eventsInScope(expandEvents(data.current.events, today, lastDay, timeZone), scope, membership)
	);
	const tasks = $derived(tasksInScope(data.current.tasks, scope, membership));
	const todayEvents = $derived(onDay(occurrences, today));
	const allDayToday = $derived(todayEvents.filter((o) => o.allDay));
	const openItems = $derived(groupItems(data.current.items).open.flatMap((group) => group.items));

	const overview = $derived(
		stats({ todayEvents, tasks, openShopping: openItems.length, today, now })
	);
	const next = $derived(
		upNext({
			todayEvents,
			meals: data.current.meals,
			recipes: data.current.recipes,
			today,
			nowMinutes: utcToZoned(now, timeZone).minutes
		})
	);
	const week = $derived(weekStrip({ occurrences, meals: data.current.meals, tasks, today }));
	const due = $derived(tasksForToday(tasks, membership, today));

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

	const calendarDay = (date: string) => `${resolve('/(app)/kalender')}?ansicht=tag&datum=${date}`;
	const mealPlanWeek = (date: string) => {
		const day = fromDateString(date);
		const base = resolve('/(app)/essen/wochenplan');
		return day ? `${base}?woche=${weekKey(day)}` : base;
	};

	function dayName(date: string, index: number): string {
		if (index === 0) return m.today_week_today();
		if (index === 1) return m.today_week_tomorrow();
		return formatShortWeekday(date);
	}

	function eventCount(count: number): string {
		if (count === 0) return m.today_week_events_none();
		return count === 1 ? m.today_week_events_one() : m.today_week_events({ count });
	}
</script>

<svelte:head>
	<title>{m.nav_today()} · {m.app_name()}</title>
</svelte:head>

<header class="intro">
	<div class="hello">
		<h1>{m.nav_today()}</h1>
		<p class="greeting">{greeting}</p>
		<p class="date">{formatDay(today)}</p>
	</div>
	<div class="scope" role="group" aria-label={m.today_scope_label()}>
		<button type="button" aria-pressed={scope === 'all'} onclick={() => setScope('all')}
			>{m.today_scope_all()}</button
		>
		<button type="button" aria-pressed={scope === 'mine'} onclick={() => setScope('mine')}
			>{m.today_scope_mine()}</button
		>
	</div>
</header>

<!-- Kennzahlen: ein Blick, was heute ansteht; jede Zahl führt in den Bereich. -->
<nav class="stats" aria-label={m.today_stats_label()}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- calendarDay nutzt resolve() -->
	<a class="stat calendar" href={calendarDay(today)}>
		<span class="value">{overview.events}</span>
		<span class="label">{m.today_stat_events()}</span>
		{#if overview.eventsLeft < overview.events}
			<span class="sub">{m.today_stat_events_left({ count: overview.eventsLeft })}</span>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	<a class="stat shopping" href={resolve('/(app)/einkauf')}>
		<span class="value">{overview.shopping}</span>
		<span class="label">{m.today_stat_shopping()}</span>
	</a>
	<a class="stat tasks" href={resolve('/(app)/aufgaben')}>
		<span class="value">{overview.tasks}</span>
		<span class="label">{m.today_stat_tasks()}</span>
		{#if overview.overdue > 0}
			<span class="sub warn-text">{m.today_stat_overdue({ count: overview.overdue })}</span>
		{/if}
	</a>
	{#if overview.conflicts > 0}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- calendarDay nutzt resolve() -->
		<a class="stat conflicts" href={calendarDay(today)}>
			<span class="value">⚠ {overview.conflicts}</span>
			<span class="label"
				>{overview.conflicts === 1 ? m.today_stat_conflicts_one() : m.today_stat_conflicts()}</span
			>
		</a>
	{/if}
</nav>

<div class="cards">
	{#if session.householdId}
		<HintCenter household={session.householdId} {today} />
	{/if}

	<!-- Als Nächstes: Termine und Kochbeginn, zeitlich sortiert -->
	<section class="card upnext" aria-labelledby="today-upnext">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- calendarDay nutzt resolve() -->
		<a class="card-head" href={calendarDay(today)}>
			<span class="icon calendar"><Icon name="today" size={20} /></span>
			<h2 id="today-upnext">{m.today_upnext()}</h2>
			<span class="arrow" aria-hidden="true">›</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{#if allDayToday.length > 0}
			<p class="allday">
				<span class="allday-label">{m.today_allday()}</span>
				{allDayToday.map((o) => o.event.title).join(' · ')}
			</p>
		{/if}
		{#if next.length === 0}
			<p class="empty">{m.today_upnext_empty()}</p>
			{#if session.canEdit && todayEvents.length === 0}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- calendarDay nutzt resolve() -->
				<a class="btn" href={calendarDay(today)}>{m.today_upnext_add()}</a>
			{/if}
		{:else}
			<ol class="list">
				{#each next as item, index (item.key)}
					{#if item.kind === 'event'}
						{@const o = item.occurrence}
						<li
							class="event"
							class:first={index === 0}
							style:--event-color={occurrenceColor(o, members)}
						>
							<span class="time">{timeRange(o)}</span>
							<span class="what">
								<span class="title">{o.event.title}</span>
								{#if item.running}<span class="badge">{m.today_upnext_running()}</span>{/if}
								{#if item.clashes.length > 0}
									<span class="clash"
										><span aria-hidden="true">⚠</span>
										{m.today_upnext_clash({ titles: item.clashes.join(', ') })}</span
									>
								{/if}
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
					{:else}
						{@const entry = item.entry}
						<li class="event meal" class:first={index === 0}>
							<span class="time">{item.at}</span>
							<span class="what">
								{#if entry.recipe}
									<a
										class="title dish"
										href={resolve('/(app)/essen/rezepte/[id]/kochen', { id: entry.recipe })}
										aria-label={m.today_upnext_cook_link({ title: entry.title, time: item.at })}
										>{m.today_upnext_cook({ title: entry.title })}<span
											class="go"
											aria-hidden="true">›</span
										></a
									>
								{:else}
									<span class="title">{m.today_upnext_cook({ title: entry.title })}</span>
								{/if}
								<span class="detail">
									{item.estimated
										? m.today_upnext_cook_estimated({ minutes: item.minutes, time: item.mealTime })
										: m.today_upnext_cook_detail({ minutes: item.minutes, time: item.mealTime })}
								</span>
							</span>
						</li>
					{/if}
				{/each}
			</ol>
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

	<!-- Die nächsten 7 Tage: Termine, Essen, fällige Aufgaben je Tag -->
	<section class="card week-card" aria-labelledby="today-week">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- calendarDay nutzt resolve() -->
		<a class="card-head" href={`${resolve('/(app)/kalender')}?ansicht=woche&datum=${today}`}>
			<span class="icon calendar"><Icon name="calendar" size={20} /></span>
			<h2 id="today-week">{m.today_week()}</h2>
			<span class="arrow" aria-hidden="true">›</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<ol class="week">
			{#each week as day, index (day.date)}
				<li class="day" class:is-today={day.isToday}>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- calendarDay nutzt resolve() -->
					<a class="day-link" href={calendarDay(day.date)}>
						<span class="day-name">
							<strong>{dayName(day.date, index)}</strong>
							<span class="day-date">{formatShortDate(day.date)}</span>
						</span>
						<span class="day-events">
							{#if day.people.length > 0}
								<span class="dots" aria-hidden="true">
									{#each day.people.slice(0, 3) as id (id)}
										{@const person = members.get(id)}
										{#if person}<MemberAvatar
												name={person.display_name}
												color={person.color}
												size={20}
											/>{/if}
									{/each}
								</span>
							{/if}
							<span class:muted={day.events.length === 0}>{eventCount(day.events.length)}</span>
							{#if day.hasConflict}<span class="warn" title={m.cal_conflict()}
									>⚠<span class="visually-hidden">{m.cal_conflict()}</span></span
								>{/if}
						</span>
						{#if day.tasks > 0}
							<span class="day-tasks">
								{day.tasks === 1
									? m.today_week_tasks_one()
									: m.today_week_tasks({ count: day.tasks })}
							</span>
						{/if}
					</a>
					<span class="day-meals">
						{#each day.meals as entry (entry.id)}
							{#if day.isToday && entry.recipe}
								<a
									class="dish"
									href={resolve('/(app)/essen/rezepte/[id]/kochen', { id: entry.recipe })}
									aria-label={m.today_meal_cook({ title: entry.title })}
									>{entry.title}<span class="go" aria-hidden="true">›</span></a
								>
							{:else if day.isToday && entry.recipe_url}
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
								<!-- eslint-disable svelte/no-navigation-without-resolve -- mealPlanWeek nutzt resolve() -->
								<a
									class="dish"
									href={mealPlanWeek(day.date)}
									aria-label={m.today_week_meal_plan({ title: entry.title })}>{entry.title}</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/if}
						{:else}
							{#if session.canEdit}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mealPlanWeek nutzt resolve() -->
								<a class="dish plan" href={mealPlanWeek(day.date)}>{m.today_week_plan()}</a>
							{:else}
								<span class="muted">{m.today_week_no_meal()}</span>
							{/if}
						{/each}
					</span>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Einkauf -->
	<section class="card shopping-card" aria-labelledby="today-shopping">
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
				{#each openItems.slice(0, TILE_LIMIT) as item (item.id)}
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
			{#if openItems.length > TILE_LIMIT}
				<p class="hint">{m.today_shopping_more({ count: openItems.length - TILE_LIMIT })}</p>
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
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.hello {
		display: grid;
		gap: 2px;
	}

	/* Umschalter „Alle / Nur meins“ (wie die Reiter der Aufgaben). */
	.scope {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: 12px;
		background: var(--color-surface-2);
	}

	.scope button {
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--color-text-muted);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.scope button[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	/* Kennzahlen: auf dem Handy 2 × 2, ab Tablet in einer Reihe. */
	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.stat {
		display: grid;
		align-content: start;
		gap: 2px;
		min-height: 72px;
		padding: var(--space-3);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
		border-left: 4px solid var(--stat-color);
	}

	.stat:hover {
		background: var(--stat-bg);
	}

	.stat.calendar {
		--stat-color: var(--color-calendar);
		--stat-bg: var(--color-calendar-bg);
	}

	.stat.shopping {
		--stat-color: var(--color-shopping);
		--stat-bg: var(--color-shopping-bg);
	}

	.stat.tasks {
		--stat-color: var(--color-tasks);
		--stat-bg: var(--color-tasks-bg);
	}

	.stat.conflicts {
		--stat-color: var(--color-warning);
		--stat-bg: var(--color-surface-2);
	}

	.stat .value {
		font-size: 1.5rem;
		font-weight: 750;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.stat.conflicts .value {
		color: var(--color-warning);
	}

	.stat .label {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.stat .sub {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.warn-text {
		color: var(--color-warning) !important;
		font-weight: 700;
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
		border-left: 4px solid var(--event-color, var(--color-meals));
		padding-left: var(--space-3) !important;
	}

	.event.first {
		background: var(--color-calendar-bg);
		border-radius: 0 var(--radius) var(--radius) 0;
	}

	.event.meal.first {
		background: var(--color-meals-bg);
	}

	.event.meal .time {
		color: var(--color-meals);
	}

	.detail {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.clash {
		color: var(--color-warning);
		font-size: 0.8125rem;
		font-weight: 650;
	}

	.allday {
		margin: 0;
		font-weight: 600;
	}

	.allday-label {
		margin-right: var(--space-2);
		color: var(--color-calendar);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	/* Nächste 7 Tage: Handy Zeilen, Desktop Spalten. */
	.week {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.day {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) 0;
		border-top: 1px solid var(--color-border);
	}

	.day:first-child {
		border-top: 0;
	}

	.day.is-today {
		margin: 0 calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius);
		background: var(--color-calendar-bg);
	}

	.day.is-today + .day {
		border-top: 0;
	}

	.day-link {
		display: grid;
		gap: 2px;
		min-height: var(--touch-target);
		padding: var(--space-1) 0;
		color: var(--color-text);
		text-decoration: none;
	}

	.day-link:hover .day-name strong {
		text-decoration: underline;
	}

	.day-name {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.day-date,
	.muted {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.day-events {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
	}

	.dots {
		display: flex;
	}

	.dots :global(.avatar + .avatar) {
		margin-left: -5px;
	}

	.day-tasks {
		color: var(--color-tasks);
		font-size: 0.8125rem;
		font-weight: 650;
	}

	.day-meals {
		display: grid;
		justify-items: start;
		min-width: 0;
	}

	.day-meals .dish {
		display: block;
		max-width: 100%;
		line-height: var(--touch-target);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dish.plan {
		color: var(--color-primary-strong);
		font-weight: 600;
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

	/* Tablet: zwei Spalten, Wochenstreifen über die ganze Breite. */
	@media (min-width: 700px) {
		.stats {
			grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		}

		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		/* Hinweise und Woche über die ganze Breite, die Woche unter den Karten. */
		.cards > :global(.hints),
		.week-card {
			grid-column: 1 / -1;
		}

		.week-card {
			order: 1;
		}

		.shopping-card {
			grid-column: 1 / -1;
		}

		/* Karten einer Reihe gleich hoch, Inhalt oben. */
		.cards > .card {
			align-content: start;
		}

		.toast {
			bottom: var(--space-6);
		}
	}

	/* Desktop: Woche als sieben Spalten. */
	@media (min-width: 1100px) {
		.card {
			padding: var(--space-6);
		}

		.week {
			grid-template-columns: repeat(7, minmax(0, 1fr));
			gap: var(--space-2);
		}

		.day,
		.day.is-today {
			grid-template-columns: minmax(0, 1fr);
			align-content: start;
			align-items: start;
			margin: 0;
			padding: var(--space-2);
			border: 1px solid var(--color-border);
			border-radius: var(--radius);
		}

		.day.is-today {
			border-color: var(--color-calendar);
		}

		.day-name {
			flex-direction: column;
			gap: 0;
		}

		.day-events {
			flex-wrap: wrap;
		}

		/* In der schmalen Spalte umbrechen statt abschneiden. */
		.day-meals .dish {
			display: flex;
			align-items: center;
			min-height: 40px;
			line-height: 1.3;
			white-space: normal;
			overflow-wrap: anywhere;
			hyphens: auto;
		}

		/* Desktop: Als Nächstes, Aufgaben, Einkauf nebeneinander. */
		.cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.shopping-card {
			grid-column: auto;
		}
	}
</style>
