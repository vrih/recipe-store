import type Database from 'better-sqlite3';
import { thumbPathFor } from './images.js';

export interface PlaylistSummary {
	id: number;
	name: string;
	count: number;
}

export interface PlaylistRecipe {
	id: string;
	title: string;
	thumb: string | null;
}

export interface Playlist {
	id: number;
	name: string;
	recipes: PlaylistRecipe[];
}

export const MAX_NAME_LENGTH = 80;

function cleanName(name: string): string {
	return name.trim().slice(0, MAX_NAME_LENGTH);
}

/** All playlists, newest first, with recipe counts. */
export function listPlaylists(db: Database.Database): PlaylistSummary[] {
	return db
		.prepare(
			`SELECT p.id, p.name, COUNT(pr.recipe_id) AS count
			 FROM playlists p LEFT JOIN playlist_recipes pr ON pr.playlist_id = p.id
			 GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`
		)
		.all() as PlaylistSummary[];
}

/** Create a playlist. Returns null when the name is blank. */
export function createPlaylist(db: Database.Database, name: string): PlaylistSummary | null {
	const n = cleanName(name);
	if (!n) return null;
	const info = db
		.prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)')
		.run(n, Date.now());
	return { id: Number(info.lastInsertRowid), name: n, count: 0 };
}

export function renamePlaylist(db: Database.Database, id: number, name: string): boolean {
	const n = cleanName(name);
	if (!n) return false;
	return db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(n, id).changes > 0;
}

export function deletePlaylist(db: Database.Database, id: number): void {
	db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

/** A playlist with its recipes in order, or null if it doesn't exist. */
export function getPlaylist(db: Database.Database, id: number): Playlist | null {
	const p = db.prepare('SELECT id, name FROM playlists WHERE id = ?').get(id) as
		| { id: number; name: string }
		| undefined;
	if (!p) return null;
	const rows = db
		.prepare(
			`SELECT r.id, r.title,
			   (SELECT path FROM recipe_images WHERE recipe_id = r.id ORDER BY position LIMIT 1) AS img
			 FROM playlist_recipes pr JOIN recipes r ON r.id = pr.recipe_id
			 WHERE pr.playlist_id = ? ORDER BY pr.position ASC`
		)
		.all(id) as { id: string; title: string; img: string | null }[];
	return {
		id: p.id,
		name: p.name,
		recipes: rows.map((r) => ({
			id: r.id,
			title: r.title,
			thumb: r.img ? thumbPathFor(r.img) : null
		}))
	};
}

/** Append a recipe to the end. Idempotent. Returns false if either side doesn't exist. */
export function addToPlaylist(db: Database.Database, playlistId: number, recipeId: string): boolean {
	const ok =
		db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(playlistId) &&
		db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(recipeId);
	if (!ok) return false;
	db.prepare(
		`INSERT OR IGNORE INTO playlist_recipes (playlist_id, recipe_id, position)
		 VALUES (?, ?, COALESCE((SELECT MAX(position) + 1 FROM playlist_recipes WHERE playlist_id = ?), 0))`
	).run(playlistId, recipeId, playlistId);
	return true;
}

export function removeFromPlaylist(db: Database.Database, playlistId: number, recipeId: string): void {
	db.transaction(() => {
		db.prepare('DELETE FROM playlist_recipes WHERE playlist_id = ? AND recipe_id = ?').run(
			playlistId,
			recipeId
		);
		compact(db, playlistId);
	})();
}

/**
 * Reorder to match `orderedIds`. Ids not in the playlist are ignored; recipes
 * missing from the list keep their relative order after the listed ones.
 */
export function reorderPlaylist(db: Database.Database, playlistId: number, orderedIds: string[]): void {
	db.transaction(() => {
		const current = (
			db
				.prepare('SELECT recipe_id FROM playlist_recipes WHERE playlist_id = ? ORDER BY position')
				.all(playlistId) as { recipe_id: string }[]
		).map((r) => r.recipe_id);
		const inList = new Set(current);
		const seen = new Set<string>();
		const final: string[] = [];
		for (const id of orderedIds) {
			if (inList.has(id) && !seen.has(id)) {
				seen.add(id);
				final.push(id);
			}
		}
		for (const id of current) if (!seen.has(id)) final.push(id);
		const upd = db.prepare(
			'UPDATE playlist_recipes SET position = ? WHERE playlist_id = ? AND recipe_id = ?'
		);
		final.forEach((id, i) => upd.run(i, playlistId, id));
	})();
}

function compact(db: Database.Database, playlistId: number): void {
	const ids = (
		db
			.prepare('SELECT recipe_id FROM playlist_recipes WHERE playlist_id = ? ORDER BY position')
			.all(playlistId) as { recipe_id: string }[]
	).map((r) => r.recipe_id);
	const upd = db.prepare(
		'UPDATE playlist_recipes SET position = ? WHERE playlist_id = ? AND recipe_id = ?'
	);
	ids.forEach((id, i) => upd.run(i, playlistId, id));
}

/** Ids of playlists containing a recipe. */
export function playlistIdsForRecipe(db: Database.Database, recipeId: string): number[] {
	return (
		db.prepare('SELECT playlist_id FROM playlist_recipes WHERE recipe_id = ?').all(recipeId) as {
			playlist_id: number;
		}[]
	).map((r) => r.playlist_id);
}
