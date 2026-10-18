<script lang="ts">
	// Rezept anlegen oder bearbeiten: Grunddaten, Tags, Zutaten-Zeilen (mit ↑/↓ sortierbar) und
	// „Zutaten aus Text einfügen“. Speichert nur lokal; der Sync sendet im Hintergrund.
	import { untrack } from 'svelte';
	import type { Recipe, RecipeIngredient } from '#lib/db/types.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
	import { formatAmount, parseAmount } from './amounts.js';
	import { CATEGORIES, UNITS } from './catalog.js';
	import { parseIngredientText } from './paste.js';
	import { saveRecipe } from './store.js';
	import TagPicker from './TagPicker.svelte';

	let {
		household,
		recipe = null,
		ingredients = [],
		tagOptions,
		onsaved,
		oncancel
	}: {
		household: string;
		recipe?: Recipe | null;
		ingredients?: RecipeIngredient[];
		tagOptions: string[];
		onsaved: (id: string) => void;
		oncancel: () => void;
	} = $props();

	interface Row {
		key: number;
		id?: string;
		name: string;
		amountText: string;
		unit: string;
		category: string;
	}

	let nextKey = 0;
	function row(data: Partial<Omit<Row, 'key'>> = {}): Row {
		nextKey += 1;
		return { key: nextKey, name: '', amountText: '', unit: '', category: '', ...data };
	}

	// Startwerte einmalig aus den Props; spätere Sync-Änderungen überschreiben die Eingaben nicht.
	const initial = untrack(() => ({ recipe, ingredients }));
	let title = $state(initial.recipe?.title ?? '');
	let servings = $state(initial.recipe?.servings ?? 4);
	let prepMinutes = $state(initial.recipe?.prep_minutes || null);
	let difficulty = $state(String(initial.recipe?.difficulty ?? 0));
	let tags = $state<string[]>([...(initial.recipe?.tags ?? [])]);
	let favorite = $state(initial.recipe?.is_favorite ?? false);
	let instructions = $state(initial.recipe?.instructions ?? '');
	let rows = $state<Row[]>(
		initial.ingredients.length > 0
			? initial.ingredients.map((i) =>
					row({
						id: i.id,
						name: i.name,
						amountText: formatAmount(i.amount),
						unit: i.unit ?? '',
						category: i.category ?? ''
					})
				)
			: [row()]
	);

	let error = $state('');
	let busy = $state(false);
	let pasteOpen = $state(false);
	let pasteText = $state('');
	const pasted = $derived(parseIngredientText(pasteText));

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= rows.length) return;
		const copy = [...rows];
		[copy[index], copy[target]] = [copy[target], copy[index]];
		rows = copy;
	}

	function removeRow(index: number) {
		rows = rows.length > 1 ? rows.filter((_, i) => i !== index) : [row()];
	}

	function applyPaste() {
		const filled = rows.filter((r) => r.name.trim() || r.amountText.trim());
		rows = [
			...filled,
			...pasted.map((draft) =>
				row({ name: draft.name, amountText: formatAmount(draft.amount), unit: draft.unit })
			)
		];
		pasteText = '';
		pasteOpen = false;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!title.trim()) {
			error = m.editor_title_required();
			return;
		}
		busy = true;
		error = '';
		try {
			const id = await saveRecipe(
				household,
				initial.recipe,
				{
					title,
					servings,
					tags,
					is_favorite: favorite,
					instructions,
					prep_minutes: Number(prepMinutes) || 0,
					difficulty: Number(difficulty)
				},
				rows.map((r) => ({
					id: r.id,
					name: r.name,
					amount: parseAmount(r.amountText),
					unit: r.unit,
					category: r.category
				}))
			);
			onsaved(id);
		} catch {
			error = m.error_generic();
		} finally {
			busy = false;
		}
	}
</script>

<form class="editor" onsubmit={submit} novalidate>
	<div class="grid-2">
		<label class="field title">
			<span>{m.editor_name()}</span>
			<input id="recipe-title" required maxlength="200" bind:value={title} />
		</label>
		<label class="field">
			<span>{m.editor_servings()}</span>
			<input
				id="recipe-servings"
				type="number"
				min="1"
				max="99"
				inputmode="numeric"
				bind:value={servings}
			/>
		</label>
	</div>

	<div class="grid-2 cooking">
		<label class="field">
			<span>{m.editor_prep_minutes()}</span>
			<input
				id="recipe-prep"
				type="number"
				min="0"
				max="1440"
				step="5"
				inputmode="numeric"
				bind:value={prepMinutes}
			/>
		</label>
		<label class="field">
			<span>{m.editor_difficulty()}</span>
			<select id="recipe-difficulty" bind:value={difficulty}>
				<option value="0">{m.cook_difficulty_none()}</option>
				<option value="1">{m.cook_difficulty_1()}</option>
				<option value="2">{m.cook_difficulty_2()}</option>
				<option value="3">{m.cook_difficulty_3()}</option>
			</select>
		</label>
	</div>

	<TagPicker bind:value={tags} options={tagOptions} />

	<label class="check">
		<input id="recipe-favorite" type="checkbox" bind:checked={favorite} />
		<span>{m.editor_favorite()}</span>
	</label>

	<fieldset class="ingredients">
		<legend>{m.editor_ingredients()}</legend>

		<ol class="rows">
			{#each rows as item, index (item.key)}
				{@const n = index + 1}
				<li class="row">
					<input
						class="name"
						aria-label={m.editor_ingredient_name({ n })}
						placeholder={m.editor_ingredient_name({ n })}
						maxlength="200"
						bind:value={item.name}
					/>
					<input
						class="amount"
						aria-label={m.editor_ingredient_amount({ n })}
						placeholder={m.editor_placeholder_amount()}
						inputmode="decimal"
						bind:value={item.amountText}
					/>
					<input
						class="unit"
						aria-label={m.editor_ingredient_unit({ n })}
						placeholder={m.editor_placeholder_unit()}
						list="unit-options"
						maxlength="20"
						bind:value={item.unit}
					/>
					<input
						class="category"
						aria-label={m.editor_ingredient_category({ n })}
						placeholder={m.editor_placeholder_category()}
						list="category-options"
						maxlength="40"
						bind:value={item.category}
					/>
					<div class="row-actions">
						<button
							type="button"
							class="icon"
							aria-label={m.editor_ingredient_up({ n })}
							disabled={index === 0}
							onclick={() => move(index, -1)}><Icon name="up" size={20} /></button
						>
						<button
							type="button"
							class="icon"
							aria-label={m.editor_ingredient_down({ n })}
							disabled={index === rows.length - 1}
							onclick={() => move(index, 1)}><Icon name="down" size={20} /></button
						>
						<button
							type="button"
							class="icon"
							aria-label={m.editor_ingredient_remove({ n })}
							onclick={() => removeRow(index)}><Icon name="close" size={20} /></button
						>
					</div>
				</li>
			{/each}
		</ol>

		<div class="ingredient-actions">
			<button class="btn" type="button" onclick={() => (rows = [...rows, row()])}>
				{m.editor_ingredient_add()}
			</button>
			<button
				class="btn"
				type="button"
				aria-expanded={pasteOpen}
				aria-controls="paste-panel"
				onclick={() => (pasteOpen = !pasteOpen)}
			>
				<Icon name="meals" size={18} />
				{m.editor_paste_open()}
			</button>
		</div>

		{#if pasteOpen}
			<div class="paste" id="paste-panel">
				<label class="field">
					<span>{m.editor_paste_label()}</span>
					<textarea id="paste-text" rows="6" aria-describedby="paste-hint" bind:value={pasteText}
					></textarea>
				</label>
				<p class="hint" id="paste-hint">{m.editor_paste_hint()}</p>
				<p class="hint" role="status">
					{pasted.length > 0
						? m.editor_paste_preview({ count: pasted.length })
						: m.editor_paste_none()}
				</p>
				{#if pasted.length > 0}
					<ul class="preview">
						{#each pasted as draft, i (i)}
							<li>
								{[formatAmount(draft.amount), draft.unit, draft.name].filter(Boolean).join(' ')}
							</li>
						{/each}
					</ul>
				{/if}
				<button
					class="btn btn-primary"
					type="button"
					disabled={pasted.length === 0}
					onclick={applyPaste}>{m.editor_paste_apply()}</button
				>
			</div>
		{/if}
	</fieldset>

	<label class="field">
		<span>{m.editor_instructions()}</span>
		<textarea id="recipe-instructions" rows="8" maxlength="20000" bind:value={instructions}
		></textarea>
	</label>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<div class="actions">
		<button class="btn btn-primary" type="submit" disabled={busy}>{m.editor_save()}</button>
		<button class="btn" type="button" onclick={oncancel}>{m.cancel()}</button>
	</div>

	<datalist id="unit-options">
		{#each UNITS as unit (unit)}<option value={unit}></option>{/each}
	</datalist>
	<datalist id="category-options">
		{#each CATEGORIES as category (category)}<option value={category}></option>{/each}
	</datalist>
</form>

<style>
	.editor {
		display: grid;
		gap: var(--space-6);
	}

	.grid-2 {
		display: grid;
		grid-template-columns: 1fr 7rem;
		gap: var(--space-3);
	}

	.grid-2.cooking {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.title {
		min-width: 0;
	}

	textarea {
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		resize: vertical;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--touch-target);
		font-weight: 600;
	}

	.check input {
		width: 22px;
		height: 22px;
		accent-color: var(--color-primary);
	}

	.ingredients {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--space-2);
		font-weight: 600;
	}

	.rows {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--color-border);
	}

	/* Handy: zwei Zeilen pro Zutat – Name und Knöpfe, darunter Menge, Einheit, Kategorie. */
	.row {
		display: grid;
		grid-template-columns: 4.5rem 6rem 1fr auto;
		grid-template-areas:
			'name name name actions'
			'amount unit category category';
		gap: var(--space-2);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.row input {
		min-width: 0;
		min-height: var(--touch-target);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	.name {
		grid-area: name;
	}
	.amount {
		grid-area: amount;
	}
	.unit {
		grid-area: unit;
	}
	.category {
		grid-area: category;
	}

	.row-actions {
		grid-area: actions;
		display: flex;
		justify-content: flex-end;
		gap: 2px;
	}

	/* Schlichte Symbol-Knöpfe ohne Rahmen; Touch-Fläche bleibt 48 px. */
	.icon {
		display: inline-grid;
		place-items: center;
		min-width: var(--touch-target);
		min-height: var(--touch-target);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-text-muted);
		font: inherit;
		font-size: 1.125rem;
		cursor: pointer;
	}

	.icon:hover:not(:disabled) {
		background: var(--color-surface-2);
		color: var(--color-text);
	}

	.icon:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.ingredient-actions,
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.paste {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius);
		background: var(--color-surface-2);
	}

	.preview {
		margin: 0;
		padding-left: var(--space-6);
	}

	/* Breiter: eine Zeile pro Zutat. */
	@media (min-width: 900px) {
		.row {
			grid-template-columns: minmax(10rem, 1fr) 5.5rem 6rem minmax(8rem, 12rem) auto;
			grid-template-areas: 'name amount unit category actions';
			align-items: center;
			padding: var(--space-2) 0;
		}
	}
</style>
