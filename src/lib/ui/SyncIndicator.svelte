<script lang="ts">
	// Sync-Status in der Kopfzeile: Symbol und kurzer Text, für Screenreader angesagt.
	import { m } from '#lib/paraglide/messages.js';
	import { syncStatus } from '#lib/sync/status.svelte.js';
	import Icon from './Icon.svelte';

	const text = $derived(
		{
			synced: m.sync_synced(),
			pending: m.sync_pending({ count: syncStatus.pending }),
			offline: m.sync_offline(),
			error: m.sync_error()
		}[syncStatus.state]
	);
</script>

<span
	class="sync"
	data-state={syncStatus.state}
	role="status"
	aria-label={m.sync_label({ state: text })}
	title={syncStatus.state === 'offline' ? m.sync_offline_hint() : text}
>
	<Icon name={syncStatus.state} size={18} />
	<span class="text" aria-hidden="true">{text}</span>
</span>

<style>
	.sync {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 32px;
		padding: 0 var(--space-3);
		border-radius: 999px;
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.sync[data-state='offline'],
	.sync[data-state='pending'] {
		background: var(--color-surface-2);
		color: var(--color-text);
	}

	.sync[data-state='error'] {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}

	/* Sehr schmale Handys: nur das Symbol, der Text bleibt für Screenreader im Label. */
	@media (max-width: 359px) {
		.text {
			display: none;
		}
	}
</style>
