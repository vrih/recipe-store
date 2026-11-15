import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { getRecipe } from '$lib/server/recipes';
import { startCooking, endCooking } from '$lib/server/progress';
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

/** Mark the recipe as being cooked (cook mode opened). */
export const PUT: RequestHandler = ({ params }) => {
	startCooking(db, resolveId(params.eid));
	return json({ ok: true });
};

/** Finish cooking: drop the recipe from "Cooking now" and clear its ticks. */
export const DELETE: RequestHandler = ({ params }) => {
	endCooking(db, resolveId(params.eid));
	return json({ ok: true });
};
