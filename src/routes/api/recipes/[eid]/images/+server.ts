import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { getRecipe, getRecipeImages } from '$lib/server/recipes';
import { addRecipeImages, deleteRecipeImage, reorderRecipeImages } from '$lib/server/edit';
import { decodeId } from '$lib/ids';
import { imageUrl } from '$lib/paths';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per image upload

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

function currentImages(id: string) {
	return getRecipeImages(db, id).map((p, position) => ({ position, url: imageUrl(p) }));
}

/** Upload one or more images (multipart, field name `files`), appended at end. */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = resolveId(params.eid);
	const form = await request.formData();
	const files = form.getAll('files').filter((f): f is File => f instanceof File);

	const buffers: Buffer[] = [];
	for (const file of files) {
		if (file.size === 0) continue;
		if (file.size > MAX_BYTES) throw error(413, `Image too large: ${file.name}`);
		buffers.push(Buffer.from(await file.arrayBuffer()));
	}
	await addRecipeImages(db, id, buffers);
	return json({ images: currentImages(id) });
};

/** Delete an image by position. Body: { position: number }. */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const id = resolveId(params.eid);
	const { position } = await request.json();
	deleteRecipeImage(db, id, Number(position));
	return json({ images: currentImages(id) });
};

/** Reorder images. Body: { order: number[] } (desired sequence of positions). */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = resolveId(params.eid);
	const { order } = await request.json();
	if (!Array.isArray(order)) throw error(400, 'order must be an array');
	reorderRecipeImages(db, id, order.map(Number));
	return json({ images: currentImages(id) });
};
