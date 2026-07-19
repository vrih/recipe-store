<script lang="ts">
	interface CompareFields {
		title: string;
		text: string;
		yield: string;
		prepTime: string;
		cookTime: string;
		totalTime: string;
		ingredients: string;
		instructions: string;
		notes: string;
		nutrition: string;
	}

	let {
		leftLabel,
		rightLabel,
		left,
		right,
		active = null,
		onChoose
	}: {
		leftLabel: string;
		rightLabel: string;
		left: CompareFields;
		right: CompareFields;
		active?: 'left' | 'right' | null;
		onChoose: (side: 'left' | 'right') => void;
	} = $props();

	const rows: { label: string; key: keyof CompareFields }[] = [
		{ label: 'Title', key: 'title' },
		{ label: 'Overview', key: 'text' },
		{ label: 'Yield', key: 'yield' },
		{ label: 'Prep time', key: 'prepTime' },
		{ label: 'Cook time', key: 'cookTime' },
		{ label: 'Total time', key: 'totalTime' },
		{ label: 'Ingredients', key: 'ingredients' },
		{ label: 'Instructions', key: 'instructions' },
		{ label: 'Notes', key: 'notes' },
		{ label: 'Nutrition', key: 'nutrition' }
	];
</script>

<div class="compare">
	<div class="col" class:active={active === 'left'}>
		<div class="col-head">
			<h3>{leftLabel}</h3>
			<button type="button" onclick={() => onChoose('left')}>
				{active === 'left' ? 'Using this version' : 'Use this version'}
			</button>
		</div>
		{#each rows as row (row.key)}
			{#if left[row.key]}
				<div class="field">
					<span class="label">{row.label}</span>
					<pre>{left[row.key]}</pre>
				</div>
			{/if}
		{/each}
	</div>
	<div class="col" class:active={active === 'right'}>
		<div class="col-head">
			<h3>{rightLabel}</h3>
			<button type="button" onclick={() => onChoose('right')}>
				{active === 'right' ? 'Using this version' : 'Use this version'}
			</button>
		</div>
		{#each rows as row (row.key)}
			{#if right[row.key]}
				<div class="field">
					<span class="label">{row.label}</span>
					<pre>{right[row.key]}</pre>
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.compare {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		max-width: 900px;
		margin: 1rem 0;
	}

	.col {
		border: 1px solid #e7e5e4;
		border-radius: 10px;
		padding: 0.85rem 1rem;
		background: #fafaf9;
		max-height: 420px;
		overflow-y: auto;
	}

	.col.active {
		border-color: #1c1917;
		background: #fff;
	}

	.col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		position: sticky;
		top: -0.85rem;
		background: inherit;
		padding: 0.2rem 0 0.5rem;
		margin: -0.85rem -1rem 0.5rem;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.col-head h3 {
		margin: 0;
		font-size: 0.95rem;
	}

	.col-head button {
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid #d6d3d1;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
		white-space: nowrap;
	}

	.col.active .col-head button {
		background: #1c1917;
		color: #fff;
		border-color: #1c1917;
	}

	.field {
		margin-bottom: 0.6rem;
	}

	.field .label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: #78716c;
		margin-bottom: 0.15rem;
	}

	.field pre {
		margin: 0;
		font: inherit;
		font-size: 0.85rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	@media (max-width: 700px) {
		.compare {
			grid-template-columns: 1fr;
		}
	}
</style>
