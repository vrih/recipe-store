import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import { createRecipe, type RecipeInput } from './edit.js';
import { searchRecipeCards, listTags } from './recipes.js';

vi.mock('./images.js', () => ({
	saveImageBuffer: vi.fn(),
	deleteImageFile: vi.fn(),
	deleteRecipeImages: vi.fn(),
	thumbPathFor: (p: string) => p.replace(/\.\w+$/, '_thumb.webp')
}));

function freshDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	runMigrations(db);
	return db;
}

function make(db: Database.Database, o: Partial<RecipeInput>): string {
	const base: RecipeInput = {
		title: '', text: '', yield: '', prepTime: '', cookTime: '', totalTime: '',
		ingredients: '', instructions: '', notes: '', nutrition: '', link: '',
		favorite: false, wantToCook: false, tags: []
	};
	return createRecipe(db, { ...base, ...o });
}

let db: Database.Database;
beforeEach(() => {
	db = freshDb();
	make(db, { title: 'Chocolate Cake', ingredients: 'flour\ncocoa\nsugar', tags: ['Dessert', 'Baking'], favorite: true });
	make(db, { title: 'Carrot Soup', ingredients: 'carrots\nstock', tags: ['Dinner', 'Soup'], wantToCook: true });
	make(db, { title: 'Beef Stew', ingredients: 'beef\npotato', tags: ['Dinner'] });
});

function titles(cards: { title: string }[]): string[] {
	return cards.map((c) => c.title).sort();
}

describe('searchRecipeCards — text', () => {
	it('matches titles by FTS prefix', () => {
		expect(titles(searchRecipeCards(db, { q: 'choc' }))).toEqual(['Chocolate Cake']);
	});

	it('matches ingredients', () => {
		expect(titles(searchRecipeCards(db, { q: 'carrot' }))).toEqual(['Carrot Soup']);
	});

	it('matches by tag name', () => {
		expect(titles(searchRecipeCards(db, { q: 'baking' }))).toEqual(['Chocolate Cake']);
	});

	it('returns everything for an empty query', () => {
		expect(searchRecipeCards(db, { q: '' })).toHaveLength(3);
	});

	it('does not throw on punctuation-only queries', () => {
		expect(() => searchRecipeCards(db, { q: '!!!' })).not.toThrow();
		expect(searchRecipeCards(db, { q: '!!!' })).toHaveLength(0);
	});

	it('does not throw on FTS special characters', () => {
		expect(() => searchRecipeCards(db, { q: 'cake AND "soup' })).not.toThrow();
	});
});

describe('searchRecipeCards — filters', () => {
	it('filters by a single tag', () => {
		expect(titles(searchRecipeCards(db, { tags: ['Dinner'] }))).toEqual(['Beef Stew', 'Carrot Soup']);
	});

	it('ANDs multiple tags', () => {
		expect(titles(searchRecipeCards(db, { tags: ['Dinner', 'Soup'] }))).toEqual(['Carrot Soup']);
	});

	it('filters by favourite', () => {
		expect(titles(searchRecipeCards(db, { favorite: true }))).toEqual(['Chocolate Cake']);
	});

	it('filters by want-to-cook', () => {
		expect(titles(searchRecipeCards(db, { wantToCook: true }))).toEqual(['Carrot Soup']);
	});

	it('combines text and tag filters', () => {
		expect(titles(searchRecipeCards(db, { q: 'soup', tags: ['Dinner'] }))).toEqual(['Carrot Soup']);
	});
});

describe('listTags', () => {
	it('lists tags with recipe counts', () => {
		const tags = listTags(db);
		const dinner = tags.find((t) => t.name === 'Dinner');
		expect(dinner?.count).toBe(2);
		expect(tags.find((t) => t.name === 'Baking')?.count).toBe(1);
	});
});
