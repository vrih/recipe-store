<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Persisted progress comes from the server (data.done). Local toggles are
	// overlaid on top so the set is correct during SSR and after invalidation.
	let overrides = $state<Record<string, boolean>>({});
	let done = $derived.by(() => {
		const s = new Set(data.done);
		for (const k in overrides) {
			if (overrides[k]) s.add(k);
			else s.delete(k);
		}
		return s;
	});

	const endpoint = $derived(`/api/recipes/${data.eid}/progress`);

	// --- Wake Lock (FR-COOK-2) ---
	const wakeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
	let wakeActive = $state(false);
	let sentinel: WakeLockSentinel | null = null;

	async function acquireWakeLock() {
		if (!wakeSupported) return;
		try {
			sentinel = await navigator.wakeLock.request('screen');
			wakeActive = true;
			sentinel.addEventListener('release', () => (wakeActive = false));
		} catch {
			wakeActive = false;
		}
	}

	$effect(() => {
		acquireWakeLock();
		// The lock drops when the tab is backgrounded; re-acquire on return.
		function onVisibility() {
			if (document.visibilityState === 'visible') acquireWakeLock();
		}
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			sentinel?.release();
			sentinel = null;
		};
	});

	function composite(kind: 'ingredient' | 'step', key: string) {
		return `${kind}:${key}`;
	}

	async function toggle(kind: 'ingredient' | 'step', key: string) {
		const id = composite(kind, key);
		const nowDone = !done.has(id);
		overrides = { ...overrides, [id]: nowDone };
		try {
			await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, key, done: nowDone })
			});
		} catch {
			// Roll back the override on network failure.
			const { [id]: _, ...rest } = overrides;
			overrides = rest;
		}
	}

	async function reset() {
		const optimistic: Record<string, boolean> = {};
		for (const id of done) optimistic[id] = false;
		overrides = optimistic;
		try {
			await fetch(endpoint, { method: 'DELETE' });
			await invalidateAll();
			overrides = {};
		} catch {
			overrides = {};
		}
	}
</script>

<svelte:head>
	<title>Cooking: {data.title || 'Recipe'}</title>
</svelte:head>

<div class="cook">
	<header>
		<a class="exit" href="/recipe/{data.eid}" aria-label="Exit cooking mode">✕ Exit</a>
		<h1>{data.title || 'Untitled'}</h1>
		<div class="head-meta">
			{#if data.yield}<span>{data.yield}</span>{/if}
			{#if data.totalTime}<span>{data.totalTime}</span>{/if}
		</div>
		<div class="status">
			{#if wakeSupported}
				<span class="wake" class:on={wakeActive}>
					{wakeActive ? '🔆 Screen stays awake' : '💤 Screen lock active'}
				</span>
			{:else}
				<span class="wake">Tip: disable auto-lock on your device</span>
			{/if}
			<button type="button" class="reset" onclick={reset}>Reset progress</button>
		</div>
		{#if wakeSupported}
			<p class="caveat">Keep this tab in the foreground — the screen can still lock if the device sleeps.</p>
		{/if}
	</header>

	<div class="grid">
		{#if data.ingredients.length > 0}
			<section>
				<h2>Ingredients</h2>
				<ul class="items">
					{#each data.ingredients as item (item.key || item.html)}
						{#if item.type === 'header'}
							<li class="section-header">{item.html}</li>
						{:else}
							<li>
								<button
									type="button"
									class="item"
									class:struck={done.has(composite('ingredient', item.key))}
									onclick={() => toggle('ingredient', item.key)}
								>
									{@html item.html}
								</button>
							</li>
						{/if}
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.steps.length > 0}
			<section>
				<h2>Instructions</h2>
				<ol class="items steps">
					{#each data.steps as step (step.key)}
						{#if step.type === 'header'}
							<li class="section-header">{step.text}</li>
						{:else}
							<li>
								<button
									type="button"
									class="item"
									class:struck={done.has(composite('step', step.key))}
									onclick={() => toggle('step', step.key)}
								>
									{@html step.html}
								</button>
							</li>
						{/if}
					{/each}
				</ol>
			</section>
		{/if}
	</div>
</div>

<style>
	.cook {
		max-width: 1000px;
		margin: 0 auto;
		font-size: 1.15rem;
		/* Pin to the viewport (main has 1.5rem top+bottom padding) so the two
		   panes can scroll independently instead of the whole page moving. */
		height: calc(100dvh - 3rem);
		display: flex;
		flex-direction: column;
	}

	header {
		flex: 0 0 auto;
		margin-bottom: 1.5rem;
	}

	.exit {
		display: inline-block;
		text-decoration: none;
		color: #57534e;
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	h1 {
		margin: 0.25rem 0;
		font-size: 2rem;
	}

	.head-meta {
		display: flex;
		gap: 1rem;
		color: #78716c;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}

	.wake {
		font-size: 0.95rem;
		color: #78716c;
	}

	.wake.on {
		color: #047857;
	}

	.reset {
		font: inherit;
		font-size: 0.9rem;
		padding: 0.35rem 0.85rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
	}

	.caveat {
		font-size: 0.85rem;
		color: #a8a29e;
		margin: 0.5rem 0 0;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.6fr);
		grid-template-rows: minmax(0, 1fr);
		gap: 2.5rem;
		flex: 1;
		min-height: 0;
	}

	/* Each pane scrolls on its own. min-height: 0 lets the grid item shrink
	   below its content height so overflow-y can take effect. */
	.grid > section {
		min-height: 0;
		overflow-y: auto;
	}

	@media (max-width: 760px) {
		.cook {
			height: auto;
			display: block;
		}

		.grid {
			grid-template-columns: 1fr;
			grid-template-rows: none;
			gap: 1.5rem;
		}

		.grid > section {
			overflow-y: visible;
		}
	}

	h2 {
		font-size: 1.2rem;
		color: #57534e;
		/* Keep the pane label visible while its list scrolls. */
		position: sticky;
		top: 0;
		margin: 0 0 0.5rem;
		padding-bottom: 0.5rem;
		background: #fafaf9;
	}

	.items {
		list-style: none;
		padding: 0;
		margin: 0;
		counter-reset: step;
	}

	.items li {
		margin-bottom: 0.4rem;
	}

	.steps {
		counter-reset: step;
	}

	/* A section header restarts step numbering for the section that follows. */
	.steps .section-header {
		counter-reset: step;
	}

	.item {
		display: block;
		width: 100%;
		text-align: left;
		font: inherit;
		background: #fff;
		border: 1px solid #e7e5e4;
		border-radius: 10px;
		padding: 0.85rem 1rem;
		cursor: pointer;
		line-height: 1.5;
		transition: opacity 0.15s, background 0.15s;
	}

	.steps .item {
		counter-increment: step;
	}

	.steps .item::before {
		content: counter(step);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		margin-right: 0.6rem;
		border-radius: 50%;
		background: #f5f5f4;
		font-size: 0.9rem;
		font-weight: 700;
		color: #78716c;
		vertical-align: middle;
	}

	.item.struck {
		opacity: 0.45;
		background: #fafaf9;
		text-decoration: line-through;
		text-decoration-color: #a8a29e;
	}

	.section-header {
		font-weight: 700;
		margin: 1rem 0 0.4rem;
	}

	.item :global(p) {
		margin: 0;
		display: inline;
	}

	.item :global(a) {
		color: #b45309;
	}
</style>
