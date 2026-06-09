import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import db from '$lib/server/db';
import { getRecipe, getRecipeImages, getRecipeTags, setFavorite } from '$lib/server/recipes';
import { renderMarkdown, renderInline } from '$lib/server/markdown';
import { parseIngredients, parseInstructions } from '$lib/server/parse';
import { decodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

export const load: PageServerLoad = ({ params }) => {
	let id: string;
	try {
		id = decodeId(params.eid);
	} catch {
		throw error(404, 'Recipe not found');
	}

	const recipe = getRecipe(db, id);
	if (!recipe) throw error(404, 'Recipe not found');

	const images = getRecipeImages(db, id).map(imageUrl);
	const tags = getRecipeTags(db, id);

	return {
		id,
		title: recipe.title,
		images,
		tags,
		yield: recipe.yield,
		prepTime: recipe.prep_time,
		cookTime: recipe.cook_time,
		totalTime: recipe.total_time,
		link: recipe.link,
		favorite: !!recipe.favorite,
		wantToCook: !!recipe.want_to_cook,
		textHtml: renderMarkdown(recipe.text),
		ingredients: parseIngredients(recipe.ingredients).map((i) => ({
			type: i.type,
			key: i.key,
			html: i.type === 'item' ? renderInline(i.text) : i.text
		})),
		steps: parseInstructions(recipe.instructions).map((s) => ({
			type: s.type,
			key: s.key,
			text: s.text,
			html: s.type === 'step' ? renderMarkdown(s.text) : ''
		})),
		notesHtml: renderMarkdown(recipe.notes),
		nutritionHtml: renderMarkdown(recipe.nutrition)
	};
};

export const actions: Actions = {
	toggleFavorite: async ({ params, request }) => {
		let id: string;
		try {
			id = decodeId(params.eid);
		} catch {
			return fail(404, { message: 'Recipe not found' });
		}
		const form = await request.formData();
		const favorite = form.get('favorite') === 'true';
		const result = setFavorite(db, id, favorite);
		if (result === null) return fail(404, { message: 'Recipe not found' });
		return { favorite: result };
	}
};
