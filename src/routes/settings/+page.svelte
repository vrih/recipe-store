<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);
	let message = $state<string | null>(null);

	async function backupNow() {
		busy = true;
		message = null;
		try {
			const res = await fetch('/api/backup', { method: 'POST' });
			if (res.ok) {
				const { created } = await res.json();
				message = `Backup created: ${created}`;
				await invalidateAll();
			} else {
				message = 'Backup failed.';
			}
		} catch {
			message = 'Backup failed.';
		} finally {
			busy = false;
		}
	}

	function fmtSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function fmtDate(ms: number): string {
		return new Date(ms).toLocaleString();
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<h1>Settings</h1>

<section>
	<h2>Backups</h2>
	<p class="lead">
		The database is backed up nightly (the {data.backups.length === 0 ? '' : 'most recent '}14 are
		kept). Backups live in the data volume, so DSM snapshots cover them too. You can also back up now.
	</p>

	<div class="actions">
		<button type="button" onclick={backupNow} disabled={busy}>
			{busy ? 'Backing up…' : 'Back up now'}
		</button>
		{#if message}<span class="msg">{message}</span>{/if}
	</div>

	{#if data.backups.length === 0}
		<p class="empty">No backups yet.</p>
	{:else}
		<table>
			<thead>
				<tr><th>Backup</th><th>Created</th><th>Size</th></tr>
			</thead>
			<tbody>
				{#each data.backups as b (b.name)}
					<tr>
						<td><code>{b.name}</code></td>
						<td>{fmtDate(b.createdAt)}</td>
						<td>{fmtSize(b.bytes)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.lead {
		color: #57534e;
		max-width: 640px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 1rem 0;
	}
	button {
		padding: 0.55rem 1.2rem;
		font-size: 0.95rem;
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
	.msg {
		color: #047857;
		font-size: 0.9rem;
	}
	.empty {
		color: #a8a29e;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		max-width: 640px;
		font-size: 0.9rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid #f0efed;
	}
	th {
		color: #78716c;
		font-weight: 600;
	}
	code {
		color: #44403c;
	}
</style>
