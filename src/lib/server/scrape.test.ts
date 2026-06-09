import { describe, it, expect } from 'vitest';
import { extractJsonLd } from './scrape.js';

function pageWith(jsonLd: unknown): string {
	return `<html><head>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    </head><body>...</body></html>`;
}

const baseRecipe = {
	'@context': 'https://schema.org',
	'@type': 'Recipe',
	name: 'Pancakes',
	description: 'Fluffy pancakes',
	recipeIngredient: ['200g flour', '2 eggs', '300ml milk'],
	recipeInstructions: [
		{ '@type': 'HowToStep', text: 'Mix the batter.' },
		{ '@type': 'HowToStep', text: 'Cook on a griddle.' }
	],
	recipeYield: '4 servings',
	prepTime: 'PT10M',
	cookTime: 'PT20M',
	totalTime: 'PT30M',
	recipeCategory: 'Breakfast',
	keywords: 'easy, quick, brunch',
	image: 'https://example.com/pancakes.jpg'
};

describe('extractJsonLd', () => {
	it('maps a schema.org Recipe to the Mela model', () => {
		const result = extractJsonLd(pageWith(baseRecipe));
		expect(result).not.toBeNull();
		expect(result!.recipe.title).toBe('Pancakes');
		expect(result!.recipe.ingredients).toBe('200g flour\n2 eggs\n300ml milk');
		expect(result!.recipe.instructions).toBe('Mix the batter.\n\nCook on a griddle.');
		expect(result!.recipe.yield).toBe('4 servings');
		expect(result!.imageUrl).toBe('https://example.com/pancakes.jpg');
	});

	it('converts ISO 8601 durations to friendly strings', () => {
		const result = extractJsonLd(pageWith(baseRecipe))!;
		expect(result.recipe.prepTime).toBe('10 min');
		expect(result.recipe.cookTime).toBe('20 min');
		expect(result.recipe.totalTime).toBe('30 min');
		const longer = extractJsonLd(pageWith({ ...baseRecipe, totalTime: 'PT1H30M' }))!;
		expect(longer.recipe.totalTime).toBe('1 hr 30 min');
	});

	it('collects categories from category/cuisine/keywords without commas or dupes', () => {
		const result = extractJsonLd(pageWith(baseRecipe))!;
		expect(result.recipe.categories).toEqual(['Breakfast', 'easy', 'quick', 'brunch']);
	});

	it('handles HowToSection instructions with headers', () => {
		const withSections = {
			...baseRecipe,
			recipeInstructions: [
				{
					'@type': 'HowToSection',
					name: 'Batter',
					itemListElement: [
						{ '@type': 'HowToStep', text: 'Whisk flour and eggs.' },
						{ '@type': 'HowToStep', text: 'Add milk.' }
					]
				},
				{
					'@type': 'HowToSection',
					name: 'Cook',
					itemListElement: [{ '@type': 'HowToStep', text: 'Fry until golden.' }]
				}
			]
		};
		const result = extractJsonLd(pageWith(withSections))!;
		expect(result.recipe.instructions).toBe(
			'# Batter\n\nWhisk flour and eggs.\n\nAdd milk.\n\n# Cook\n\nFry until golden.'
		);
	});

	it('finds a Recipe inside an @graph array', () => {
		const graph = {
			'@context': 'https://schema.org',
			'@graph': [{ '@type': 'WebSite', name: 'Site' }, baseRecipe]
		};
		const result = extractJsonLd(pageWith(graph));
		expect(result!.recipe.title).toBe('Pancakes');
	});

	it('handles @type as an array, string instructions, and ImageObject', () => {
		const variant = {
			'@context': 'https://schema.org',
			'@type': ['Thing', 'Recipe'],
			name: 'Soup',
			recipeIngredient: ['water'],
			recipeInstructions: 'Boil water.\n\nServe.',
			image: { '@type': 'ImageObject', url: 'https://example.com/soup.png' }
		};
		const result = extractJsonLd(pageWith(variant))!;
		expect(result.recipe.title).toBe('Soup');
		expect(result.recipe.instructions).toBe('Boil water.\n\nServe.');
		expect(result.imageUrl).toBe('https://example.com/soup.png');
	});

	it('returns null when there is no Recipe', () => {
		expect(extractJsonLd(pageWith({ '@type': 'WebSite', name: 'Nope' }))).toBeNull();
		expect(extractJsonLd('<html><body>no json-ld</body></html>')).toBeNull();
	});

	it('ignores malformed JSON-LD blocks', () => {
		const html = `<script type="application/ld+json">{ broken</script>` + pageWith(baseRecipe);
		expect(extractJsonLd(html)!.recipe.title).toBe('Pancakes');
	});
});
