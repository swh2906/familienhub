<script lang="ts">
	// Termin anlegen oder bearbeiten. Bei Serien: „Nur dieser Termin“ oder „Alle Termine der Serie“.
	// Warnt schon beim Planen vor Überschneidungen derselben Person.
	import { untrack } from 'svelte';
	import type { CalendarEvent, Membership } from '#lib/db/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';
	import { conflictsWith } from './conflicts.js';
	import { addDaysTo, expandEvents } from './expand.js';
	import RepeatPicker from './RepeatPicker.svelte';
	import {
		createEvent,
		deleteEvent,
		formFromEvent,
		formTimes,
		updateOnlyThis,
		updateSeries,
		type EventForm,
		type EventTarget
	} from './store.js';

	let {
		target,
		household,
		members,
		events,
		timeZone,
		onclose,
		ondeleted
	}: {
		target: EventTarget | null;
		household: string;
		members: Membership[];
		events: CalendarEvent[];
		timeZone: string;
		onclose: () => void;
		ondeleted: (undo: () => Promise<void>, onlyOne: boolean) => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let form = $state<EventForm | null>(null);
	let scope: 'this' | 'all' = $state('this');
	let error = $state('');
	let opened = $state(0);

	const editing = $derived(target?.event ?? null);
	const isSeries = $derived(!!editing?.rrule);

	function addHour(time: string): string {
		const [h, mi] = time.split(':').map(Number);
		return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
	}

	$effect(() => {
		if (!dialog) return;
		if (target) untrack(fill);
		else if (dialog.open) dialog.close();
	});

	function fill() {
		if (!target || !dialog) return;
		const start = target.time ?? '09:00';
		form = target.event
			? formFromEvent(target.event, target.occurrenceDate ?? target.date, timeZone)
			: {
					title: '',
					allDay: false,
					date: target.date,
					endDate: '',
					startTime: start,
					endTime: addHour(start),
					location: '',
					participants: [],
					reminder_minutes: 0,
					rrule: ''
				};
		scope = 'this';
		error = '';
		opened += 1;
		if (!dialog.open) dialog.showModal();
	}

	const conflicts = $derived.by(() => {
		if (!form || form.allDay || form.participants.length === 0 || !form.date) return [];
		const { start, end } = formTimes(form, timeZone);
		const nearby = expandEvents(events, form.date, addDaysTo(form.date, 1), timeZone);
		return conflictsWith(
			{ start, end, participants: form.participants, allDay: false, ignore: editing?.id },
			nearby
		);
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!form || !target) return;
		if (!form.title.trim()) {
			error = m.cal_title_required();
			return;
		}
		const data = $state.snapshot(form) as EventForm;
		try {
			if (!editing) await createEvent(household, data, timeZone);
			else if (isSeries && scope === 'this')
				await updateOnlyThis(editing, target.occurrenceDate ?? data.date, data, timeZone);
			else await updateSeries(editing, target.occurrenceDate ?? data.date, data, timeZone);
			dialog?.close();
		} catch {
			error = m.error_generic();
		}
	}

	async function remove() {
		if (!editing || !target) return;
		const onlyOne = isSeries && scope === 'this';
		const undo = await deleteEvent(editing, onlyOne ? (target.occurrenceDate ?? null) : null);
		dialog?.close();
		ondeleted(undo, onlyOne);
	}

	const reminders = [
		{ value: 0, label: m.reminder_none },
		{ value: 10, label: m.reminder_10 },
		{ value: 30, label: m.reminder_30 },
		{ value: 60, label: m.reminder_60 },
		{ value: 1440, label: m.reminder_1440 }
	];
</script>

<dialog bind:this={dialog} aria-labelledby="event-dialog-title" {onclose}>
	{#if form}
		<form onsubmit={save} novalidate>
			<h2 id="event-dialog-title">{editing ? m.cal_dialog_edit() : m.cal_dialog_new()}</h2>

			<label class="field">
				<span>{m.cal_field_title()}</span>
				<input
					id="event-title"
					maxlength="200"
					placeholder={m.cal_title_placeholder()}
					bind:value={form.title}
				/>
			</label>

			<label class="check">
				<input id="event-all-day" type="checkbox" bind:checked={form.allDay} />
				<span>{m.cal_field_all_day()}</span>
			</label>

			<div class="row">
				<label class="field">
					<span>{m.cal_field_date()}</span>
					<input id="event-date" type="date" required bind:value={form.date} />
				</label>
				{#if form.allDay}
					<label class="field">
						<span>{m.cal_field_end_date()}</span>
						<input id="event-end-date" type="date" min={form.date} bind:value={form.endDate} />
					</label>
				{/if}
			</div>

			{#if !form.allDay}
				<div class="row">
					<label class="field">
						<span>{m.cal_field_start()}</span>
						<input id="event-start" type="time" required bind:value={form.startTime} />
					</label>
					<label class="field">
						<span>{m.cal_field_end()}</span>
						<input id="event-end" type="time" required bind:value={form.endTime} />
					</label>
				</div>
			{/if}

			<fieldset class="choices">
				<legend>{m.cal_field_participants()}</legend>
				<div class="chips">
					{#each members as member (member.id)}
						{@const selected = form.participants.includes(member.id)}
						<button
							type="button"
							class="chip person"
							aria-pressed={selected}
							onclick={() => {
								if (!form) return;
								form.participants = selected
									? form.participants.filter((p) => p !== member.id)
									: [...form.participants, member.id];
							}}
						>
							<MemberAvatar name={member.display_name} color={member.color} size={28} />
							{member.display_name}
						</button>
					{/each}
				</div>
				<p class="hint">{m.cal_participants_hint()}</p>
			</fieldset>

			{#if conflicts.length > 0}
				<p class="warning" role="status">
					⚠ {m.cal_conflict_warning({
						list: conflicts.map((o) => `${o.event.title} ${o.startTime}`).join(', ')
					})}
				</p>
			{/if}

			<label class="field">
				<span>{m.cal_field_location()}</span>
				<input id="event-location" maxlength="200" bind:value={form.location} />
			</label>

			{#key opened}
				<RepeatPicker bind:rrule={form.rrule} anchorDate={form.date} />
			{/key}

			<div class="field">
				<label for="event-reminder">{m.cal_field_reminder()}</label>
				<select
					id="event-reminder"
					aria-describedby="event-reminder-hint"
					bind:value={form.reminder_minutes}
				>
					{#each reminders as option (option.value)}
						<option value={option.value}>{option.label()}</option>
					{/each}
				</select>
				<span class="hint" id="event-reminder-hint">{m.cal_reminder_hint()}</span>
			</div>

			{#if isSeries}
				<fieldset class="choices scope">
					<legend>{m.cal_scope_label()}</legend>
					<label class="radio">
						<input type="radio" name="scope" value="this" bind:group={scope} />
						{m.cal_scope_this()}
					</label>
					<label class="radio">
						<input type="radio" name="scope" value="all" bind:group={scope} />
						{m.cal_scope_all()}
					</label>
				</fieldset>
			{/if}

			{#if error}
				<p class="form-error" role="alert">{error}</p>
			{/if}

			<div class="actions">
				<button class="btn btn-primary" type="submit">{m.plan_save()}</button>
				<button class="btn" type="button" onclick={() => dialog?.close()}>{m.cancel()}</button>
				{#if editing}
					<button class="btn danger" type="button" onclick={remove}>{m.cal_delete()}</button>
				{/if}
			</div>
		</form>
	{/if}
</dialog>

<style>
	dialog {
		width: min(34rem, calc(100vw - 2 * var(--space-4)));
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
		font-size: var(--fs-title);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
	}

	.check,
	.radio {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--touch-target);
		font-weight: 600;
	}

	.check input,
	.radio input {
		width: 22px;
		height: 22px;
		accent-color: var(--color-primary);
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
		padding: 0 var(--space-3) 0 var(--space-1);
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

	.warning {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius);
		background: var(--color-warning-bg);
		color: var(--color-warning);
		font-weight: 600;
	}

	.scope {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius);
		background: var(--color-surface-2);
	}

	/* Speichern/Abbrechen bleiben beim Scrollen unten sichtbar (lange Formulare auf dem Handy). */
	.actions {
		position: sticky;
		bottom: calc(-1 * var(--space-6));
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin: 0 calc(-1 * var(--space-6)) calc(-1 * var(--space-6));
		padding: var(--space-4) var(--space-6) var(--space-6);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.danger {
		margin-left: auto;
		color: var(--color-warning);
	}
</style>
