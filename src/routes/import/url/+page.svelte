<script lang="ts">
	import { enhance } from '$app/forms';
	import RecipeForm from '$lib/components/RecipeForm.svelte';
	import RecipeCompare from '$lib/components/RecipeCompare.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let url = $state('');
	let fetching = $state(false);
	let pasting = $state(false);
	let showPaste = $state(false);

	// When a fetch succeeds, `form.fetched` carries the pre-filled values.
	const fetched = $derived(form && 'fetched' in form && form.fetched ? form : null);
	const blocked = $derived(form && 'blocked' in form && form.blocked);

	// Open the paste fallback automatically when the site blocked our fetch.
	$effect(() => {
		if (blocked) showPaste = true;
	});

	// Which version (original vs Claude-cleaned) is currently used to seed the editable form.
	let versionChoice = $state<'original' | 'cleaned'>('original');
	$effect(() => {
		if (fetched) versionChoice = fetched.cleaned ? 'cleaned' : 'original';
	});

	// Which candidate images the user wants imported (hero image pre-selected).
	let selectedImages = $state<string[]>([]);
	$effect(() => {
		selectedImages = fetched && fetched.imageUrls.length > 0 ? [fetched.imageUrls[0]] : [];
	});

	function toggleImage(imgUrl: string, checked: boolean) {
		selectedImages = checked
			? [...selectedImages, imgUrl]
			: selectedImages.filter((u) => u !== imgUrl);
	}
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
	<p class="paste-toggle">
		<button type="button" class="linklike" onclick={() => (showPaste = !showPaste)}>
			{showPaste ? 'Hide' : 'Some sites block automated access — paste the page source instead'}
		</button>
	</p>
</form>

{#if form && 'message' in form && form.message && !fetched}
	<div class="notice" class:warn={blocked || (form && 'noStructuredData' in form)}>
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

{#if showPaste && !fetched}
	<form
		class="paste"
		method="POST"
		action="?/paste"
		use:enhance={() => {
			pasting = true;
			return async ({ update }) => {
				await update();
				pasting = false;
			};
		}}
	>
		<label>
			<span>Paste page source</span>
			<small>
				Open the recipe in your browser, view the page source (⌘/Ctrl+U), select all
				(⌘/Ctrl+A), copy, and paste it here. We'll read the recipe data out of it — no
				request to the site is made.
			</small>
			<textarea name="html" rows="6" placeholder="<!doctype html> …"></textarea>
		</label>
		<input type="hidden" name="url" value={url || (form && 'url' in form ? form.url : '')} />
		<button type="submit" disabled={pasting}>{pasting ? 'Extracting…' : 'Extract from pasted source'}</button>
	</form>
{/if}

{#if fetched}
	<div class="review">
		<p class="method">
			Extracted via <strong>{fetched.method === 'claude' ? 'Claude' : 'structured data'}</strong>.
			Review and edit before saving.
		</p>

		{#if fetched.cleaned}
			<h2 class="section-title">Claude cleanup</h2>
			<p class="hint">Compare the original extraction with a Claude-tidied version, and pick which one to start editing from.</p>
			<RecipeCompare
				leftLabel="Original"
				rightLabel="Claude cleaned up"
				left={fetched.values}
				right={fetched.cleaned.values}
				active={versionChoice === 'cleaned' ? 'right' : 'left'}
				onChoose={(side) => (versionChoice = side === 'right' ? 'cleaned' : 'original')}
			/>
		{/if}

		<form method="POST" action="?/create">
			{#if fetched.imageUrls.length > 0}
				<fieldset class="images-pick">
					<legend>Images to import</legend>
					<div class="image-candidates">
						{#each fetched.imageUrls as imgUrl (imgUrl)}
							<label class="candidate">
								<input
									type="checkbox"
									name="selectedImages"
									value={imgUrl}
									checked={selectedImages.includes(imgUrl)}
									onchange={(e) => toggleImage(imgUrl, e.currentTarget.checked)}
								/>
								<img src={imgUrl} alt="" loading="lazy" />
							</label>
						{/each}
					</div>
					<p class="hint">Selected images will be downloaded and attached on save.</p>
				</fieldset>
			{/if}
			{#key versionChoice}
				<RecipeForm
					recipe={versionChoice === 'cleaned' && fetched.cleaned ? fetched.cleaned.values : fetched.values}
					tags={fetched.tags}
				/>
			{/key}
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
	.paste-toggle {
		max-width: 600px;
		margin: 0.5rem 0 0;
	}
	.linklike {
		background: none;
		border: none;
		padding: 0;
		color: #57534e;
		font: inherit;
		font-size: 0.85rem;
		text-decoration: underline;
		cursor: pointer;
	}
	.paste {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		align-items: flex-start;
		max-width: 600px;
		margin-top: 1rem;
	}
	.paste label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
	}
	.paste span {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.paste small {
		color: #78716c;
		line-height: 1.4;
	}
	.paste textarea {
		font: inherit;
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		width: 100%;
		resize: vertical;
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
	.section-title {
		margin: 1.5rem 0 0.25rem;
		font-size: 1.05rem;
	}
	.images-pick {
		border: 1px solid #e7e5e4;
		border-radius: 10px;
		padding: 0.85rem 1rem;
		margin: 0 0 1.25rem;
		max-width: 760px;
	}
	.images-pick legend {
		font-size: 0.85rem;
		font-weight: 600;
		color: #44403c;
		padding: 0 0.3rem;
	}
	.image-candidates {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.candidate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
	}
	.candidate img {
		width: 120px;
		height: 90px;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid #e7e5e4;
	}
</style>
