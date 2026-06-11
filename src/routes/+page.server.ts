import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import db from '$lib/server/db';
import { searchRecipeCards, listTags, setFavorite, type SortKey } from '$lib/server/recipes';
import { encodeId, decodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

const SORTS: SortKey[] = ['created', 'updated', 'title'];

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const activeTags = url.searchParams.getAll('tag');
	const favorite = url.searchParams.get('fav') === '1';
	const wantToCook = url.searchParams.get('want') === '1';
	const sortParam = url.searchParams.get('sort');
	const sort: SortKey = SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'created';

	const cards = searchRecipeCards(db, { q, tags: activeTags, favorite, wantToCook, sort }).map(
		(c) => ({
			eid: encodeId(c.id),
			title: c.title,
			favorite: c.favorite,
			want_to_cook: c.want_to_cook,
			thumb: c.thumb ? imageUrl(c.thumb) : null
		})
	);

	return {
		cards,
		tags: listTags(db),
		filters: { q, activeTags, favorite, wantToCook, sort }
	};
};

export const actions: Actions = {
	toggleFavorite: async ({ request }) => {
		const form = await request.formData();
		const eid = form.get('eid') as string;
		const favorite = form.get('favorite') === 'true';
		let id: string;
		try {
			id = decodeId(eid);
		} catch {
			return fail(404, { message: 'Recipe not found' });
		}
		const result = setFavorite(db, id, favorite);
		if (result === null) return fail(404, { message: 'Recipe not found' });
		return { eid, favorite: result };
	}
};
