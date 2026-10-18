<script lang="ts">
	// Reiter unter Aufgaben: „Feedback“ gibt es nur in der Testphase (Server mit HOMI_FEEDBACK=1).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { features } from '#lib/auth/features.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const tasksHref = resolve('/(app)/aufgaben');
	const feedbackHref = resolve('/(app)/aufgaben/feedback');
	const onFeedback = $derived(page.url.pathname.startsWith(feedbackHref));
</script>

{#if features.feedback || onFeedback}
	<nav class="tabs" aria-label={m.tasks_sections_label()}>
		<a href={tasksHref} aria-current={onFeedback ? undefined : 'page'}>{m.tasks_tab_tasks()}</a>
		<a href={feedbackHref} aria-current={onFeedback ? 'page' : undefined}
			>{m.tasks_tab_feedback()}</a
		>
	</nav>
{/if}

{@render children()}

<style>
	.tabs {
		display: inline-flex;
		gap: 2px;
		margin-bottom: var(--space-6);
		padding: 3px;
		border-radius: 12px;
		background: var(--color-surface-2);
	}

	.tabs a {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border-radius: 9px;
		color: var(--color-text-muted);
		font-weight: 600;
		text-decoration: none;
	}

	.tabs a[aria-current='page'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}
</style>
