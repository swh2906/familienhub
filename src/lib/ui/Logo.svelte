<script lang="ts">
	// Homi-Logo: kleines Haus aus einem H (Giebeldach über den beiden H-Pfosten).
	// Dieselbe Form wie im Favicon und den App-Icons (scripts/icons.ts). Rein dekorativ.
	let { size = 28 }: { size?: number } = $props();
</script>

<svg viewBox="8 8 48 48" width={size} height={size} aria-hidden="true" focusable="false">
	<path d="M12 30 L32 13 L52 30" stroke-width="5" />
	<path d="M21 29 V51 M43 29 V51 M21 40 H43" stroke-width="6.5" />
</svg>

<style>
	svg {
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
