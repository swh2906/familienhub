<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { listMembers, renameHousehold, serverMessage } from '#lib/auth/family.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import type { Membership } from '#lib/auth/types.js';
	import HintSettings from '#lib/features/hints/HintSettings.svelte';
	import ChildForm from '#lib/features/household/ChildForm.svelte';
	import FamilyMembers from '#lib/features/household/FamilyMembers.svelte';
	import InvitePanel from '#lib/features/household/InvitePanel.svelte';
	import PrivacySection from '#lib/features/privacy/PrivacySection.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { appearance } from '#lib/ui/appearance.svelte.js';
	import Collapsible from '#lib/ui/Collapsible.svelte';
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

	type SectionId = 'family' | 'invite' | 'child' | 'appearance' | 'hints' | 'account' | 'privacy';

	// Auf dem Handy sind selten gebrauchte Abschnitte anfangs zugeklappt, am Desktop ist alles offen.
	const compact = window.matchMedia('(max-width: 699px)').matches;
	const open: Record<SectionId, boolean> = $state({
		family: true,
		invite: !compact,
		child: !compact,
		appearance: true,
		hints: !compact,
		account: true,
		privacy: !compact
	});

	const jumps: { id: SectionId; label: () => string; adminOnly?: boolean }[] = [
		{ id: 'family', label: m.settings_nav_family },
		{ id: 'invite', label: m.settings_nav_invite, adminOnly: true },
		{ id: 'child', label: m.settings_nav_child, adminOnly: true },
		{ id: 'appearance', label: m.settings_nav_appearance },
		{ id: 'hints', label: m.settings_nav_hints },
		{ id: 'account', label: m.settings_nav_account },
		{ id: 'privacy', label: m.settings_nav_privacy }
	];

	/** Sprungleiste: Abschnitt aufklappen und hinscrollen. */
	async function jump(id: SectionId) {
		open[id] = true;
		await tick();
		const target = document.getElementById(`section-${id}`);
		target?.scrollIntoView({
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'start'
		});
		target?.querySelector('summary')?.focus({ preventScroll: true });
	}

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

<nav class="jumps" aria-label={m.settings_nav_label()}>
	{#each jumps.filter((j) => !j.adminOnly || session.isAdmin) as item (item.id)}
		<button type="button" class="jump" onclick={() => jump(item.id)}>{item.label()}</button>
	{/each}
</nav>

<div class="sections">
	<Collapsible
		id="family"
		title="{m.settings_family()}: {session.householdName}"
		bind:open={open.family}
	>
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
	</Collapsible>

	{#if session.isAdmin}
		<Collapsible id="invite" title={m.invite_title()} bind:open={open.invite}>
			<InvitePanel {household} />
		</Collapsible>

		<Collapsible id="child" title={m.child_title()} bind:open={open.child}>
			<ChildForm {household} oncreated={reload} />
		</Collapsible>
	{/if}

	<Collapsible id="appearance" title={m.settings_appearance()} bind:open={open.appearance}>
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
	</Collapsible>

	<Collapsible id="hints" title={m.settings_hints_title()} bind:open={open.hints}>
		<HintSettings />
	</Collapsible>

	<Collapsible id="account" title={m.account_title()} bind:open={open.account}>
		<p>
			{m.account_signed_in({
				name: session.user?.email || session.user?.username || session.user?.name || ''
			})}
		</p>
		<button class="btn logout" type="button" onclick={logout}>{m.logout()}</button>
	</Collapsible>

	<Collapsible id="privacy" title={m.privacy_title()} bind:open={open.privacy}>
		<PrivacySection {household} householdName={session.householdName} isAdmin={session.isAdmin} />
	</Collapsible>
</div>

<style>
	h1 {
		margin: 0 0 var(--space-4);
		font-size: 2rem;
		letter-spacing: -0.02em;
	}

	/* Sprungleiste: auf dem Handy waagerecht wischbar. */
	.jumps {
		display: flex;
		gap: var(--space-2);
		max-width: 720px;
		margin: 0 calc(-1 * var(--space-4)) var(--space-4);
		padding: 2px var(--space-4) var(--space-1);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.jump {
		flex: none;
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.jump:hover {
		background: var(--color-primary-soft);
	}

	.sections {
		display: grid;
		gap: var(--space-4);
		max-width: 720px;
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
		.sections :global(.card) {
			padding: var(--space-6);
		}

		.jumps {
			flex-wrap: wrap;
			margin: 0 0 var(--space-6);
			padding: 0;
			overflow: visible;
		}
	}
</style>
