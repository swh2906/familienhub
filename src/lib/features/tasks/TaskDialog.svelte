<script lang="ts">
	// Aufgabe anlegen oder bearbeiten: Titel, Notiz, Zuständige, Fälligkeit, Wiederholung als Vorlage.
	import { untrack } from 'svelte';
	import type { Membership, Task } from '#lib/db/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';
	import { WEEKDAYS_LONG, WEEKDAYS_SHORT } from './describe.js';
	import { presetToRrule, rruleToPreset, type Preset } from './recurrence.js';
	import { saveTask } from './store.js';

	type Mode = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

	let {
		open,
		task,
		household,
		members,
		today,
		onclose,
		ondelete
	}: {
		open: boolean;
		task: Task | null;
		household: string;
		members: Membership[];
		today: string;
		onclose: () => void;
		ondelete: (task: Task) => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let title = $state('');
	let notes = $state('');
	let assignees = $state<string[]>([]);
	let due = $state('');
	let mode: Mode = $state('none');
	let days = $state<number[]>([]);
	let monthDay = $state(1);
	let customRule = $state('');
	let error = $state('');

	/** Wochentag (0 = Montag) eines JJJJ-MM-TT-Datums. */
	function weekdayOf(date: string): number {
		const [y, mo, d] = date.split('-').map(Number);
		return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
	}

	// Nur auf Öffnen/Schließen reagieren; das Befüllen selbst nicht verfolgen, sonst würde jede
	// Eingabe (z. B. ein neues Datum) alle Felder zurücksetzen.
	$effect(() => {
		if (!dialog) return;
		if (open) untrack(fill);
		else if (dialog.open) dialog.close();
	});

	function fill() {
		if (!dialog) return;
		title = task?.title ?? '';
		notes = task?.notes ?? '';
		assignees = [...(task?.assignees ?? [])];
		due = task?.due_date ?? '';
		const preset = rruleToPreset(task?.rrule ?? '');
		mode = preset.kind === 'weekly' ? (preset.interval === 2 ? 'biweekly' : 'weekly') : preset.kind;
		days = preset.kind === 'weekly' ? [...preset.days] : [weekdayOf(due || today)];
		monthDay = preset.kind === 'monthly' ? preset.day : Number((due || today).slice(8, 10));
		customRule = preset.kind === 'custom' ? preset.rrule : '';
		error = '';
		if (!dialog.open) dialog.showModal();
	}

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	function preset(): Preset {
		switch (mode) {
			case 'weekly':
			case 'biweekly':
				return { kind: 'weekly', days, interval: mode === 'biweekly' ? 2 : 1 };
			case 'monthly':
				return { kind: 'monthly', day: monthDay };
			case 'custom':
				return { kind: 'custom', rrule: customRule };
			default:
				return { kind: mode };
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!title.trim()) {
			error = m.task_title_required();
			return;
		}
		const rrule = presetToRrule(preset());
		try {
			// Wiederkehrende Aufgaben brauchen ein erstes Datum; ohne Angabe ab heute.
			// $state.snapshot: IndexedDB kann Svelte-Zustandsobjekte (Proxies) nicht speichern.
			await saveTask(household, task, {
				title,
				notes,
				assignees: $state.snapshot(assignees),
				due_date: due || (rrule ? today : ''),
				rrule
			});
			dialog?.close();
		} catch {
			error = m.error_generic();
		}
	}

	function remove() {
		if (!task) return;
		const current = task;
		dialog?.close();
		ondelete(current);
	}

	const modes: { value: Mode; label: () => string }[] = [
		{ value: 'none', label: m.repeat_none },
		{ value: 'daily', label: m.repeat_daily },
		{ value: 'weekly', label: m.repeat_weekly },
		{ value: 'biweekly', label: m.repeat_biweekly },
		{ value: 'monthly', label: m.repeat_monthly }
	];
</script>

<dialog bind:this={dialog} aria-labelledby="task-dialog-title" {onclose}>
	<form onsubmit={save} novalidate>
		<h2 id="task-dialog-title">{task ? m.task_dialog_edit() : m.task_dialog_new()}</h2>

		<label class="field">
			<span>{m.task_title()}</span>
			<input
				id="task-title"
				maxlength="200"
				placeholder={m.task_title_placeholder()}
				bind:value={title}
			/>
		</label>

		<fieldset class="choices">
			<legend>{m.task_assignees()}</legend>
			<div class="chips">
				{#each members as member (member.id)}
					<button
						type="button"
						class="chip person"
						aria-pressed={assignees.includes(member.id)}
						onclick={() => (assignees = toggle(assignees, member.id))}
					>
						<MemberAvatar name={member.display_name} color={member.color} size={28} />
						{member.display_name}
					</button>
				{/each}
			</div>
			<p class="hint">{m.task_assignees_hint()}</p>
		</fieldset>

		<label class="field">
			<span>{m.task_due()}</span>
			<input id="task-due" type="date" bind:value={due} />
		</label>

		<div class="field">
			<label for="task-repeat">{m.task_repeat()}</label>
			<select id="task-repeat" bind:value={mode}>
				{#each modes as option (option.value)}
					<option value={option.value}>{option.label()}</option>
				{/each}
				{#if mode === 'custom'}<option value="custom">{m.repeat_custom()}</option>{/if}
			</select>
		</div>

		{#if mode === 'weekly' || mode === 'biweekly'}
			<fieldset class="choices">
				<legend>{m.repeat_days()}</legend>
				<div class="chips days">
					{#each WEEKDAYS_SHORT as short, index (short)}
						<button
							type="button"
							class="chip day"
							aria-pressed={days.includes(index)}
							aria-label={WEEKDAYS_LONG[index]}
							onclick={() => (days = toggle(days, index))}>{short}</button
						>
					{/each}
				</div>
			</fieldset>
		{:else if mode === 'monthly'}
			<div class="field">
				<label for="task-monthday">{m.repeat_monthday()}</label>
				<input
					id="task-monthday"
					type="number"
					min="1"
					max="31"
					inputmode="numeric"
					aria-describedby="task-monthday-hint"
					bind:value={monthDay}
				/>
				<span class="hint" id="task-monthday-hint">{m.repeat_monthday_hint()}</span>
			</div>
		{/if}

		<label class="field">
			<span>{m.task_notes()}</span>
			<textarea id="task-notes" rows="3" maxlength="2000" bind:value={notes}></textarea>
		</label>

		{#if error}
			<p class="form-error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-primary" type="submit">{m.plan_save()}</button>
			<button class="btn" type="button" onclick={() => dialog?.close()}>{m.cancel()}</button>
			{#if task}
				<button class="btn danger" type="button" onclick={remove}>{m.task_delete()}</button>
			{/if}
		</div>
	</form>
</dialog>

<style>
	dialog {
		width: min(32rem, calc(100vw - 2 * var(--space-4)));
		max-height: calc(100dvh - 2 * var(--space-4));
		padding: var(--space-6);
		border: 0;
		border-radius: var(--radius-card);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 20px 50px rgb(0 0 0 / 0.3);
	}

	dialog::backdrop {
		background: rgb(0 0 0 / 0.45);
	}

	form {
		display: grid;
		gap: var(--space-4);
	}

	h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	textarea {
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		resize: vertical;
	}

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
		display: inline-flex;
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

	.person {
		padding-left: var(--space-1);
	}

	.day {
		justify-content: center;
		min-width: var(--touch-target);
		padding: 0;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-weight: 650;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.danger {
		margin-left: auto;
		color: var(--color-warning);
	}
</style>
