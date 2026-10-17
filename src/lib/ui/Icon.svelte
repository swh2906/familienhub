<script lang="ts">
	// Schlanke Inline-Icons (dekorativ, der Text daneben trägt die Bedeutung).
	type IconName =
		| 'today'
		| 'meals'
		| 'shopping'
		| 'calendar'
		| 'tasks'
		| 'sun'
		| 'moon'
		| 'system'
		| 'settings'
		| 'synced'
		| 'pending'
		| 'offline'
		| 'error'
		| 'up'
		| 'down'
		| 'close'
		| 'edit'
		| 'plus';

	let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'today' || name === 'sun'}
		<circle cx="12" cy="12" r="4" />
		<path
			d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
		/>
	{:else if name === 'meals'}
		<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2 0-3 3-3 7s1 5 3 5" />
	{:else if name === 'shopping'}
		<circle cx="9" cy="20" r="1.5" />
		<circle cx="18" cy="20" r="1.5" />
		<path d="M2 3h3l2.5 12h11.5l2-8H6.2" />
	{:else if name === 'calendar'}
		<rect x="3" y="5" width="18" height="16" rx="2" />
		<path d="M3 10h18M8 3v4M16 3v4" />
	{:else if name === 'tasks'}
		<rect x="3" y="3" width="18" height="18" rx="3" />
		<path d="m8 12 3 3 5-6" />
	{:else if name === 'moon'}
		<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
	{:else if name === 'system'}
		<rect x="3" y="4" width="18" height="12" rx="2" />
		<path d="M8 20h8M12 16v4" />
	{:else if name === 'settings'}
		<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
		<circle cx="16" cy="6" r="2" />
		<circle cx="10" cy="12" r="2" />
		<circle cx="18" cy="18" r="2" />
	{:else if name === 'synced'}
		<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.75 3.75 0 0 1 17.5 18z" />
		<path d="m9.5 13.5 2 2 3.5-4" />
	{:else if name === 'pending'}
		<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4" />
		<path d="M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" />
	{:else if name === 'offline'}
		<path
			d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 2.1-3.3M12 4.5a6 6 0 0 1 5.8 6 3.75 3.75 0 0 1 2.7 5.6"
		/>
		<path d="M3 3l18 18" />
	{:else if name === 'up'}
		<path d="M12 19V5M6 11l6-6 6 6" />
	{:else if name === 'down'}
		<path d="M12 5v14M6 13l6 6 6-6" />
	{:else if name === 'edit'}
		<path d="M4 20h4L19 9l-4-4L4 16z" />
		<path d="m13.5 6.5 4 4" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'error'}
		<path d="M12 3 2 20h20z" />
		<path d="M12 10v4M12 17v.5" />
	{/if}
</svg>
