import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { saveImageBuffer, deleteImageFile, deleteRecipeImages } from './images.js';
import { getRecipeImages } from './recipes.js';

/** Thrown when an optimistic-concurrency version check fails (lost-update). */
export class ConflictError extends Error {
	constructor(public currentVersion: number) {
		super('Recipe was modified by someone else');
		this.name = 'ConflictError';
	}
}

/** Thrown when the target recipe does not exist. */
export class NotFoundError extends Error {
	constructor() {
		super('Recipe not found');
		this.name = 'NotFoundError';
	}
}

export interface RecipeInput {
	title: string;
	text: string;
	yield: string;
	prepTime: string;
	cookTime: string;
	totalTime: string;
	ingredients: string;
	instructions: string;
	notes: string;
	nutrition: string;
	link: string;
	favorite: boolean;
	wantToCook: boolean;
	tags: string[];
}

/** Build a RecipeInput from submitted form data. Tags are comma-separated. */
export function recipeInputFromForm(form: FormData): RecipeInput {
	const s = (k: string) => (form.get(k) ?? '').toString();
	return {
		title: s('title').trim(),
		text: s('text'),
		yield: s('yield').trim(),
		prepTime: s('prepTime').trim(),
		cookTime: s('cookTime').trim(),
		totalTime: s('totalTime').trim(),
		ingredients: s('ingredients'),
		instructions: s('instructions'),
		notes: s('notes'),
		nutrition: s('nutrition'),
		link: s('link').trim(),
		favorite: form.get('favorite') === 'on' || form.get('favorite') === 'true',
		wantToCook: form.get('wantToCook') === 'on' || form.get('wantToCook') === 'true',
		tags: s('tags')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
	};
}

function params(id: string, input: RecipeInput) {
	return {
		id,
		title: input.title,
		text: input.text,
		yield: input.yield,
		prep_time: input.prepTime,
		cook_time: input.cookTime,
		total_time: input.totalTime,
		ingredients: input.ingredients,
		instructions: input.instructions,
		notes: input.notes,
		nutrition: input.nutrition,
		link: input.link,
		favorite: input.favorite ? 1 : 0,
		want_to_cook: input.wantToCook ? 1 : 0
	};
}

/** Replace a recipe's tag associations with the given names (creating tags). */
function setRecipeTags(db: Database.Database, recipeId: string, names: string[]): void {
	db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(recipeId);
	const insTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
	const selTag = db.prepare('SELECT id FROM tags WHERE name = ?');
	const link = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');
	const seen = new Set<string>();
	for (const raw of names) {
		const name = raw.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		insTag.run(name);
		const row = selTag.get(name) as { id: number } | undefined;
		if (row) link.run(recipeId, row.id);
	}
}

/** Create a new recipe from scratch. Returns the generated id. */
export function createRecipe(db: Database.Database, input: RecipeInput): string {
	const id = randomUUID();
	const now = Date.now();
	db.transaction(() => {
		db.prepare(
			`INSERT INTO recipes (
         id, title, text, yield, prep_time, cook_time, total_time,
         ingredients, instructions, notes, nutrition, link,
         favorite, want_to_cook, date, created_at, updated_at, version
       ) VALUES (
         @id, @title, @text, @yield, @prep_time, @cook_time, @total_time,
         @ingredients, @instructions, @notes, @nutrition, @link,
         @favorite, @want_to_cook, NULL, @created_at, @updated_at, 1
       )`
		).run({ ...params(id, input), created_at: now, updated_at: now });
		setRecipeTags(db, id, input.tags);
	})();
	return id;
}

/**
 * Update an existing recipe using optimistic concurrency control. Throws
 * ConflictError if expectedVersion no longer matches, NotFoundError if missing.
 * Editing invalidates cook-progress keys, so stale progress is cleared.
 * Returns the new version.
 */
export function updateRecipe(
	db: Database.Database,
	id: string,
	expectedVersion: number,
	input: RecipeInput
): number {
	return db.transaction(() => {
		const current = db.prepare('SELECT version FROM recipes WHERE id = ?').get(id) as
			| { version: number }
			| undefined;
		if (!current) throw new NotFoundError();
		if (current.version !== expectedVersion) throw new ConflictError(current.version);

		db.prepare(
			`UPDATE recipes SET
         title = @title, text = @text, yield = @yield,
         prep_time = @prep_time, cook_time = @cook_time, total_time = @total_time,
         ingredients = @ingredients, instructions = @instructions,
         notes = @notes, nutrition = @nutrition, link = @link,
         favorite = @favorite, want_to_cook = @want_to_cook,
         updated_at = @updated_at, version = version + 1
       WHERE id = @id`
		).run({ ...params(id, input), updated_at: Date.now() });

		setRecipeTags(db, id, input.tags);
		db.prepare('DELETE FROM cook_progress WHERE recipe_id = ?').run(id);
		return current.version + 1;
	})();
}

/** Delete a recipe (cascades to images/tags/progress) and its image files. */
export function deleteRecipe(db: Database.Database, id: string): boolean {
	const exists = db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id);
	if (!exists) return false;
	db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
	deleteRecipeImages(id);
	return true;
}

/** Append uploaded image buffers to a recipe at the next positions. */
export async function addRecipeImages(
	db: Database.Database,
	id: string,
	buffers: Buffer[]
): Promise<void> {
	const max = db
		.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM recipe_images WHERE recipe_id = ?')
		.get(id) as { m: number };
	let pos = max.m + 1;
	const ins = db.prepare('INSERT INTO recipe_images (recipe_id, position, path) VALUES (?, ?, ?)');
	for (const buf of buffers) {
		const path = await saveImageBuffer(id, buf);
		if (path) ins.run(id, pos++, path);
	}
}

/** Delete a single image (by current position) and renumber the rest. */
export function deleteRecipeImage(db: Database.Database, id: string, position: number): void {
	const row = db
		.prepare('SELECT path FROM recipe_images WHERE recipe_id = ? AND position = ?')
		.get(id, position) as { path: string } | undefined;
	if (!row) return;

	db.transaction(() => {
		db.prepare('DELETE FROM recipe_images WHERE recipe_id = ? AND position = ?').run(id, position);
		renumber(db, id);
	})();
	deleteImageFile(row.path);
}

/**
 * Reorder a recipe's images. `order` is the desired sequence of current
 * positions (e.g. [2,0,1]); positions are rewritten to 0..n-1 in that order.
 */
export function reorderRecipeImages(db: Database.Database, id: string, order: number[]): void {
	const paths = getRecipeImages(db, id);
	// Validate: order must be a permutation of existing positions.
	const valid =
		order.length === paths.length &&
		new Set(order).size === paths.length &&
		order.every((p) => p >= 0 && p < paths.length);
	if (!valid) return;

	db.transaction(() => {
		// Move to a temporary offset first to avoid PK collisions mid-update.
		const offset = paths.length + 1000;
		const bump = db.prepare(
			'UPDATE recipe_images SET position = position + ? WHERE recipe_id = ?'
		);
		bump.run(offset, id);
		const set = db.prepare(
			'UPDATE recipe_images SET position = ? WHERE recipe_id = ? AND position = ?'
		);
		order.forEach((oldPos, newPos) => set.run(newPos, id, oldPos + offset));
	})();
}

/** Compact positions to a contiguous 0..n-1 sequence (after a deletion). */
function renumber(db: Database.Database, id: string): void {
	const rows = db
		.prepare('SELECT position FROM recipe_images WHERE recipe_id = ? ORDER BY position')
		.all(id) as { position: number }[];
	const offset = rows.length + 1000;
	db.prepare('UPDATE recipe_images SET position = position + ? WHERE recipe_id = ?').run(offset, id);
	const set = db.prepare(
		'UPDATE recipe_images SET position = ? WHERE recipe_id = ? AND position = ?'
	);
	rows.forEach((r, i) => set.run(i, id, r.position + offset));
}
