<script lang="ts">
	// Daten und Konto: Export (alle), Konto löschen (alle), Familienraum löschen (nur Admin).
	// Löschen ist zweistufig: erst aufklappen und lesen, dann mit Passwort bzw. Namen bestätigen.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		deleteAccount,
		deleteHousehold,
		isLastAdminError,
		serverMessage
	} from '#lib/auth/family.js';
	import { isOffline } from '#lib/auth/session.svelte.js';
	import { getDb } from '#lib/db/database.js';
	import { m } from '#lib/paraglide/messages.js';
	import { exportFileName, readExport } from './export.js';

	let {
		household,
		householdName,
		isAdmin
	}: { household: string; householdName: string; isAdmin: boolean } = $props();

	let exported = $state('');
	let open: 'account' | 'household' | null = $state(null);
	let password = $state('');
	let confirmName = $state('');
	let busy = $state(false);
	let error = $state('');

	const nameMatches = $derived(confirmName.trim() === householdName.trim() && confirmName !== '');

	function fail(e: unknown) {
		if (isLastAdminError(e)) error = m.account_delete_last_admin();
		else error = isOffline(e) ? m.error_offline() : (serverMessage(e) ?? m.error_generic());
	}

	function toggle(section: 'account' | 'household') {
		open = open === section ? null : section;
		error = '';
		password = '';
		confirmName = '';
	}

	async function exportData() {
		const data = await readExport(getDb(), household);
		const file = exportFileName(householdName, new Date());
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = file;
		link.click();
		URL.revokeObjectURL(url);
		exported = m.privacy_export_done({ file });
	}

	async function removeAccount(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			await deleteAccount(password);
			await goto(resolve('/(auth)/login'), { replace: true });
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function removeHousehold(event: SubmitEvent) {
		event.preventDefault();
		if (!nameMatches) return;
		busy = true;
		error = '';
		try {
			await deleteHousehold(household, confirmName);
			await goto(resolve('/(app)'), { replace: true, refreshAll: true });
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="block">
	<p class="hint">{m.privacy_export_hint()}</p>
	<button class="btn" type="button" onclick={exportData}>{m.privacy_export()}</button>
	{#if exported}<p class="hint" role="status">{exported}</p>{/if}
</div>

<div class="block">
	<button
		class="btn btn-danger"
		type="button"
		aria-expanded={open === 'account'}
		aria-controls="account-delete"
		onclick={() => toggle('account')}
	>
		{m.account_delete()}
	</button>
	{#if open === 'account'}
		<form id="account-delete" class="confirm" onsubmit={removeAccount}>
			<p>{m.account_delete_warning()}</p>
			<div class="field">
				<label for="account-delete-password">{m.account_delete_password()}</label>
				<input
					id="account-delete-password"
					type="password"
					autocomplete="current-password"
					required
					bind:value={password}
				/>
			</div>
			{#if error}<p class="form-error" role="alert">{error}</p>{/if}
			<div class="actions">
				<button class="btn btn-danger" type="submit" disabled={busy}>
					{m.account_delete_confirm()}
				</button>
				<button class="btn" type="button" onclick={() => toggle('account')}>{m.cancel()}</button>
			</div>
		</form>
	{/if}
</div>

{#if isAdmin}
	<div class="block">
		<button
			class="btn btn-danger"
			type="button"
			aria-expanded={open === 'household'}
			aria-controls="household-delete"
			onclick={() => toggle('household')}
		>
			{m.household_delete()}
		</button>
		{#if open === 'household'}
			<form id="household-delete" class="confirm" onsubmit={removeHousehold}>
				<p>{m.household_delete_warning({ name: householdName })}</p>
				<div class="field">
					<label for="household-delete-name">
						{m.household_delete_name({ name: householdName })}
					</label>
					<input id="household-delete-name" autocomplete="off" required bind:value={confirmName} />
				</div>
				{#if error}<p class="form-error" role="alert">{error}</p>{/if}
				<div class="actions">
					<button class="btn btn-danger" type="submit" disabled={busy || !nameMatches}>
						{m.household_delete_confirm()}
					</button>
					<button class="btn" type="button" onclick={() => toggle('household')}>
						{m.cancel()}
					</button>
				</div>
			</form>
		{/if}
	</div>
{/if}

<style>
	.block {
		display: grid;
		gap: var(--space-3);
		justify-items: start;
	}

	.block p {
		margin: 0;
	}

	.confirm {
		display: grid;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-4);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
