import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';

export const GET: RequestHandler = () => {
	const { count } = db
		.prepare('SELECT COUNT(*) as count FROM recipes')
		.get() as { count: number };
	return json({ status: 'ok', recipe_count: count });
};
