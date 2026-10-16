<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Icon from './Icon.svelte';
	import { applyTheme, loadTheme, nextTheme, type ThemePreference } from './theme.js';

	let theme: ThemePreference = $state(loadTheme());

	const labels: Record<ThemePreference, () => string> = {
		system: m.theme_system,
		light: m.theme_light,
		dark: m.theme_dark
	};
	const icons = { system: 'system', light: 'sun', dark: 'moon' } as const;

	function toggle() {
		theme = nextTheme(theme);
		applyTheme(theme);
	}
</script>

<button
	type="button"
	class="theme-toggle"
	onclick={toggle}
	aria-label={m.theme_toggle_label({ theme: labels[theme]() })}
	title={labels[theme]()}
>
	<Icon name={icons[theme]} />
</button>

<style>
	.theme-toggle {
		display: inline-grid;
		place-items: center;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
	}

	.theme-toggle:hover {
		background: var(--color-nav-active-bg);
	}
</style>
