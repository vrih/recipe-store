<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const chrome = $derived(!page.url.pathname.endsWith('/cook'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if chrome}
	<nav>
		<a href="/" class="brand">Hearth</a>
		<div class="nav-links">
			<a href="/recipe/new">New</a>
			<a href="/import">Import</a>
			<a href="/settings">Settings</a>
		</div>
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
		font-family: 'Hanken Grotesk', system-ui, -apple-system, sans-serif;
		-webkit-font-smoothing: antialiased;
		background: #f6f1e9;
		color: #2b2723;
	}

	:global(::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}
	:global(::-webkit-scrollbar-thumb) {
		background: #d9cdba;
		border-radius: 99px;
		border: 2px solid transparent;
		background-clip: padding-box;
	}

	nav {
		padding: 0 1.75rem;
		height: 60px;
		border-bottom: 1px solid #e9e1d4;
		background: rgba(246, 241, 233, 0.9);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}

	.brand {
		font-weight: 800;
		font-size: 1.2rem;
		letter-spacing: -0.03em;
		text-decoration: none;
		color: #2b2723;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	nav a:not(.brand) {
		text-decoration: none;
		color: #6e665c;
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0.4rem 0.75rem;
		border-radius: 8px;
		transition: background 0.12s ease, color 0.12s ease;
	}

	nav a:not(.brand):hover {
		background: #ede4d6;
		color: #2b2723;
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	main.bare {
		max-width: none;
		padding: 0;
	}

	@media (max-width: 820px) {
		nav {
			padding: 0 1rem;
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
