<script lang="ts">
	import { enhance } from '$app/forms';
	import RecipeForm from '$lib/components/RecipeForm.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let url = $state('');
	let fetching = $state(false);

	// When a fetch succeeds, `form.fetched` carries the pre-filled values.
	const fetched = $derived(form && 'fetched' in form && form.fetched ? form : null);
</script>

<svelte:head>
	<title>Import from URL</title>
</svelte:head>

<p class="back"><a href="/import">← Import</a></p>
<h1>Import from a URL</h1>
<p class="lead">Paste a recipe URL. We'll read structured data from the page; if there isn't any, you can extract it with Claude{data.claudeAvailable ? '' : ' (not currently configured)'}.</p>

<form
	method="POST"
	action="?/fetch"
	use:enhance={() => {
		fetching = true;
		return async ({ update }) => {
			await update();
			fetching = false;
		};
	}}
>
	<div class="row">
		<input
			type="url"
			name="url"
			placeholder="https://example.com/recipe"
			bind:value={url}
			required
		/>
		<input type="hidden" name="method" value="auto" />
		<button type="submit" disabled={fetching}>{fetching ? 'Fetching…' : 'Fetch recipe'}</button>
	</div>
</form>

{#if form && 'message' in form && form.message}
	<div class="notice" class:warn={form && 'noStructuredData' in form}>
		<p>{form.message}</p>
		{#if form && 'noStructuredData' in form && form.noStructuredData && 'claudeAvailable' in form && form.claudeAvailable}
			<form
				method="POST"
				action="?/fetch"
				use:enhance={() => {
					fetching = true;
					return async ({ update }) => {
						await update();
						fetching = false;
					};
				}}
			>
				<input type="hidden" name="url" value={form.url} />
				<input type="hidden" name="method" value="claude" />
				<button type="submit" disabled={fetching}>{fetching ? 'Asking Claude…' : 'Extract with Claude'}</button>
			</form>
		{/if}
	</div>
{/if}

{#if fetched}
	<div class="review">
		<p class="method">
			Extracted via <strong>{fetched.method === 'claude' ? 'Claude' : 'structured data'}</strong>.
			Review and edit before saving.
		</p>
		<form method="POST" action="?/create">
			<input type="hidden" name="link" value={fetched.url} />
			<input type="hidden" name="imageUrl" value={fetched.imageUrl} />
			<RecipeForm recipe={fetched.values} tags={fetched.values.tags} />
			{#if fetched.imageUrl}
				<p class="hint">Lead image will be downloaded and attached on save.</p>
			{/if}
			<div class="actions">
				<button type="submit">Save recipe</button>
				<a href="/import/url">Start over</a>
			</div>
		</form>
	</div>
{/if}

<style>
	.back a {
		color: #57534e;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.lead {
		color: #57534e;
		max-width: 600px;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		max-width: 600px;
	}
	input[type='url'] {
		flex: 1;
		font: inherit;
		padding: 0.55rem 0.75rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
	}
	button {
		padding: 0.55rem 1.2rem;
		font-size: 0.95rem;
		border: none;
		border-radius: 8px;
		background: #1c1917;
		color: #fff;
		cursor: pointer;
		white-space: nowrap;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.notice {
		margin-top: 1rem;
		padding: 0.85rem 1rem;
		border-radius: 8px;
		background: #f5f5f4;
		border: 1px solid #e7e5e4;
		max-width: 600px;
	}
	.notice.warn {
		background: #fffbeb;
		border-color: #fde68a;
	}
	.notice p {
		margin: 0 0 0.5rem;
	}
	.review {
		margin-top: 1.5rem;
	}
	.method {
		color: #57534e;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.25rem;
	}
	.hint {
		color: #a8a29e;
		font-size: 0.9rem;
	}
</style>
