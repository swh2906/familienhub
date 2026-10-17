<script lang="ts">
	// Monatsraster (Montag zuerst, 6 Wochen). Handy: Punkte je Termin, Tipp wählt den Tag;
	// größer: Termin-Titel direkt im Raster. Die Termine des gewählten Tages stehen darunter.
	import type { Membership } from '#lib/db/types.js';
	import { formatDay } from '#lib/features/meals/week.js';
	import { WEEKDAYS_SHORT } from '#lib/features/tasks/describe.js';
	import { m } from '#lib/paraglide/messages.js';
	import { onDay, type Occurrence } from './expand.js';
	import { describeOccurrence, occurrenceColor } from './label.js';

	let {
		days,
		month,
		selected,
		occurrences,
		conflicts,
		members,
		today,
		onselect,
		onopen
	}: {
		days: string[];
		month: string;
		selected: string;
		occurrences: Occurrence[];
		conflicts: ReadonlySet<string>;
		members: ReadonlyMap<string, Membership>;
		today: string;
		onselect: (date: string) => void;
		onopen?: (o: Occurrence) => void;
	} = $props();

	const MAX_CHIPS = 3;
</script>

<div class="month">
	<div class="weekdays" aria-hidden="true">
		{#each WEEKDAYS_SHORT as name (name)}<span>{name}</span>{/each}
	</div>
	{#each [0, 1, 2, 3, 4, 5] as week (week)}
		<div class="week">
			{#each days.slice(week * 7, week * 7 + 7) as day (day)}
				{@const list = onDay(occurrences, day)}
				<div
					class="cell"
					class:other={!day.startsWith(month)}
					class:today={day === today}
					class:selected={day === selected}
				>
					<button
						type="button"
						class="daynum"
						aria-label={m.cal_select_day({ day: formatDay(day), count: list.length })}
						aria-pressed={day === selected}
						onclick={() => onselect(day)}
					>
						<span>{Number(day.slice(8, 10))}</span>
						{#if list.length > 0}
							<span class="dots" aria-hidden="true">
								{#each list.slice(0, 4) as o (o.key)}
									<span class="dot" style:background={occurrenceColor(o, members)}></span>
								{/each}
							</span>
						{/if}
					</button>
					<div class="chips">
						{#each list.slice(0, MAX_CHIPS) as o (o.key)}
							{@const conflict = conflicts.has(o.key)}
							{#if onopen}
								<button
									type="button"
									class="chip"
									class:conflict
									style:--event-color={occurrenceColor(o, members)}
									aria-label={describeOccurrence(o, members, conflict, 'start')}
									onclick={() => onopen?.(o)}
								>
									{#if !o.allDay}<span class="time">{o.startTime}</span>{/if}
									{o.event.title}
								</button>
							{:else}
								<span class="chip" class:conflict style:--event-color={occurrenceColor(o, members)}>
									{#if !o.allDay}<span class="time">{o.startTime}</span>{/if}
									{o.event.title}
								</span>
							{/if}
						{/each}
						{#if list.length > MAX_CHIPS}
							<span class="more">{m.cal_more({ count: list.length - MAX_CHIPS })}</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.month {
		display: grid;
		overflow: hidden;
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	.weekdays,
	.week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}

	.weekdays span {
		padding: var(--space-2) 0;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		text-align: center;
	}

	.cell {
		display: grid;
		align-content: start;
		min-height: 3.5rem;
		border-top: 1px solid var(--color-border);
		border-left: 1px solid var(--color-border);
	}

	.cell:first-child {
		border-left: 0;
	}

	.cell.other {
		background: var(--color-surface-2);
	}

	.cell.other .daynum {
		color: var(--color-text-muted);
	}

	.daynum {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 3px;
		width: 100%;
		min-height: var(--touch-target);
		padding: var(--space-1) 0;
		border: 0;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.daynum > span:first-child {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
	}

	.today .daynum > span:first-child {
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

	.selected .daynum > span:first-child {
		box-shadow: 0 0 0 2px var(--color-primary);
	}

	.dots {
		display: flex;
		gap: 2px;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
	}

	/* Handy: nur Punkte; Titel ab Tablet-Breite. */
	.chips {
		display: none;
	}

	@media (min-width: 700px) {
		.cell {
			min-height: 7rem;
		}

		.daynum {
			justify-items: start;
			min-height: 36px;
			padding: var(--space-1);
		}

		.dots {
			display: none;
		}

		.chips {
			display: grid;
			gap: 2px;
			padding: 0 var(--space-1) var(--space-1);
		}

		.chip {
			display: block;
			overflow: hidden;
			padding: 2px var(--space-1);
			border: 0;
			border-left: 3px solid var(--event-color);
			border-radius: 4px;
			background: var(--color-calendar-bg);
			color: var(--color-text);
			font: inherit;
			font-size: 0.75rem;
			text-align: left;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		button.chip {
			cursor: pointer;
		}

		.chip.conflict {
			box-shadow: inset 0 0 0 1.5px var(--color-warning);
		}

		.time {
			color: var(--color-calendar);
			font-weight: 650;
			font-variant-numeric: tabular-nums;
		}

		.more {
			color: var(--color-text-muted);
			font-size: 0.75rem;
		}
	}
</style>
