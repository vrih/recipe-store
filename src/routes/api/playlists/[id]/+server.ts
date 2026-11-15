import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { renamePlaylist, deletePlaylist } from '$lib/server/playlists';

function parseId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
	return id;
}

/** Rename. Body: { name: string } */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { name } = await request.json();
	if (!renamePlaylist(db, parseId(params.id), typeof name === 'string' ? name : '')) {
		throw error(400, 'Invalid name or playlist');
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params }) => {
	deletePlaylist(db, parseId(params.id));
	return json({ ok: true });
};
