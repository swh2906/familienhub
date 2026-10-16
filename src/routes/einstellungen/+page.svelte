<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { appearance } from '#lib/ui/appearance.svelte.js';
	import { ACCENTS, type Accent, type ThemePreference } from '#lib/ui/theme.js';

	const themes: { value: ThemePreference; label: () => string }[] = [
		{ value: 'system', label: m.theme_system },
		{ value: 'light', label: m.theme_light },
		{ value: 'dark', label: m.theme_dark }
	];
	const accentLabels: Record<Accent, () => string> = {
		petrol: m.accent_petrol,
		indigo: m.accent_indigo,
		graphit: m.accent_graphit
	};
</script>

<svelte:head>
	<title>{m.settings_title()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.settings_title()}</h1>

<section class="card" aria-labelledby="appearance-heading">
	<h2 id="appearance-heading">{m.settings_appearance()}</h2>

	<fieldset>
		<legend>{m.settings_theme()}</legend>
		<p class="hint">{m.settings_theme_hint()}</p>
		<div class="options">
			{#each themes as theme (theme.value)}
				<label class="option">
					<input
						type="radio"
						name="theme"
						value={theme.value}
						checked={appearance.theme === theme.value}
						onchange={() => (appearance.theme = theme.value)}
					/>
					<span>{theme.label()}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset>
		<legend>{m.settings_accent()}</legend>
		<p class="hint">{m.settings_accent_hint()}</p>
		<div class="options">
			{#each ACCENTS as accent (accent)}
				<label class="option">
					<input
						type="radio"
						name="accent"
						value={accent}
						checked={appearance.accent === accent}
						onchange={() => (appearance.accent = accent)}
					/>
					<span class="swatch" style:background="var(--swatch-{accent})" aria-hidden="true"></span>
					<span>{accentLabels[accent]()}</span>
				</label>
			{/each}
		</div>
	</fieldset>
</section>

<style>
	h1 {
		margin: 0 0 var(--space-6);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.card {
		display: grid;
		gap: var(--space-6);
		max-width: 640px;
		padding: var(--space-6) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	fieldset {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		font-weight: 600;
	}

	.hint {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.option {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		cursor: pointer;
	}

	.option:has(input:checked) {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-weight: 600;
	}

	.option:has(input:focus-visible) {
		outline: 3px solid var(--color-focus);
		outline-offset: 2px;
	}

	.option input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.swatch {
		width: 20px;
		height: 20px;
		border-radius: 999px;
	}

	@media (min-width: 700px) {
		.card {
			padding: var(--space-6);
		}
	}
</style>
