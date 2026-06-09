<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let formEl: HTMLFormElement;
	const hasFilters = $derived(
		!!data.filters.q ||
			data.filters.activeTags.length > 0 ||
			data.filters.favorite ||
			data.filters.wantToCook
	);

	function autoSubmit() {
		formEl?.requestSubmit();
	}
</script>

<svelte:head>
	<title>Recipe Store</title>
</svelte:head>

<form method="GET" bind:this={formEl} class="filters">
	<div class="row">
		<input
			type="search"
			name="q"
			placeholder="Search recipes…"
			value={data.filters.q}
			aria-label="Search"
		/>
		<select name="sort" onchange={autoSubmit} aria-label="Sort">
			<option value="created" selected={data.filters.sort === 'created'}>Newest</option>
			<option value="updated" selected={data.filters.sort === 'updated'}>Recently updated</option>
			<option value="title" selected={data.filters.sort === 'title'}>Title A–Z</option>
		</select>
		<button type="submit">Search</button>
		{#if hasFilters}
			<a class="clear" href="/">Clear</a>
		{/if}
	</div>

	<div class="row toggles">
		<label class="chip toggle" class:on={data.filters.favorite}>
			<input type="checkbox" name="fav" value="1" checked={data.filters.favorite} onchange={autoSubmit} />
			★ Favourites
		</label>
		<label class="chip toggle" class:on={data.filters.wantToCook}>
			<input type="checkbox" name="want" value="1" checked={data.filters.wantToCook} onchange={autoSubmit} />
			🍳 Want to cook
		</label>
	</div>

	{#if data.tags.length > 0}
		<div class="row tags">
			{#each data.tags as tag (tag.name)}
				<label class="chip" class:on={data.filters.activeTags.includes(tag.name)}>
					<input
						type="checkbox"
						name="tag"
						value={tag.name}
						checked={data.filters.activeTags.includes(tag.name)}
						onchange={autoSubmit}
					/>
					{tag.name} <span class="count">{tag.count}</span>
				</label>
			{/each}
		</div>
	{/if}
</form>

<div class="header">
	<h1>Recipes</h1>
	<span class="count-total">{data.cards.length}</span>
</div>

{#if data.cards.length === 0}
	{#if hasFilters}
		<p class="empty">No recipes match these filters. <a href="/">Clear filters</a>.</p>
	{:else}
		<p class="empty">No recipes yet. <a href="/import">Import your Mela library</a> to get started.</p>
	{/if}
{:else}
	<ul class="grid">
		{#each data.cards as card (card.eid)}
			<li>
				<a href="/recipe/{card.eid}" class="card">
					<div class="thumb">
						{#if card.thumb}
							<img src={card.thumb} alt="" loading="lazy" />
						{:else}
							<div class="placeholder">🍽️</div>
						{/if}
						<div class="badges">
							{#if card.favorite}<span title="Favourite">★</span>{/if}
							{#if card.want_to_cook}<span title="Want to cook">🍳</span>{/if}
						</div>
					</div>
					<span class="title">{card.title || 'Untitled'}</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	input[type='search'] {
		flex: 1;
		min-width: 200px;
		font: inherit;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
	}

	select,
	button,
	.clear {
		font: inherit;
		padding: 0.5rem 0.85rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
	}

	button[type='submit'] {
		background: #1c1917;
		color: #fff;
		border: none;
	}

	.clear {
		text-decoration: none;
		color: #57534e;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.7rem;
		border: 1px solid #e7e5e4;
		border-radius: 999px;
		background: #fff;
		font-size: 0.85rem;
		color: #57534e;
		cursor: pointer;
		user-select: none;
	}

	.chip.on {
		background: #1c1917;
		color: #fff;
		border-color: #1c1917;
	}

	.chip input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.chip .count {
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.count-total {
		color: #a8a29e;
		font-variant-numeric: tabular-nums;
	}

	.empty {
		color: #57534e;
	}

	.grid {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1.25rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
	}

	.thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		border-radius: 10px;
		overflow: hidden;
		background: #f5f5f4;
		border: 1px solid #e7e5e4;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		opacity: 0.4;
	}

	.badges {
		position: absolute;
		top: 0.4rem;
		right: 0.5rem;
		display: flex;
		gap: 0.25rem;
		font-size: 0.95rem;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
		color: #fbbf24;
	}

	.title {
		font-weight: 600;
		line-height: 1.3;
	}
</style>
