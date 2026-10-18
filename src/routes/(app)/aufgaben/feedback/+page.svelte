<script lang="ts">
	// Testphase: Feedback schreiben und lesen. Gespeichert wie alles andere lokal und per Sync in
	// PocketBase (Collection „feedback“); der Server nimmt es nur mit HOMI_FEEDBACK=1 an.
	import { features } from '#lib/auth/features.svelte.js';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Feedback, Membership } from '#lib/db/types.js';
	import {
		deviceSummary,
		feedbackOf,
		sendFeedback,
		setDone,
		sortFeedback
	} from '#lib/features/feedback/feedback.js';
	import { formatCompactDay } from '#lib/features/meals/week.js';
	import { membersOf } from '#lib/features/shopping/store.js';
	import { m } from '#lib/paraglide/messages.js';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';

	const household = session.householdId ?? '';
	const membership = session.membership?.id ?? '';

	const data = live(
		() => household,
		async (h) => ({ items: await feedbackOf(h), members: await membersOf(h) }),
		{ items: [] as Feedback[], members: [] as Membership[] }
	);
	const items = $derived(sortFeedback(data.current.items));
	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));

	const areas = [
		m.nav_today,
		m.nav_meals,
		m.nav_shopping,
		m.nav_calendar,
		m.nav_tasks,
		m.feedback_area_settings,
		m.feedback_area_other
	];

	let text = $state('');
	let area = $state(m.feedback_area_other());
	let sent = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!text.trim()) return;
		await sendFeedback(household, membership, {
			text,
			area,
			device: deviceSummary(navigator.userAgent, window.innerWidth)
		});
		text = '';
		sent = true;
	}

	function dateOf(item: Feedback): string {
		return item.created ? formatCompactDay(item.created.slice(0, 10)) : '';
	}
</script>

<svelte:head>
	<title>{m.feedback_title()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.feedback_title()}</h1>

{#if !features.feedback}
	<p class="hint">{m.feedback_off()}</p>
{:else}
	<p class="intro">{m.feedback_intro()}</p>

	<form class="card form" onsubmit={submit}>
		<div class="field">
			<label for="feedback-text">{m.feedback_text()}</label>
			<textarea
				id="feedback-text"
				rows="4"
				maxlength="4000"
				required
				placeholder={m.feedback_text_placeholder()}
				bind:value={text}
				oninput={() => (sent = false)}></textarea>
		</div>
		<div class="row">
			<div class="field">
				<label for="feedback-area">{m.feedback_area()}</label>
				<select id="feedback-area" bind:value={area}>
					{#each areas as label (label)}<option value={label()}>{label()}</option>{/each}
				</select>
			</div>
			<button class="btn btn-primary" type="submit" disabled={!text.trim()}
				>{m.feedback_send()}</button
			>
		</div>
		{#if sent}<p class="hint" role="status">{m.feedback_sent()}</p>{/if}
	</form>
{/if}

<section aria-labelledby="feedback-list">
	<h2 id="feedback-list">{m.feedback_list()}</h2>
	{#if items.length === 0}
		<p class="hint">{m.feedback_empty()}</p>
	{:else}
		<ul class="list">
			{#each items as item (item.id)}
				{@const person = members.get(item.created_by)}
				<li class="card item" class:done={item.done}>
					<p class="text">{item.text}</p>
					<p class="meta">
						{#if person}<MemberAvatar
								name={person.display_name}
								color={person.color}
								size={20}
							/>{/if}
						<span
							>{[item.area, person?.display_name, dateOf(item)].filter(Boolean).join(' · ')}</span
						>
						<span class="status">{item.done ? m.feedback_done() : m.feedback_open()}</span>
					</p>
					{#if session.canEdit}
						<button
							class="btn toggle"
							type="button"
							aria-pressed={item.done}
							aria-label={item.done
								? m.feedback_mark_open({ text: item.text.slice(0, 40) })
								: m.feedback_mark_done({ text: item.text.slice(0, 40) })}
							onclick={() => setDone(item, !item.done)}
						>
							{item.done ? m.feedback_open() : m.feedback_done()}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	h1 {
		margin: 0 0 var(--space-3);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	h2 {
		margin: var(--space-6) 0 var(--space-3);
		font-size: 1.125rem;
	}

	.intro {
		max-width: 60ch;
		margin: 0 0 var(--space-4);
		color: var(--color-text-muted);
	}

	.form {
		display: grid;
		gap: var(--space-3);
		max-width: 720px;
	}

	.form textarea {
		width: 100%;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}

	.row .field {
		flex: 1;
		min-width: 12rem;
	}

	.list {
		display: grid;
		gap: var(--space-3);
		max-width: 720px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-2) var(--space-3);
		align-items: start;
	}

	.item.done .text {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	.text {
		grid-column: 1;
		margin: 0;
		white-space: pre-line;
	}

	.meta {
		grid-column: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.status {
		font-weight: 600;
	}

	.toggle {
		grid-column: 2;
		grid-row: 1 / span 2;
	}
</style>
