<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Recipe Store</title>
</svelte:head>

<div class="header">
	<h1>Recipes</h1>
	<span class="count">{data.cards.length}</span>
</div>

{#if data.cards.length === 0}
	<p class="empty">No recipes yet. <a href="/import">Import your Mela library</a> to get started.</p>
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
	.header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.count {
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
