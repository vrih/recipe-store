import sharp from 'sharp';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

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

/**
 * Decode and persist all base64 images for a recipe, generating a WebP
 * thumbnail for each. Returns the relative paths of successfully saved images,
 * ordered by position. Images that fail to decode/process are skipped.
 */
export async function saveRecipeImages(
	recipeId: string,
	base64Images: string[] | undefined
): Promise<SavedImage[]> {
	if (!base64Images || base64Images.length === 0) return [];

	const dir = recipeImageDir(recipeId);
	mkdirSync(dir, { recursive: true });
	const dirName = recipeDirName(recipeId);
	const saved: SavedImage[] = [];

	for (let i = 0; i < base64Images.length; i++) {
		try {
			const buf = decodeBase64Image(base64Images[i]);
			if (buf.length === 0) continue;

			const image = sharp(buf, { failOn: 'none' });
			const meta = await image.metadata();
			const ext = FORMAT_EXT[meta.format ?? ''] ?? 'jpg';

			const relFull = join('images', dirName, `${i}.${ext}`);
			writeFileSync(join(dataDir(), relFull), buf);

			const relThumb = thumbPathFor(relFull);
			await sharp(buf, { failOn: 'none' })
				.rotate()
				.resize({ width: THUMB_WIDTH, withoutEnlargement: true })
				.webp({ quality: 80 })
				.toFile(join(dataDir(), relThumb));

			saved.push({ path: relFull });
		} catch {
			// Skip individual images that cannot be processed.
			continue;
		}
	}

	return saved;
}
