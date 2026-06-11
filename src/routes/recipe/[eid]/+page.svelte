<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { detectTimes } from '$lib/times';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let pending = $state<boolean | null>(null);
	let favorite = $derived(pending ?? data.favorite);

	function hasMeta() {
		return data.yield || data.prepTime || data.cookTime || data.totalTime;
	}

	// Servings stepper — parse a base number from the yield field.
	function parseBase(y: string | null | undefined): number | null {
		if (!y) return null;
		const m = y.match(/\d+/);
		return m ? parseInt(m[0], 10) : null;
	}

	const baseServings = $derived(parseBase(data.yield));
	let servingsOverride = $state<number | null>(null);
	let currentServings = $derived(servingsOverride ?? baseServings ?? null);
	const scale = $derived(baseServings && currentServings ? currentServings / baseServings : 1);

	function adjServings(d: number) {
		const base = currentServings ?? 1;
		servingsOverride = Math.max(1, Math.min(50, base + d));
	}

	// Detect timers in each step.
	const stepTimers = $derived.by(() => {
		const map = new Map<string, ReturnType<typeof detectTimes>>();
		for (const step of data.steps) {
			if (step.type === 'step') map.set(step.key, detectTimes(step.text));
		}
		return map;
	});
</script>

<svelte:head>
	<title>{data.title || 'Recipe'} — Hearth</title>
</svelte:head>

<div class="wrap">
	<div class="topbar">
		<a class="back" href="/">← All recipes</a>
		<div class="topbar-actions">
			<a class="btn-outline" href="/recipe/{page.params.eid}/edit">Edit</a>
			<a class="btn-cook" href="/recipe/{page.params.eid}/cook">Start cooking</a>
		</div>
	</div>

	{#if data.images.length > 0}
		<div class="hero-img">
			<img src={data.images[0]} alt={data.title} loading="eager" />
			{#if data.images.length > 1}
				<div class="extra-images">
					{#each data.images.slice(1) as src, i (src)}
						<img {src} alt={data.title} loading="lazy" />
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="header-row">
		<div class="header-left">
			{#if data.tags.length > 0}
				<div class="tags">
					{#each data.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
				</div>
			{/if}
			<h1>{data.title || 'Untitled'}</h1>
			{#if data.textHtml}
				<div class="overview">{@html data.textHtml}</div>
			{/if}
		</div>
		<div class="header-actions">
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
				<button type="submit" class="fav-btn" class:on={favorite}>
					{favorite ? '♥  Saved' : '♡  Save recipe'}
				</button>
			</form>
		</div>
	</div>

	{#if hasMeta() || baseServings !== null}
		<div class="meta-cards">
			{#if data.totalTime || data.cookTime || data.prepTime}
				<div class="meta-card">
					<div class="meta-label">Total time</div>
					<div class="meta-value">{data.totalTime ?? data.cookTime ?? data.prepTime}</div>
				</div>
			{/if}

			{#if baseServings !== null}
				<div class="meta-card">
					<div class="meta-label">Servings</div>
					<div class="servings-stepper">
						<button type="button" class="step-btn" onclick={() => adjServings(-1)} aria-label="Fewer">−</button>
						<span class="servings-val">{currentServings}</span>
						<button type="button" class="step-btn" onclick={() => adjServings(1)} aria-label="More">+</button>
					</div>
					{#if scale !== 1}
						<div class="scale-badge">×{scale % 1 === 0 ? scale : scale.toFixed(1)}</div>
					{/if}
				</div>
			{:else if data.yield}
				<div class="meta-card">
					<div class="meta-label">Yield</div>
					<div class="meta-value">{data.yield}</div>
				</div>
			{/if}

			{#if data.prepTime && data.totalTime}
				<div class="meta-card">
					<div class="meta-label">Prep</div>
					<div class="meta-value">{data.prepTime}</div>
				</div>
			{/if}
			{#if data.cookTime}
				<div class="meta-card">
					<div class="meta-label">Cook</div>
					<div class="meta-value">{data.cookTime}</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if scale !== 1}
		<div class="scale-notice">
			Multiply quantities by <strong>×{scale % 1 === 0 ? scale : scale.toFixed(1)}</strong> for {currentServings} serving{currentServings !== 1 ? 's' : ''}.
		</div>
	{/if}

	<div class="columns">
		{#if data.ingredients.length > 0}
			<section class="ingredients-col">
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
			<section class="instructions-col">
				<h2>Method</h2>
				<div class="steps">
					{#each data.steps as step (step.key)}
						{#if step.type === 'header'}
							<h3 class="step-section">{step.text}</h3>
						{:else}
							<div class="step">
								<div class="step-num"></div>
								<div class="step-body">
									<div class="step-text">{@html step.html}</div>
									{#if (stepTimers.get(step.key)?.length ?? 0) > 0}
										<div class="timer-chips">
											{#each stepTimers.get(step.key) ?? [] as match (match.start)}
												<span class="timer-chip">⏱ {match.label}</span>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</div>

	{#if data.notesHtml}
		<section class="extras">
			<h2>Notes</h2>
			{@html data.notesHtml}
		</section>
	{/if}

	{#if data.nutritionHtml}
		<section class="extras">
			<h2>Nutrition</h2>
			{@html data.nutritionHtml}
		</section>
	{/if}

	{#if data.link}
		<p class="source">Source: <a href={data.link} target="_blank" rel="noopener noreferrer">{data.link}</a></p>
	{/if}
</div>

<style>
	.wrap {
		max-width: 960px;
		margin: 0 auto;
		padding-bottom: 3rem;
	}

	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 0 1.25rem;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.back {
		color: #6e665c;
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.back:hover { color: #2b2723; }

	.topbar-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-outline {
		text-decoration: none;
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0.55rem 1rem;
		border-radius: 10px;
		border: 1px solid #e4dbcc;
		background: #fff;
		color: #2b2723;
		transition: background 0.12s;
	}
	.btn-outline:hover { background: #f4e8e0; }

	.btn-cook {
		display: inline-flex;
		align-items: center;
		padding: 0.55rem 1.2rem;
		border-radius: 10px;
		background: #c0644a;
		color: #fff;
		text-decoration: none;
		font-size: 0.9rem;
		font-weight: 700;
		box-shadow: 0 6px 18px rgba(192,100,74,0.28);
		transition: background 0.12s;
	}
	.btn-cook:hover { background: #a5523b; }

	/* Hero image */
	.hero-img {
		border-radius: 18px;
		overflow: hidden;
		margin-bottom: 1.5rem;
	}
	.hero-img > img {
		width: 100%;
		max-height: 420px;
		object-fit: cover;
		display: block;
	}
	.extra-images {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}
	.extra-images img {
		width: 140px;
		height: 100px;
		object-fit: cover;
		border-radius: 10px;
	}

	/* Header row */
	.header-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.25rem;
		margin-bottom: 1.5rem;
	}
	.header-left { flex: 1; min-width: 240px; }

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}
	.tag {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #a8765f;
		background: #f4e8e0;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
	}

	h1 {
		font-size: clamp(1.6rem, 4vw, 2.4rem);
		font-weight: 800;
		letter-spacing: -0.035em;
		line-height: 1.1;
		margin: 0 0 0.6rem;
	}

	.overview {
		color: #6e665c;
		font-size: 1.05rem;
		line-height: 1.5;
		max-width: 520px;
	}
	.overview :global(p) { margin: 0; }

	.header-actions { display: flex; flex-direction: column; gap: 0.5rem; }

	.fav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.7rem 1.3rem;
		border-radius: 12px;
		border: 1px solid #e4dbcc;
		background: #fff;
		color: #6e665c;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.12s, background 0.12s, color 0.12s;
	}
	.fav-btn.on, .fav-btn:hover {
		border-color: #c0644a;
		background: #f4e8e0;
		color: #c0644a;
	}

	/* Meta cards */
	.meta-cards {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.meta-card {
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 14px;
		padding: 0.85rem 1.2rem;
		min-width: 110px;
	}
	.meta-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9a9084;
		margin-bottom: 0.4rem;
	}
	.meta-value {
		font-size: 1.2rem;
		font-weight: 700;
	}

	/* Servings stepper */
	.servings-stepper {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.step-btn {
		width: 28px;
		height: 28px;
		min-height: unset;
		border-radius: 8px;
		border: 1px solid #e4dbcc;
		background: #fff;
		color: #2b2723;
		font: inherit;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.1s;
	}
	.step-btn:hover { background: #f4e8e0; border-color: #c0644a; }
	.servings-val {
		font-size: 1.2rem;
		font-weight: 700;
		min-width: 1.5rem;
		text-align: center;
	}
	.scale-badge {
		margin-top: 0.35rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #c0644a;
		background: #f4e8e0;
		padding: 0.15rem 0.5rem;
		border-radius: 99px;
		display: inline-block;
	}
	.scale-notice {
		background: #f4e8e0;
		border: 1px solid #e7c4b6;
		border-radius: 10px;
		padding: 0.65rem 1rem;
		font-size: 0.88rem;
		color: #7a4534;
		margin-bottom: 1.25rem;
	}

	/* Two-col layout */
	.columns {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(300px, 2fr);
		gap: 2rem;
		align-items: start;
		margin-top: 0.5rem;
	}
	@media (max-width: 700px) {
		.columns { grid-template-columns: 1fr; gap: 1.5rem; }
	}

	/* Ingredients */
	.ingredients-col {
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 16px;
		padding: 1.25rem 1.5rem;
	}
	.ingredients-col h2 {
		font-size: 1.1rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 0 0 0.85rem;
	}
	.ingredients-col ul { list-style: none; padding: 0; margin: 0; }
	.ingredients-col li {
		padding: 0.55rem 0;
		border-bottom: 1px solid #f0e9dd;
		font-size: 0.95rem;
		line-height: 1.4;
	}
	.ingredients-col li:last-child { border-bottom: none; }
	.section-header { font-weight: 700; padding: 0.4rem 0; border-bottom: none !important; }

	/* Instructions */
	.instructions-col h2 {
		font-size: 1.1rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 0 0 1.1rem;
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		counter-reset: step;
	}
	.step-section {
		counter-reset: step;
		font-size: 1rem;
		font-weight: 700;
		margin: 0.5rem 0;
		color: #6e665c;
	}
	.step {
		display: flex;
		gap: 1rem;
		counter-increment: step;
	}
	.step-num {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 99px;
		background: #f4e8e0;
		color: #c0644a;
		font-weight: 700;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.15rem;
	}
	.step-num::after { content: counter(step); }
	.step-body { flex: 1; }
	.step-text { font-size: 1rem; line-height: 1.55; color: #2b2723; }
	.step-text :global(p) { margin: 0; }
	.step-text :global(a) { color: #c0644a; }

	/* Timer chips (informational on recipe page) */
	.timer-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}
	.timer-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: #a8765f;
		background: #f4e8e0;
		padding: 0.25rem 0.65rem;
		border-radius: 99px;
	}

	/* Notes / Nutrition */
	.extras {
		margin-top: 2rem;
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 16px;
		padding: 1.25rem 1.5rem;
	}
	.extras h2 {
		font-size: 1.1rem;
		font-weight: 800;
		margin: 0 0 0.75rem;
	}
	.extras :global(p) { margin: 0.4rem 0; color: #44403c; }
	.extras :global(a) { color: #c0644a; }

	.source {
		margin-top: 1.5rem;
		font-size: 0.85rem;
		color: #9a9084;
	}
	.source a { color: #c0644a; }
</style>
