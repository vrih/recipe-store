import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import { importEntries } from './import.js';
import type { ParsedEntry } from './mela.js';

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	return db;
}

function entry(overrides: Record<string, unknown>): ParsedEntry {
	return {
		source: 'test.melarecipe',
		recipe: { id: 'example.com/r1', title: 'Recipe One', ...overrides }
	};
}

let db: Database.Database;
beforeEach(() => {
	db = freshDb();
});

describe('importEntries', () => {
	it('adds new recipes and maps categories to tags', async () => {
		const summary = await importEntries(db, [
			entry({ categories: ['Dinner', 'Vegetarian'] })
		]);
		expect(summary).toMatchObject({ added: 1, updated: 0, skipped: 0, failed: 0 });

		const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get('example.com/r1') as Record<
			string,
			unknown
		>;
		expect(recipe.title).toBe('Recipe One');
		expect(recipe.version).toBe(1);

		const tags = db
			.prepare(
				`SELECT t.name FROM tags t
         JOIN recipe_tags rt ON rt.tag_id = t.id
         WHERE rt.recipe_id = ? ORDER BY t.name`
			)
			.all('example.com/r1') as { name: string }[];
		expect(tags.map((t) => t.name)).toEqual(['Dinner', 'Vegetarian']);
	});

	it('skips existing recipes by default (dedupe by id)', async () => {
		await importEntries(db, [entry({})]);
		const summary = await importEntries(db, [entry({ title: 'Changed' })]);

		expect(summary).toMatchObject({ added: 0, skipped: 1 });
		const recipe = db.prepare('SELECT title, version FROM recipes WHERE id = ?').get(
			'example.com/r1'
		) as { title: string; version: number };
		expect(recipe.title).toBe('Recipe One');
		expect(recipe.version).toBe(1);
	});

	it('overwrites existing recipes when conflict mode is overwrite', async () => {
		await importEntries(db, [entry({ categories: ['Old'] })]);
		const summary = await importEntries(
			db,
			[entry({ title: 'Updated', categories: ['New'] })],
			'overwrite'
		);

		expect(summary).toMatchObject({ added: 0, updated: 1 });
		const recipe = db.prepare('SELECT title, version FROM recipes WHERE id = ?').get(
			'example.com/r1'
		) as { title: string; version: number };
		expect(recipe.title).toBe('Updated');
		expect(recipe.version).toBe(2);

		// Old tag association replaced.
		const tags = db
			.prepare(
				`SELECT t.name FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id WHERE rt.recipe_id = ?`
			)
			.all('example.com/r1') as { name: string }[];
		expect(tags.map((t) => t.name)).toEqual(['New']);
	});

	it('records failures without aborting the batch', async () => {
		const summary = await importEntries(db, [
			{ source: 'broken.melarecipe', error: 'bad json' },
			entry({ id: 'example.com/ok' })
		]);
		expect(summary.added).toBe(1);
		expect(summary.failed).toBe(1);
		expect(summary.failures[0].source).toBe('broken.melarecipe');
	});

	it('generates a UUID when a recipe has no id', async () => {
		const summary = await importEntries(db, [
			{ source: 'noid.melarecipe', recipe: { title: 'No Id' } }
		]);
		expect(summary.added).toBe(1);
		const count = db.prepare('SELECT COUNT(*) as c FROM recipes').get() as { c: number };
		expect(count.c).toBe(1);
	});
});
