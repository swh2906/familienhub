<script lang="ts">
	// Auswahl aus den geprüften Mitgliedsfarben (Kontrast in Hell und Dunkel).
	import { m } from '#lib/paraglide/messages.js';
	import { MEMBER_COLORS } from '#lib/ui/members.js';

	let { value = $bindable(), name }: { value: string; name: string } = $props();
</script>

<fieldset class="colors">
	<legend>{m.member_color()}</legend>
	<div class="swatches">
		{#each MEMBER_COLORS as color, index (color)}
			<label class="swatch" style:background={color}>
				<input
					type="radio"
					{name}
					value={color}
					bind:group={value}
					aria-label={m.member_color_option({ n: index + 1 })}
				/>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.colors {
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

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.swatch {
		position: relative;
		width: var(--touch-target);
		height: var(--touch-target);
		border-radius: 999px;
		cursor: pointer;
	}

	.swatch input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.swatch:has(input:checked) {
		box-shadow:
			0 0 0 3px var(--color-surface),
			0 0 0 6px var(--color-text);
	}

	.swatch:has(input:checked)::after {
		content: '';
		position: absolute;
		inset: 15px 13px 19px;
		border: solid var(--member-text);
		border-width: 0 0 3px 3px;
		transform: rotate(-45deg);
	}

	.swatch:has(input:focus-visible) {
		outline: 3px solid var(--color-focus);
		outline-offset: 5px;
	}
</style>
