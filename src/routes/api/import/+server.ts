import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { parseUpload, type ParsedEntry } from '$lib/server/mela';
import { importEntries, type ConflictMode } from '$lib/server/import';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const files = form.getAll('files').filter((f): f is File => f instanceof File);
	const conflict: ConflictMode = form.get('conflict') === 'overwrite' ? 'overwrite' : 'skip';

	if (files.length === 0) {
		throw error(400, 'No files uploaded');
	}

	const entries: ParsedEntry[] = [];
	for (const file of files) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		entries.push(...parseUpload(file.name, bytes));
	}

	const summary = await importEntries(db, entries, conflict);
	return json(summary);
};
