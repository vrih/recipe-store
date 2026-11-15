import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { getPlaylist } from '$lib/server/playlists';
import { searchRecipeCards } from '$lib/server/recipes';
import { encodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

export const load: PageServerLoad = ({ params, url }) => {
	const id = Number(params.id);
	const playlist = Number.isInteger(id) ? getPlaylist(db, id) : null;
	if (!playlist) throw error(404, 'Playlist not found');

	const q = url.searchParams.get('q')?.trim() ?? '';
	const inList = new Set(playlist.recipes.map((r) => r.id));
	const results = q
		? searchRecipeCards(db, { q, limit: 12 })
				.filter((r) => !inList.has(r.id))
				.map((r) => ({ eid: encodeId(r.id), title: r.title }))
		: [];

	return {
		id: playlist.id,
		name: playlist.name,
		q,
		results,
		recipes: playlist.recipes.map((r) => ({
			eid: encodeId(r.id),
			title: r.title,
			thumb: r.thumb ? imageUrl(r.thumb) : null
		}))
	};
};
