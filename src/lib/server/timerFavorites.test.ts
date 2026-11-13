import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import { listFavorites, addFavorite, deleteFavorite } from './timerFavorites.js';

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	return db;
}

let db: Database.Database;
beforeEach(() => {
	db = freshDb();
});

describe('timer favorites', () => {
	it('starts empty', () => {
		expect(listFavorites(db)).toEqual([]);
	});

	it('adds and lists presets in insertion order', () => {
		addFavorite(db, 'Rice', 840);
		addFavorite(db, 'Pasta', 540);
		expect(listFavorites(db)).toEqual([
			{ id: expect.any(Number), label: 'Rice', seconds: 840 },
			{ id: expect.any(Number), label: 'Pasta', seconds: 540 }
		]);
	});

	it('is idempotent on the same label + duration', () => {
		const first = addFavorite(db, 'Rice', 840);
		const again = addFavorite(db, 'Rice', 840);
		expect(again.id).toBe(first.id);
		expect(listFavorites(db)).toHaveLength(1);
	});

	it('treats the same name with a different duration as distinct', () => {
		addFavorite(db, 'Rice', 840);
		addFavorite(db, 'Rice', 900);
		expect(listFavorites(db)).toHaveLength(2);
	});

	it('deletes a preset by id', () => {
		const fav = addFavorite(db, 'Rice', 840);
		deleteFavorite(db, fav.id);
		expect(listFavorites(db)).toEqual([]);
	});
});
