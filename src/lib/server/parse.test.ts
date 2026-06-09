import { describe, it, expect } from 'vitest';
import { parseIngredients, parseInstructions } from './parse.js';

describe('parseIngredients', () => {
	it('splits lines into items and detects section headers', () => {
		const items = parseIngredients('# Batter\n200g flour\n2 eggs\n\n# Topping\nSyrup');
		expect(items).toHaveLength(5);
		expect(items[0]).toMatchObject({ type: 'header', text: 'Batter' });
		expect(items[1]).toMatchObject({ type: 'item', text: '200g flour' });
		expect(items[3]).toMatchObject({ type: 'header', text: 'Topping' });
	});

	it('gives items stable, unique keys', () => {
		const items = parseIngredients('flour\neggs').filter((i) => i.type === 'item');
		expect(items[0].key).toBeTruthy();
		expect(items[0].key).not.toBe(items[1].key);

		// Re-parsing the same input yields the same keys (stable).
		const again = parseIngredients('flour\neggs').filter((i) => i.type === 'item');
		expect(again.map((i) => i.key)).toEqual(items.map((i) => i.key));
	});

	it('disambiguates duplicate lines with an index suffix', () => {
		const items = parseIngredients('salt\nsalt').filter((i) => i.type === 'item');
		expect(items[0].key).not.toBe(items[1].key);
	});

	it('returns empty for blank input', () => {
		expect(parseIngredients('')).toEqual([]);
		expect(parseIngredients(null)).toEqual([]);
	});
});

describe('parseInstructions', () => {
	it('splits on blank lines when present', () => {
		const steps = parseInstructions('Mix the batter.\n\nCook on a griddle.\n\nServe.');
		expect(steps).toHaveLength(3);
		expect(steps[0].text).toBe('Mix the batter.');
	});

	it('falls back to single newlines when no blank-line separators', () => {
		const steps = parseInstructions('Step one\nStep two\nStep three');
		expect(steps).toHaveLength(3);
	});

	it('gives each step a stable key', () => {
		const steps = parseInstructions('Mix.\n\nCook.');
		expect(steps[0].key).toBeTruthy();
		expect(steps[0].key).not.toBe(steps[1].key);
	});

	it('returns empty for blank input', () => {
		expect(parseInstructions('')).toEqual([]);
		expect(parseInstructions('   ')).toEqual([]);
	});
});
