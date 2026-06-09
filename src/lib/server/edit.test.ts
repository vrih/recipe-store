import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import {
	createRecipe,
	updateRecipe,
	deleteRecipe,
	reorderRecipeImages,
	deleteRecipeImage,
	ConflictError,
	NotFoundError,
	recipeInputFromForm,
	type RecipeInput
} from './edit.js';
import { getRecipeImages, getRecipeTags } from './recipes.js';

// Image file I/O is exercised separately; stub disk writes here so the DB
// logic for image rows/positions can be tested in isolation.
vi.mock('./images.js', () => ({
	saveImageBuffer: vi.fn(async () => 'images/x/' + Math.random().toString(36).slice(2) + '.png'),
	deleteImageFile: vi.fn(),
	deleteRecipeImages: vi.fn()
}));

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	return db;
}

function input(overrides: Partial<RecipeInput> = {}): RecipeInput {
	return {
		title: 'Test',
		text: '',
		yield: '',
		prepTime: '',
		cookTime: '',
		totalTime: '',
		ingredients: '',
		instructions: '',
		notes: '',
		nutrition: '',
		link: '',
		favorite: false,
		wantToCook: false,
		tags: [],
		...overrides
	};
}

let db: Database.Database;
beforeEach(() => {
	db = freshDb();
});

describe('createRecipe', () => {
	it('creates a recipe with version 1 and tags', () => {
		const id = createRecipe(db, input({ title: 'Soup', tags: ['Lunch', 'Easy'] }));
		const row = db.prepare('SELECT title, version FROM recipes WHERE id = ?').get(id) as {
			title: string;
			version: number;
		};
		expect(row).toMatchObject({ title: 'Soup', version: 1 });
		expect(getRecipeTags(db, id)).toEqual(['Easy', 'Lunch']);
	});
});

describe('updateRecipe (optimistic concurrency)', () => {
	it('updates and bumps the version when the expected version matches', () => {
		const id = createRecipe(db, input({ title: 'A' }));
		const newVersion = updateRecipe(db, id, 1, input({ title: 'B', tags: ['X'] }));
		expect(newVersion).toBe(2);
		const row = db.prepare('SELECT title FROM recipes WHERE id = ?').get(id) as { title: string };
		expect(row.title).toBe('B');
		expect(getRecipeTags(db, id)).toEqual(['X']);
	});

	it('throws ConflictError on a stale version (lost-update guard)', () => {
		const id = createRecipe(db, input());
		updateRecipe(db, id, 1, input({ title: 'first' })); // now version 2
		expect(() => updateRecipe(db, id, 1, input({ title: 'second' }))).toThrowError(ConflictError);
		// Original update preserved; stale write rejected.
		const row = db.prepare('SELECT title, version FROM recipes WHERE id = ?').get(id) as {
			title: string;
			version: number;
		};
		expect(row).toMatchObject({ title: 'first', version: 2 });
	});

	it('throws NotFoundError for a missing recipe', () => {
		expect(() => updateRecipe(db, 'nope', 1, input())).toThrowError(NotFoundError);
	});

	it('clears stale cook_progress on update', () => {
		const id = createRecipe(db, input());
		db.prepare(
			'INSERT INTO cook_progress (recipe_id, kind, item_key, done, updated_at) VALUES (?,?,?,1,?)'
		).run(id, 'ingredient', 'abc', Date.now());
		updateRecipe(db, id, 1, input({ title: 'changed' }));
		const count = db
			.prepare('SELECT COUNT(*) c FROM cook_progress WHERE recipe_id = ?')
			.get(id) as { c: number };
		expect(count.c).toBe(0);
	});
});

describe('deleteRecipe', () => {
	it('deletes and cascades to tags', () => {
		const id = createRecipe(db, input({ tags: ['T'] }));
		expect(deleteRecipe(db, id)).toBe(true);
		expect(db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id)).toBeUndefined();
		const links = db
			.prepare('SELECT COUNT(*) c FROM recipe_tags WHERE recipe_id = ?')
			.get(id) as { c: number };
		expect(links.c).toBe(0);
	});

	it('returns false for a missing recipe', () => {
		expect(deleteRecipe(db, 'missing')).toBe(false);
	});
});

describe('image ordering', () => {
	function addImages(id: string, n: number) {
		const ins = db.prepare(
			'INSERT INTO recipe_images (recipe_id, position, path) VALUES (?,?,?)'
		);
		for (let i = 0; i < n; i++) ins.run(id, i, `images/x/${i}.png`);
	}

	it('reorders images to the requested sequence', () => {
		const id = createRecipe(db, input());
		addImages(id, 3); // positions 0,1,2 -> paths 0,1,2
		reorderRecipeImages(db, id, [2, 0, 1]);
		expect(getRecipeImages(db, id)).toEqual(['images/x/2.png', 'images/x/0.png', 'images/x/1.png']);
	});

	it('ignores an invalid (non-permutation) order', () => {
		const id = createRecipe(db, input());
		addImages(id, 3);
		reorderRecipeImages(db, id, [0, 0, 1]);
		expect(getRecipeImages(db, id)).toEqual(['images/x/0.png', 'images/x/1.png', 'images/x/2.png']);
	});

	it('deletes an image and renumbers the rest contiguously', () => {
		const id = createRecipe(db, input());
		addImages(id, 3);
		deleteRecipeImage(db, id, 1);
		expect(getRecipeImages(db, id)).toEqual(['images/x/0.png', 'images/x/2.png']);
		const positions = db
			.prepare('SELECT position FROM recipe_images WHERE recipe_id = ? ORDER BY position')
			.all(id) as { position: number }[];
		expect(positions.map((p) => p.position)).toEqual([0, 1]);
	});
});

describe('recipeInputFromForm', () => {
	it('parses fields, checkboxes, and comma-separated tags', () => {
		const fd = new FormData();
		fd.set('title', '  Cake  ');
		fd.set('favorite', 'on');
		fd.set('tags', 'Dessert, Baking , ,Dessert');
		const parsed = recipeInputFromForm(fd);
		expect(parsed.title).toBe('Cake');
		expect(parsed.favorite).toBe(true);
		expect(parsed.wantToCook).toBe(false);
		expect(parsed.tags).toEqual(['Dessert', 'Baking', 'Dessert']);
	});
});
