<script lang="ts">
	// Zeitachse für einen oder mehrere Tage: ganztägige Termine oben, Termine nach Uhrzeit,
	// überlappende nebeneinander. Klick auf eine freie Stelle legt dort einen Termin an.
	import { onMount } from 'svelte';
	import type { Membership } from '#lib/db/types.js';
	import { formatShortDate, formatWeekday } from '#lib/features/meals/week.js';
	import { m } from '#lib/paraglide/messages.js';
	import { layoutColumns } from './conflicts.js';
	import { onDay, type Occurrence } from './expand.js';
	import { describeOccurrence, occurrenceColor, timeRange } from './label.js';
	import { utcToZoned } from './tz.js';

	let {
		days,
		occurrences,
		conflicts,
		members,
		today,
		timeZone,
		onopen,
		oncreate
	}: {
		days: string[];
		occurrences: Occurrence[];
		conflicts: ReadonlySet<string>;
		members: ReadonlyMap<string, Membership>;
		today: string;
		timeZone: string;
		onopen?: (o: Occurrence) => void;
		oncreate?: (date: string, time: string) => void;
	} = $props();

	const HOUR_PX = 48;
	const hours = Array.from({ length: 24 }, (_, h) => h);
	let scroller: HTMLDivElement | undefined = $state();
	let now = $state(Date.now());

	onMount(() => {
		// Auf 7 Uhr scrollen, damit der Tag sichtbar ist.
		if (scroller) scroller.scrollTop = 7 * HOUR_PX;
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	const nowZoned = $derived(utcToZoned(now, timeZone));

	/** Zeitlich platzierte Termine eines Tages (auf den Tag zugeschnitten). */
	function placed(day: string) {
		const timed = onDay(occurrences, day).filter((o) => !o.allDay);
		return layoutColumns(timed).map((p) => {
			const o = p.occurrence;
			const start = o.startDate === day ? toMinutes(o.startTime) : 0;
			const end = o.endDate === day ? toMinutes(o.endTime) : 24 * 60;
			return { ...p, top: start, height: Math.max(end - start, 20) };
		});
	}

	function toMinutes(time: string): number {
		const [h, mi] = time.split(':').map(Number);
		return h * 60 + mi;
	}

	function createAt(event: MouseEvent, day: string) {
		if (!oncreate || event.target !== event.currentTarget) return;
		const y = event.offsetY;
		const minutes = Math.floor(y / HOUR_PX) * 60 + (y % HOUR_PX >= HOUR_PX / 2 ? 30 : 0);
		const h = String(Math.floor(minutes / 60)).padStart(2, '0');
		const mi = String(minutes % 60).padStart(2, '0');
		oncreate(day, `${h}:${mi}`);
	}
</script>

<div class="grid" style:--days={days.length}>
	{#if days.length > 1}
		<div class="head" aria-hidden="true">
			<span></span>
			{#each days as day (day)}
				<span class="dayname" class:today={day === today}>
					<strong>{formatWeekday(day).slice(0, 2)}</strong>
					{formatShortDate(day)}
				</span>
			{/each}
		</div>
	{/if}

	<div class="allday">
		<span class="label">{m.cal_all_day()}</span>
		{#each days as day (day)}
			<div class="allday-cell">
				{#each onDay(occurrences, day).filter((o) => o.allDay) as o (o.key)}
					{@render chip(o, true)}
				{/each}
			</div>
		{/each}
	</div>

	<div class="scroller" bind:this={scroller}>
		<div class="body" style:height="{24 * HOUR_PX}px">
			<div class="hours" aria-hidden="true">
				{#each hours as h (h)}
					<span style:top="{h * HOUR_PX}px">{String(h).padStart(2, '0')}:00</span>
				{/each}
			</div>
			{#each days as day (day)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div class="column" class:today={day === today} onclick={(e) => createAt(e, day)}>
					{#each placed(day) as p (p.occurrence.key)}
						<div
							class="slot"
							style:top="{(p.top / 60) * HOUR_PX}px"
							style:height="{(p.height / 60) * HOUR_PX}px"
							style:left="{(p.column / p.columns) * 100}%"
							style:width="{100 / p.columns}%"
						>
							{@render chip(p.occurrence, false)}
						</div>
					{/each}
					{#if day === nowZoned.date}
						<div class="now" style:top="{(nowZoned.minutes / 60) * HOUR_PX}px"></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

{#snippet chip(o: Occurrence, allDay: boolean)}
	{@const conflict = conflicts.has(o.key)}
	{@const label = describeOccurrence(o, members, conflict)}
	{#if onopen}
		<button
			type="button"
			class="event"
			class:allday-event={allDay}
			class:conflict
			style:--event-color={occurrenceColor(o, members)}
			aria-label={label}
			title={label}
			onclick={() => onopen?.(o)}
		>
			{@render text(o, conflict)}
		</button>
	{:else}
		<div
			class="event"
			class:allday-event={allDay}
			class:conflict
			style:--event-color={occurrenceColor(o, members)}
			title={label}
		>
			{@render text(o, conflict)}
		</div>
	{/if}
{/snippet}

{#snippet text(o: Occurrence, conflict: boolean)}
	<span class="event-title"
		>{#if conflict}⚠
		{/if}{o.event.title}</span
	>
	{#if !o.allDay}<span class="event-time">{timeRange(o)}</span>{/if}
{/snippet}

<style>
	.grid {
		--label: 3.25rem;
		display: grid;
		overflow: hidden;
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.head,
	.allday {
		display: grid;
		grid-template-columns: var(--label) repeat(var(--days), minmax(0, 1fr));
		border-bottom: 1px solid var(--color-border);
	}

	.dayname {
		padding: var(--space-2) var(--space-1);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		text-align: center;
	}

	.dayname strong {
		color: var(--color-text);
		margin-right: 2px;
	}

	.dayname.today strong {
		color: var(--color-primary-strong);
	}

	.allday .label {
		align-self: center;
		padding: 0 var(--space-1);
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		text-align: right;
	}

	.allday-cell {
		display: grid;
		gap: 2px;
		align-content: start;
		min-height: 2rem;
		padding: 2px;
		border-left: 1px solid var(--color-border);
	}

	.scroller {
		max-height: min(68dvh, 40rem);
		overflow-y: auto;
	}

	.body {
		position: relative;
		display: grid;
		grid-template-columns: var(--label) repeat(var(--days), minmax(0, 1fr));
		background-image: linear-gradient(var(--color-border) 1px, transparent 1px);
		background-size: 100% 48px;
	}

	.hours {
		position: relative;
	}

	.hours span {
		position: absolute;
		right: var(--space-1);
		/* Knapp unter der Stundenlinie, damit oben nichts abgeschnitten wird. */
		transform: translateY(2px);
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}

	.hours span:first-child {
		display: none;
	}

	.column {
		position: relative;
		border-left: 1px solid var(--color-border);
	}

	.column.today {
		background: color-mix(in srgb, var(--color-primary-soft) 35%, transparent);
	}

	.slot {
		position: absolute;
		padding: 1px 2px;
	}

	.event {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 20px;
		overflow: hidden;
		padding: 2px var(--space-1);
		border: 0;
		border-left: 3px solid var(--event-color);
		border-radius: 6px;
		background: var(--color-calendar-bg);
		color: var(--color-text);
		font: inherit;
		font-size: 0.75rem;
		line-height: 1.25;
		text-align: left;
	}

	button.event {
		cursor: pointer;
	}

	button.event:hover {
		filter: brightness(0.97);
	}

	.allday-event {
		height: auto;
		min-height: 24px;
		justify-content: center;
	}

	.event.conflict {
		box-shadow: inset 0 0 0 2px var(--color-warning);
	}

	.event-title {
		font-weight: 650;
		overflow-wrap: break-word;
		hyphens: auto;
	}

	.event-time {
		color: var(--color-calendar);
		font-variant-numeric: tabular-nums;
	}

	.now {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--color-warning);
		pointer-events: none;
	}

	.now::before {
		content: '';
		position: absolute;
		left: -4px;
		top: -3px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--color-warning);
	}
</style>
