import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { listFavorites, addFavorite, MAX_TIMER_SECONDS } from '$lib/server/timerFavorites';
import { formatDuration } from '$lib/times';

/** List all saved timer presets. */
export const GET: RequestHandler = () => json({ favorites: listFavorites(db) });

/** Save a preset. Body: { label?: string, seconds: number }. */
export const POST: RequestHandler = async ({ request }) => {
	const { label, seconds } = await request.json();
	const secs = Math.round(Number(seconds));
	if (!Number.isFinite(secs) || secs <= 0 || secs > MAX_TIMER_SECONDS) {
		throw error(400, 'Invalid duration');
	}
	const name = (typeof label === 'string' ? label : '').trim().slice(0, 60) || formatDuration(secs);
	return json({ favorite: addFavorite(db, name, secs) });
};
