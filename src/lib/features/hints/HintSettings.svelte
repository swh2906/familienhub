<script lang="ts">
	// Einstellungen: mit „Nie wieder so“ ausgeblendete Hinweise wieder einschalten.
	import { session } from '#lib/auth/session.svelte.js';
	import { live } from '#lib/db/live.svelte.js';
	import type { HintResponse } from '#lib/db/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resetNever, responsesOf } from './store.js';

	const ids = $derived({
		household: session.householdId ?? '',
		membership: session.membership?.id ?? ''
	});
	const data = live(
		() => ids,
		({ household, membership }) =>
			household && membership ? responsesOf(household, membership) : Promise.resolve([]),
		[] as HintResponse[]
	);
	const hidden = $derived(data.current.filter((r) => r.response === 'never').length);
	let done = $state(false);

	async function reset() {
		await resetNever(ids.household, ids.membership);
		done = true;
	}
</script>

<p class="hint">{m.settings_hints_text()}</p>
{#if hidden > 0}
	<button class="btn" type="button" onclick={reset}>{m.settings_hints_reset()}</button>
{:else}
	<p role="status">{done ? m.settings_hints_done() : m.settings_hints_none()}</p>
{/if}

<style>
	p {
		margin: 0;
	}

	.hint {
		color: var(--color-text-muted);
	}
</style>
