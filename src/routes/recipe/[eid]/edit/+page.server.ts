import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import db from '$lib/server/db';
import { getRecipe, getRecipeImages, getRecipeTags } from '$lib/server/recipes';
import {
	updateRecipe,
	deleteRecipe,
	recipeInputFromForm,
	ConflictError,
	NotFoundError
} from '$lib/server/edit';
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
	}
};
