<script lang="ts">
	// Schnelleingabe für alles: eine Zeile, Homi erkennt Termin, Aufgabe oder Einkauf und zeigt vor dem
	// Speichern, was es verstanden hat. Die Art lässt sich per Tipp umstellen. Kinder legen nur Einkäufe an
	// (Termine und Aufgaben dürfen sie laut Rechten nicht anlegen).
	import type { Membership, ShoppingItem } from '#lib/db/types.js';
	import { createEvent } from '#lib/features/calendar/store.js';
	import { formatCompactDay } from '#lib/features/meals/week.js';
	import { parseQuickInput } from '#lib/features/shopping/list.js';
	import { addItem } from '#lib/features/shopping/store.js';
	import { saveTask } from '#lib/features/tasks/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import { parseQuick, type QuickKind } from './parse.js';

	let {
		household,
		membership,
		canEdit,
		members,
		items,
		today,
		timeZone
	}: {
		household: string;
		membership: string;
		canEdit: boolean;
		members: readonly Membership[];
		items: readonly ShoppingItem[];
		today: string;
		timeZone: string;
	} = $props();

	let text = $state('');
	/** Von Hand gewählte Art (sonst die erkannte). */
	let chosen: QuickKind | null = $state(null);
	let done = $state('');
	let doneTimer: ReturnType<typeof setTimeout> | null = null;

	const people = $derived(
		members
			.filter((member) => !member.deleted_at && member.user && member.display_name)
			.map((member) => ({ id: member.id, name: member.display_name }))
	);
	const result = $derived(parseQuick(text, { today, people }));
	const kind: QuickKind | null = $derived(
		!result ? null : !canEdit ? 'shopping' : (chosen ?? result.kind)
	);

	const kinds: { value: QuickKind; label: () => string }[] = [
		{ value: 'event', label: m.quick_kind_event },
		{ value: 'task', label: m.quick_kind_task },
		{ value: 'shopping', label: m.quick_kind_shopping }
	];

	function names(ids: readonly string[]): string {
		return ids
			.map((id) => people.find((person) => person.id === id)?.name)
			.filter(Boolean)
			.join(', ');
	}

	/** Was gespeichert würde, in einer Zeile. */
	const summary = $derived.by(() => {
		if (!result || !kind) return '';
		if (kind === 'shopping') return result.title;
		const when =
			kind === 'event'
				? [
						formatCompactDay(result.date || today),
						result.startTime ? `${result.startTime}–${result.endTime}` : m.quick_allday()
					].join(' · ')
				: result.date
					? formatCompactDay(result.date)
					: m.quick_no_date();
		return [result.title, when, names(result.people)].filter(Boolean).join(' · ');
	});

	function input() {
		if (!text.trim()) chosen = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!result || !kind) return;
		const title = result.title;
		if (kind === 'event') {
			await createEvent(
				household,
				{
					title,
					allDay: !result.startTime,
					date: result.date || today,
					endDate: '',
					startTime: result.startTime,
					endTime: result.endTime,
					location: '',
					participants: result.people,
					reminder_minutes: 0,
					rrule: ''
				},
				timeZone
			);
		} else if (kind === 'task') {
			await saveTask(household, null, {
				title,
				notes: '',
				assignees: result.people,
				due_date: result.date,
				rrule: ''
			});
		} else {
			const parsed = parseQuickInput(title);
			if (!parsed) return;
			await addItem(household, membership, parsed, items);
		}
		const message = {
			event: m.quick_added_event,
			task: m.quick_added_task,
			shopping: m.quick_added_shopping
		}[kind]({ title });
		text = '';
		chosen = null;
		done = message;
		if (doneTimer) clearTimeout(doneTimer);
		doneTimer = setTimeout(() => (done = ''), 5000);
	}
</script>

<form class="quickadd" onsubmit={submit}>
	<label class="visually-hidden" for="quickadd-input">{m.quick_label()}</label>
	<div class="pill">
		<span class="plus" aria-hidden="true"><Icon name="plus" size={20} /></span>
		<input
			id="quickadd-input"
			bind:value={text}
			oninput={input}
			placeholder={canEdit ? m.quick_placeholder() : m.today_shopping_placeholder()}
			autocomplete="off"
			enterkeyhint="done"
			maxlength="200"
			aria-describedby="quickadd-preview"
		/>
		<button class="submit" type="submit" disabled={!result} aria-label={m.quick_submit()}>
			<Icon name="up" size={20} />
		</button>
	</div>

	<div class="preview" id="quickadd-preview" aria-live="polite">
		{#if result && kind}
			{#if canEdit}
				<div class="pills" role="group" aria-label={m.quick_kind_label()}>
					{#each kinds as option (option.value)}
						<button
							type="button"
							aria-pressed={kind === option.value}
							onclick={() => (chosen = option.value)}>{option.label()}</button
						>
					{/each}
				</div>
			{/if}
			<p class="summary">{summary}</p>
		{:else if done}
			<p class="summary done" role="status">{done}</p>
		{:else}
			<p class="hint">{canEdit ? m.quick_hint() : m.quick_hint_child()}</p>
		{/if}
	</div>
</form>

<style>
	.quickadd {
		display: grid;
		gap: var(--space-2);
	}

	/* Dunkle Pille (Entwurf C): Plus in der Akzentfarbe, Senden rechts. */
	.pill {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 58px;
		padding: 0 7px;
		border-radius: var(--radius-pill);
		background: var(--color-ink);
		color: var(--color-on-ink);
	}

	.plus {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-pill);
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

	input {
		flex: 1;
		min-width: 0;
		height: 52px;
		padding: 0 var(--space-1);
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--fs-body);
		font-weight: 600;
		outline: none;
	}

	input::placeholder {
		color: var(--color-on-ink-muted);
	}

	.pill:focus-within {
		outline: 3px solid var(--color-focus);
		outline-offset: 2px;
	}

	.submit {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--color-on-ink);
		color: var(--color-ink);
		cursor: pointer;
	}

	.submit:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.preview {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-height: 24px;
		padding: 0 var(--space-2);
	}

	.preview .pills > button {
		min-height: 40px;
		padding: 0 14px;
		font-size: var(--fs-small);
	}

	.summary {
		margin: 0;
		font-weight: 700;
	}

	.done {
		color: var(--color-shopping);
	}
</style>
