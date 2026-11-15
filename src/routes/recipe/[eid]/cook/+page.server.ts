import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { getRecipe } from '$lib/server/recipes';
import { parseIngredients, parseInstructions } from '$lib/server/parse';
import { renderInline, renderMarkdown } from '$lib/server/markdown';
import { getProgress } from '$lib/server/progress';
import { listFavorites } from '$lib/server/timerFavorites';
import { getPlaylist } from '$lib/server/playlists';
import { decodeId, encodeId } from '$lib/ids';

export const load: PageServerLoad = ({ params, url }) => {
	let id: string;
	try {
		id = decodeId(params.eid);
	} catch {
		throw error(404, 'Recipe not found');
	}

	const recipe = getRecipe(db, id);
	if (!recipe) throw error(404, 'Recipe not found');

	// Optional playlist context: ?playlist=<id> adds a switcher across its recipes.
	const pid = Number(url.searchParams.get('playlist'));
	const pl = Number.isInteger(pid) && pid > 0 ? getPlaylist(db, pid) : null;
	const playlist =
		pl && pl.recipes.some((r) => r.id === id)
			? { id: pl.id, name: pl.name, recipes: pl.recipes.map((r) => ({ eid: encodeId(r.id), title: r.title })) }
			: null;

	return {
		playlist,
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
