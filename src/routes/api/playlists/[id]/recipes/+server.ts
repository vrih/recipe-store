import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { addToPlaylist, removeFromPlaylist, reorderPlaylist } from '$lib/server/playlists';
import { decodeId } from '$lib/ids';

function parseId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');
	return id;
}

function eidToId(eid: unknown): string {
	if (typeof eid !== 'string') throw error(400, 'Invalid recipe');
	try {
		return decodeId(eid);
	} catch {
		throw error(400, 'Invalid recipe');
	}
}

/** Add a recipe. Body: { eid } */
export const POST: RequestHandler = async ({ params, request }) => {
	const { eid } = await request.json();
	if (!addToPlaylist(db, parseId(params.id), eidToId(eid))) throw error(404, 'Not found');
	return json({ ok: true });
};

/** Reorder. Body: { order: eid[] } */
export const PUT: RequestHandler = async ({ params, request }) => {
	const { order } = await request.json();
	if (!Array.isArray(order)) throw error(400, 'Invalid order');
	reorderPlaylist(db, parseId(params.id), order.map(eidToId));
	return json({ ok: true });
};

/** Remove a recipe. Body: { eid } */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const { eid } = await request.json();
	removeFromPlaylist(db, parseId(params.id), eidToId(eid));
	return json({ ok: true });
};
