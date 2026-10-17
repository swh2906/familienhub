<script lang="ts">
	import { shortcut } from '#lib/ui/shortcut.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { CalendarEvent, Membership } from '#lib/db/types.js';
	import Agenda from '#lib/features/calendar/Agenda.svelte';
	import { findConflicts, matchesFilter } from '#lib/features/calendar/conflicts.js';
	import EventDialog from '#lib/features/calendar/EventDialog.svelte';
	import { expandEvents, type Occurrence } from '#lib/features/calendar/expand.js';
	import MonthView from '#lib/features/calendar/MonthView.svelte';
	import { daysFor, parseView, shiftDate, VIEWS, type View } from '#lib/features/calendar/range.js';
	import { eventsOf, type EventTarget } from '#lib/features/calendar/store.js';
	import TimeGrid from '#lib/features/calendar/TimeGrid.svelte';
	import { deviceTimeZone } from '#lib/features/calendar/tz.js';
	import {
		formatDay,
		formatWeekRange,
		fromDateString,
		isoWeek,
		mondayOf,
		toDateString
	} from '#lib/features/meals/week.js';
	import { membersOf } from '#lib/features/shopping/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';

	const household = session.householdId ?? '';
	const timeZone = session.membership?.expand?.household?.timezone || deviceTimeZone();
	const today = toDateString(new Date());
	const base = resolve('/(app)/kalender');

	const view = $derived(parseView(page.url.searchParams.get('ansicht')));
	const date = $derived(
		fromDateString(page.url.searchParams.get('datum') ?? '')
			? page.url.searchParams.get('datum')!
			: today
	);
	const days = $derived(daysFor(view, date));

	const data = live(
		() => household,
		async (h) => ({ events: await eventsOf(h), members: await membersOf(h) }),
		{ events: [] as CalendarEvent[], members: [] as Membership[] }
	);

	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));
	const activeMembers = $derived(data.current.members.filter((member) => !member.deleted_at));
	const all = $derived(expandEvents(data.current.events, days[0], days[days.length - 1], timeZone));
	const conflicts = $derived(findConflicts(all));

	let selectedPeople = $state<string[]>([]);
	const filter = $derived(new Set(selectedPeople));
	const visible = $derived(all.filter((o) => matchesFilter(o, filter)));

	let target: EventTarget | null = $state(null);
	let toast: {
		text: string;
		undo: () => Promise<void>;
		timer: ReturnType<typeof setTimeout>;
	} | null = $state(null);

	const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
	const title = $derived.by(() => {
		const day = fromDateString(date) ?? new Date();
		if (view === 'monat') return monthFormat.format(day);
		if (view === 'woche') {
			return `${m.cal_week_label({ week: isoWeek(day).week })} · ${formatWeekRange(mondayOf(day))}`;
		}
		return formatDay(date);
	});

	function href(nextView: View, nextDate: string): string {
		return `${base}?ansicht=${nextView}&datum=${nextDate}`;
	}

	function select(day: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- href() nutzt resolve()
		void goto(href(view, day), { replace: true, reset: false });
	}

	function open(o: Occurrence) {
		target = { event: o.event, occurrenceDate: o.occurrenceDate, date: o.startDate };
	}

	function create(day: string, time = '09:00') {
		target = { date: day, time };
	}

	function deleted(undo: () => Promise<void>, onlyOne: boolean) {
		if (toast) clearTimeout(toast.timer);
		toast = {
			text: onlyOne ? m.cal_deleted_one() : m.cal_deleted(),
			undo,
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

	const viewLabels: Record<View, () => string> = {
		tag: m.cal_view_day,
		woche: m.cal_view_week,
		monat: m.cal_view_month
	};
	const canEdit = $derived(session.canEdit);
</script>

<svelte:head>
	<title>{m.cal_title()} · {m.app_name()}</title>
</svelte:head>

<div class="head">
	<h1>{m.cal_title()}</h1>
	{#if canEdit}
		<button
			class="btn btn-primary new"
			type="button"
			{@attach shortcut('n')}
			onclick={() => create(view === 'monat' ? date : today)}
		>
			<Icon name="plus" size={20} />
			{m.cal_new()}
		</button>
	{/if}
</div>

<!-- eslint-disable svelte/no-navigation-without-resolve -- href() nutzt resolve() -->
<div class="toolbar">
	<nav class="views" aria-label={m.cal_views_label()}>
		{#each VIEWS as option (option)}
			<a href={href(option, date)} aria-current={view === option ? 'page' : undefined}>
				{viewLabels[option]()}
			</a>
		{/each}
	</nav>
	<nav class="nav" aria-label={m.cal_nav_label()}>
		<a class="btn icon" href={href(view, shiftDate(view, date, -1))} aria-label={m.cal_prev()}>
			<Icon name="up" size={20} />
		</a>
		<a class="btn" href={href(view, today)}>{m.cal_today()}</a>
		<a class="btn icon" href={href(view, shiftDate(view, date, 1))} aria-label={m.cal_next()}>
			<Icon name="down" size={20} />
		</a>
	</nav>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<h2 class="range" aria-live="polite">{title}</h2>

{#if activeMembers.length > 1}
	<div class="filter" role="group" aria-label={m.cal_filter_label()}>
		<button
			type="button"
			class="chip"
			aria-pressed={selectedPeople.length === 0}
			onclick={() => (selectedPeople = [])}
		>
			{m.cal_filter_all()}
		</button>
		{#each activeMembers as member (member.id)}
			{@const pressed = selectedPeople.includes(member.id)}
			<button
				type="button"
				class="chip"
				aria-pressed={pressed}
				onclick={() =>
					(selectedPeople = pressed
						? selectedPeople.filter((id) => id !== member.id)
						: [...selectedPeople, member.id])}
			>
				<MemberAvatar name={member.display_name} color={member.color} size={26} />
				{member.display_name}
			</button>
		{/each}
	</div>
{/if}

{#if view === 'monat'}
	<MonthView
		{days}
		month={date.slice(0, 7)}
		selected={date}
		occurrences={visible}
		{conflicts}
		{members}
		{today}
		onselect={select}
		onopen={canEdit ? open : undefined}
	/>
	<div class="below">
		<Agenda
			days={[date]}
			occurrences={visible}
			{conflicts}
			{members}
			{today}
			onopen={canEdit ? open : undefined}
		/>
	</div>
{:else if view === 'woche'}
	<div class="wide">
		<TimeGrid
			{days}
			occurrences={visible}
			{conflicts}
			{members}
			{today}
			{timeZone}
			onopen={canEdit ? open : undefined}
			oncreate={canEdit ? create : undefined}
		/>
	</div>
	<div class="narrow">
		<Agenda
			{days}
			occurrences={visible}
			{conflicts}
			{members}
			{today}
			onopen={canEdit ? open : undefined}
		/>
	</div>
{:else}
	<TimeGrid
		{days}
		occurrences={visible}
		{conflicts}
		{members}
		{today}
		{timeZone}
		onopen={canEdit ? open : undefined}
		oncreate={canEdit ? create : undefined}
	/>
{/if}

{#if toast}
	<div class="toast" role="status">
		<span>{toast.text}</span>
		<button class="btn" type="button" onclick={runUndo}>{m.shopping_undo()}</button>
	</div>
{/if}

{#if canEdit}
	<EventDialog
		{target}
		{household}
		members={activeMembers}
		events={data.current.events}
		{timeZone}
		onclose={() => (target = null)}
		ondeleted={deleted}
	/>
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.new {
		margin-left: auto;
		padding: 0 var(--space-4);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.views {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: 12px;
		background: var(--color-surface-2);
	}

	.views a {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border-radius: 9px;
		color: var(--color-text-muted);
		font-weight: 600;
		text-decoration: none;
	}

	.views a[aria-current='page'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	.nav {
		display: flex;
		gap: var(--space-2);
	}

	.nav .icon {
		min-width: var(--touch-target);
		padding: 0;
	}

	.nav .icon :global(svg) {
		transform: rotate(-90deg);
	}

	.range {
		margin: var(--space-4) 0 var(--space-3);
		font-size: 1.25rem;
	}

	.filter {
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-1);
		scrollbar-width: none;
	}

	.chip {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
	}

	.chip:has(:global(.avatar)) {
		padding-left: var(--space-1);
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-weight: 650;
	}

	.below {
		margin-top: var(--space-4);
	}

	.wide {
		display: none;
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

	/* Woche: ab Tablet-Breite Zeitachse, auf dem Handy Tagesliste. */
	@media (min-width: 700px) {
		.wide {
			display: block;
		}

		.narrow {
			display: none;
		}

		.toast {
			bottom: var(--space-6);
		}
	}
</style>
