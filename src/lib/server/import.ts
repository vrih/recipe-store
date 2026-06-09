import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { MelaRecipe, ParsedEntry } from './mela.js';
import { appleDateToUnixMs, walkUpload } from './mela.js';
import { saveRecipeImages, deleteRecipeImages } from './images.js';

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

function bool(v: unknown): 0 | 1 {
	return v === true ? 1 : 0;
}

/** Resolve a list of tag names to tag ids, creating tags that don't exist. */
function resolveTagIds(db: Database.Database, names: string[]): number[] {
	const insert = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
	const select = db.prepare('SELECT id FROM tags WHERE name = ?');
	const ids: number[] = [];
	for (const raw of names) {
		const name = raw.trim();
		if (!name) continue;
		insert.run(name);
		const row = select.get(name) as { id: number } | undefined;
		if (row) ids.push(row.id);
	}
	return ids;
}

/**
 * Persist one parsed recipe. Image files are written before the (synchronous)
 * DB transaction so the transaction stays atomic. Returns whether the recipe
 * was added, updated, or skipped.
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

	// Decode/process images up front (async); replace any prior images on update.
	if (existing) deleteRecipeImages(id);
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
			db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(id);
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

		const insTag = db.prepare(
			'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)'
		);
		for (const tagId of resolveTagIds(db, tagNames)) insTag.run(id, tagId);
	});

	tx();
	return existing ? 'updated' : 'added';
}

function rowParams(id: string, r: MelaRecipe, createdAt: number, updatedAt: number) {
	return {
		id,
		title: str(r.title),
		text: str(r.text),
		yield: str(r.yield),
		prep_time: str(r.prepTime),
		cook_time: str(r.cookTime),
		total_time: str(r.totalTime),
		ingredients: str(r.ingredients),
		instructions: str(r.instructions),
		notes: str(r.notes),
		nutrition: str(r.nutrition),
		link: str(r.link),
		favorite: bool(r.favorite),
		want_to_cook: bool(r.wantToCook),
		date: appleDateToUnixMs(r.date),
		created_at: createdAt,
		updated_at: updatedAt
	};
}

/**
 * Import a batch of parsed entries. Each recipe is handled independently: a
 * malformed or failing recipe is recorded and skipped without aborting the run.
 */
export async function importEntries(
	db: Database.Database,
	entries: ParsedEntry[],
	conflict: ConflictMode = 'skip'
): Promise<ImportSummary> {
	const summary: ImportSummary = { added: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

	for (const entry of entries) {
		await importOne(db, entry, conflict, summary);
	}

	return summary;
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

/**
 * Stream-import one or more uploaded files. Recipes are parsed, imported, and
 * freed one at a time (decompressed archive buffers are released as we go), so
 * peak memory stays roughly constant regardless of library size — this is what
 * keeps a large `.melarecipes` import from OOM-killing the container.
 */
export async function importUploads(
	db: Database.Database,
	uploads: { name: string; bytes: Uint8Array }[],
	conflict: ConflictMode = 'skip'
): Promise<ImportSummary> {
	const summary: ImportSummary = { added: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

	for (const upload of uploads) {
		await walkUpload(upload.name, upload.bytes, (entry) =>
			importOne(db, entry, conflict, summary)
		);
	}

	return summary;
}
