<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { listMembers, renameHousehold, serverMessage } from '#lib/auth/family.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import type { Membership } from '#lib/auth/types.js';
	import ChildForm from '#lib/features/household/ChildForm.svelte';
	import FamilyMembers from '#lib/features/household/FamilyMembers.svelte';
	import InvitePanel from '#lib/features/household/InvitePanel.svelte';
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

	const household = session.householdId ?? '';
	let members: Membership[] = $state([]);
	let householdName = $state(session.householdName);
	let familyError = $state('');

	async function reload() {
		try {
			members = await listMembers(household);
			await session.loadMemberships();
			familyError = '';
		} catch (e) {
			familyError = isOffline(e) ? m.error_offline() : m.error_generic();
		}
	}

	onMount(reload);

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		try {
			await renameHousehold(household, householdName);
			familyError = '';
		} catch (e) {
			familyError = isOffline(e) ? m.error_offline() : (serverMessage(e) ?? m.error_generic());
		}
	}

	async function logout() {
		await session.logout();
		await goto(resolve('/(auth)/login'));
	}
</script>

<svelte:head>
	<title>{m.settings_title()} · {m.app_name()}</title>
</svelte:head>

<h1>{m.settings_title()}</h1>

<div class="sections">
	<section class="card" aria-labelledby="family-heading">
		<h2 id="family-heading">{m.settings_family()}: {session.householdName}</h2>
		{#if familyError}
			<p class="form-error" role="alert">{familyError}</p>
		{/if}
		{#if session.isAdmin}
			<form class="rename" onsubmit={rename}>
				<label class="field">
					<span>{m.household_name()}</span>
					<input id="household-rename" required maxlength="80" bind:value={householdName} />
				</label>
				<button class="btn" type="submit">{m.household_rename()}</button>
			</form>
		{/if}
		<FamilyMembers {members} onchange={reload} />
	</section>

	{#if session.isAdmin}
		<section class="card" aria-labelledby="invite-heading">
			<h2 id="invite-heading">{m.invite_title()}</h2>
			<InvitePanel {household} />
		</section>

		<section class="card" aria-labelledby="child-heading">
			<h2 id="child-heading">{m.child_title()}</h2>
			<ChildForm {household} oncreated={reload} />
		</section>
	{/if}

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
						<span class="swatch" style:background="var(--swatch-{accent})" aria-hidden="true"
						></span>
						<span>{accentLabels[accent]()}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	</section>

	<section class="card" aria-labelledby="account-heading">
		<h2 id="account-heading">{m.account_title()}</h2>
		<p>
			{m.account_signed_in({
				name: session.user?.email || session.user?.username || session.user?.name || ''
			})}
		</p>
		<button class="btn logout" type="button" onclick={logout}>{m.logout()}</button>
	</section>
</div>

<style>
	h1 {
		margin: 0 0 var(--space-6);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	.sections {
		display: grid;
		gap: var(--space-6);
		max-width: 720px;
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.card p {
		margin: 0;
	}

	.rename {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}

	.rename .field {
		flex: 1;
		min-width: 12rem;
	}

	.logout {
		justify-self: start;
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
