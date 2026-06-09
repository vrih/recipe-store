<script lang="ts">
	interface RecipeValues {
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
		link: string;
		favorite: boolean;
		wantToCook: boolean;
	}

	let { recipe, tags = '' }: { recipe: RecipeValues; tags?: string } = $props();
</script>

<div class="fields">
	<label class="full">
		<span>Title</span>
		<input name="title" type="text" value={recipe.title} required />
	</label>

	<label class="full">
		<span>Overview</span>
		<textarea name="text" rows="2">{recipe.text}</textarea>
	</label>

	<label>
		<span>Yield</span>
		<input name="yield" type="text" value={recipe.yield} />
	</label>
	<label>
		<span>Prep time</span>
		<input name="prepTime" type="text" value={recipe.prepTime} />
	</label>
	<label>
		<span>Cook time</span>
		<input name="cookTime" type="text" value={recipe.cookTime} />
	</label>
	<label>
		<span>Total time</span>
		<input name="totalTime" type="text" value={recipe.totalTime} />
	</label>

	<label class="full">
		<span>Ingredients <em>(one per line; start a line with # for a section header)</em></span>
		<textarea name="ingredients" rows="8">{recipe.ingredients}</textarea>
	</label>

	<label class="full">
		<span>Instructions <em>(markdown; blank line between steps)</em></span>
		<textarea name="instructions" rows="8">{recipe.instructions}</textarea>
	</label>

	<label class="full">
		<span>Notes <em>(markdown)</em></span>
		<textarea name="notes" rows="3">{recipe.notes}</textarea>
	</label>

	<label class="full">
		<span>Nutrition <em>(markdown)</em></span>
		<textarea name="nutrition" rows="3">{recipe.nutrition}</textarea>
	</label>

	<label class="full">
		<span>Tags <em>(comma-separated)</em></span>
		<input name="tags" type="text" value={tags} />
	</label>

	<label class="full">
		<span>Source link</span>
		<input name="link" type="url" value={recipe.link} placeholder="https://…" />
	</label>

	<div class="flags">
		<label class="inline">
			<input name="favorite" type="checkbox" checked={recipe.favorite} /> Favourite
		</label>
		<label class="inline">
			<input name="wantToCook" type="checkbox" checked={recipe.wantToCook} /> Want to cook
		</label>
	</div>
</div>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		max-width: 760px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	label.full {
		grid-column: 1 / -1;
	}

	label span {
		font-size: 0.85rem;
		font-weight: 600;
		color: #44403c;
	}

	label span em {
		font-weight: 400;
		color: #a8a29e;
	}

	input[type='text'],
	input[type='url'],
	textarea {
		font: inherit;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		background: #fff;
		width: 100%;
	}

	textarea {
		resize: vertical;
		line-height: 1.5;
	}

	.flags {
		grid-column: 1 / -1;
		display: flex;
		gap: 1.5rem;
	}

	label.inline {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}

	@media (max-width: 600px) {
		.fields {
			grid-template-columns: 1fr;
		}
	}
</style>
