import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import db from '$lib/server/db';
import { createRecipe, recipeInputFromForm } from '$lib/server/edit';
import { encodeId } from '$lib/ids';

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const input = recipeInputFromForm(form);
		if (!input.title) {
			return fail(400, { message: 'Title is required', values: input });
		}
		const id = createRecipe(db, input);
		// Redirect to the editor so images can be added to the new recipe.
		throw redirect(303, `/recipe/${encodeId(id)}/edit?created=1`);
	}
};
