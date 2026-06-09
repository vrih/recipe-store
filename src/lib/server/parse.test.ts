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

	it('treats lines starting with # as section headers (blank-line mode)', () => {
		const items = parseInstructions('# Prep\n\nChop onions.\n\n# Cook\n\nFry until golden.');
		expect(items.map((i) => i.type)).toEqual(['header', 'step', 'header', 'step']);
		expect(items[0]).toMatchObject({ type: 'header', text: 'Prep' });
		expect(items[2]).toMatchObject({ type: 'header', text: 'Cook' });
		expect(items[1].text).toBe('Chop onions.');
	});

	it('detects a header even when not blank-separated from its step', () => {
		const items = parseInstructions('# Prep\nChop onions.\nMince garlic.\n\n# Cook\nFry.');
		const headers = items.filter((i) => i.type === 'header').map((i) => i.text);
		expect(headers).toEqual(['Prep', 'Cook']);
	});

	it('handles headers in single-newline (one step per line) mode', () => {
		const items = parseInstructions('# Prep\nChop.\n# Cook\nFry.\nServe.');
		expect(items.map((i) => i.type)).toEqual(['header', 'step', 'header', 'step', 'step']);
	});

	it('only steps get strikeable keys; headers are not strikeable progress', () => {
		const items = parseInstructions('# Section\n\nDo a thing.');
		const step = items.find((i) => i.type === 'step')!;
		expect(step.key).toBeTruthy();
		// keys are unique across all items (no keyed-each collisions)
		const keys = items.map((i) => i.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
