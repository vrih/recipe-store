import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, stat } from 'fs/promises';
import { resolve, normalize } from 'path';
import { DATA_DIR } from '$lib/server/db';

const IMAGES_ROOT = resolve(DATA_DIR, 'images');

const CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	heic: 'image/heic',
	tiff: 'image/tiff'
};

export const GET: RequestHandler = async ({ params }) => {
	// Resolve against the images root and confirm the result stays inside it,
	// so a crafted "../" path cannot escape the data directory.
	const target = resolve(IMAGES_ROOT, normalize(params.path));
	if (target !== IMAGES_ROOT && !target.startsWith(IMAGES_ROOT + '/')) {
		throw error(403, 'Forbidden');
	}

	try {
		const info = await stat(target);
		if (!info.isFile()) throw error(404, 'Not found');
		const data = await readFile(target);
		const ext = target.slice(target.lastIndexOf('.') + 1).toLowerCase();
		return new Response(new Uint8Array(data), {
			headers: {
				'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(404, 'Not found');
	}
};
