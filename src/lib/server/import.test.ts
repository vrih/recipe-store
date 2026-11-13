import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { zipSync, strToU8 } from 'fflate';
import { runMigrations } from './migrate.js';
import { importStream } from './import.js';

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	return db;
}

function recipeBytes(obj: unknown): Uint8Array {
	return strToU8(JSON.stringify(obj));
}

async function* singleChunk(data: Uint8Array): AsyncIterable<Uint8Array> {
	yield data;
}

// Feed a buffer to the importer in small chunks to exercise streaming unzip.
async function* inChunks(data: Uint8Array, size = 64): AsyncIterable<Uint8Array> {
	for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
}

let db: Database.Database;
beforeEach(() => {
	db = freshDb();
});

// These exercise the upsert logic (dedupe/overwrite/tag-mapping/failure-recording/UUID
// generation) through importStream — the only import entry point production actually
// uses (the API route streams the request body straight into it).
describe('importStream — upsert behavior', () => {
	it('adds new recipes and maps categories to tags', async () => {
		const bytes = recipeBytes({
			id: 'example.com/r1',
			title: 'Recipe One',
			categories: ['Dinner', 'Vegetarian']
		});
		const summary = await importStream(db, 'r1.melarecipe', singleChunk(bytes));
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
		const withTitle = (title: string) => recipeBytes({ id: 'example.com/r1', title });
		await importStream(db, '1.melarecipe', singleChunk(withTitle('Recipe One')));
		const summary = await importStream(db, '2.melarecipe', singleChunk(withTitle('Changed')));

		expect(summary).toMatchObject({ added: 0, skipped: 1 });
		const recipe = db.prepare('SELECT title, version FROM recipes WHERE id = ?').get(
			'example.com/r1'
		) as { title: string; version: number };
		expect(recipe.title).toBe('Recipe One');
		expect(recipe.version).toBe(1);
	});

	it('overwrites existing recipes when conflict mode is overwrite', async () => {
		await importStream(
			db,
			'1.melarecipe',
			singleChunk(recipeBytes({ id: 'example.com/r1', title: 'Recipe One', categories: ['Old'] }))
		);
		const summary = await importStream(
			db,
			'2.melarecipe',
			singleChunk(recipeBytes({ id: 'example.com/r1', title: 'Updated', categories: ['New'] })),
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

	it('records failures without aborting the batch, keeping the source name', async () => {
		const zip = zipSync({
			'broken.melarecipe': strToU8('not-an-object'),
			'ok.melarecipe': recipeBytes({ id: 'example.com/ok', title: 'OK' })
		});
		const summary = await importStream(db, 'lib.melarecipes', singleChunk(zip));
		expect(summary.added).toBe(1);
		expect(summary.failed).toBe(1);
		expect(summary.failures[0].source).toContain('broken.melarecipe');
	});

	it('generates a UUID when a recipe has no id', async () => {
		const summary = await importStream(
			db,
			'noid.melarecipe',
			singleChunk(recipeBytes({ title: 'No Id' }))
		);
		expect(summary.added).toBe(1);
		const count = db.prepare('SELECT COUNT(*) as c FROM recipes').get() as { c: number };
		expect(count.c).toBe(1);
	});

	it('dedupes across separate import calls, matching the one-file-per-request API route', async () => {
		const bytes = () => recipeBytes({ id: 'x/dup', title: 'Dup' });
		await importStream(db, '1.melarecipe', singleChunk(bytes()));
		const summary = await importStream(db, '2.melarecipe', singleChunk(bytes()));
		expect(summary.added).toBe(0);
		expect(summary.skipped).toBe(1);
	});
});

describe('importStream (memory-safe streaming)', () => {
	it('streams recipes from an archive fed in small chunks', async () => {
		const zip = zipSync({
			'a.melarecipe': recipeBytes({ id: 'x/a', title: 'A', categories: ['Dinner'] }),
			'b.melarecipe': recipeBytes({ id: 'x/b', title: 'B' }),
			'__MACOSX/._a.melarecipe': strToU8('AppleDouble junk'),
			'bad.melarecipe': strToU8('{broken')
		});
		const summary = await importStream(db, 'library.melarecipes', inChunks(zip));
		expect(summary.added).toBe(2);
		expect(summary.failed).toBe(1); // bad.melarecipe; cruft is skipped, not failed
		const count = db.prepare('SELECT COUNT(*) c FROM recipes').get() as { c: number };
		expect(count.c).toBe(2);
	});

	it('recurses into a nested archive', async () => {
		const inner = zipSync({ 'n.melarecipe': recipeBytes({ id: 'x/n', title: 'Nested' }) });
		const outer = zipSync({ 'sub.melarecipes': inner });
		const summary = await importStream(db, 'outer.melarecipes', inChunks(outer));
		expect(summary.added).toBe(1);
		const row = db.prepare('SELECT title FROM recipes WHERE id = ?').get('x/n') as {
			title: string;
		};
		expect(row.title).toBe('Nested');
	});

	it('imports a single .melarecipe stream', async () => {
		const summary = await importStream(
			db,
			'one.melarecipe',
			inChunks(recipeBytes({ id: 'x/one', title: 'One' }))
		);
		expect(summary.added).toBe(1);
	});

	it('records a clear failure for a corrupt archive', async () => {
		const summary = await importStream(db, 'bad.melarecipes', inChunks(strToU8('not a zip at all')));
		expect(summary.added).toBe(0);
		expect(summary.failed).toBeGreaterThanOrEqual(1);
	});
});
