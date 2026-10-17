<script lang="ts">
	// Wiederholung als Vorlage wählen (keine, täglich, wöchentlich an Tagen, alle 2 Wochen,
	// monatlich am Tag X, jährlich); liefert eine RRULE. Unbekannte Regeln bleiben unverändert.
	import { untrack } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { WEEKDAYS_LONG, WEEKDAYS_SHORT } from '#lib/features/tasks/describe.js';
	import { presetToRrule, rruleToPreset, type Preset } from '#lib/features/tasks/recurrence.js';

	type Mode = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';

	let { rrule = $bindable(), anchorDate }: { rrule: string; anchorDate: string } = $props();

	function weekdayOf(date: string): number {
		const [y, mo, d] = date.split('-').map(Number);
		return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
	}

	// Einmalig aus der vorhandenen Regel übernehmen.
	const initial = untrack(() => ({ preset: rruleToPreset(rrule), anchor: anchorDate }));
	let mode: Mode = $state(
		initial.preset.kind === 'weekly'
			? initial.preset.interval === 2
				? 'biweekly'
				: 'weekly'
			: initial.preset.kind
	);
	let days = $state<number[]>(
		initial.preset.kind === 'weekly' ? [...initial.preset.days] : [weekdayOf(initial.anchor)]
	);
	let monthDay = $state(
		initial.preset.kind === 'monthly' ? initial.preset.day : Number(initial.anchor.slice(8, 10))
	);
	const custom = initial.preset.kind === 'custom' ? initial.preset.rrule : '';

	function preset(): Preset {
		switch (mode) {
			case 'weekly':
			case 'biweekly':
				return { kind: 'weekly', days, interval: mode === 'biweekly' ? 2 : 1 };
			case 'monthly':
				return { kind: 'monthly', day: monthDay };
			case 'custom':
				return { kind: 'custom', rrule: custom };
			default:
				return { kind: mode };
		}
	}

	$effect(() => {
		rrule = presetToRrule(preset());
	});

	const modes: { value: Mode; label: () => string }[] = [
		{ value: 'none', label: m.repeat_none },
		{ value: 'daily', label: m.repeat_daily },
		{ value: 'weekly', label: m.repeat_weekly },
		{ value: 'biweekly', label: m.repeat_biweekly },
		{ value: 'monthly', label: m.repeat_monthly },
		{ value: 'yearly', label: m.repeat_yearly }
	];
</script>

<div class="field">
	<label for="event-repeat">{m.task_repeat()}</label>
	<select id="event-repeat" bind:value={mode}>
		{#each modes as option (option.value)}
			<option value={option.value}>{option.label()}</option>
		{/each}
		{#if custom}<option value="custom">{m.repeat_custom()}</option>{/if}
	</select>
</div>

{#if mode === 'weekly' || mode === 'biweekly'}
	<fieldset class="choices">
		<legend>{m.repeat_days()}</legend>
		<div class="chips">
			{#each WEEKDAYS_SHORT as short, index (short)}
				<button
					type="button"
					class="chip"
					aria-pressed={days.includes(index)}
					aria-label={WEEKDAYS_LONG[index]}
					onclick={() =>
						(days = days.includes(index) ? days.filter((d) => d !== index) : [...days, index])}
					>{short}</button
				>
			{/each}
		</div>
	</fieldset>
{:else if mode === 'monthly'}
	<div class="field">
		<label for="event-monthday">{m.repeat_monthday()}</label>
		<input
			id="event-monthday"
			type="number"
			min="1"
			max="31"
			inputmode="numeric"
			aria-describedby="event-monthday-hint"
			bind:value={monthDay}
		/>
		<span class="hint" id="event-monthday-hint">{m.repeat_monthday_hint()}</span>
	</div>
{/if}

<style>
	.choices {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--space-2);
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-weight: 650;
	}
</style>
