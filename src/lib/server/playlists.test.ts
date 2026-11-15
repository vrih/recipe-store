import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import {
	listPlaylists,
	createPlaylist,
	renamePlaylist,
	deletePlaylist,
	getPlaylist,
	addToPlaylist,
	removeFromPlaylist,
	reorderPlaylist,
	playlistIdsForRecipe
} from './playlists.js';

let db: Database.Database;
beforeEach(() => {
	db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	for (const id of ['a', 'b', 'c']) {
		db.prepare('INSERT INTO recipes (id, title, created_at, updated_at) VALUES (?, ?, 0, 0)').run(
			id,
			`Recipe ${id}`
		);
	}
});

const ids = (pid: number) => getPlaylist(db, pid)!.recipes.map((r) => r.id);

describe('playlists', () => {
	it('creates, lists, renames and deletes', () => {
		const p = createPlaylist(db, '  Christmas  ')!;
		expect(p.name).toBe('Christmas');
		expect(createPlaylist(db, '   ')).toBeNull();
		expect(listPlaylists(db)).toEqual([{ id: p.id, name: 'Christmas', count: 0 }]);
		expect(renamePlaylist(db, p.id, 'Xmas')).toBe(true);
		expect(renamePlaylist(db, p.id, ' ')).toBe(false);
		expect(getPlaylist(db, p.id)!.name).toBe('Xmas');
		deletePlaylist(db, p.id);
		expect(getPlaylist(db, p.id)).toBeNull();
	});

	it('appends recipes in order and is idempotent', () => {
		const p = createPlaylist(db, 'x')!;
		expect(addToPlaylist(db, p.id, 'b')).toBe(true);
		expect(addToPlaylist(db, p.id, 'a')).toBe(true);
		expect(addToPlaylist(db, p.id, 'b')).toBe(true);
		expect(ids(p.id)).toEqual(['b', 'a']);
		expect(addToPlaylist(db, p.id, 'nope')).toBe(false);
		expect(addToPlaylist(db, 999, 'a')).toBe(false);
	});

	it('reorders, ignoring unknown and duplicate ids', () => {
		const p = createPlaylist(db, 'x')!;
		for (const r of ['a', 'b', 'c']) addToPlaylist(db, p.id, r);
		reorderPlaylist(db, p.id, ['c', 'zzz', 'c', 'a']);
		expect(ids(p.id)).toEqual(['c', 'a', 'b']);
	});

	it('removes and keeps order; deleting a recipe or playlist cascades', () => {
		const p = createPlaylist(db, 'x')!;
		for (const r of ['a', 'b', 'c']) addToPlaylist(db, p.id, r);
		removeFromPlaylist(db, p.id, 'b');
		expect(ids(p.id)).toEqual(['a', 'c']);
		addToPlaylist(db, p.id, 'b');
		expect(ids(p.id)).toEqual(['a', 'c', 'b']);
		db.prepare("DELETE FROM recipes WHERE id = 'a'").run();
		expect(ids(p.id)).toEqual(['c', 'b']);
		expect(playlistIdsForRecipe(db, 'c')).toEqual([p.id]);
		deletePlaylist(db, p.id);
		expect(playlistIdsForRecipe(db, 'c')).toEqual([]);
	});
});
