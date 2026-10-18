<script lang="ts">
	// Kochmütze für die Schwierigkeit (Form wie in der COOK-App). Rein dekorativ.
	let { filled }: { filled: boolean } = $props();
</script>

<svg class:filled viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
	<rect x="4.8" y="14.4" width="14.4" height="7.2" rx="2" />
	<ellipse cx="5.6" cy="11.4" rx="4.8" ry="5.4" />
	<ellipse cx="12" cy="9" rx="6" ry="6.6" />
	<ellipse cx="18.4" cy="11.4" rx="4.8" ry="5.4" />
</svg>

<style>
	svg {
		display: block;
		fill: color-mix(in srgb, var(--paper-text) 25%, transparent);
	}

	svg.filled {
		fill: var(--paper-heading);
	}
</style>
