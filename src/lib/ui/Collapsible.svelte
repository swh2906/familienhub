<script lang="ts">
	// Einklappbarer Abschnitt als Karte: Überschrift antippen klappt auf und zu (natives <details>,
	// damit Tastatur und Screenreader ohne Zusatzlogik funktionieren).
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		open = $bindable(true),
		children
	}: { id: string; title: string; open?: boolean; children: Snippet } = $props();
</script>

<section class="card collapsible" id="section-{id}" aria-labelledby="{id}-heading">
	<details bind:open>
		<summary>
			<h2 id="{id}-heading">{title}</h2>
			<span class="chevron" aria-hidden="true"></span>
		</summary>
		<div class="content">
			{@render children()}
		</div>
	</details>
</section>

<style>
	.collapsible {
		scroll-margin-top: var(--space-4);
	}

	summary {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--touch-target);
		margin: calc(-1 * var(--space-2)) 0;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 3px solid var(--color-focus);
		outline-offset: 4px;
		border-radius: var(--radius);
	}

	h2 {
		flex: 1;
		margin: 0;
		font-size: 1.125rem;
	}

	/* Pfeil nach unten, aufgeklappt nach oben. */
	.chevron {
		width: 10px;
		height: 10px;
		margin-right: var(--space-1);
		border-right: 2px solid var(--color-text-muted);
		border-bottom: 2px solid var(--color-text-muted);
		transform: rotate(45deg) translateY(-3px);
		transition: transform 0.15s;
	}

	details[open] .chevron {
		transform: rotate(-135deg) translateY(-3px);
	}

	.content {
		display: grid;
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.content :global(p) {
		margin: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
