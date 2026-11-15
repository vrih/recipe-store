<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let name = $state('');
	let busy = $state(false);

	async function create(e: Event) {
		e.preventDefault();
		if (!name.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/playlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (res.ok) {
				const { playlist } = await res.json();
				await goto(`/playlists/${playlist.id}`);
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Playlists — Hearth</title></svelte:head>

<div class="wrap">
	<h1>Playlists</h1>
	<p class="lead">Group recipes you're cooking together — like Christmas dinner — and flick between them.</p>

	<form class="new" onsubmit={create}>
		<input type="text" bind:value={name} placeholder="New playlist, e.g. Christmas dinner" maxlength="80" />
		<button type="submit" disabled={!name.trim() || busy}>Create</button>
	</form>

	{#if data.playlists.length === 0}
		<p class="empty">No playlists yet.</p>
	{:else}
		<ul class="list">
			{#each data.playlists as p (p.id)}
				<li>
					<a href="/playlists/{p.id}">
						<span class="pname">{p.name}</span>
						<span class="count">{p.count} recipe{p.count === 1 ? '' : 's'}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.wrap { max-width: 640px; margin: 0 auto; }
	h1 { margin: 0.5rem 0 0.25rem; letter-spacing: -0.02em; }
	.lead { color: #6e665c; margin: 0 0 1.25rem; }
	.new { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
	.new input { flex: 1; font: inherit; padding: 0.55rem 0.8rem; border: 1px solid #e4dbcc; border-radius: 10px; background: #fff; }
	.new button { font: inherit; font-weight: 700; padding: 0.55rem 1.1rem; border: none; border-radius: 10px; background: #c0644a; color: #fff; cursor: pointer; }
	.new button:disabled { opacity: 0.5; cursor: default; }
	.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.list a { display: flex; justify-content: space-between; align-items: center; padding: 0.9rem 1rem; background: #fff; border: 1px solid #e9e1d4; border-radius: 12px; text-decoration: none; color: inherit; }
	.list a:hover { background: #fbf8f3; }
	.pname { font-weight: 700; }
	.count { color: #6e665c; font-size: 0.85rem; }
	.empty { color: #6e665c; }
</style>
