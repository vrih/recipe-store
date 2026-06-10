<script lang="ts">
	import { timers } from '$lib/timerStore.svelte';
	import { formatClock } from '$lib/times';

	let { recipeEid }: { recipeEid: string } = $props();

	const list = $derived(timers.forRecipe(recipeEid));
	const hasDone = $derived(list.some((t) => t.status === 'done'));
</script>

{#if list.length > 0}
	<div class="tray" role="region" aria-label="Kitchen timers">
		<div class="tray-head">
			<strong>Timers</strong>
			{#if timers.permission === 'default'}
				<span class="hint">Tap a timer — we'll ask to send alerts</span>
			{:else if timers.permission === 'denied'}
				<span class="hint">Alerts blocked — you'll still hear a beep</span>
			{/if}
			{#if hasDone}
				<button type="button" class="link" onclick={() => timers.clearDone()}>Clear done</button>
			{/if}
		</div>

		<ul>
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
	</div>
{/if}

<style>
	.tray {
		position: sticky;
		bottom: 0;
		margin-top: 2rem;
		background: #fff;
		border: 1px solid #e7e5e4;
		border-radius: 12px 12px 0 0;
		box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
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
		margin-left: auto;
		font: inherit;
		font-size: 0.85rem;
		background: none;
		border: none;
		color: #b45309;
		cursor: pointer;
		padding: 0;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid #e7e5e4;
		border-radius: 8px;
	}

	li.done {
		background: #ecfdf5;
		border-color: #a7f3d0;
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
</style>
