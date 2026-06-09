import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { listRecipeCards } from '$lib/server/recipes';
import { encodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

export const load: PageServerLoad = () => {
	const cards = listRecipeCards(db, 'created').map((c) => ({
		eid: encodeId(c.id),
		title: c.title,
		favorite: c.favorite,
		want_to_cook: c.want_to_cook,
		thumb: c.thumb ? imageUrl(c.thumb) : null
	}));
	return { cards };
};
