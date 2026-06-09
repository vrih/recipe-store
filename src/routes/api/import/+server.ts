import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { importUploads, type ConflictMode } from '$lib/server/import';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const files = form.getAll('files').filter((f): f is File => f instanceof File);
	const conflict: ConflictMode = form.get('conflict') === 'overwrite' ? 'overwrite' : 'skip';

	if (files.length === 0) {
		throw error(400, 'No files uploaded');
	}

	// Read each upload into a buffer, then stream-import (parse + persist one
	// recipe at a time) so a large library doesn't exhaust memory.
	const uploads = await Promise.all(
		files.map(async (file) => ({
			name: file.name,
			bytes: new Uint8Array(await file.arrayBuffer())
		}))
	);

	const summary = await importUploads(db, uploads, conflict);
	return json(summary);
};
