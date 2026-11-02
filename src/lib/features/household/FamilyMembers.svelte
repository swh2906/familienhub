<script lang="ts">
	// Mitgliederliste: eigenes Profil (Name, Farbe) für alle; Rollen ändern und entfernen nur für Admins.
	import { removeMember, serverMessage, updateMember } from '#lib/auth/family.js';
	import { isOffline, session } from '#lib/auth/session.svelte.js';
	import { ROLES, type Membership, type Role } from '#lib/auth/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import MemberAvatar from '#lib/ui/MemberAvatar.svelte';
	import ColorPicker from './ColorPicker.svelte';

	let { members, onchange }: { members: Membership[]; onchange: () => Promise<void> } = $props();

	const roleLabels: Record<Role, () => string> = {
		admin: m.role_admin,
		adult: m.role_adult,
		child: m.role_child
	};

	const own = $derived(members.find((member) => member.user === session.user?.id) ?? null);
	let displayName = $state(session.membership?.display_name ?? '');
	let color = $state(session.membership?.color ?? '');
	let error = $state('');
	let saved = $state(false);
	let confirming: string | null = $state(null);

	function fail(e: unknown) {
		error = isOffline(e) ? m.error_offline() : (serverMessage(e) ?? m.error_generic());
	}

	async function saveProfile(event: SubmitEvent) {
		event.preventDefault();
		if (!own) return;
		error = '';
		saved = false;
		try {
			await updateMember(own.id, { display_name: displayName.trim(), color });
			await onchange();
			saved = true;
		} catch (e) {
			fail(e);
		}
	}

	async function changeRole(member: Membership, role: Role) {
		error = '';
		try {
			await updateMember(member.id, { role });
		} catch (e) {
			fail(e);
		}
		await onchange();
	}

	async function remove(member: Membership) {
		error = '';
		confirming = null;
		try {
			await removeMember(member.id);
		} catch (e) {
			fail(e);
		}
		await onchange();
	}
</script>

{#if error}
	<p class="form-error" role="alert">{error}</p>
{/if}

<ul class="members">
	{#each members as member (member.id)}
		{@const isSelf = member.user === session.user?.id}
		<li class="member">
			<MemberAvatar name={member.display_name} color={member.color} size={40} />
			<div class="who">
				<span class="name">
					{member.display_name}
					{#if isSelf}<span class="you">({m.member_you()})</span>{/if}
				</span>
				{#if !session.isAdmin || isSelf}
					<span class="role">{roleLabels[member.role]()}</span>
				{/if}
			</div>

			{#if session.isAdmin && !isSelf}
				<div class="controls">
					<select
						aria-label={m.member_role_label({ name: member.display_name })}
						value={member.role}
						onchange={(event) => changeRole(member, event.currentTarget.value as Role)}
					>
						{#each ROLES as role (role)}
							<option value={role}>{roleLabels[role]()}</option>
						{/each}
					</select>
					<button
						class="btn"
						type="button"
						aria-label={m.member_remove_label({ name: member.display_name })}
						onclick={() => (confirming = member.id)}
					>
						{m.member_remove()}
					</button>
				</div>
			{/if}
		</li>
		{#if confirming === member.id}
			<li
				class="confirm"
				role="group"
				aria-label={m.member_remove_label({ name: member.display_name })}
			>
				<p>{m.member_remove_confirm({ name: member.display_name })}</p>
				<div class="actions">
					<button class="btn btn-primary" type="button" onclick={() => remove(member)}>
						{m.member_remove_yes()}
					</button>
					<button class="btn" type="button" onclick={() => (confirming = null)}>{m.cancel()}</button
					>
				</div>
			</li>
		{/if}
	{/each}
</ul>

{#if own}
	<form class="profile" onsubmit={saveProfile}>
		<h3>{m.member_profile()}</h3>
		<label class="field">
			<span>{m.member_display_name()}</span>
			<input
				id="profile-name"
				name="display_name"
				required
				maxlength="40"
				bind:value={displayName}
			/>
		</label>
		<ColorPicker name="profile-color" bind:value={color} />
		<div class="actions">
			<button class="btn btn-primary" type="submit">{m.member_save()}</button>
			{#if saved}<span class="hint" role="status">{m.member_saved()}</span>{/if}
		</div>
	</form>
{/if}

<style>
	.members {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.member {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		min-height: 64px;
		padding: var(--space-2) 0;
		border-top: 1px solid var(--color-border);
	}

	.member:first-child {
		border-top: 0;
	}

	.who {
		display: grid;
		flex: 1;
		min-width: 8rem;
	}

	.name {
		font-weight: 600;
	}

	.you,
	.role {
		color: var(--color-text-muted);
		font-size: var(--fs-small);
		font-weight: 500;
	}

	/* Rolle und Entfernen bleiben zusammen und rücken auf schmalen Bildschirmen gemeinsam nach rechts unten. */
	.controls {
		display: flex;
		gap: var(--space-2);
		margin-left: auto;
	}

	select {
		min-height: var(--touch-target);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	.confirm {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius);
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}

	.confirm p {
		margin: 0;
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.profile {
		display: grid;
		gap: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	h3 {
		margin: 0;
		font-size: var(--fs-body);
	}
</style>
