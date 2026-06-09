import type Database from 'better-sqlite3';

export type ProgressKind = 'ingredient' | 'step';

/** Composite key used client-side: `${kind}:${item_key}`. */
function composite(kind: ProgressKind, key: string): string {
	return `${kind}:${key}`;
}

/** Return the set of completed item composite-keys for a recipe. */
export function getProgress(db: Database.Database, recipeId: string): string[] {
	const rows = db
		.prepare('SELECT kind, item_key FROM cook_progress WHERE recipe_id = ? AND done = 1')
		.all(recipeId) as { kind: ProgressKind; item_key: string }[];
	return rows.map((r) => composite(r.kind, r.item_key));
}

/**
 * Set or clear the done state of a single ingredient/step. Presence of a row
 * (done = 1) means struck through; clearing removes the row.
 */
export function setProgress(
	db: Database.Database,
	recipeId: string,
	kind: ProgressKind,
	key: string,
	done: boolean
): void {
	if (done) {
		db.prepare(
			`INSERT INTO cook_progress (recipe_id, kind, item_key, done, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(recipe_id, kind, item_key) DO UPDATE SET done = 1, updated_at = excluded.updated_at`
		).run(recipeId, kind, key, Date.now());
	} else {
		db.prepare(
			'DELETE FROM cook_progress WHERE recipe_id = ? AND kind = ? AND item_key = ?'
		).run(recipeId, kind, key);
	}
}

/** Clear all cooking progress for a recipe. */
export function resetProgress(db: Database.Database, recipeId: string): void {
	db.prepare('DELETE FROM cook_progress WHERE recipe_id = ?').run(recipeId);
}
