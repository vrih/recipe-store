import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { Unzip, UnzipInflate } from 'fflate';
import type { MelaRecipe, ParsedEntry } from './mela.js';
import { appleDateToUnixMs, isMacOsCruft, parseMelaRecipe } from './mela.js';
import { saveRecipeImages, deleteImageFile } from './images.js';
import { getRecipeImages } from './recipes.js';
import { setRecipeTags } from './tags.js';
import { recipeColumnParams } from './recipeColumns.js';

/** Cap on retained failure records so a huge bad import can't itself OOM. */
const MAX_FAILURES = 200;

export type ConflictMode = 'skip' | 'overwrite';

export interface ImportSummary {
	added: number;
	updated: number;
	skipped: number;
	failed: number;
	failures: { source: string; error: string }[];
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

/**
 * Persist one parsed recipe. New images are saved to disk before the DB
 * transaction runs; any images the recipe previously had are only deleted
 * from disk *after* the transaction commits, so a failure partway through
 * (image processing or the write itself) can never leave the DB pointing at
 * files that have already been removed.
 */
async function upsertRecipe(
	db: Database.Database,
	recipe: MelaRecipe,
	conflict: ConflictMode
): Promise<'added' | 'updated' | 'skipped'> {
	const id = str(recipe.id) || randomUUID();
	const existing = db.prepare('SELECT id, created_at FROM recipes WHERE id = ?').get(id) as
		| { id: string; created_at: number }
		| undefined;

	if (existing && conflict === 'skip') return 'skipped';

	const oldImagePaths = existing ? getRecipeImages(db, id) : [];
	const images = await saveRecipeImages(id, recipe.images);
	const tagNames = Array.isArray(recipe.categories) ? recipe.categories : [];
	const now = Date.now();

	const tx = db.transaction(() => {
		if (existing) {
			db.prepare(
				`UPDATE recipes SET
           title = @title, text = @text, yield = @yield,
           prep_time = @prep_time, cook_time = @cook_time, total_time = @total_time,
           ingredients = @ingredients, instructions = @instructions,
           notes = @notes, nutrition = @nutrition, link = @link,
           favorite = @favorite, want_to_cook = @want_to_cook, date = @date,
           updated_at = @updated_at, version = version + 1
         WHERE id = @id`
			).run(rowParams(id, recipe, existing.created_at, now));

			db.prepare('DELETE FROM recipe_images WHERE recipe_id = ?').run(id);
			// Editing invalidates strike-through keys; clear stale progress.
			db.prepare('DELETE FROM cook_progress WHERE recipe_id = ?').run(id);
		} else {
			db.prepare(
				`INSERT INTO recipes (
           id, title, text, yield, prep_time, cook_time, total_time,
           ingredients, instructions, notes, nutrition, link,
           favorite, want_to_cook, date, created_at, updated_at, version
         ) VALUES (
           @id, @title, @text, @yield, @prep_time, @cook_time, @total_time,
           @ingredients, @instructions, @notes, @nutrition, @link,
           @favorite, @want_to_cook, @date, @created_at, @updated_at, 1
         )`
			).run(rowParams(id, recipe, now, now));
		}

		const insImg = db.prepare(
			'INSERT INTO recipe_images (recipe_id, position, path) VALUES (?, ?, ?)'
		);
		images.forEach((img, pos) => insImg.run(id, pos, img.path));

		setRecipeTags(db, id, tagNames);
	});

	tx();

	// Now that the DB no longer references them, remove the recipe's old image
	// files (new images were written under fresh random names, so this can't
	// collide with what we just saved above).
	for (const path of oldImagePaths) deleteImageFile(path);

	return existing ? 'updated' : 'added';
}

function rowParams(id: string, r: MelaRecipe, createdAt: number, updatedAt: number) {
	return {
		id,
		...recipeColumnParams({
			title: str(r.title),
			text: str(r.text),
			yield: str(r.yield),
			prepTime: str(r.prepTime),
			cookTime: str(r.cookTime),
			totalTime: str(r.totalTime),
			ingredients: str(r.ingredients),
			instructions: str(r.instructions),
			notes: str(r.notes),
			nutrition: str(r.nutrition),
			link: str(r.link),
			favorite: r.favorite === true,
			wantToCook: r.wantToCook === true
		}),
		date: appleDateToUnixMs(r.date),
		created_at: createdAt,
		updated_at: updatedAt
	};
}

/** Import a single parsed entry into the running summary. */
async function importOne(
	db: Database.Database,
	entry: ParsedEntry,
	conflict: ConflictMode,
	summary: ImportSummary
): Promise<void> {
	if (entry.error || !entry.recipe) {
		summary.failed++;
		if (summary.failures.length < MAX_FAILURES) {
			summary.failures.push({ source: entry.source, error: entry.error ?? 'No recipe data' });
		}
		return;
	}
	try {
		const result = await upsertRecipe(db, entry.recipe, conflict);
		summary[result]++;
	} catch (err) {
		summary.failed++;
		if (summary.failures.length < MAX_FAILURES) {
			summary.failures.push({
				source: entry.source,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	} finally {
		// Release the recipe (and its base64 image data) for GC before the next.
		entry.recipe = undefined;
	}
}

function emptySummary(): ImportSummary {
	return { added: 0, updated: 0, skipped: 0, failed: 0, failures: [] };
}

function recordFailure(summary: ImportSummary, source: string, error: string): void {
	summary.failed++;
	if (summary.failures.length < MAX_FAILURES) summary.failures.push({ source, error });
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
	let len = 0;
	for (const c of chunks) len += c.length;
	const out = new Uint8Array(len);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

interface PendingEntry {
	source: string;
	bytes?: Uint8Array;
	nested?: Uint8Array;
	error?: string;
}

/**
 * Stream-unzip an archive from a chunk source, importing each recipe as its
 * entry finishes decompressing. Only one entry's bytes are held at a time, so
 * memory stays bounded no matter how large the archive is. Nested archives are
 * buffered and recursed (rare; their size bounds the transient cost).
 */
async function importArchiveChunks(
	db: Database.Database,
	chunks: AsyncIterable<Uint8Array>,
	archiveName: string,
	conflict: ConflictMode,
	summary: ImportSummary
): Promise<void> {
	const unzip = new Unzip();
	unzip.register(UnzipInflate);
	const queue: PendingEntry[] = [];
	let started = 0;
	let hadError = false;

	unzip.onfile = (file) => {
		const lower = file.name.toLowerCase();
		const isArchive = lower.endsWith('.melarecipes') || lower.endsWith('.zip');
		const isRecipe = lower.endsWith('.melarecipe') || lower.endsWith('.json');
		const source = `${archiveName}/${file.name}`;
		// Skip directories, macOS cruft, and non-recipe files: don't call
		// file.start(), so their data is never decompressed/buffered.
		if (file.name.endsWith('/') || isMacOsCruft(file.name) || (!isArchive && !isRecipe)) return;
		started++;

		const parts: Uint8Array[] = [];
		file.ondata = (err, chunk, final) => {
			if (err) {
				queue.push({ source, error: err.message });
				return;
			}
			if (chunk && chunk.length) parts.push(chunk);
			if (final) {
				const bytes = concatChunks(parts);
				parts.length = 0;
				queue.push(isArchive ? { source, nested: bytes } : { source, bytes });
			}
		};
		file.start();
	};

	const drain = async () => {
		while (queue.length) {
			const item = queue.shift()!;
			if (item.error) {
				recordFailure(summary, item.source, item.error);
			} else if (item.nested) {
				await importArchiveChunks(db, singleChunk(item.nested), item.source, conflict, summary);
			} else if (item.bytes) {
				try {
					const recipe = parseMelaRecipe(item.bytes);
					await importOne(db, { source: item.source, recipe }, conflict, summary);
				} catch (err) {
					recordFailure(summary, item.source, err instanceof Error ? err.message : String(err));
				}
			}
		}
	};

	try {
		for await (const chunk of chunks) {
			unzip.push(chunk, false);
			await drain();
		}
		unzip.push(new Uint8Array(0), true);
		await drain();
	} catch (err) {
		hadError = true;
		recordFailure(summary, archiveName, `Could not read archive: ${err instanceof Error ? err.message : String(err)}`);
	}

	// No valid entries and no thrown error usually means the upload wasn't a
	// readable Mela archive — surface that instead of a silent 0/0/0/0.
	if (!hadError && started === 0) {
		recordFailure(summary, archiveName, 'No recipes found — the file may be corrupt or not a Mela archive.');
	}
}

async function* singleChunk(data: Uint8Array): AsyncIterable<Uint8Array> {
	yield data;
}

/** Read an entire chunk stream into one buffer (for small single-recipe files). */
async function readAll(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
	const parts: Uint8Array[] = [];
	for await (const c of chunks) parts.push(c instanceof Uint8Array ? c : new Uint8Array(c));
	return concatChunks(parts);
}

/**
 * Import an upload directly from its byte stream (e.g. the request body),
 * dispatching on the filename. Archives are stream-unzipped one entry at a
 * time; a single `.melarecipe` is read whole (it's small) and parsed. This is
 * the memory-safe entry point for the HTTP import endpoint.
 */
export async function importStream(
	db: Database.Database,
	filename: string,
	chunks: AsyncIterable<Uint8Array>,
	conflict: ConflictMode = 'skip'
): Promise<ImportSummary> {
	const summary = emptySummary();
	const lower = filename.toLowerCase();

	if (lower.endsWith('.melarecipes') || lower.endsWith('.zip')) {
		await importArchiveChunks(db, chunks, filename, conflict, summary);
	} else {
		const bytes = await readAll(chunks);
		try {
			const recipe = parseMelaRecipe(bytes);
			await importOne(db, { source: filename, recipe }, conflict, summary);
		} catch (err) {
			recordFailure(summary, filename, err instanceof Error ? err.message : String(err));
		}
	}

	return summary;
}
