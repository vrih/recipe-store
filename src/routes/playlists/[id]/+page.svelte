<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/api/playlists/${data.id}`);
	let renaming = $state(false);
	let nameDraft = $state('');
	let search = $state('');

	$effect(() => {
		search = data.q;
	});

	async function call(url: string, method: string, body?: unknown) {
		const res = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (res.ok) await invalidateAll();
		return res.ok;
	}

	const add = (eid: string) => call(`${base}/recipes`, 'POST', { eid });
	const remove = (eid: string) => call(`${base}/recipes`, 'DELETE', { eid });

	function move(i: number, d: -1 | 1) {
		const order = data.recipes.map((r) => r.eid);
		const j = i + d;
		if (j < 0 || j >= order.length) return;
		[order[i], order[j]] = [order[j], order[i]];
		return call(`${base}/recipes`, 'PUT', { order });
	}

	function startRename() {
		nameDraft = data.name;
		renaming = true;
	}
	async function saveRename(e: Event) {
		e.preventDefault();
		if (nameDraft.trim() && (await call(base, 'PATCH', { name: nameDraft }))) renaming = false;
	}

	async function del() {
		if (!confirm(`Delete playlist "${data.name}"? The recipes themselves are kept.`)) return;
		const res = await fetch(base, { method: 'DELETE' });
		if (res.ok) await goto('/playlists');
	}

	function runSearch(e: Event) {
		e.preventDefault();
		goto(`?q=${encodeURIComponent(search.trim())}`, { keepFocus: true, replaceState: true });
	}
</script>

<svelte:head><title>{data.name} — Hearth</title></svelte:head>

<div class="wrap">
	<a class="back" href="/playlists">← Playlists</a>

	<div class="head">
		{#if renaming}
			<form class="rename" onsubmit={saveRename}>
				<input type="text" bind:value={nameDraft} maxlength="80" />
				<button type="submit">Save</button>
				<button type="button" class="ghost" onclick={() => (renaming = false)}>Cancel</button>
			</form>
		{:else}
			<h1>{data.name}</h1>
			<button type="button" class="ghost" onclick={startRename}>Rename</button>
		{/if}
	</div>

	{#if data.recipes.length > 0}
		<a class="start" href="/recipe/{data.recipes[0].eid}/cook?playlist={data.id}">▶ Start cooking</a>
		<ol class="recipes">
			{#each data.recipes as r, i (r.eid)}
				<li>
					<a class="rlink" href="/recipe/{r.eid}/cook?playlist={data.id}">
						{#if r.thumb}<img src={r.thumb} alt="" />{:else}<span class="ph"></span>{/if}
						<span class="rtitle">{r.title || 'Untitled'}</span>
					</a>
					<div class="ctrls">
						<button type="button" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
						<button type="button" onclick={() => move(i, 1)} disabled={i === data.recipes.length - 1} aria-label="Move down">↓</button>
						<button type="button" onclick={() => remove(r.eid)} aria-label="Remove {r.title}">×</button>
					</div>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="empty">Empty — add recipes below, or use “Add to playlist” on any recipe page.</p>
	{/if}

	<section class="adder">
		<h2>Add recipes</h2>
		<form onsubmit={runSearch} class="searchrow">
			<input type="search" bind:value={search} placeholder="Search your recipes…" />
			<button type="submit">Search</button>
		</form>
		{#if data.q && data.results.length === 0}
			<p class="empty">No matches.</p>
		{/if}
		<ul class="results">
			{#each data.results as r (r.eid)}
				<li>
					<span>{r.title || 'Untitled'}</span>
					<button type="button" onclick={() => add(r.eid)}>+ Add</button>
				</li>
			{/each}
		</ul>
	</section>

	<button type="button" class="danger" onclick={del}>Delete playlist</button>
</div>

<style>
	.wrap { max-width: 680px; margin: 0 auto; }
	.back { color: #6e665c; text-decoration: none; font-size: 0.9rem; font-weight: 600; }
	.head { display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0 1rem; }
	h1 { margin: 0; letter-spacing: -0.02em; }
	h2 { font-size: 1rem; margin: 1.75rem 0 0.5rem; }
	button { font: inherit; cursor: pointer; }
	.ghost { background: none; border: 1px solid #e4dbcc; border-radius: 8px; padding: 0.3rem 0.7rem; color: #6e665c; font-size: 0.85rem; }
	.rename { display: flex; gap: 0.5rem; flex: 1; }
	.rename input, .searchrow input { flex: 1; font: inherit; padding: 0.5rem 0.8rem; border: 1px solid #e4dbcc; border-radius: 10px; background: #fff; }
	.rename button[type='submit'], .searchrow button { font-weight: 700; padding: 0.5rem 1rem; border: none; border-radius: 10px; background: #2b2723; color: #fff; }
	.start { display: inline-flex; padding: 0.65rem 1.3rem; border-radius: 10px; background: #c0644a; color: #fff; text-decoration: none; font-weight: 700; box-shadow: 0 6px 18px rgba(192,100,74,0.28); margin-bottom: 1rem; }
	.recipes, .results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.recipes li { display: flex; align-items: center; gap: 0.5rem; background: #fff; border: 1px solid #e9e1d4; border-radius: 12px; padding: 0.4rem 0.6rem 0.4rem 0.4rem; }
	.rlink { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; text-decoration: none; color: inherit; }
	.rlink img, .ph { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; background: #ede4d6; flex-shrink: 0; }
	.rtitle { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ctrls { display: flex; gap: 0.25rem; }
	.ctrls button { width: 36px; height: 36px; border: 1px solid #e4dbcc; border-radius: 8px; background: #fff; color: #6e665c; }
	.ctrls button:disabled { opacity: 0.3; cursor: default; }
	.results li { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: #fff; border: 1px solid #e9e1d4; border-radius: 10px; }
	.results button { border: 1px solid #c0644a; background: #fff; color: #c0644a; font-weight: 700; border-radius: 8px; padding: 0.3rem 0.7rem; }
	.searchrow { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
	.empty { color: #6e665c; }
	.danger { margin-top: 2.5rem; background: none; border: none; color: #b3402a; font-size: 0.85rem; padding: 0; text-decoration: underline; }
</style>
