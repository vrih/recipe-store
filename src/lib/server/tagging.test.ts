import { describe, it, expect } from 'vitest';
import { normaliseTags, taxonomyTags, buildSweepSchema, buildSuggestSchema, MAX_TAGS } from './tagging.js';

describe('taxonomy', () => {
	it('has unique tags (case-insensitive) and no commas', () => {
		const tags = taxonomyTags();
		expect(new Set(tags.map((t) => t.toLowerCase())).size).toBe(tags.length);
		expect(tags.every((t) => !t.includes(','))).toBe(true);
	});

	it('constrains the sweep schema to the taxonomy', () => {
		const schema = buildSweepSchema();
		expect(schema.properties.tags.items.enum).toEqual(taxonomyTags());
	});

	it('constrains suggestions to the given vocabulary', () => {
		expect(buildSuggestSchema(['A', 'B']).properties.existing.items.enum).toEqual(['A', 'B']);
	});
});

describe('normaliseTags', () => {
	it('de-dupes case-insensitively and trims', () => {
		expect(normaliseTags(['  Soup ', 'soup', 'Main'])).toEqual(['Soup', 'Main']);
	});

	it('maps to canonical spelling and drops tags outside the allowed list', () => {
		expect(normaliseTags(['chinese', 'Martian', 'MAIN'], ['Chinese', 'Main'])).toEqual(['Chinese', 'Main']);
	});

	it('strips commas and caps the count', () => {
		expect(normaliseTags(['a, b'])).toEqual(['a b']);
		const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `t${i}`);
		expect(normaliseTags(many)).toHaveLength(MAX_TAGS);
	});
});
