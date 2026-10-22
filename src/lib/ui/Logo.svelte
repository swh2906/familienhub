<script lang="ts">
	// Homi-Logo: Haus mit einem H darin (Umriss mit Dach, Wänden und abgerundetem Boden).
	// Dieselbe Form wie im Favicon und den App-Icons (scripts/icons.ts). Rein dekorativ.
	let { size = 28 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
	<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
	<path d="M9.5 21v-7M14.5 21v-7M9.5 16.5h5" />
</svg>

<style>
	svg {
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.1;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
