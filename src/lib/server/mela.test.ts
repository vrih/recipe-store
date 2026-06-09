import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
	parseMelaRecipe,
	parseMelaArchive,
	parseUpload,
	appleDateToUnixMs,
	APPLE_EPOCH_OFFSET
} from './mela.js';

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

describe('parseMelaArchive', () => {
	it('extracts recipes from a flat archive', () => {
		const zip = zipSync({
			'pancakes.melarecipe': recipeBytes(sampleRecipe),
			'waffles.melarecipe': recipeBytes({ ...sampleRecipe, id: 'x/waffles', title: 'Waffles' })
		});
		const entries = parseMelaArchive(zip);
		expect(entries).toHaveLength(2);
		expect(entries.map((e) => e.recipe?.title).sort()).toEqual(['Pancakes', 'Waffles']);
	});

	it('recurses into nested archives', () => {
		const inner = zipSync({ 'pancakes.melarecipe': recipeBytes(sampleRecipe) });
		const outer = zipSync({ 'nested.melarecipes': inner });
		const entries = parseMelaArchive(outer);
		expect(entries).toHaveLength(1);
		expect(entries[0].recipe?.title).toBe('Pancakes');
	});

	it('ignores macOS cruft and captures malformed entries', () => {
		const zip = zipSync({
			'__MACOSX/._pancakes.melarecipe': strToU8('garbage'),
			'good.melarecipe': recipeBytes(sampleRecipe),
			'bad.melarecipe': strToU8('{broken')
		});
		const entries = parseMelaArchive(zip);
		expect(entries).toHaveLength(2);
		expect(entries.filter((e) => e.recipe)).toHaveLength(1);
		expect(entries.filter((e) => e.error)).toHaveLength(1);
	});
});

describe('parseUpload', () => {
	it('dispatches single recipe files', () => {
		const entries = parseUpload('pancakes.melarecipe', recipeBytes(sampleRecipe));
		expect(entries).toHaveLength(1);
		expect(entries[0].recipe?.title).toBe('Pancakes');
	});

	it('dispatches archive files', () => {
		const zip = zipSync({ 'pancakes.melarecipe': recipeBytes(sampleRecipe) });
		const entries = parseUpload('library.melarecipes', zip);
		expect(entries).toHaveLength(1);
	});

	it('captures a malformed single file without throwing', () => {
		const entries = parseUpload('bad.melarecipe', strToU8('{broken'));
		expect(entries).toHaveLength(1);
		expect(entries[0].error).toBeDefined();
	});
});
