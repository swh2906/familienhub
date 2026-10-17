<script lang="ts">
	// Eine Kachel im Bring-Stil: Emoji, Name, Menge. Antippen löst die Hauptaktion aus
	// (kaufen, wieder auf die Liste, hinzufügen); langes Drücken oder Rechtsklick öffnet Details.
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';
	import { emojiFor } from './emoji.js';

	let {
		name,
		quantity = '',
		category = '',
		variant,
		label,
		adder = null,
		onactivate,
		onlongpress
	}: {
		name: string;
		quantity?: string;
		category?: string;
		variant: 'open' | 'recent' | 'suggestion';
		label: string;
		adder?: { name: string; color: string } | null;
		onactivate: () => void;
		onlongpress?: () => void;
	} = $props();

	const LONG_PRESS_MS = 500;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let longPressed = false;

	function startPress(event: PointerEvent) {
		if (!onlongpress || event.button !== 0) return;
		longPressed = false;
		timer = setTimeout(() => {
			longPressed = true;
			onlongpress?.();
		}, LONG_PRESS_MS);
	}

	function cancelPress() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	function click() {
		if (longPressed) {
			longPressed = false;
			return;
		}
		onactivate();
	}
</script>

<div class="wrap">
	<button
		type="button"
		class="tile {variant}"
		aria-label={label}
		onclick={click}
		onpointerdown={startPress}
		onpointerup={cancelPress}
		onpointerleave={cancelPress}
		onpointercancel={cancelPress}
		oncontextmenu={(event) => {
			if (!onlongpress) return;
			event.preventDefault();
			cancelPress();
			onlongpress();
		}}
	>
		<span class="emoji" aria-hidden="true">{emojiFor(name, category)}</span>
		<span class="name" aria-hidden="true">{name}</span>
		{#if quantity}<span class="quantity" aria-hidden="true">{quantity}</span>{/if}
	</button>
	<!-- Neben dem Button: Die Initiale wäre sonst sichtbarer Text, der im Button-Namen fehlt (WCAG 2.5.3).
	Wer hinzugefügt hat, steht bereits im Namen (label). -->
	{#if adder}
		<span class="adder" aria-hidden="true">
			<MemberAvatar name={adder.name} color={adder.color} size={20} />
		</span>
	{/if}
</div>

<style>
	.tile {
		position: relative;
		display: grid;
		grid-template-rows: auto auto auto;
		align-content: center;
		justify-items: center;
		gap: 2px;
		width: 100%;
		aspect-ratio: 1 / 0.92;
		min-height: var(--touch-target);
		padding: var(--space-2) var(--space-1);
		border: 0;
		border-radius: 14px;
		font: inherit;
		text-align: center;
		cursor: pointer;
		user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 0.12s ease,
			filter 0.12s ease;
	}

	.tile:active {
		transform: scale(0.95);
	}

	/* Offene Artikel in der Akzentfarbe (Petrol, Indigo oder Graphit). */
	.open {
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

	.open:hover {
		filter: brightness(1.08);
	}

	.recent,
	.suggestion {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: inset 0 0 0 1px var(--color-border);
	}

	.recent:hover,
	.suggestion:hover {
		background: var(--color-surface-2);
	}

	.suggestion {
		box-shadow: inset 0 0 0 2px var(--color-primary);
	}

	.emoji {
		font-size: 1.875rem;
		line-height: 1.1;
	}

	.recent .emoji {
		opacity: 0.85;
	}

	.name {
		max-width: 100%;
		font-size: 0.875rem;
		font-weight: 650;
		line-height: 1.2;
		hyphens: auto;
		overflow-wrap: break-word;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.quantity {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		opacity: 0.9;
	}

	.wrap {
		position: relative;
	}

	.adder {
		position: absolute;
		pointer-events: none;
		top: 5px;
		right: 5px;
		display: inline-flex;
		border-radius: 999px;
		box-shadow: 0 0 0 2px var(--color-primary);
	}

	@media (prefers-reduced-motion: reduce) {
		.tile {
			transition: none;
		}

		.tile:active {
			transform: none;
		}
	}
</style>
