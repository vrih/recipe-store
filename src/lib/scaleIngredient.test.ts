import { describe, it, expect } from 'vitest';
import { scaleIngredient, formatQuantity } from './scaleIngredient.js';

// ── formatQuantity ─────────────────────────────────────────────────────────
describe('formatQuantity', () => {
	it('returns integers for whole numbers', () => {
		expect(formatQuantity(1)).toBe('1');
		expect(formatQuantity(2)).toBe('2');
		expect(formatQuantity(10)).toBe('10');
		expect(formatQuantity(0.5 * 2)).toBe('1');
	});

	it('uses unicode fractions for common values', () => {
		expect(formatQuantity(0.5)).toBe('½');
		expect(formatQuantity(0.25)).toBe('¼');
		expect(formatQuantity(0.75)).toBe('¾');
		expect(formatQuantity(1 / 3)).toBe('⅓');
		expect(formatQuantity(2 / 3)).toBe('⅔');
		expect(formatQuantity(0.125)).toBe('⅛');
	});

	it('combines whole + unicode fraction', () => {
		expect(formatQuantity(1.5)).toBe('1½');
		expect(formatQuantity(2.25)).toBe('2¼');
		expect(formatQuantity(1 + 1 / 3)).toBe('1⅓');
	});

	it('falls back to 1 decimal for non-standard fractions', () => {
		expect(formatQuantity(1.6)).toBe('1.6');
		expect(formatQuantity(2.4)).toBe('2.4');
	});
});

// ── scaleIngredient — scale ≈ 1 ───────────────────────────────────────────
describe('scaleIngredient — identity', () => {
	it('returns the line unchanged when scale is 1', () => {
		expect(scaleIngredient('200g spaghetti', 1)).toBe('200g spaghetti');
		expect(scaleIngredient('2 eggs', 1)).toBe('2 eggs');
		expect(scaleIngredient('Salt and pepper', 1)).toBe('Salt and pepper');
	});
});

// ── scaleIngredient — plain integers ─────────────────────────────────────
describe('scaleIngredient — plain integers', () => {
	it('doubles a plain integer', () => {
		expect(scaleIngredient('2 eggs', 2)).toBe('4 eggs');
		expect(scaleIngredient('3 cloves garlic', 2)).toBe('6 cloves garlic');
	});

	it('halves a plain integer', () => {
		expect(scaleIngredient('4 eggs', 0.5)).toBe('2 eggs');
		expect(scaleIngredient('3 cups flour', 1 / 3)).toBe('1 cups flour');
	});

	it('scales a number attached directly to a unit', () => {
		expect(scaleIngredient('200g spaghetti', 2)).toBe('400 g spaghetti');
		expect(scaleIngredient('400g tinned tomatoes', 0.5)).toBe('200 g tinned tomatoes');
		expect(scaleIngredient('100ml milk', 3)).toBe('300 ml milk');
	});
});

// ── scaleIngredient — unicode fractions ───────────────────────────────────
describe('scaleIngredient — unicode fractions', () => {
	it('scales lone unicode fractions', () => {
		expect(scaleIngredient('½ tsp salt', 2)).toBe('1 tsp salt');
		expect(scaleIngredient('¼ cup oil', 4)).toBe('1 cup oil');
		expect(scaleIngredient('¾ cup sugar', 2)).toBe('1½ cup sugar');
	});

	it('scales mixed integer + unicode fraction', () => {
		expect(scaleIngredient('1½ cups flour', 2)).toBe('3 cups flour');
		expect(scaleIngredient('2½ tbsp butter', 2)).toBe('5 tbsp butter');
	});
});

// ── scaleIngredient — ascii fractions ────────────────────────────────────
describe('scaleIngredient — ascii fractions', () => {
	it('scales ascii fractions', () => {
		expect(scaleIngredient('1/2 tsp baking powder', 2)).toBe('1 tsp baking powder');
		expect(scaleIngredient('3/4 cup milk', 2)).toBe('1½ cup milk');
		expect(scaleIngredient('1/4 tsp salt', 3)).toBe('¾ tsp salt');
	});
});

// ── scaleIngredient — mixed numbers ──────────────────────────────────────
describe('scaleIngredient — mixed numbers', () => {
	it('scales mixed numbers "1 1/2"', () => {
		expect(scaleIngredient('1 1/2 cups flour', 2)).toBe('3 cups flour');
		expect(scaleIngredient('2 1/4 tsp yeast', 2)).toBe('4½ tsp yeast');
	});
});

// ── scaleIngredient — ranges ──────────────────────────────────────────────
describe('scaleIngredient — ranges', () => {
	it('scales both ends of a hyphen range', () => {
		expect(scaleIngredient('2-3 cloves garlic', 2)).toBe('4–6 cloves garlic');
		expect(scaleIngredient('3-4 tbsp olive oil', 2)).toBe('6–8 tbsp olive oil');
	});

	it('scales en-dash and "to" ranges', () => {
		expect(scaleIngredient('1–2 cups broth', 2)).toBe('2–4 cups broth');
		expect(scaleIngredient('2 to 3 tbsp sugar', 2)).toBe('4–6 tbsp sugar');
	});
});

// ── scaleIngredient — indefinite article ─────────────────────────────────
describe('scaleIngredient — "a" / "an"', () => {
	it('treats "a" and "an" as 1', () => {
		expect(scaleIngredient('a pinch of salt', 2)).toBe('2 pinch of salt');
		expect(scaleIngredient('an onion, diced', 3)).toBe('3 onion, diced');
	});
});

// ── scaleIngredient — no leading quantity ────────────────────────────────
describe('scaleIngredient — no quantity', () => {
	it('returns the line unchanged when no quantity is found', () => {
		expect(scaleIngredient('Salt and pepper to taste', 2)).toBe('Salt and pepper to taste');
		expect(scaleIngredient('Fresh herbs', 3)).toBe('Fresh herbs');
	});
});

// ── scaleIngredient — realistic recipe lines ─────────────────────────────
describe('scaleIngredient — realistic lines', () => {
	it('handles a variety of real-world formats at ×2', () => {
		const cases: [string, string][] = [
			['2 eggs', '4 eggs'],
			['200g spaghetti', '400 g spaghetti'],
			['400g tinned plum tomatoes', '800 g tinned plum tomatoes'],
			['2 cloves garlic, sliced', '4 cloves garlic, sliced'],
			['3 tbsp olive oil', '6 tbsp olive oil'],
			['1 handful fresh basil', '2 handful fresh basil'],
			['30g Parmesan, grated', '60 g Parmesan, grated'],
			['1 1/2 tsp baking powder', '3 tsp baking powder'],
			['¾ cup brown sugar', '1½ cup brown sugar'],
		];
		for (const [input, expected] of cases) {
			expect(scaleIngredient(input, 2), input).toBe(expected);
		}
	});
});
