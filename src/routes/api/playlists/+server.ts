import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { listPlaylists, createPlaylist, addToPlaylist } from '$lib/server/playlists';
import { decodeId } from '$lib/ids';

export const GET: RequestHandler = () => json({ playlists: listPlaylists(db) });

/** Create a playlist. Body: { name: string, recipeEid?: string } (optionally seeded with a recipe). */
export const POST: RequestHandler = async ({ request }) => {
	const { name, recipeEid } = await request.json();
	const created = createPlaylist(db, typeof name === 'string' ? name : '');
	if (!created) throw error(400, 'Name required');
	if (typeof recipeEid === 'string') {
		try {
			if (addToPlaylist(db, created.id, decodeId(recipeEid))) created.count = 1;
		} catch {
			/* ignore a malformed eid; playlist still created */
		}
	}
	return json({ playlist: created });
};
