<script lang="ts">
	// Tags an- und abwählen (Vorschläge und bereits benutzte) und eigene hinzufügen.
	import { m } from '#lib/paraglide/messages.js';
	import { cleanTags, normalize } from './recipes.js';

	let { value = $bindable(), options }: { value: string[]; options: string[] } = $props();

	let custom = $state('');
	const all = $derived(cleanTags([...options, ...value]));
	const selected = $derived(new Set(value.map(normalize)));

	function toggle(tag: string) {
		value = selected.has(normalize(tag))
			? value.filter((t) => normalize(t) !== normalize(tag))
			: [...value, tag];
	}

	function addCustom() {
		const tag = custom.trim();
		if (tag && !selected.has(normalize(tag))) value = [...value, tag];
		custom = '';
	}
</script>

<fieldset class="tags">
	<legend>{m.editor_tags()}</legend>
	<div class="chips">
		{#each all as tag (tag)}
			<button
				type="button"
				class="chip"
				aria-pressed={selected.has(normalize(tag))}
				onclick={() => toggle(tag)}>{tag}</button
			>
		{/each}
	</div>
	<div class="custom">
		<label class="visually-hidden" for="tag-custom">{m.editor_tag_add()}</label>
		<input
			id="tag-custom"
			placeholder={m.editor_tag_add()}
			maxlength="30"
			bind:value={custom}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					addCustom();
				}
			}}
		/>
		<button class="btn" type="button" onclick={addCustom}>{m.editor_tag_add_button()}</button>
	</div>
</fieldset>

<style>
	.tags {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--space-2);
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		min-height: var(--touch-target);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: 0.9375rem;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: var(--color-primary-soft);
		color: var(--color-primary-strong);
		font-weight: 600;
	}

	.custom {
		display: flex;
		gap: var(--space-2);
	}

	.custom input {
		flex: 1;
		min-width: 0;
		min-height: var(--touch-target);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}
</style>
