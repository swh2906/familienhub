<script lang="ts">
	// Personenfarbe immer mit Initiale (Farbe allein trägt keine Bedeutung).
	import { initialOf, memberColor } from './members.js';

	let { name, color, size = 36 }: { name: string; color: string; size?: number } = $props();
</script>

<span
	class="avatar"
	style:background={memberColor(color)}
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.round(size * 0.42)}px"
	aria-hidden="true">{initialOf(name)}</span
>

<style>
	.avatar {
		display: inline-grid;
		place-items: center;
		flex: none;
		border-radius: 999px;
		color: var(--member-text);
		font-weight: 700;
		line-height: 1;
	}
</style>
