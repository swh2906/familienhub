<script lang="ts">
	import { shortcut } from '#lib/ui/shortcut.js';
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { Membership, Task, TaskCompletion } from '#lib/db/types.js';
	import { formatCompactDay, toDateString } from '#lib/features/meals/week.js';
	import { membersOf } from '#lib/features/shopping/store.js';
	import { parseUtc } from '#lib/features/calendar/tz.js';
	import { describeRrule } from '#lib/features/tasks/describe.js';
	import {
		canComplete,
		dueKind,
		effectiveDue,
		groupTasks,
		type TaskGroup,
		isOpen,
		recentCompletions,
		tasksForTab,
		type Tab
	} from '#lib/features/tasks/list.js';
	import {
		completeTask,
		completionsOf,
		deleteTask,
		revertCompletion,
		restoreTask,
		tasksOf,
		undoCompletion,
		type CompletionUndo
	} from '#lib/features/tasks/store.js';
	import TaskDialog from '#lib/features/tasks/TaskDialog.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';

	const household = session.householdId ?? '';
	const membership = session.membership?.id ?? '';
	const today = toDateString(new Date());

	const data = live(
		() => household,
		async (h) => {
			const tasks = await tasksOf(h);
			return {
				tasks,
				completions: await completionsOf(tasks.map((t) => t.id)),
				members: await membersOf(h)
			};
		},
		{ tasks: [] as Task[], completions: [] as TaskCompletion[], members: [] as Membership[] }
	);

	let tab = $state<Tab>('mine');
	const visible = $derived(
		tab === 'done' ? [] : tasksForTab(data.current.tasks, tab, membership, today)
	);
	const groups = $derived(groupTasks(visible, today));
	const groupLabels: Record<TaskGroup, () => string> = {
		overdue: m.tasks_group_overdue,
		today: m.tasks_group_today,
		week: m.tasks_group_week,
		later: m.tasks_group_later,
		none: m.tasks_group_none
	};
	const done = $derived(recentCompletions(data.current.completions, data.current.tasks));

	/** Zurücknehmen: Admins und Erwachsene alles, Kinder ihr eigenes Erledigt (wie die Server-Regel). */
	function canRevert(completion: TaskCompletion, task: Task | undefined): boolean {
		return !!task && !task.deleted_at && (session.canEdit || completion.membership === membership);
	}

	async function revert(completion: TaskCompletion, task: Task) {
		await revertCompletion(
			completion,
			task,
			toDateString(new Date(parseUtc(completion.completed_at)))
		);
		showToast(m.task_reverted({ title: task.title }), () =>
			completeTask(task, membership, today).then(() => undefined)
		);
	}
	const openCount = $derived(tasksForTab(data.current.tasks, 'mine', membership, today).length);
	const members = $derived(new Map(data.current.members.map((member) => [member.id, member])));
	const activeMembers = $derived(data.current.members.filter((member) => !member.deleted_at));

	let dialogOpen = $state(false);
	let editing: Task | null = $state(null);
	let toast: {
		text: string;
		undo: () => Promise<void>;
		timer: ReturnType<typeof setTimeout>;
	} | null = $state(null);

	function showToast(text: string, undo: () => Promise<void>) {
		if (toast) clearTimeout(toast.timer);
		toast = { text, undo, timer: setTimeout(() => (toast = null), 8000) };
	}

	async function runUndo() {
		if (!toast) return;
		clearTimeout(toast.timer);
		const undo = toast.undo;
		toast = null;
		await undo();
	}

	async function complete(task: Task) {
		const result: CompletionUndo = await completeTask(task, membership, today);
		showToast(
			result.next
				? m.task_completed_next({ title: task.title, date: formatCompactDay(result.next) })
				: m.task_completed({ title: task.title }),
			() => undoCompletion(result)
		);
	}

	async function remove(task: Task) {
		await deleteTask(task);
		showToast(m.task_deleted(), () => restoreTask(task.id));
	}

	function dueText(task: Task): string {
		const due = effectiveDue(task, today);
		switch (dueKind(due, today)) {
			case 'overdue':
				return m.task_due_overdue({ date: formatCompactDay(due) });
			case 'today':
				return m.task_due_today();
			case 'tomorrow':
				return m.task_due_tomorrow();
			case 'later':
				return formatCompactDay(due);
			default:
				return '';
		}
	}

	function assigneeNames(task: Task): string {
		const names = (task.assignees ?? [])
			.map((id) => members.get(id)?.display_name)
			.filter(Boolean)
			.join(', ');
		return m.task_assigned_to({ names: names || m.task_everyone() });
	}

	const tabs: { value: Tab; label: () => string }[] = [
		{ value: 'mine', label: m.tasks_tab_mine },
		{ value: 'all', label: m.tasks_tab_all },
		{ value: 'done', label: m.tasks_tab_done }
	];
</script>

<svelte:head>
	<title>{m.tasks_title()} · {m.app_name()}</title>
</svelte:head>

<div class="head">
	<div class="heading">
		<h1>{m.tasks_title()}</h1>
		{#if openCount > 0}<span class="count">{m.tasks_open_count({ count: openCount })}</span>{/if}
	</div>
	{#if session.canEdit}
		<button
			class="btn btn-primary new"
			type="button"
			{@attach shortcut('n')}
			onclick={() => {
				editing = null;
				dialogOpen = true;
			}}
		>
			<Icon name="plus" size={20} />
			{m.tasks_new()}
		</button>
	{/if}
</div>

<div class="tabs" role="group" aria-label={m.tasks_tabs_label()}>
	{#each tabs as option (option.value)}
		<button type="button" aria-pressed={tab === option.value} onclick={() => (tab = option.value)}>
			{option.label()}
		</button>
	{/each}
</div>

{#if tab === 'done'}
	{#if done.length === 0}
		<p class="hint">{m.tasks_empty_done()}</p>
	{:else}
		<ul class="card list" aria-label={m.tasks_tab_done()}>
			{#each done as { completion, task } (completion.id)}
				{@const person = members.get(completion.membership)}
				<li class="row done">
					{#if task && canRevert(completion, task)}
						<button
							type="button"
							class="check checked"
							aria-label={m.task_revert_label({ title: task.title })}
							onclick={() => revert(completion, task)}
						></button>
					{:else}
						<span class="check checked" aria-hidden="true"></span>
					{/if}
					<div class="body">
						<span class="title">{task?.title ?? '–'}</span>
						<span class="meta">
							{m.task_done_by({
								person: person?.display_name ?? '?',
								date: formatCompactDay(toDateString(new Date(completion.completed_at)))
							})}
						</span>
					</div>
					{#if person}<MemberAvatar
							name={person.display_name}
							color={person.color}
							size={28}
						/>{/if}
					{#if task && !task.deleted_at && session.canEdit}
						<button
							type="button"
							class="edit"
							aria-label={m.task_edit({ title: task.title })}
							onclick={() => {
								editing = task;
								dialogOpen = true;
							}}
						>
							<Icon name="edit" size={20} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{:else if data.loaded && visible.length === 0}
	<p class="hint">{tab === 'mine' ? m.tasks_empty_mine() : m.tasks_empty_all()}</p>
{:else}
	{#each groups as { group, tasks: items } (group)}
		<section class="group" aria-labelledby="tasks-group-{group}">
			<h2 class="group-title" class:overdue={group === 'overdue'} id="tasks-group-{group}">
				{groupLabels[group]()} <span class="group-count">{items.length}</span>
			</h2>
			<ul class="card list" aria-labelledby="tasks-group-{group}">
				{#each items as task (task.id)}
					{@const allowed = canComplete(task, membership, session.canEdit)}
					{@const kind = dueKind(effectiveDue(task, today), today)}
					<li class="row">
						<button
							type="button"
							class="check"
							disabled={!allowed || !isOpen(task)}
							title={allowed ? undefined : m.task_complete_denied({ title: task.title })}
							aria-label={allowed
								? m.task_complete({ title: task.title })
								: m.task_complete_denied({ title: task.title })}
							onclick={() => complete(task)}
						></button>
						<div class="body">
							<span class="title">{task.title}</span>
							<span class="meta">
								{#if kind !== 'none'}
									<span class="due {kind}">{dueText(task)}</span>
								{/if}
								{#if task.rrule}
									<span class="repeat"
										><Icon name="pending" size={14} />{describeRrule(task.rrule)}</span
									>
								{/if}
								<span class="visually-hidden">{assigneeNames(task)}</span>
							</span>
							{#if task.notes}<span class="notes">{task.notes}</span>{/if}
						</div>
						<span class="avatars" aria-hidden="true">
							{#each task.assignees ?? [] as id (id)}
								{@const person = members.get(id)}
								{#if person}<MemberAvatar
										name={person.display_name}
										color={person.color}
										size={28}
									/>{/if}
							{/each}
						</span>
						{#if session.canEdit}
							<button
								type="button"
								class="edit"
								aria-label={m.task_edit({ title: task.title })}
								onclick={() => {
									editing = task;
									dialogOpen = true;
								}}
							>
								<Icon name="edit" size={20} />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

{#if toast}
	<div class="toast" role="status">
		<span>{toast.text}</span>
		<button class="btn" type="button" onclick={runUndo}>{m.shopping_undo()}</button>
	</div>
{/if}

{#if session.canEdit}
	<TaskDialog
		open={dialogOpen}
		task={editing}
		{household}
		members={activeMembers}
		{today}
		onclose={() => {
			dialogOpen = false;
			editing = null;
		}}
		ondelete={remove}
	/>
{/if}

<style>
	/* Wie im Kalender: Überschrift links, „Neue Aufgabe“ rechts in derselben Zeile. */
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.heading {
		display: grid;
		min-width: 0;
	}

	/* Gruppen: Überfällig, Heute, Nächste 7 Tage, Später, Ohne Datum. */
	.group + .group {
		margin-top: var(--space-4);
	}

	.group-title {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.group-title.overdue {
		color: var(--color-warning);
	}

	.group-count {
		font-weight: 600;
		letter-spacing: 0;
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.count {
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.new {
		flex: none;
		margin-left: auto;
		padding: 0 var(--space-4);
	}

	.tabs {
		display: inline-flex;
		gap: 2px;
		margin-bottom: var(--space-4);
		padding: 3px;
		border-radius: 12px;
		background: var(--color-surface-2);
	}

	.tabs button {
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

	.tabs button[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	.list {
		display: grid;
		gap: 0;
		max-width: 760px;
		margin: 0;
		padding: var(--space-1) var(--space-4);
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 64px;
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-border);
	}

	.row:first-child {
		border-top: 0;
	}

	/* Runder Abhak-Knopf mit 48-px-Fläche; der sichtbare Kreis ist kleiner. */
	.check {
		position: relative;
		flex: none;
		width: var(--touch-target);
		height: var(--touch-target);
		border: 0;
		border-radius: 999px;
		background: transparent;
		cursor: pointer;
	}

	.check::before {
		content: '';
		position: absolute;
		inset: 11px;
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
		opacity: 0.6;
	}

	.check.checked::before {
		border-color: var(--color-tasks);
		background: var(--color-tasks);
	}

	button.check.checked {
		cursor: pointer;
	}

	button.check.checked:hover::before {
		opacity: 0.75;
	}

	.check.checked::after {
		content: '';
		position: absolute;
		left: 20px;
		top: 15px;
		width: 6px;
		height: 12px;
		border: solid var(--color-bg);
		border-width: 0 2.5px 2.5px 0;
		transform: rotate(45deg);
	}

	.body {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.title {
		font-size: 1.0625rem;
		font-weight: 600;
		overflow-wrap: break-word;
		hyphens: auto;
	}

	.done .title {
		color: var(--color-text-muted);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-3);
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.due.overdue {
		color: var(--color-warning);
		font-weight: 700;
	}

	.due.today {
		color: var(--color-tasks);
		font-weight: 700;
	}

	.repeat {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.notes {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		white-space: pre-line;
		overflow-wrap: break-word;
	}

	.avatars {
		display: flex;
		flex: none;
	}

	.avatars :global(.avatar + .avatar) {
		margin-left: -8px;
		box-shadow: 0 0 0 2px var(--color-surface);
	}

	.edit {
		display: inline-grid;
		place-items: center;
		flex: none;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.edit:hover {
		background: var(--color-surface-2);
		color: var(--color-text);
	}

	.small {
		padding: 0 var(--space-3);
		font-size: 0.875rem;
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

	@media (min-width: 700px) {
		.toast {
			bottom: var(--space-6);
		}
	}
</style>
