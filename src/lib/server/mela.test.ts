import { describe, it, expect } from 'vitest';
import { strToU8 } from 'fflate';
import { parseMelaRecipe, isMacOsCruft, appleDateToUnixMs, APPLE_EPOCH_OFFSET } from './mela.js';

const sampleRecipe = {
	id: 'example.com/pancakes',
	title: 'Pancakes',
	categories: ['Breakfast', 'Quick'],
	ingredients: '# Batter\n200g flour\n2 eggs',
	instructions: 'Mix.\n\nCook.',
	favorite: true,
	date: 0
};

function recipeBytes(obj: unknown): Uint8Array {
	return strToU8(JSON.stringify(obj));
}

describe('appleDateToUnixMs', () => {
	it('converts the Apple epoch to 2001-01-01 UTC', () => {
		expect(appleDateToUnixMs(0)).toBe(APPLE_EPOCH_OFFSET * 1000);
		expect(new Date(appleDateToUnixMs(0)!).toISOString()).toBe('2001-01-01T00:00:00.000Z');
	});

	it('returns null for missing or invalid values', () => {
		expect(appleDateToUnixMs(undefined)).toBeNull();
		expect(appleDateToUnixMs(null)).toBeNull();
		expect(appleDateToUnixMs(NaN)).toBeNull();
	});
});

describe('parseMelaRecipe', () => {
	it('parses a valid recipe JSON', () => {
		const r = parseMelaRecipe(recipeBytes(sampleRecipe));
		expect(r.title).toBe('Pancakes');
		expect(r.categories).toEqual(['Breakfast', 'Quick']);
	});

	it('throws on malformed JSON', () => {
		expect(() => parseMelaRecipe(strToU8('{not json'))).toThrow();
	});

	it('throws when the JSON is not an object', () => {
		expect(() => parseMelaRecipe(strToU8('[1,2,3]'))).toThrow();
	});
});

// Archive parsing (recursion, macOS-cruft skipping, malformed-entry capture,
// and dispatch-by-extension) is exercised end-to-end via the streaming import
// path in import.test.ts's `importStream` suite, which is what production
// actually uses — no separate coverage needed here.

describe('isMacOsCruft', () => {
	it('recognises __MACOSX entries and .DS_Store files', () => {
		expect(isMacOsCruft('__MACOSX/._pancakes.melarecipe')).toBe(true);
		expect(isMacOsCruft('some/dir/.DS_Store')).toBe(true);
		expect(isMacOsCruft('.DS_Store')).toBe(true);
		expect(isMacOsCruft('pancakes.melarecipe')).toBe(false);
	});
});
