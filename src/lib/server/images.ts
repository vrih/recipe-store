import sharp from 'sharp';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';

// Bound sharp/libvips memory: disable the operation cache and serialize work.
// Without this, a large batch import (many images) balloons native memory and
// can get the container OOM-killed (exit 137).
sharp.cache(false);
sharp.concurrency(1);

const THUMB_WIDTH = 400;

/** Read the data directory at call time so tests can override it via env. */
function dataDir(): string {
	return process.env.DATA_DIR ?? './data';
}

/** Map sharp's detected format to a file extension for the stored original. */
const FORMAT_EXT: Record<string, string> = {
	jpeg: 'jpg',
	png: 'png',
	webp: 'webp',
	gif: 'gif',
	heif: 'heic',
	avif: 'avif',
	tiff: 'tiff'
};

function imagesRoot(): string {
	return join(dataDir(), 'images');
}

/**
 * Per-recipe image directory. The recipe id may be a URL-without-scheme (for
 * web imports), so it is hashed to produce a filesystem-safe, collision-free
 * directory name.
 */
function recipeDirName(recipeId: string): string {
	return createHash('sha1').update(recipeId).digest('hex').slice(0, 16);
}

function recipeImageDir(recipeId: string): string {
	return join(imagesRoot(), recipeDirName(recipeId));
}

/** Strip a `data:image/...;base64,` prefix if present and decode to a buffer. */
function decodeBase64Image(raw: string): Buffer {
	const comma = raw.indexOf(',');
	const payload = raw.startsWith('data:') && comma !== -1 ? raw.slice(comma + 1) : raw;
	return Buffer.from(payload, 'base64');
}

export interface SavedImage {
	/** Path to the full image, relative to DATA_DIR (portable for backups). */
	path: string;
}

/** Convention: thumbnail path derived from a stored full-image relative path. */
export function thumbPathFor(fullPath: string): string {
	const dot = fullPath.lastIndexOf('.');
	const base = dot === -1 ? fullPath : fullPath.slice(0, dot);
	return `${base}_thumb.webp`;
}

/** Remove all stored images for a recipe (used before re-import / on delete). */
export function deleteRecipeImages(recipeId: string): void {
	rmSync(recipeImageDir(recipeId), { recursive: true, force: true });
}

/** Remove a single stored image (full + thumbnail) given its relative path. */
export function deleteImageFile(relPath: string): void {
	rmSync(join(dataDir(), relPath), { force: true });
	rmSync(join(dataDir(), thumbPathFor(relPath)), { force: true });
}

/**
 * Persist a single image buffer for a recipe, generating a WebP thumbnail.
 * The on-disk filename uses a random token so it is independent of ordering
 * position (which lets images be reordered/deleted without renaming files).
 * Returns the relative path of the stored original, or null if it can't be
 * processed as an image.
 */
export async function saveImageBuffer(
	recipeId: string,
	buf: Buffer
): Promise<string | null> {
	if (buf.length === 0) return null;
	try {
		const meta = await sharp(buf, { failOn: 'none' }).metadata();
		const ext = FORMAT_EXT[meta.format ?? ''] ?? 'jpg';

		const dir = recipeImageDir(recipeId);
		mkdirSync(dir, { recursive: true });
		const relFull = join('images', recipeDirName(recipeId), `${randomUUID()}.${ext}`);
		writeFileSync(join(dataDir(), relFull), buf);

		await sharp(buf, { failOn: 'none' })
			.rotate()
			.resize({ width: THUMB_WIDTH, withoutEnlargement: true })
			.webp({ quality: 80 })
			.toFile(join(dataDir(), thumbPathFor(relFull)));

		return relFull;
	} catch {
		return null;
	}
}

/**
 * Decode and persist all base64 images for a recipe (used by Mela import).
 * Returns the relative paths of successfully saved images, in order.
 */
export async function saveRecipeImages(
	recipeId: string,
	base64Images: string[] | undefined
): Promise<SavedImage[]> {
	if (!base64Images || base64Images.length === 0) return [];

	const saved: SavedImage[] = [];
	for (const raw of base64Images) {
		const path = await saveImageBuffer(recipeId, decodeBase64Image(raw));
		if (path) saved.push({ path });
	}
	return saved;
}
