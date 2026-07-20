import type Database from 'better-sqlite3';

/**
 * Resolve tag names to ids, creating any that don't exist yet. De-dupes the
 * given names case-insensitively (tags are unique COLLATE NOCASE).
 */
export function resolveTagIds(db: Database.Database, names: string[]): number[] {
	const insert = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
	const select = db.prepare('SELECT id FROM tags WHERE name = ?');
	const ids: number[] = [];
	const seen = new Set<string>();
	for (const raw of names) {
		const name = raw.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		insert.run(name);
		const row = select.get(name) as { id: number } | undefined;
		if (row) ids.push(row.id);
	}
	return ids;
}

/** Replace a recipe's tag associations with the given names (creating tags as needed). */
export function setRecipeTags(db: Database.Database, recipeId: string, names: string[]): void {
	db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(recipeId);
	const link = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');
	for (const tagId of resolveTagIds(db, names)) link.run(recipeId, tagId);
}
