<script lang="ts">
	import RecipeForm from '$lib/components/RecipeForm.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const empty = {
		title: '',
		text: '',
		yield: '',
		prepTime: '',
		cookTime: '',
		totalTime: '',
		ingredients: '',
		instructions: '',
		notes: '',
		nutrition: '',
		link: '',
		favorite: false,
		wantToCook: false
	};
</script>

<svelte:head>
	<title>New recipe</title>
</svelte:head>

<p class="back"><a href="/">← All recipes</a></p>
<h1>New recipe</h1>

{#if form?.message}
	<p class="error">{form.message}</p>
{/if}

<form method="POST">
	<RecipeForm recipe={empty} />
	<div class="actions">
		<button type="submit">Create recipe</button>
		<a href="/">Cancel</a>
	</div>
	<p class="hint">You can add images after creating the recipe.</p>
</form>

<style>
	.back a {
		color: #57534e;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.error {
		color: #b91c1c;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.25rem;
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
	.hint {
		color: #a8a29e;
		font-size: 0.9rem;
	}
</style>
