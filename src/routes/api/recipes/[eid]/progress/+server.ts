import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { getRecipe } from '$lib/server/recipes';
import { setProgress, resetProgress, type ProgressKind } from '$lib/server/progress';
import { decodeId } from '$lib/ids';

function resolveId(eid: string): string {
	let id: string;
	try {
		id = decodeId(eid);
	} catch {
		throw error(404, 'Recipe not found');
	}
	if (!getRecipe(db, id)) throw error(404, 'Recipe not found');
	return id;
}

/** Toggle a single item. Body: { kind: 'ingredient'|'step', key, done }. */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = resolveId(params.eid);
	const { kind, key, done } = await request.json();
	if ((kind !== 'ingredient' && kind !== 'step') || typeof key !== 'string') {
		throw error(400, 'Invalid item');
	}
	setProgress(db, id, kind as ProgressKind, key, !!done);
	return json({ ok: true });
};

/** Reset all progress for the recipe. */
export const DELETE: RequestHandler = ({ params }) => {
	const id = resolveId(params.eid);
	resetProgress(db, id);
	return json({ ok: true });
};
