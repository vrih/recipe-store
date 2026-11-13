import type Database from 'better-sqlite3';

export interface TimerFavorite {
	id: number;
	label: string;
	seconds: number;
}

/** Largest allowed preset duration (24 hours), guarding against silly input. */
export const MAX_TIMER_SECONDS = 24 * 60 * 60;

/** All saved presets, oldest first. */
export function listFavorites(db: Database.Database): TimerFavorite[] {
	return db
		.prepare('SELECT id, label, seconds FROM timer_favorites ORDER BY created_at ASC, id ASC')
		.all() as TimerFavorite[];
}

/**
 * Save a preset. Idempotent on (label, seconds): saving the same one twice
 * returns the existing row rather than erroring on the UNIQUE constraint.
 */
export function addFavorite(db: Database.Database, label: string, seconds: number): TimerFavorite {
	const existing = db
		.prepare('SELECT id, label, seconds FROM timer_favorites WHERE label = ? AND seconds = ?')
		.get(label, seconds) as TimerFavorite | undefined;
	if (existing) return existing;

	const info = db
		.prepare('INSERT INTO timer_favorites (label, seconds, created_at) VALUES (?, ?, ?)')
		.run(label, seconds, Date.now());
	return { id: Number(info.lastInsertRowid), label, seconds };
}

export function deleteFavorite(db: Database.Database, id: number): void {
	db.prepare('DELETE FROM timer_favorites WHERE id = ?').run(id);
}
