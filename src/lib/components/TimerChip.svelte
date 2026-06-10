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
		padding: 0.3rem 0.7rem;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		background: #fff7ed;
		color: #9a3412;
		cursor: pointer;
		line-height: 1.2;
	}

	.chip:hover {
		background: #ffedd5;
	}

	.chip:active {
		transform: translateY(1px);
	}
</style>
