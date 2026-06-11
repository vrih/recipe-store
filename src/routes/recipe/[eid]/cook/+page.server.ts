import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { getRecipe } from '$lib/server/recipes';
import { parseIngredients, parseInstructions } from '$lib/server/parse';
import { renderInline, renderMarkdown } from '$lib/server/markdown';
import { getProgress } from '$lib/server/progress';
import { listFavorites } from '$lib/server/timerFavorites';
import { decodeId } from '$lib/ids';

export const load: PageServerLoad = ({ params }) => {
	let id: string;
	try {
		id = decodeId(params.eid);
	} catch {
		throw error(404, 'Recipe not found');
	}

	const recipe = getRecipe(db, id);
	if (!recipe) throw error(404, 'Recipe not found');

	return {
		eid: params.eid,
		title: recipe.title,
		yield: recipe.yield,
		totalTime: recipe.total_time,
		baseServings: (() => { const m = recipe.yield?.match(/\d+/); return m ? parseInt(m[0], 10) : null; })(),
		ingredients: parseIngredients(recipe.ingredients).map((i) => ({
			type: i.type,
			key: i.key,
			text: i.text,
			html: i.type === 'item' ? renderInline(i.text) : i.text
		})),
		steps: parseInstructions(recipe.instructions).map((s) => ({
			type: s.type,
			key: s.key,
			text: s.text,
			html: s.type === 'step' ? renderMarkdown(s.text) : ''
		})),
		done: getProgress(db, id),
		favorites: listFavorites(db)
	};
};
