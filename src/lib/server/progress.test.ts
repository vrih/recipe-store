import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import { getProgress, setProgress, resetProgress } from './progress.js';

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	// cook_progress has no FK requirement on a real recipe row here.
	db.prepare(
		`INSERT INTO recipes (id, created_at, updated_at) VALUES ('r1', 0, 0)`
	).run();
	return db;
}

let db: Database.Database;
beforeEach(() => {
	db = freshDb();
});

describe('cook progress', () => {
	it('starts empty', () => {
		expect(getProgress(db, 'r1')).toEqual([]);
	});

	it('marks an item done and lists it as a composite key', () => {
		setProgress(db, 'r1', 'ingredient', 'abc', true);
		expect(getProgress(db, 'r1')).toEqual(['ingredient:abc']);
	});

	it('distinguishes ingredient and step keys', () => {
		setProgress(db, 'r1', 'ingredient', 'k', true);
		setProgress(db, 'r1', 'step', 'k', true);
		expect(getProgress(db, 'r1').sort()).toEqual(['ingredient:k', 'step:k']);
	});

	it('clearing an item removes it', () => {
		setProgress(db, 'r1', 'step', 's1', true);
		setProgress(db, 'r1', 'step', 's1', false);
		expect(getProgress(db, 'r1')).toEqual([]);
	});

	it('setting done twice is idempotent', () => {
		setProgress(db, 'r1', 'ingredient', 'x', true);
		setProgress(db, 'r1', 'ingredient', 'x', true);
		expect(getProgress(db, 'r1')).toEqual(['ingredient:x']);
	});

	it('reset clears all progress for the recipe', () => {
		setProgress(db, 'r1', 'ingredient', 'a', true);
		setProgress(db, 'r1', 'step', 'b', true);
		resetProgress(db, 'r1');
		expect(getProgress(db, 'r1')).toEqual([]);
	});
});
