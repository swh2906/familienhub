<script lang="ts">
	// Zeigt „Neue Version verfügbar“, sobald ein neuer Service Worker bereitsteht (siehe
	// src/service-worker.ts). Erst nach „Neu laden“ übernimmt er; so verliert niemand Eingaben.
	import { onMount } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';

	let waiting = $state<ServiceWorker | null>(null);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		const container = navigator.serviceWorker;
		let registration: ServiceWorkerRegistration | undefined;
		let reloading = false;

		function track(worker: ServiceWorker | null) {
			if (!worker) return;
			const check = () => {
				// Ohne bisherigen Controller ist das die Erstinstallation, kein Update.
				if (worker.state === 'installed' && container.controller) waiting = worker;
			};
			check();
			worker.addEventListener('statechange', check);
		}

		function onUpdateFound() {
			track(registration?.installing ?? null);
		}

		function onControllerChange() {
			if (reloading) return;
			reloading = true;
			location.reload();
		}

		// Lange offene PWA: beim Zurückkehren in die App nach Updates fragen.
		function onVisible() {
			if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
		}

		void container.ready.then((reg) => {
			registration = reg;
			track(reg.waiting);
			reg.addEventListener('updatefound', onUpdateFound);
		});
		container.addEventListener('controllerchange', onControllerChange);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			registration?.removeEventListener('updatefound', onUpdateFound);
			container.removeEventListener('controllerchange', onControllerChange);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	function reload() {
		waiting?.postMessage('skip-waiting');
	}
</script>

{#if waiting}
	<div class="update" role="status">
		<span>{m.update_available()}</span>
		<button class="btn btn-primary" type="button" onclick={reload}>{m.update_reload()}</button>
		<button class="btn" type="button" onclick={() => (waiting = null)}>{m.update_later()}</button>
	</div>
{/if}

<style>
	.update {
		position: fixed;
		top: calc(var(--space-3) + env(safe-area-inset-top));
		left: 50%;
		z-index: 30;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		width: max-content;
		max-width: calc(100vw - 2 * var(--space-4));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
		font-weight: 600;
		transform: translateX(-50%);
	}

	.update span {
		flex: 1;
	}
</style>
