<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Icon from './Icon.svelte';
	import { appearance } from './appearance.svelte.js';
	import { nextTheme, type ThemePreference } from './theme.js';

	const labels: Record<ThemePreference, () => string> = {
		system: m.theme_system,
		light: m.theme_light,
		dark: m.theme_dark
	};
	const icons = { system: 'system', light: 'sun', dark: 'moon' } as const;

	function toggle() {
		appearance.theme = nextTheme(appearance.theme);
	}
</script>

<button
	type="button"
	class="icon-button"
	onclick={toggle}
	aria-label={m.theme_toggle_label({ theme: labels[appearance.theme]() })}
	title={labels[appearance.theme]()}
>
	<Icon name={icons[appearance.theme]} />
</button>

<style>
	.icon-button {
		display: inline-grid;
		place-items: center;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
	}

	.icon-button:hover {
		background: var(--color-surface-2);
	}
</style>
