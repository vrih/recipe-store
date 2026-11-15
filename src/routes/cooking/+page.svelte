<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { timers } from '$lib/timerStore.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const href = (c: PageData['cooks'][number]) =>
		`/recipe/${c.eid}/cook${c.playlistId ? `?playlist=${c.playlistId}` : ''}`;
	async function clear(c: PageData['cooks'][number]) {
		const res = await fetch(`/api/recipes/${c.eid}/cooking`, { method: 'DELETE' });
		if (res.ok) await invalidateAll();
	}
	async function clearAll() {
		if (!confirm('Clear progress on all of these recipes?')) return;
		await Promise.all(data.cooks.map((c) => fetch(`/api/recipes/${c.eid}/cooking`, { method: 'DELETE' })));
		await invalidateAll();
	}
	const running = (eid: string) => timers.forRecipe(eid).filter((t) => t.status !== 'done').length;
</script>

<svelte:head><title>Cooking now — Hearth</title></svelte:head>

<div class="wrap">
	<h1>Cooking now</h1>
	<p class="lead">Recipes you've made progress on in the last 7 days. Clear a recipe when you're finished with it.</p>
	<ul>
		{#each data.cooks as c (c.eid)}
			<li>
				<a href={href(c)}>
					<span class="t">{c.title || 'Untitled'}</span>
					<span class="m">
						{c.stepsDone}/{c.stepsTotal} steps
						{#if running(c.eid) > 0} · ⏱ {running(c.eid)}{/if}
					</span>
				</a>
				<button type="button" class="clear" onclick={() => clear(c)} aria-label="Clear {c.title}">Clear</button>
			</li>
		{:else}
			<li class="empty">Nothing in progress.</li>
		{/each}
	</ul>
	{#if data.cooks.length > 1}
		<button type="button" class="clear all" onclick={clearAll}>Clear all</button>
	{/if}
</div>

<style>
	.wrap { max-width: 640px; margin: 0 auto; }
	h1 { margin: 0.5rem 0 0.25rem; letter-spacing: -0.02em; }
	.lead, .empty { color: #6e665c; }
	ul { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	li { display: flex; gap: 0.5rem; align-items: stretch; }
	li a { flex: 1; }
	.clear { font: inherit; font-size: 0.85rem; font-weight: 600; border: 1px solid #e4dbcc; border-radius: 12px; background: #fff; color: #6e665c; padding: 0 0.9rem; cursor: pointer; }
	.clear.all { margin-top: 1rem; padding: 0.5rem 0.9rem; }
	a { display: flex; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; background: #fff; border: 1px solid #e9e1d4; border-radius: 12px; text-decoration: none; color: inherit; }
	a:hover { background: #fbf8f3; }
	.t { font-weight: 700; }
	.m { color: #6e665c; font-size: 0.85rem; white-space: nowrap; }
</style>
