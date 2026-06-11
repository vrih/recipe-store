<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let formEl: HTMLFormElement;
	const hasFilters = $derived(
		!!data.filters.q ||
			data.filters.activeTags.length > 0 ||
			data.filters.favorite ||
			data.filters.wantToCook
	);

	// Grid/list toggle — persisted in localStorage.
	let layout = $state<'grid' | 'list'>('grid');
	$effect(() => {
		try {
			const saved = localStorage.getItem('hearth_layout');
			if (saved === 'list' || saved === 'grid') layout = saved;
		} catch {}
	});
	function setLayout(l: 'grid' | 'list') {
		layout = l;
		try { localStorage.setItem('hearth_layout', l); } catch {}
	}

	// Optimistic fav state: map eid → override (null = follow server)
	let favOverrides = $state<Record<string, boolean>>({});
	function isFav(card: { eid: string; favorite: boolean }) {
		return favOverrides[card.eid] ?? card.favorite;
	}

	function autoSubmit() {
		formEl?.requestSubmit();
	}
</script>

<svelte:head>
	<title>Hearth — Recipes</title>
</svelte:head>

<div class="page">
	<div class="hero">
		<h1>What are we cooking?</h1>
		<p>Pick a tag, or search for something tasty.</p>
	</div>

	<form method="GET" bind:this={formEl} class="filters">
		<div class="search-row">
			<input
				type="search"
				name="q"
				placeholder="Search recipes…"
				value={data.filters.q}
				aria-label="Search"
			/>
			<select name="sort" onchange={autoSubmit} aria-label="Sort">
				<option value="created" selected={data.filters.sort === 'created'}>Newest</option>
				<option value="updated" selected={data.filters.sort === 'updated'}>Updated</option>
				<option value="title" selected={data.filters.sort === 'title'}>A–Z</option>
			</select>
			<button type="submit" class="search-btn">Search</button>
			{#if hasFilters}
				<a class="clear-btn" href="/">Clear</a>
			{/if}
		</div>

		<div class="chip-row">
			<label class="chip" class:on={data.filters.favorite}>
				<input type="checkbox" name="fav" value="1" checked={data.filters.favorite} onchange={autoSubmit} />
				♥ Favourites
			</label>
			<label class="chip" class:on={data.filters.wantToCook}>
				<input type="checkbox" name="want" value="1" checked={data.filters.wantToCook} onchange={autoSubmit} />
				🍳 Want to cook
			</label>
			{#each data.tags as tag (tag.name)}
				<label class="chip" class:on={data.filters.activeTags.includes(tag.name)}>
					<input
						type="checkbox"
						name="tag"
						value={tag.name}
						checked={data.filters.activeTags.includes(tag.name)}
						onchange={autoSubmit}
					/>
					{tag.name}
					<span class="count">{tag.count}</span>
				</label>
			{/each}
		</div>
	</form>

	<div class="list-header">
		<span class="result-count">{data.cards.length} {data.cards.length === 1 ? 'recipe' : 'recipes'}</span>
		<div class="layout-toggle">
			<button type="button" class:active={layout === 'grid'} onclick={() => setLayout('grid')} aria-label="Grid view">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/>
					<rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/>
				</svg>
				Grid
			</button>
			<button type="button" class:active={layout === 'list'} onclick={() => setLayout('list')} aria-label="List view">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<rect x="1" y="2" width="14" height="2.5" rx="1.25"/><rect x="1" y="6.75" width="14" height="2.5" rx="1.25"/>
					<rect x="1" y="11.5" width="14" height="2.5" rx="1.25"/>
				</svg>
				List
			</button>
		</div>
	</div>

	{#if data.cards.length === 0}
		<div class="empty">
			<div class="empty-title">No recipes here yet</div>
			{#if hasFilters}
				<a href="/">Clear filters</a>
			{:else}
				<a href="/import">Import your Mela library</a> to get started.
			{/if}
		</div>
	{:else if layout === 'grid'}
		<ul class="grid">
			{#each data.cards as card (card.eid)}
				<li class="card">
					<a href="/recipe/{card.eid}" class="card-link">
						<div class="thumb">
							{#if card.thumb}
								<img src={card.thumb} alt="" loading="lazy" />
							{:else}
								<div class="placeholder">🍽️</div>
							{/if}
						</div>
						<div class="card-body">
							<span class="card-title">{card.title || 'Untitled'}</span>
						</div>
					</a>
					<form
						method="POST"
						action="?/toggleFavorite"
						use:enhance={() => {
							favOverrides[card.eid] = !isFav(card);
							return async ({ result, update }) => {
								if (result.type === 'failure') delete favOverrides[card.eid];
								await update({ reset: false });
								delete favOverrides[card.eid];
							};
						}}
					>
						<input type="hidden" name="eid" value={card.eid} />
						<input type="hidden" name="favorite" value={(!isFav(card)).toString()} />
						<button type="submit" class="heart" class:on={isFav(card)} aria-label="Toggle favourite">
							{isFav(card) ? '♥' : '♡'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="list">
			{#each data.cards as card (card.eid)}
				<li class="list-card">
					<a href="/recipe/{card.eid}" class="list-link">
						<div class="list-thumb">
							{#if card.thumb}
								<img src={card.thumb} alt="" loading="lazy" />
							{:else}
								<div class="placeholder small">🍽️</div>
							{/if}
						</div>
						<div class="list-body">
							<div class="list-title">{card.title || 'Untitled'}</div>
						</div>
					</a>
					<form
						method="POST"
						action="?/toggleFavorite"
						use:enhance={() => {
							favOverrides[card.eid] = !isFav(card);
							return async ({ result, update }) => {
								if (result.type === 'failure') delete favOverrides[card.eid];
								await update({ reset: false });
								delete favOverrides[card.eid];
							};
						}}
					>
						<input type="hidden" name="eid" value={card.eid} />
						<input type="hidden" name="favorite" value={(!isFav(card)).toString()} />
						<button type="submit" class="heart list-heart" class:on={isFav(card)} aria-label="Toggle favourite">
							{isFav(card) ? '♥' : '♡'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
	}

	.hero {
		padding: 2rem 0 0.5rem;
	}

	.hero h1 {
		font-size: clamp(1.8rem, 4vw, 2.5rem);
		font-weight: 800;
		letter-spacing: -0.035em;
		margin: 0 0 0.35rem;
		line-height: 1.05;
	}

	.hero p {
		margin: 0 0 1.5rem;
		color: #6e665c;
		font-size: 1.05rem;
	}

	/* ---- Filters ---- */
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.search-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		max-width: 600px;
	}

	input[type='search'] {
		flex: 1;
		min-width: 200px;
		font: inherit;
		padding: 0.65rem 1rem;
		border: 1px solid #e4dbcc;
		border-radius: 12px;
		background: #fff;
		color: #2b2723;
		outline: none;
	}

	input[type='search']:focus {
		border-color: #c0644a;
		box-shadow: 0 0 0 3px rgba(192, 100, 74, 0.12);
	}

	select {
		font: inherit;
		padding: 0.65rem 0.85rem;
		border: 1px solid #e4dbcc;
		border-radius: 10px;
		background: #fff;
		color: #2b2723;
		cursor: pointer;
	}

	.search-btn {
		font: inherit;
		font-weight: 600;
		padding: 0.65rem 1.1rem;
		border: none;
		border-radius: 10px;
		background: #2b2723;
		color: #f6f1e9;
		cursor: pointer;
		transition: background 0.12s ease;
	}

	.search-btn:hover {
		background: #3d3530;
	}

	.clear-btn {
		font: inherit;
		font-size: 0.9rem;
		padding: 0.65rem 0.85rem;
		border: 1px solid #e4dbcc;
		border-radius: 10px;
		background: #fff;
		color: #6e665c;
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.9rem;
		border: 1px solid #e4dbcc;
		border-radius: 99px;
		background: #fff;
		font-size: 0.88rem;
		font-weight: 500;
		color: #5a5249;
		cursor: pointer;
		user-select: none;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
		white-space: nowrap;
	}

	.chip:hover {
		background: #f4e8e0;
		border-color: #c0644a;
		color: #c0644a;
	}

	.chip.on {
		background: #c0644a;
		border-color: #c0644a;
		color: #fff;
		font-weight: 600;
	}

	.chip input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.count {
		opacity: 0.65;
		font-variant-numeric: tabular-nums;
	}

	/* ---- List header ---- */
	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.result-count {
		font-size: 0.875rem;
		color: #6e665c;
		font-weight: 500;
	}

	.layout-toggle {
		display: flex;
		gap: 2px;
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 99px;
		padding: 3px;
	}

	.layout-toggle button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.85rem;
		border: none;
		border-radius: 99px;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		background: transparent;
		color: #6e665c;
		transition: background 0.12s ease, color 0.12s ease;
		min-height: unset;
	}

	.layout-toggle button.active {
		background: #2b2723;
		color: #f6f1e9;
	}

	/* ---- Empty state ---- */
	.empty {
		text-align: center;
		padding: 5rem 1.5rem;
		color: #9a9084;
	}

	.empty-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: #6e665c;
		margin-bottom: 0.4rem;
	}

	.empty a {
		color: #c0644a;
	}

	/* ---- Grid ---- */
	.grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 1.25rem;
	}

	.card {
		position: relative;
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 16px;
		overflow: hidden;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	.card:hover {
		transform: translateY(-3px);
		box-shadow: 0 14px 32px rgba(120, 80, 50, 0.12);
	}

	.card-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		background: #ede4d6;
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
		font-size: 2.5rem;
		opacity: 0.35;
	}

	.placeholder.small {
		font-size: 1.5rem;
	}

	.card-body {
		padding: 0.85rem 1rem 1rem;
	}

	.card-title {
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.35;
	}

	/* Heart button positioned top-right of the card thumb */
	.heart {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		width: 34px;
		height: 34px;
		border-radius: 99px;
		border: none;
		background: rgba(255, 255, 255, 0.92);
		color: #b7ac9c;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		transition: color 0.12s ease, background 0.12s ease;
		z-index: 2;
		min-height: unset;
	}

	.heart.on {
		color: #c0644a;
	}

	.heart:hover {
		background: #fff;
		color: #c0644a;
	}

	/* ---- List view ---- */
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.list-card {
		position: relative;
		display: flex;
		align-items: center;
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 14px;
		overflow: hidden;
		transition: box-shadow 0.15s ease;
	}

	.list-card:hover {
		box-shadow: 0 10px 26px rgba(120, 80, 50, 0.1);
	}

	.list-link {
		display: flex;
		align-items: center;
		gap: 0;
		flex: 1;
		min-width: 0;
		text-decoration: none;
		color: inherit;
	}

	.list-thumb {
		width: 120px;
		flex-shrink: 0;
		align-self: stretch;
		min-height: 80px;
		background: #ede4d6;
		overflow: hidden;
	}

	.list-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.list-body {
		flex: 1;
		min-width: 0;
		padding: 1rem 1.1rem;
	}

	.list-title {
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.list-heart {
		position: static;
		flex-shrink: 0;
		margin-right: 0.75rem;
		background: transparent;
		box-shadow: none;
		border: 1px solid #e9e1d4;
	}
</style>
