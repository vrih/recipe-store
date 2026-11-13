import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import db from '$lib/server/db';
import { getRecipe, getRecipeImages, getRecipeTags, listTags } from '$lib/server/recipes';
import {
	updateRecipe,
	deleteRecipe,
	recipeInputFromForm,
	ConflictError,
	NotFoundError
} from '$lib/server/edit';
import { cleanupRecipe, claudeAvailable, pickCleanupFields, suggestTags } from '$lib/server/claude';
import { decodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

function resolveId(eid: string): string {
	try {
		return decodeId(eid);
	} catch {
		throw error(404, 'Recipe not found');
	}
}

export const load: PageServerLoad = ({ params }) => {
	const id = resolveId(params.eid);
	const recipe = getRecipe(db, id);
	if (!recipe) throw error(404, 'Recipe not found');

	return {
		eid: params.eid,
		claudeAvailable: claudeAvailable(),
		recipe: {
			title: recipe.title,
			text: recipe.text,
			yield: recipe.yield,
			prepTime: recipe.prep_time,
			cookTime: recipe.cook_time,
			totalTime: recipe.total_time,
			ingredients: recipe.ingredients,
			instructions: recipe.instructions,
			notes: recipe.notes,
			nutrition: recipe.nutrition,
			link: recipe.link,
			favorite: !!recipe.favorite,
			wantToCook: !!recipe.want_to_cook,
			version: recipe.version
		},
		tags: getRecipeTags(db, id).join(', '),
		images: getRecipeImages(db, id).map((p, position) => ({
			position,
			url: imageUrl(p)
		}))
	};
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		const id = resolveId(params.eid);
		const form = await request.formData();
		const input = recipeInputFromForm(form);
		const expectedVersion = Number(form.get('version'));

		if (!input.title) return fail(400, { message: 'Title is required' });

		try {
			const version = updateRecipe(db, id, expectedVersion, input);
			return { saved: true, version };
		} catch (err) {
			if (err instanceof ConflictError) {
				return fail(409, {
					message:
						'This recipe was changed elsewhere since you opened it. Reload to see the latest version before saving again.',
					currentVersion: err.currentVersion
				});
			}
			if (err instanceof NotFoundError) return fail(404, { message: 'Recipe not found' });
			throw err;
		}
	},

	delete: async ({ params }) => {
		const id = resolveId(params.eid);
		deleteRecipe(db, id);
		throw redirect(303, '/');
	},

	// Ask Claude to tidy up the currently-entered text fields (no DB write).
	cleanup: async ({ request }) => {
		if (!claudeAvailable()) return fail(422, { message: 'Claude is not configured.' });

		const form = await request.formData();
		const input = recipeInputFromForm(form);

		try {
			const cleaned = await cleanupRecipe(pickCleanupFields(input));
			return { cleanupResult: true as const, original: pickCleanupFields(input), cleaned };
		} catch (err) {
			return fail(502, { message: err instanceof Error ? err.message : 'Claude cleanup failed.' });
		}
	},

	// Ask Claude to suggest tags for the currently-entered fields (no DB write).
	suggestTags: async ({ request }) => {
		if (!claudeAvailable()) return fail(422, { message: 'Claude is not configured.' });

		const form = await request.formData();
		const input = recipeInputFromForm(form);

		try {
			const suggestions = await suggestTags(
				pickCleanupFields(input),
				listTags(db).map((t) => t.name),
				input.tags
			);
			return { tagSuggestions: suggestions };
		} catch (err) {
			return fail(502, { message: err instanceof Error ? err.message : 'Tag suggestion failed.' });
		}
	}
};
