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

export interface ActiveCook {
	id: string;
	title: string;
	stepsDone: number;
	stepsTotal: number;
	playlistId: number | null;
}

/**
 * How recently a recipe must have been touched to count as "being cooked".
 * Generous so multi-day cooks (prep starting days ahead) stay listed.
 */
export const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Mark a recipe as being cooked (called when cook mode opens). */
export function startCooking(db: Database.Database, recipeId: string, now = Date.now()): void {
	db.prepare(
		`INSERT INTO cook_sessions (recipe_id, updated_at) VALUES (?, ?)
		 ON CONFLICT(recipe_id) DO UPDATE SET updated_at = excluded.updated_at`
	).run(recipeId, now);
}

/** Stop treating a recipe as being cooked, and clear its ticks. */
export function endCooking(db: Database.Database, recipeId: string): void {
	db.transaction(() => {
		db.prepare('DELETE FROM cook_sessions WHERE recipe_id = ?').run(recipeId);
		resetProgress(db, recipeId);
	})();
}

/** Recipes with a cook session or progress touched within the window, most recent first. */
export function activeCooks(
	db: Database.Database,
	totalSteps: (instructions: string) => number,
	now = Date.now()
): ActiveCook[] {
	const rows = db
		.prepare(
			`WITH activity AS (
			   SELECT recipe_id, updated_at FROM cook_sessions
			   UNION ALL
			   SELECT recipe_id, updated_at FROM cook_progress WHERE done = 1
			 )
			 SELECT r.id, r.title, r.instructions,
			   (SELECT COUNT(*) FROM cook_progress WHERE recipe_id = r.id AND kind = 'step' AND done = 1) AS steps_done,
			   MAX(a.updated_at) AS last,
			   (SELECT playlist_id FROM playlist_recipes WHERE recipe_id = r.id ORDER BY playlist_id DESC LIMIT 1) AS playlist_id
			 FROM activity a JOIN recipes r ON r.id = a.recipe_id
			 GROUP BY r.id HAVING last >= ? ORDER BY last DESC`
		)
		.all(now - ACTIVE_WINDOW_MS) as {
		id: string;
		title: string;
		instructions: string;
		steps_done: number;
		playlist_id: number | null;
	}[];
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		stepsDone: r.steps_done,
		stepsTotal: totalSteps(r.instructions),
		playlistId: r.playlist_id
	}));
}
