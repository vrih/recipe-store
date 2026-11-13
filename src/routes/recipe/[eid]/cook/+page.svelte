<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { detectTimes } from '$lib/times';
	import TimerTray from '$lib/components/TimerTray.svelte';
	import TimerChip from '$lib/components/TimerChip.svelte';
	import { timers } from '$lib/timerStore.svelte';
	import { formatClock } from '$lib/times';
	import { scaleIngredient } from '$lib/scaleIngredient';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Servings stepper
	let servingsOverride = $state<number | null>(null);
	let currentServings = $derived(servingsOverride ?? data.baseServings ?? null);
	const scale = $derived(
		data.baseServings && currentServings ? currentServings / data.baseServings : 1
	);
	function adjServings(d: number) {
		const base = currentServings ?? 1;
		servingsOverride = Math.max(1, Math.min(50, base + d));
	}

	// Detect cookable durations in each step once.
	const stepTimes = $derived.by(() => {
		const map = new Map<string, ReturnType<typeof detectTimes>>();
		for (const step of data.steps) {
			if (step.type === 'step') map.set(step.key, detectTimes(step.text));
		}
		return map;
	});

	// Progress state
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

	// Compute step progress for the header bar
	const stepsOnly = $derived(data.steps.filter((s) => s.type === 'step'));
	const doneCount = $derived(stepsOnly.filter((s) => done.has(`step:${s.key}`)).length);
	const totalSteps = $derived(stepsOnly.length);
	const progressPct = $derived(totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0);

	// Current active step index (first not done)
	const currentStepKey = $derived.by(() => {
		for (const s of stepsOnly) {
			if (!done.has(`step:${s.key}`)) return s.key;
		}
		return null;
	});

	const allDone = $derived(totalSteps > 0 && doneCount === totalSteps);

	// Active timers for the dark strip
	const activeTimers = $derived(timers.forRecipe(data.eid));

	// Wake Lock
	const wakeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
	let sentinel: WakeLockSentinel | null = null;

	async function acquireWakeLock() {
		if (!wakeSupported) return;
		try {
			sentinel = await navigator.wakeLock.request('screen');
			sentinel.addEventListener('release', () => { sentinel = null; });
		} catch {}
	}

	$effect(() => {
		acquireWakeLock();
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
	<!-- Header with progress -->
	<header class="cook-header">
		<div class="header-main">
			<div class="header-meta">
				<span class="cook-label">Cook mode</span>
				<span class="cook-title">{data.title || 'Untitled'}</span>
			</div>
			<div class="header-right">
				{#if data.baseServings !== null}
					<div class="servings-stepper">
						<button type="button" class="step-btn" onclick={() => adjServings(-1)} aria-label="Fewer servings">−</button>
						<span class="servings-val" title="Servings">{currentServings ?? data.baseServings}</span>
						<button type="button" class="step-btn" onclick={() => adjServings(1)} aria-label="More servings">+</button>
						{#if scale !== 1}
							<span class="scale-badge">×{scale % 1 === 0 ? scale : scale.toFixed(1)}</span>
						{/if}
					</div>
				{/if}
				<button type="button" class="reset-btn" onclick={reset}>Reset</button>
				<a class="exit-btn" href="/recipe/{data.eid}">Exit</a>
			</div>
		</div>
		<div class="progress-row">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {progressPct}%"></div>
			</div>
			<span class="progress-label">{doneCount} of {totalSteps} done</span>
		</div>
	</header>

	<!-- Dark timer strip -->
	<div class="timer-strip">
		<span class="strip-label">Timers</span>
		{#if activeTimers.length > 0}
			<div class="strip-timers">
				{#each activeTimers as t (t.id)}
					<div class="timer-card" class:done={t.status === 'done'}>
						<div class="tc-top">
							<span class="tc-label">{t.label}</span>
							<button type="button" class="tc-dismiss" onclick={() => timers.dismiss(t.id)} aria-label="Dismiss">×</button>
						</div>
						<div class="tc-clock">
							{#if t.status === 'done'}
								Done
							{:else}
								{formatClock(timers.remaining(t) / 1000)}
							{/if}
						</div>
						<div class="tc-bar">
							<div class="tc-bar-fill" style="width: {t.status === 'done' ? 100 : Math.max(0, (timers.remaining(t) / (t.durationMs)) * 100)}%"></div>
						</div>
						<div class="tc-controls">
							{#if t.status === 'done'}
								<button type="button" class="tc-btn" onclick={() => timers.restart(t.id)}>Restart</button>
							{:else if t.status === 'running'}
								<button type="button" class="tc-btn" onclick={() => timers.pause(t.id)}>Pause</button>
							{:else}
								<button type="button" class="tc-btn" onclick={() => timers.resume(t.id)}>Resume</button>
							{/if}
							<button type="button" class="tc-reset" onclick={() => timers.restart(t.id)} title="Restart">↺</button>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<span class="strip-empty">No timers running — tap a time in any step to start one.</span>
		{/if}
	</div>

	<!-- Main two-col content -->
	<div class="cook-grid">
		{#if data.ingredients.length > 0}
			<section class="ingredients-pane">
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
									<span class="item-check">{done.has(composite('ingredient', item.key)) ? '✓' : ''}</span>
									{#if scale !== 1}
									<span>{scaleIngredient(item.text, scale)}</span>
								{:else}
									<span>{@html item.html}</span>
								{/if}
								</button>
							</li>
						{/if}
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.steps.length > 0}
			<section class="steps-pane">
				<h2>Method</h2>
				<ol class="steps">
					{#each data.steps as step (step.key)}
						{#if step.type === 'header'}
							<li class="section-header">{step.text}</li>
						{:else}
							{@const isCurrent = step.key === currentStepKey}
							{@const isDone = done.has(composite('step', step.key))}
							<li class="step" class:current={isCurrent} class:done={isDone}>
								<button
									type="button"
									class="step-circle"
									class:current={isCurrent}
									class:done={isDone}
									onclick={() => toggle('step', step.key)}
									aria-label="Toggle step {stepsOnly.indexOf(step) + 1}"
								>
									{isDone ? '✓' : stepsOnly.indexOf(step) + 1}
								</button>
								<div class="step-content">
									<p class="step-text" class:current={isCurrent} class:done={isDone}>
										{@html step.html}
									</p>
									{#if (stepTimes.get(step.key)?.length ?? 0) > 0}
										<div class="timers">
											{#each stepTimes.get(step.key) ?? [] as match (match.start)}
												<TimerChip {match} stepKey={step.key} recipeEid={data.eid} />
											{/each}
										</div>
									{/if}
								</div>
							</li>
						{/if}
					{/each}
					{#if allDone}
						<li class="all-done">Nicely done — everything's complete! 🎉</li>
					{/if}
				</ol>
			</section>
		{/if}
	</div>

	<!-- Full timer management tray (favorites, custom timers) -->
	<TimerTray recipeEid={data.eid} favorites={data.favorites} showRunning={false} />
</div>

<style>
	.cook {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: #f6f1e9;
		overflow: hidden;
	}

	/* ---- Cook header ---- */
	.cook-header {
		flex-shrink: 0;
		background: #fff;
		border-bottom: 1px solid #e9e1d4;
		padding: 0.85rem 1.25rem 0.75rem;
	}

	.header-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.7rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}

	.cook-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #c0644a;
		flex-shrink: 0;
	}

	.cook-title {
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-right {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-shrink: 0;
	}

	/* Servings stepper in cook header */
	.servings-stepper {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: #f6f1e9;
		border: 1px solid #e4dbcc;
		border-radius: 10px;
		padding: 0.25rem 0.5rem;
	}

	.servings-stepper .step-btn {
		width: 24px;
		height: 24px;
		min-height: unset;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: #6e665c;
		font: inherit;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.1s;
	}
	.servings-stepper .step-btn:hover { background: #ede4d6; }

	.servings-val {
		font-size: 0.9rem;
		font-weight: 700;
		min-width: 1.25rem;
		text-align: center;
		color: #2b2723;
	}

	.scale-badge {
		font-size: 0.72rem;
		font-weight: 700;
		color: #c0644a;
		background: #f4e8e0;
		padding: 0.1rem 0.4rem;
		border-radius: 99px;
	}

	.reset-btn {
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.4rem 0.85rem;
		border: 1px solid #e4dbcc;
		border-radius: 10px;
		background: #fff;
		cursor: pointer;
		color: #6e665c;
		min-height: unset;
		transition: background 0.12s;
	}
	.reset-btn:hover { background: #f6f1e9; }

	.exit-btn {
		display: inline-flex;
		align-items: center;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.4rem 0.85rem;
		border-radius: 10px;
		border: 1px solid #e4dbcc;
		background: #fff;
		color: #2b2723;
		text-decoration: none;
		transition: background 0.12s;
	}
	.exit-btn:hover { background: #f6f1e9; }

	.progress-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: #ede4d6;
		border-radius: 99px;
		overflow: hidden;
		max-width: 360px;
	}

	.progress-fill {
		height: 100%;
		background: #c0644a;
		border-radius: 99px;
		transition: width 0.3s ease;
	}

	.progress-label {
		font-size: 0.78rem;
		color: #9a9084;
		font-weight: 600;
		white-space: nowrap;
	}

	/* ---- Dark timer strip ---- */
	.timer-strip {
		flex-shrink: 0;
		background: #2b2723;
		padding: 0.85rem 1.25rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.strip-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #c99b8a;
		flex-shrink: 0;
	}

	.strip-timers {
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
		flex: 1;
		padding-bottom: 2px;
	}

	.strip-empty {
		font-size: 0.875rem;
		color: #8a8178;
		font-style: italic;
	}

	/* Individual timer card in the strip */
	.timer-card {
		flex-shrink: 0;
		width: 160px;
		background: #3a3530;
		border-radius: 12px;
		padding: 0.7rem 0.85rem;
		border: 1px solid transparent;
		transition: border-color 0.2s;
	}
	.timer-card.done {
		border-color: #c0644a;
	}

	.tc-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}

	.tc-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #c99b8a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tc-dismiss {
		background: none;
		border: none;
		color: #8a8178;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
		min-height: unset;
	}

	.tc-clock {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #f6f1e9;
		line-height: 1;
		margin: 0.2rem 0;
	}
	.timer-card.done .tc-clock { color: #e89b82; }

	.tc-bar {
		height: 3px;
		background: rgba(255,255,255,0.1);
		border-radius: 99px;
		overflow: hidden;
		margin: 0.4rem 0 0.6rem;
	}
	.tc-bar-fill {
		height: 100%;
		background: #c99b8a;
		border-radius: 99px;
		transition: width 0.9s linear;
	}
	.timer-card.done .tc-bar-fill { background: #c0644a; }

	.tc-controls {
		display: flex;
		gap: 0.35rem;
	}

	.tc-btn {
		flex: 1;
		background: rgba(255,255,255,0.1);
		border: none;
		color: #f6f1e9;
		border-radius: 7px;
		padding: 0.4rem 0.5rem;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		min-height: unset;
	}
	.tc-btn:hover { background: rgba(255,255,255,0.18); }

	.tc-reset {
		background: rgba(255,255,255,0.1);
		border: none;
		color: #f6f1e9;
		border-radius: 7px;
		padding: 0.4rem 0.6rem;
		font-size: 0.9rem;
		cursor: pointer;
		min-height: unset;
	}
	.tc-reset:hover { background: rgba(255,255,255,0.18); }

	/* ---- Two-column content grid ---- */
	.cook-grid {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.6fr);
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.cook-grid > section {
		overflow-y: auto;
		padding: 1.25rem 1.5rem 3rem;
	}

	.cook-grid > section:first-child {
		border-right: 1px solid #e9e1d4;
	}

	h2 {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #9a9084;
		margin: 0 0 0.85rem;
		position: sticky;
		top: 0;
		background: #f6f1e9;
		padding-top: 0.25rem;
		padding-bottom: 0.5rem;
	}

	/* ---- Ingredients pane ---- */
	.items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		text-align: left;
		font: inherit;
		font-size: 1rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.65rem 0.75rem;
		border-radius: 10px;
		line-height: 1.4;
		min-height: unset;
		transition: background 0.12s;
	}

	.item:hover { background: #ede4d6; }

	.item-check {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 1.5px solid #d9cdba;
		background: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: transparent;
		transition: background 0.12s, border-color 0.12s, color 0.12s;
	}

	.item.struck .item-check {
		background: #c0644a;
		border-color: #c0644a;
		color: #fff;
	}

	.item.struck {
		opacity: 0.5;
		text-decoration: line-through;
		text-decoration-color: #a8a29e;
	}

	/* ---- Steps pane ---- */
	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.step {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		border-radius: 14px;
		padding: 1rem 1.1rem;
		border: 1px solid transparent;
		transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
	}

	.step.current {
		background: #fff;
		border-color: #e7c4b6;
		box-shadow: 0 6px 20px rgba(120,70,50,0.1);
	}

	.step-circle {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 99px;
		border: 1.5px solid #d9cdba;
		background: #fff;
		color: #9a9084;
		font: inherit;
		font-weight: 700;
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s, color 0.12s;
		min-height: unset;
	}

	.step-circle.current {
		border: 2px solid #c0644a;
		color: #c0644a;
	}

	.step-circle.done {
		background: #c0644a;
		border-color: #c0644a;
		color: #fff;
	}

	.step-content { flex: 1; min-width: 0; }

	.step-text {
		margin: 0;
		font-size: 1rem;
		line-height: 1.55;
		color: #6e665c;
		transition: font-size 0.15s, color 0.15s;
	}

	.step-text.current {
		font-size: 1.3rem;
		font-weight: 600;
		color: #2b2723;
	}

	.step-text.done {
		color: #aaa093;
	}

	.step-text :global(p) { margin: 0; display: inline; }
	.step-text :global(a) { color: #c0644a; }

	.timers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}

	.all-done {
		text-align: center;
		padding: 2rem;
		color: #6e665c;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.section-header {
		font-weight: 700;
		padding: 0.5rem 0;
		color: #6e665c;
		font-size: 0.9rem;
		letter-spacing: 0.02em;
	}

	/* Mobile: stack instead of side-by-side */
	@media (max-width: 720px) {
		.cook {
			height: auto;
			overflow: visible;
		}

		.cook-grid {
			grid-template-columns: 1fr;
			overflow: visible;
			flex: none;
		}

		.cook-grid > section {
			overflow-y: visible;
		}
	}
</style>
