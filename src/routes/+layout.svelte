<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	// Cooking mode is distraction-free: hide global navigation/chrome (FR-COOK-1).
	const chrome = $derived(!page.url.pathname.endsWith('/cook'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if chrome}
	<nav>
		<a href="/" class="brand">Recipe Store</a>
		<a href="/recipe/new">New</a>
		<a href="/import">Import</a>
		<a href="/settings">Settings</a>
	</nav>
{/if}

<main class:bare={!chrome}>
	{@render children()}
</main>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background: #fafaf9;
		color: #1c1917;
	}

	nav {
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid #e7e5e4;
		background: #fff;
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.brand {
		font-weight: 700;
		font-size: 1.1rem;
		letter-spacing: -0.01em;
	}

	nav a {
		text-decoration: none;
		color: inherit;
	}

	nav a:not(.brand) {
		color: #57534e;
		font-size: 0.95rem;
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	main.bare {
		max-width: none;
	}

	/* Larger touch targets for phones and kitchen tablets. */
	@media (max-width: 820px) {
		nav a:not(.brand) {
			padding: 0.35rem 0;
		}

		:global(button),
		:global(.chip),
		:global(input[type='text']),
		:global(input[type='url']),
		:global(input[type='search']) {
			min-height: 44px;
		}
	}
</style>
