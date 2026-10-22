<script lang="ts">
	// Eine Zeile der Einkaufsliste: Haken, Emoji, Name (mit Begründung), Menge, wer es hinzugefügt hat.
	// Dieselbe Bedienung wie die Kachel: Antippen löst die Hauptaktion aus (kaufen bzw. wieder auf die
	// Liste), langes Drücken oder Rechtsklick öffnet Details, im Bearbeiten-Modus öffnet Antippen den Dialog.
	import Icon from '#lib/ui/Icon.svelte';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';
	import { emojiFor } from './emoji.js';

	let {
		name,
		quantity = '',
		category = '',
		detail = '',
		variant,
		label,
		adder = null,
		fromPlan = false,
		editable = false,
		onactivate,
		onlongpress
	}: {
		name: string;
		quantity?: string;
		category?: string;
		/** Zweite Zeile, z. B. die Begründung „Für Gemüse-Lasagne“. */
		detail?: string;
		variant: 'open' | 'recent';
		label: string;
		adder?: { name: string; color: string } | null;
		/** Aus dem Essensplan übernommen. */
		fromPlan?: boolean;
		/** Bearbeiten-Modus: Antippen öffnet den Dialog statt abzuhaken (sichtbar markiert). */
		editable?: boolean;
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

<div class="row {variant}" class:editable>
	<button
		type="button"
		class="hit"
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
		<span class="check" aria-hidden="true">
			{#if editable}<Icon name="edit" size={14} />{:else if variant === 'recent'}<svg
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg
				>{/if}
		</span>
		<span class="emoji" aria-hidden="true">{emojiFor(name, category)}</span>
		<span class="text" aria-hidden="true">
			<span class="name">{name}</span>
			{#if detail}
				<span class="detail">
					{#if fromPlan}<Icon name="meals" size={12} />{/if}
					{detail}
				</span>
			{/if}
		</span>
		{#if quantity}<span class="quantity" aria-hidden="true">{quantity}</span>{/if}
	</button>
	<!-- Neben dem Button: Die Initiale wäre sonst sichtbarer Text, der im Button-Namen fehlt (WCAG 2.5.3).
	Wer hinzugefügt hat, steht bereits im Namen (label). -->
	{#if adder}
		<span class="adder" aria-hidden="true">
			<MemberAvatar name={adder.name} color={adder.color} size={26} />
		</span>
	{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 60px;
	}

	.hit {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		min-height: 60px;
		margin: 0 calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
	}

	.hit:hover {
		background: var(--color-surface-2);
	}

	.check {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 3px solid var(--color-shopping);
		border-radius: var(--radius-pill);
		color: var(--color-surface);
		transition: transform 0.12s ease;
	}

	.hit:active .check {
		transform: scale(0.88);
	}

	.recent .check {
		border-color: var(--color-shopping);
		background: var(--color-shopping);
	}

	.editable .check {
		border-style: dashed;
		border-color: var(--color-text-muted);
		color: var(--color-text);
	}

	.emoji {
		flex: none;
		font-size: 1.375rem;
		line-height: 1;
	}

	.text {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.recent .name {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	/* Fließtext mit Symbol am Anfang: bricht wie Text um, das Symbol bleibt vorn. */
	.detail {
		color: var(--color-text-muted);
		font-size: var(--fs-mini);
	}

	.detail :global(svg) {
		display: inline;
		margin-right: 4px;
		vertical-align: -1px;
	}

	.quantity {
		flex: none;
		padding: 3px 10px;
		border-radius: var(--radius-pill);
		background: var(--color-surface-2);
		color: var(--color-text-muted);
		font-size: var(--fs-mini);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.adder {
		display: inline-flex;
		flex: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.check {
			transition: none;
		}

		.hit:active .check {
			transform: none;
		}
	}
</style>
