<svelte:head>
	<title>Offline · Recipe Store</title>
</svelte:head>

<div class="offline">
	<h1>You're offline</h1>
	<p>Recipe Store needs a connection to load recipes from the kitchen library.</p>
	<p>Any timers you started are still running on this device.</p>
	<button type="button" onclick={() => location.reload()}>Try again</button>
</div>

<style>
	.offline {
		max-width: 30rem;
		margin: 4rem auto;
		text-align: center;
		padding: 0 1.5rem;
	}

	h1 {
		font-size: 1.6rem;
	}

	p {
		color: #57534e;
		line-height: 1.6;
	}

	button {
		margin-top: 1rem;
		font: inherit;
		padding: 0.6rem 1.4rem;
		border: 1px solid #d6d3d1;
		border-radius: 10px;
		background: #fff;
		cursor: pointer;
	}
</style>
