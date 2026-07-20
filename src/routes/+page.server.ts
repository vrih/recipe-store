import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import db from '$lib/server/db';
import { searchRecipeCards, listTags, setFavorite, type SortKey } from '$lib/server/recipes';
import { encodeId, decodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

const SORTS: SortKey[] = ['created', 'updated', 'title'];

/** Recipes per page. A "Load more" link bumps `offset` by this amount. */
const PAGE_SIZE = 60;

/** Build the href for the next page: current query string with `offset` replaced. */
function withOffset(url: URL, offset: number): string {
	const next = new URL(url);
	next.searchParams.set('offset', String(offset));
	return next.pathname + '?' + next.searchParams.toString();
}

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const activeTags = url.searchParams.getAll('tag');
	const favorite = url.searchParams.get('fav') === '1';
	const wantToCook = url.searchParams.get('want') === '1';
	const sortParam = url.searchParams.get('sort');
	const sort: SortKey = SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'created';
	const offsetParam = Number(url.searchParams.get('offset'));
	const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0;

	// Fetch one extra row to detect whether another page exists, without a
	// separate COUNT(*) query.
	const rows = searchRecipeCards(db, {
		q,
		tags: activeTags,
		favorite,
		wantToCook,
		sort,
		limit: PAGE_SIZE + 1,
		offset
	});
	const hasMore = rows.length > PAGE_SIZE;
	const cards = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((c) => ({
		eid: encodeId(c.id),
		title: c.title,
		favorite: c.favorite,
		want_to_cook: c.want_to_cook,
		thumb: c.thumb ? imageUrl(c.thumb) : null
	}));

	return {
		cards,
		tags: listTags(db),
		filters: { q, activeTags, favorite, wantToCook, sort },
		hasMore,
		nextPageHref: hasMore ? withOffset(url, offset + PAGE_SIZE) : null,
		prevPageHref: offset > 0 ? withOffset(url, Math.max(0, offset - PAGE_SIZE)) : null
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
