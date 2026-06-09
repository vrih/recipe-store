<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Optimistic override for the favourite toggle: null means "follow server
	// data", true/false is a pending local value while the action is in flight.
	let pending = $state<boolean | null>(null);
	let favorite = $derived(pending ?? data.favorite);

	function hasMeta() {
		return data.yield || data.prepTime || data.cookTime || data.totalTime;
	}
</script>

<svelte:head>
	<title>{data.title || 'Recipe'}</title>
</svelte:head>

<div class="topbar">
	<a class="back" href="/">← All recipes</a>
	<div class="topbar-actions">
		<a class="cook-link" href="/recipe/{page.params.eid}/cook">Cook</a>
		<a class="edit-link" href="/recipe/{page.params.eid}/edit">Edit</a>
	</div>
</div>

<div class="title-row">
	<h1>{data.title || 'Untitled'}</h1>
	<form
		method="POST"
		action="?/toggleFavorite"
		use:enhance={() => {
			pending = !favorite;
			return async ({ result, update }) => {
				if (result.type === 'failure') pending = null;
				await update({ reset: false });
				pending = null;
			};
		}}
	>
		<input type="hidden" name="favorite" value={(!favorite).toString()} />
		<button type="submit" class="fav" class:on={favorite} title="Toggle favourite">
			{favorite ? '★' : '☆'}
		</button>
	</form>
</div>

{#if data.tags.length > 0}
	<div class="tags">
		{#each data.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
	</div>
{/if}

{#if data.images.length > 0}
	<div class="images">
		{#each data.images as src, i (src)}
			<img {src} alt={data.title} loading={i === 0 ? 'eager' : 'lazy'} />
		{/each}
	</div>
{/if}

{#if data.textHtml}
	<!-- Sanitized server-side in renderMarkdown. -->
	<div class="overview">{@html data.textHtml}</div>
{/if}

{#if hasMeta()}
	<dl class="meta">
		{#if data.yield}<div><dt>Yield</dt><dd>{data.yield}</dd></div>{/if}
		{#if data.prepTime}<div><dt>Prep</dt><dd>{data.prepTime}</dd></div>{/if}
		{#if data.cookTime}<div><dt>Cook</dt><dd>{data.cookTime}</dd></div>{/if}
		{#if data.totalTime}<div><dt>Total</dt><dd>{data.totalTime}</dd></div>{/if}
	</dl>
{/if}

<div class="columns">
	{#if data.ingredients.length > 0}
		<section class="ingredients">
			<h2>Ingredients</h2>
			<ul>
				{#each data.ingredients as item (item.key || item.html)}
					{#if item.type === 'header'}
						<li class="section-header">{item.html}</li>
					{:else}
						<li>{@html item.html}</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.steps.length > 0}
		<section class="instructions">
			<h2>Instructions</h2>
			<div class="steps">
				{#each data.steps as step (step.key)}
					{#if step.type === 'header'}
						<h3 class="step-section">{step.text}</h3>
					{:else}
						<div class="step">{@html step.html}</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}
</div>

{#if data.notesHtml}
	<section class="notes">
		<h2>Notes</h2>
		{@html data.notesHtml}
	</section>
{/if}

{#if data.nutritionHtml}
	<section class="nutrition">
		<h2>Nutrition</h2>
		{@html data.nutritionHtml}
	</section>
{/if}

{#if data.link}
	<p class="source">Source: <a href={data.link} target="_blank" rel="noopener noreferrer">{data.link}</a></p>
{/if}

<style>
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.topbar .back {
		color: #57534e;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.topbar-actions {
		display: flex;
		gap: 0.5rem;
	}

	.edit-link,
	.cook-link {
		text-decoration: none;
		font-size: 0.9rem;
		border-radius: 8px;
		padding: 0.35rem 0.9rem;
	}

	.edit-link {
		color: #1c1917;
		border: 1px solid #d6d3d1;
	}

	.cook-link {
		background: #1c1917;
		color: #fff;
	}

	.title-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.title-row h1 {
		margin: 0.25rem 0;
	}

	.fav {
		background: none;
		border: none;
		font-size: 1.8rem;
		cursor: pointer;
		color: #d6d3d1;
		line-height: 1;
		padding: 0;
	}

	.fav.on {
		color: #fbbf24;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.5rem 0;
	}

	.tag {
		background: #f5f5f4;
		border: 1px solid #e7e5e4;
		border-radius: 999px;
		padding: 0.15rem 0.7rem;
		font-size: 0.85rem;
		color: #57534e;
	}

	.images {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1rem 0;
	}

	.images img {
		max-width: 100%;
		width: 360px;
		border-radius: 12px;
		object-fit: cover;
	}

	.overview {
		color: #44403c;
		font-size: 1.05rem;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		padding: 0.85rem 1rem;
		background: #fff;
		border: 1px solid #e7e5e4;
		border-radius: 10px;
		margin: 1rem 0;
	}

	.meta div {
		display: flex;
		flex-direction: column;
	}

	.meta dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #a8a29e;
	}

	.meta dd {
		margin: 0;
		font-weight: 600;
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(300px, 2fr);
		gap: 2.5rem;
		margin-top: 1.5rem;
	}

	@media (max-width: 700px) {
		.columns {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}

	.ingredients ul {
		list-style: none;
		padding: 0;
	}

	.ingredients li {
		padding: 0.3rem 0;
		border-bottom: 1px solid #f0efed;
	}

	.section-header {
		font-weight: 700;
		margin-top: 0.75rem;
		border-bottom: none !important;
	}

	.steps {
		counter-reset: step;
	}

	/* A section header restarts step numbering for the section that follows. */
	.step-section {
		counter-reset: step;
		font-size: 1.05rem;
		font-weight: 700;
		margin: 1.25rem 0 0.6rem;
	}

	.step {
		counter-increment: step;
		display: flex;
		gap: 0.7rem;
		margin-bottom: 0.9rem;
		line-height: 1.5;
	}

	.step::before {
		content: counter(step);
		flex: none;
		width: 1.6rem;
		height: 1.6rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: #f5f5f4;
		font-size: 0.85rem;
		font-weight: 700;
		color: #78716c;
	}

	.step :global(p) {
		margin: 0;
	}

	section :global(a) {
		color: #b45309;
	}
</style>
