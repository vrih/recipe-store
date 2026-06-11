<script lang="ts">
	import { timers } from '$lib/timerStore.svelte';
	import { formatClock, formatDuration } from '$lib/times';
	import type { TimerFavorite } from '$lib/server/timerFavorites';

	let { recipeEid, favorites = [] }: { recipeEid: string; favorites?: TimerFavorite[] } = $props();

	const list = $derived(timers.forRecipe(recipeEid));
	const hasDone = $derived(list.some((t) => t.status === 'done'));

	// Favourites are server-backed (shared across devices); seed from the page
	// load once and keep a local copy we mutate optimistically on add/remove.
	// svelte-ignore state_referenced_locally
	let favs = $state<TimerFavorite[]>(favorites);
	let editing = $state(false);

	// Add-timer form state.
	let showAdd = $state(false);
	let label = $state('');
	let mins = $state<number | null>(null);
	let secs = $state<number | null>(null);

	const formSeconds = $derived((Number(mins) || 0) * 60 + (Number(secs) || 0));

	function startFavorite(fav: TimerFavorite) {
		timers.start({ label: fav.label, stepKey: `fav:${fav.id}`, recipeEid, seconds: fav.seconds });
	}

	function startCustom() {
		if (formSeconds <= 0) return;
		const name = label.trim() || formatDuration(formSeconds);
		timers.start({ label: name, stepKey: 'custom', recipeEid, seconds: formSeconds });
		resetForm();
	}

	async function saveFavorite() {
		if (formSeconds <= 0) return;
		const body = { label: label.trim(), seconds: formSeconds };
		try {
			const res = await fetch('/api/timers/favorites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) return;
			const { favorite } = await res.json();
			if (!favs.some((f) => f.id === favorite.id)) favs = [...favs, favorite];
			resetForm();
		} catch {
			// Network failure — leave the form as-is so nothing is lost.
		}
	}

	async function removeFavorite(fav: TimerFavorite) {
		const prev = favs;
		favs = favs.filter((f) => f.id !== fav.id); // optimistic
		try {
			const res = await fetch(`/api/timers/favorites/${fav.id}`, { method: 'DELETE' });
			if (!res.ok) favs = prev;
		} catch {
			favs = prev;
		}
	}

	function resetForm() {
		label = '';
		mins = null;
		secs = null;
		showAdd = false;
	}
</script>

<div class="tray" role="region" aria-label="Kitchen timers">
	{#if list.length > 0}
		<div class="tray-head">
			<strong>Timers</strong>
			{#if timers.permission === 'default'}
				<span class="hint">We'll ask to send alerts on your first timer</span>
			{:else if timers.permission === 'denied'}
				<span class="hint">Alerts blocked — you'll still hear a beep</span>
			{/if}
			{#if hasDone}
				<button type="button" class="link" onclick={() => timers.clearDone()}>Clear done</button>
			{/if}
		</div>

		<ul class="active">
			{#each list as t (t.id)}
				<li class:done={t.status === 'done'}>
					<span class="time">
						{#if t.status === 'done'}
							✅ Done
						{:else}
							{formatClock(timers.remaining(t) / 1000)}
						{/if}
					</span>
					<span class="label">{t.label}</span>
					<span class="controls">
						{#if t.status === 'running'}
							<button type="button" onclick={() => timers.pause(t.id)} aria-label="Pause">⏸</button>
						{:else if t.status === 'paused'}
							<button type="button" onclick={() => timers.resume(t.id)} aria-label="Resume">▶</button>
						{/if}
						{#if t.status === 'done'}
							<button type="button" onclick={() => timers.restart(t.id)} aria-label="Restart">↻</button>
							<button type="button" onclick={() => timers.dismiss(t.id)} aria-label="Dismiss">✕</button>
						{:else}
							<button type="button" onclick={() => timers.cancel(t.id)} aria-label="Cancel">✕</button>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="presets">
		<span class="presets-label">Quick timers</span>
		{#each favs as fav (fav.id)}
			<span class="fav">
				<button type="button" class="fav-start" onclick={() => startFavorite(fav)}>
					⏱ {fav.label}
					<em>{formatDuration(fav.seconds)}</em>
				</button>
				{#if editing}
					<button
						type="button"
						class="fav-del"
						aria-label="Remove {fav.label}"
						onclick={() => removeFavorite(fav)}>✕</button
					>
				{/if}
			</span>
		{/each}

		<button type="button" class="add-toggle" onclick={() => (showAdd = !showAdd)}>
			{showAdd ? '✕ Close' : '＋ Timer'}
		</button>
		{#if favs.length > 0}
			<button type="button" class="link edit" onclick={() => (editing = !editing)}>
				{editing ? 'Done' : 'Edit'}
			</button>
		{/if}
	</div>

	{#if showAdd}
		<form
			class="add-form"
			onsubmit={(e) => {
				e.preventDefault();
				startCustom();
			}}
		>
			<input
				type="text"
				placeholder="Name (e.g. Rice)"
				bind:value={label}
				class="name"
				maxlength="60"
			/>
			<span class="duration">
				<input type="number" min="0" max="1440" placeholder="0" bind:value={mins} aria-label="Minutes" />
				<span>min</span>
				<input type="number" min="0" max="59" placeholder="0" bind:value={secs} aria-label="Seconds" />
				<span>sec</span>
			</span>
			<span class="actions">
				<button type="submit" class="primary" disabled={formSeconds <= 0}>Start</button>
				<button type="button" class="link" disabled={formSeconds <= 0} onclick={saveFavorite}>
					☆ Save
				</button>
			</span>
		</form>
	{/if}
</div>

<style>
	.tray {
		position: sticky;
		bottom: 0;
		margin-top: 2rem;
		background: #fff;
		border: 1px solid #e9e1d4;
		border-radius: 12px 12px 0 0;
		box-shadow: 0 -4px 16px rgba(120, 80, 50, 0.08);
		padding: 0.75rem 1rem 1rem;
		z-index: 20;
	}

	.tray-head {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.hint {
		font-size: 0.8rem;
		color: #a8a29e;
	}

	.link {
		font: inherit;
		font-size: 0.85rem;
		background: none;
		border: none;
		color: #c0644a;
		cursor: pointer;
		padding: 0;
	}

	.tray-head .link {
		margin-left: auto;
	}

	.active {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.active li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid #e7e5e4;
		border-radius: 8px;
	}

	.active li.done {
		background: #f4e8e0;
		border-color: #e7c4b6;
	}

	.time {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		font-size: 1.1rem;
		min-width: 4.5rem;
	}

	.label {
		color: #57534e;
		flex: 1;
	}

	.controls {
		display: flex;
		gap: 0.35rem;
	}

	.controls button {
		font: inherit;
		font-size: 1rem;
		width: 2.2rem;
		height: 2.2rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		background: #fafaf9;
		cursor: pointer;
	}

	.controls button:active {
		transform: translateY(1px);
	}

	/* --- favourites + add --- */
	.presets {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.presets-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #a8a29e;
		margin-right: 0.25rem;
	}

	.fav {
		display: inline-flex;
		align-items: center;
	}

	.fav-start {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		font: inherit;
		font-size: 0.9rem;
		padding: 0.3rem 0.7rem;
		border: 1px solid #e7e5e4;
		border-radius: 999px;
		background: #fafaf9;
		cursor: pointer;
		line-height: 1.2;
	}

	.fav-start em {
		font-style: normal;
		color: #a8a29e;
		font-size: 0.8rem;
	}

	.fav-start:hover {
		background: #f5f5f4;
	}

	.fav-del {
		font: inherit;
		margin-left: 0.2rem;
		width: 1.6rem;
		height: 1.6rem;
		border: 1px solid #fecaca;
		background: #fef2f2;
		color: #b91c1c;
		border-radius: 50%;
		cursor: pointer;
	}

	.add-toggle {
		font: inherit;
		font-size: 0.9rem;
		padding: 0.3rem 0.7rem;
		border: 1px dashed #d6d3d1;
		border-radius: 999px;
		background: #fff;
		cursor: pointer;
	}

	.add-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #f5f5f4;
	}

	.add-form .name {
		font: inherit;
		padding: 0.4rem 0.6rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		min-width: 9rem;
		flex: 1;
	}

	.duration {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: #78716c;
		font-size: 0.9rem;
	}

	.duration input {
		font: inherit;
		width: 3.5rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		text-align: center;
	}

	.actions {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
	}

	.primary {
		font: inherit;
		padding: 0.45rem 1rem;
		border: none;
		border-radius: 8px;
		background: #c0644a;
		color: #fff;
		cursor: pointer;
	}

	.primary:disabled,
	.link:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
