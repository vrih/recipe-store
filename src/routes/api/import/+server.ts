import { json, error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { importStream, type ConflictMode } from '$lib/server/import';

/**
 * Import a single uploaded file, streamed as the raw request body (not
 * multipart). Streaming the body straight into the unzip keeps memory bounded
 * — the whole library is never held in the heap. The client posts one file per
 * request with ?name= and ?conflict=, merging the per-file summaries.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const name = url.searchParams.get('name') ?? 'upload.melarecipes';
	const conflict: ConflictMode = url.searchParams.get('conflict') === 'overwrite' ? 'overwrite' : 'skip';

	if (!request.body) throw error(400, 'No file body');

	const rssMB = () => Math.round(process.memoryUsage().rss / 1024 / 1024);
	console.log(`[import] streaming "${name}" (conflict=${conflict}); rss=${rssMB()}MB`);

	// Node's Readable is an async-iterable of Buffers (Uint8Array).
	const chunks = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
	const summary = await importStream(db, name, chunks, conflict);

	console.log(
		`[import] done "${name}": +${summary.added} ~${summary.updated} skip ${summary.skipped} fail ${summary.failed}; rss=${rssMB()}MB`
	);
	return json(summary);
};
