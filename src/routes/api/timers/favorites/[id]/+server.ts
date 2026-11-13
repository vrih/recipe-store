import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { deleteFavorite } from '$lib/server/timerFavorites';

/** Remove a saved preset by id. */
export const DELETE: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
	deleteFavorite(db, id);
	return json({ ok: true });
};
