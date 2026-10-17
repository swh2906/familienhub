<script lang="ts">
	// Terminliste nach Tagen (Woche auf dem Handy, gewählter Tag in der Monatsansicht).
	import type { Membership } from '#lib/db/types.js';
	import { formatDay } from '#lib/features/meals/week.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';
	import { onDay, type Occurrence } from './expand.js';
	import { describeOccurrence, occurrenceColor, timeRange } from './label.js';

	let {
		days,
		occurrences,
		conflicts,
		members,
		today,
		onopen
	}: {
		days: string[];
		occurrences: Occurrence[];
		conflicts: ReadonlySet<string>;
		members: ReadonlyMap<string, Membership>;
		today: string;
		onopen?: (o: Occurrence) => void;
	} = $props();

	function participantsOf(o: Occurrence): Membership[] {
		return (o.event.participants ?? []).flatMap((id) => members.get(id) ?? []);
	}
</script>

<div class="agenda">
	{#each days as day (day)}
		{@const list = onDay(occurrences, day)}
		<section class="day" class:today={day === today} aria-labelledby="agenda-{day}">
			<h3 id="agenda-{day}">{formatDay(day)}</h3>
			{#if list.length === 0}
				<p class="empty">{m.cal_no_events()}</p>
			{:else}
				<ul>
					{#each list as o (o.key)}
						{@const conflict = conflicts.has(o.key)}
						{@const people = participantsOf(o)}
						<li
							style:--event-color={occurrenceColor(o, members)}
							style:--people-space={people.length
								? `${24 + (people.length - 1) * 18 + 12}px`
								: '0px'}
						>
							{#if onopen}
								<button
									type="button"
									class="item"
									class:conflict
									aria-label={describeOccurrence(o, members, conflict, 'range')}
									onclick={() => onopen?.(o)}
								>
									{@render content(o, conflict)}
								</button>
							{:else}
								<div class="item" class:conflict>{@render content(o, conflict)}</div>
							{/if}
							<!-- Außerhalb des Buttons: Initialen sind sichtbarer Text, die Namen stehen schon im Label. -->
							{#if people.length}
								<span class="people" aria-hidden="true">
									{#each people as person (person.id)}
										<MemberAvatar name={person.display_name} color={person.color} size={24} />
									{/each}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</div>

{#snippet content(o: Occurrence, conflict: boolean)}
	<span class="time">{timeRange(o)}</span>
	<span class="body">
		<span class="title">
			{o.event.title}
			{#if o.recurring}<Icon name="pending" size={14} />{/if}
			{#if conflict}<span class="warn" title={m.cal_conflict()}>⚠</span>{/if}
		</span>
		{#if o.event.location}<span class="location">{o.event.location}</span>{/if}
	</span>
{/snippet}

<style>
	.agenda {
		display: grid;
		gap: var(--space-3);
	}

	.day {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.day.today {
		box-shadow:
			0 0 0 2px var(--color-primary),
			var(--shadow-card);
	}

	h3 {
		margin: 0 0 var(--space-2);
		font-size: 0.9375rem;
	}

	.empty {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	ul {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: var(--touch-target);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-left: 4px solid var(--event-color);
		border-radius: var(--radius);
		background: var(--color-calendar-bg);
		color: var(--color-text);
		font: inherit;
		text-align: left;
	}

	button.item {
		cursor: pointer;
	}

	.item.conflict {
		box-shadow: inset 0 0 0 2px var(--color-warning);
	}

	.time {
		flex: none;
		width: 5.25rem;
		color: var(--color-calendar);
		font-size: 0.8125rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}

	.body {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-weight: 600;
		overflow-wrap: break-word;
		hyphens: auto;
	}

	.warn {
		color: var(--color-warning);
	}

	.location {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	li {
		position: relative;
	}

	.item {
		padding-right: calc(var(--space-3) + var(--people-space));
	}

	.people {
		position: absolute;
		top: 50%;
		right: var(--space-3);
		display: flex;
		pointer-events: none;
		transform: translateY(-50%);
	}

	.people :global(.avatar + .avatar) {
		margin-left: -6px;
	}
</style>
