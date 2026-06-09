<script lang="ts">
	interface ImportSummary {
		added: number;
		updated: number;
		skipped: number;
		failed: number;
		failures: { source: string; error: string }[];
	}

	let files = $state<FileList | null>(null);
	let conflict = $state<'skip' | 'overwrite'>('skip');
	let busy = $state(false);
	let summary = $state<ImportSummary | null>(null);
	let errorMsg = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!files || files.length === 0) return;

		busy = true;
		summary = null;
		errorMsg = null;

		const body = new FormData();
		for (const file of Array.from(files)) body.append('files', file);
		body.append('conflict', conflict);

		try {
			const res = await fetch('/api/import', { method: 'POST', body });
			if (!res.ok) {
				errorMsg = (await res.text()) || `Import failed (${res.status})`;
			} else {
				summary = await res.json();
			}
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Network error';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Import recipes</title>
</svelte:head>

<h1>Import recipes</h1>
<p>Upload one or more <code>.melarecipe</code> or <code>.melarecipes</code> files exported from Mela.</p>
<p class="url-link">Or <a href="/import/url">import from a recipe URL →</a></p>

<form onsubmit={submit}>
	<label class="file">
		<input
			type="file"
			multiple
			accept=".melarecipe,.melarecipes,.zip,application/json"
			onchange={(e) => (files = e.currentTarget.files)}
		/>
	</label>

	<fieldset>
		<legend>If a recipe already exists</legend>
		<label><input type="radio" bind:group={conflict} value="skip" /> Skip it</label>
		<label><input type="radio" bind:group={conflict} value="overwrite" /> Overwrite it</label>
	</fieldset>

	<button type="submit" disabled={busy || !files || files.length === 0}>
		{busy ? 'Importing…' : 'Import'}
	</button>
</form>

{#if errorMsg}
	<p class="error">{errorMsg}</p>
{/if}

{#if summary}
	<div class="summary">
		<h2>Import complete</h2>
		<ul>
			<li><strong>{summary.added}</strong> added</li>
			<li><strong>{summary.updated}</strong> updated</li>
			<li><strong>{summary.skipped}</strong> skipped</li>
			<li><strong>{summary.failed}</strong> failed</li>
		</ul>
		{#if summary.failures.length > 0}
			<details>
				<summary>{summary.failures.length} failure(s)</summary>
				<ul class="failures">
					{#each summary.failures as f (f.source)}
						<li><code>{f.source}</code>: {f.error}</li>
					{/each}
				</ul>
			</details>
		{/if}
		<p><a href="/">Back to recipes</a></p>
	</div>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: flex-start;
		max-width: 480px;
		margin-top: 1.5rem;
	}

	fieldset {
		border: 1px solid #e7e5e4;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		display: flex;
		gap: 1.5rem;
	}

	legend {
		padding: 0 0.4rem;
		color: #57534e;
		font-size: 0.85rem;
	}

	button {
		padding: 0.6rem 1.4rem;
		font-size: 1rem;
		border: none;
		border-radius: 8px;
		background: #1c1917;
		color: #fff;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.error {
		color: #b91c1c;
	}

	.summary {
		margin-top: 1.5rem;
		padding: 1rem 1.25rem;
		border: 1px solid #e7e5e4;
		border-radius: 10px;
		background: #fff;
		max-width: 480px;
	}

	.summary ul {
		list-style: none;
		padding: 0;
		display: flex;
		gap: 1.25rem;
		flex-wrap: wrap;
	}

	.failures {
		display: block;
		font-size: 0.85rem;
	}

	.failures code {
		color: #57534e;
	}
</style>
