import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { createBackup, listBackups } from '$lib/server/backup';

/** List existing backups. */
export const GET: RequestHandler = () => {
	return json({ backups: listBackups() });
};

/** Trigger a manual online backup now. */
export const POST: RequestHandler = async () => {
	const name = await createBackup(db);
	return json({ created: name, backups: listBackups() });
};
