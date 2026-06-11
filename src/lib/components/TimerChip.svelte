<script lang="ts">
	import { timers } from '$lib/timerStore.svelte';
	import type { TimeMatch } from '$lib/times';

	let { match, stepKey, recipeEid }: { match: TimeMatch; stepKey: string; recipeEid: string } =
		$props();

	function start() {
		timers.start({ label: match.label, stepKey, recipeEid, seconds: match.seconds });
	}
</script>

<button type="button" class="chip" onclick={start} title="Start a {match.label} timer">
	<span aria-hidden="true">⏱</span>
	{match.label}
</button>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0.4rem 0.9rem;
		border: 1px solid #e7c4b6;
		border-radius: 999px;
		background: #fff;
		color: #c0644a;
		cursor: pointer;
		line-height: 1.2;
		white-space: nowrap;
	}

	.chip:hover {
		background: #f4e8e0;
	}

	.chip:active {
		transform: translateY(1px);
	}
</style>
