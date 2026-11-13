<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import RecipeForm from '$lib/components/RecipeForm.svelte';
	import RecipeCompare from '$lib/components/RecipeCompare.svelte';
	import type { PageData, ActionData } from './$types';

	interface CleanupFields {
		title: string;
		text: string;
		yield: string;
		prepTime: string;
		cookTime: string;
		totalTime: string;
		ingredients: string;
		instructions: string;
		notes: string;
		nutrition: string;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// data.images is the single source of truth; refreshed via invalidateAll().
	let images = $derived(data.images);
	const imagesEndpoint = $derived(`/api/recipes/${data.eid}/images`);

	let dirty = $state(false);
	let saving = $state(false);
	let uploading = $state(false);
	const justCreated = page.url.searchParams.get('created') === '1';

	// Editable field values live here so a Claude cleanup can replace them
	// wholesale; bumping formVersion forces RecipeForm to remount with the
	// new values (its inputs are otherwise uncontrolled).
	let currentRecipeValues = $state(untrack(() => ({ ...data.recipe })));
	let currentTags = $state(untrack(() => data.tags));
	let formVersion = $state(0);

	let cleaningUp = $state(false);
	let suggesting = $state(false);
	let suggestions = $state<{ existing: string[]; new: string[] } | null>(null);

	function splitTags(csv: string): string[] {
		return csv.split(',').map((t) => t.trim()).filter(Boolean);
	}

	function addTag(tag: string) {
		const tags = splitTags(currentTags);
		if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
		currentTags = tags.join(', ');
		dirty = true;
		if (suggestions) {
			suggestions = {
				existing: suggestions.existing.filter((t) => t !== tag),
				new: suggestions.new.filter((t) => t !== tag)
			};
		}
	}
	let compare = $state<{ original: CleanupFields; cleaned: CleanupFields } | null>(null);

	function chooseVersion(side: 'left' | 'right') {
		if (side === 'right' && compare) {
			currentRecipeValues = { ...currentRecipeValues, ...compare.cleaned };
			formVersion++;
			dirty = true;
		}
		compare = null;
	}

	// Warn before leaving with unsaved text changes (FR-EDIT-5).
	beforeNavigate((nav) => {
		if (dirty && !saving) {
			if (!confirm('You have unsaved changes. Leave without saving?')) {
				nav.cancel();
			}
		}
	});

	$effect(() => {
		function onBeforeUnload(e: BeforeUnloadEvent) {
			if (dirty && !saving) {
				e.preventDefault();
				e.returnValue = '';
			}
		}
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	async function uploadImages(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		uploading = true;
		try {
			const body = new FormData();
			for (const f of Array.from(input.files)) body.append('files', f);
			const res = await fetch(imagesEndpoint, { method: 'POST', body });
			if (res.ok) await invalidateAll();
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	async function deleteImage(position: number) {
		const res = await fetch(imagesEndpoint, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ position })
		});
		if (res.ok) await invalidateAll();
	}

	async function reorder(order: number[]) {
		const res = await fetch(imagesEndpoint, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ order })
		});
		if (res.ok) await invalidateAll();
	}

	function move(position: number, delta: number) {
		const order = images.map((i) => i.position);
		const idx = order.indexOf(position);
		const target = idx + delta;
		if (target < 0 || target >= order.length) return;
		[order[idx], order[target]] = [order[target], order[idx]];
		reorder(order);
	}

	function makePrimary(position: number) {
		const order = images.map((i) => i.position).filter((p) => p !== position);
		reorder([position, ...order]);
	}
</script>

<svelte:head>
	<title>Editing {data.recipe.title || 'recipe'}</title>
</svelte:head>

<p class="back"><a href="/recipe/{data.eid}">← Back to recipe</a></p>
<h1>Edit recipe</h1>

{#if justCreated}
	<p class="notice">Recipe created. Add images and fine-tune the details below.</p>
{/if}
{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<form
	method="POST"
	action="?/save"
	oninput={() => (dirty = true)}
	use:enhance={(submit) => {
		const isCleanup = submit.action.search.includes('cleanup');
		const isSuggest = submit.action.search.includes('suggestTags');
		if (isSuggest) {
			suggesting = true;
			suggestions = null;
		} else if (isCleanup) cleaningUp = true;
		else saving = true;
		return async ({ result, update }) => {
			if (isSuggest) {
				suggesting = false;
				if (result.type === 'success' && result.data && 'tagSuggestions' in result.data) {
					suggestions = result.data.tagSuggestions as { existing: string[]; new: string[] };
				} else {
					await update({ reset: false });
				}
				return;
			}
			if (isCleanup) {
				cleaningUp = false;
				if (result.type === 'success' && result.data && 'cleanupResult' in result.data) {
					compare = {
						original: result.data.original as CleanupFields,
						cleaned: result.data.cleaned as CleanupFields
					};
				} else {
					await update();
				}
				return;
			}
			saving = false;
			if (result.type === 'success') {
				dirty = false;
				await goto(`/recipe/${data.eid}`);
			} else {
				await update();
			}
		};
	}}
>
	<input type="hidden" name="version" value={data.recipe.version} />
	{#key formVersion}
		<RecipeForm recipe={currentRecipeValues} bind:tags={currentTags} />
	{/key}

	<div class="actions">
		<button type="submit" disabled={saving || cleaningUp}>{saving ? 'Saving…' : 'Save changes'}</button>
		{#if data.claudeAvailable}
			<button type="submit" formaction="?/cleanup" class="secondary" disabled={saving || cleaningUp}>
				{cleaningUp ? 'Asking Claude…' : 'Clean up with Claude'}
			</button>
		{/if}
		<a href="/recipe/{data.eid}">Cancel</a>
	</div>
	{#if data.claudeAvailable}
		<div class="suggest">
			<button type="submit" formaction="?/suggestTags" class="secondary" disabled={saving || cleaningUp || suggesting}>
				{suggesting ? 'Thinking…' : 'Suggest tags'}
			</button>
			{#if suggestions}
				{#if suggestions.existing.length === 0 && suggestions.new.length === 0}
					<span class="hint">No further tags to suggest.</span>
				{/if}
				{#each suggestions.existing as tag (tag)}
					<button type="button" class="chip" onclick={() => addTag(tag)}>+ {tag}</button>
				{/each}
				{#each suggestions.new as tag (tag)}
					<button type="button" class="chip new" onclick={() => addTag(tag)} title="Creates a new tag">+ {tag} <em>new</em></button>
				{/each}
			{/if}
		</div>
	{/if}
</form>

{#if compare}
	<section class="cleanup-compare">
		<h2 class="section-title">Claude cleanup</h2>
		<p class="hint">Compare your current text with a Claude-tidied version, and pick which one to use.</p>
		<RecipeCompare
			leftLabel="Current"
			rightLabel="Claude cleaned up"
			left={compare.original}
			right={compare.cleaned}
			onChoose={chooseVersion}
		/>
	</section>
{/if}

<section class="images-section">
	<h2>Images</h2>
	{#if images.length > 0}
		<ul class="image-list">
			{#each images as img (img.url)}
				<li>
					<img src={img.url} alt="" />
					{#if img.position === 0}<span class="primary-badge">Primary</span>{/if}
					<div class="img-controls">
						<button type="button" onclick={() => move(img.position, -1)} disabled={img.position === 0} title="Move up">↑</button>
						<button type="button" onclick={() => move(img.position, 1)} disabled={img.position === images.length - 1} title="Move down">↓</button>
						{#if img.position !== 0}
							<button type="button" onclick={() => makePrimary(img.position)}>Make primary</button>
						{/if}
						<button type="button" class="danger" onclick={() => deleteImage(img.position)}>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">No images yet.</p>
	{/if}

	<label class="upload">
		<span>{uploading ? 'Uploading…' : 'Add images'}</span>
		<input type="file" accept="image/*" multiple onchange={uploadImages} disabled={uploading} />
	</label>
</section>

<section class="danger-zone">
	<form
		method="POST"
		action="?/delete"
		use:enhance={() => {
			dirty = false;
			return async ({ update }) => update();
		}}
		onsubmit={(e) => {
			if (!confirm('Delete this recipe permanently? This cannot be undone.')) e.preventDefault();
		}}
	>
		<button type="submit" class="danger">Delete recipe</button>
	</form>
</section>

<style>
	.back a {
		color: #57534e;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.notice {
		background: #ecfdf5;
		border: 1px solid #a7f3d0;
		color: #065f46;
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.25rem;
	}
	button {
		padding: 0.55rem 1.2rem;
		font-size: 0.95rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		background: #fff;
		cursor: pointer;
	}
	.actions button[type='submit'] {
		background: #1c1917;
		color: #fff;
		border: none;
	}
	.actions button[type='submit'].secondary {
		background: #fff;
		color: #1c1917;
		border: 1px solid #d6d3d1;
	}
	.suggest {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.suggest .chip {
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
		font-size: 0.85rem;
	}
	.suggest .chip.new {
		border-style: dashed;
	}
	.suggest .chip em {
		font-size: 0.7rem;
		color: #78716c;
	}
	button.danger {
		color: #b91c1c;
		border-color: #fecaca;
	}
	.images-section,
	.danger-zone,
	.cleanup-compare {
		max-width: 760px;
		margin-top: 2rem;
	}
	.cleanup-compare .section-title {
		margin: 0 0 0.25rem;
		font-size: 1.05rem;
	}
	.image-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.image-list li {
		position: relative;
		width: 180px;
	}
	.image-list img {
		width: 180px;
		height: 135px;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid #e7e5e4;
	}
	.primary-badge {
		position: absolute;
		top: 0.3rem;
		left: 0.3rem;
		background: #1c1917;
		color: #fff;
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}
	.img-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.35rem;
	}
	.img-controls button {
		padding: 0.2rem 0.5rem;
		font-size: 0.8rem;
	}
	.upload {
		display: inline-flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 1rem;
	}
	.upload span {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.danger-zone {
		border-top: 1px solid #f0efed;
		padding-top: 1.5rem;
	}
</style>
