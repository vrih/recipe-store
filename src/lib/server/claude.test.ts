import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
	default: class {
		messages = { create: createMock };
	}
}));

import { claudeAvailable, pickCleanupFields, cleanupRecipe, suggestTags } from './claude.js';

describe('claudeAvailable', () => {
	const original = process.env.ANTHROPIC_API_KEY;
	afterEach(() => {
		if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
		else process.env.ANTHROPIC_API_KEY = original;
	});

	it('reflects whether ANTHROPIC_API_KEY is set', () => {
		delete process.env.ANTHROPIC_API_KEY;
		expect(claudeAvailable()).toBe(false);
		process.env.ANTHROPIC_API_KEY = 'sk-test';
		expect(claudeAvailable()).toBe(true);
	});
});

describe('pickCleanupFields', () => {
	it('defaults missing/undefined fields to empty strings', () => {
		expect(pickCleanupFields({ title: 'Soup' })).toEqual({
			title: 'Soup',
			text: '',
			ingredients: '',
			instructions: '',
			yield: '',
			prepTime: '',
			cookTime: '',
			totalTime: '',
			notes: '',
			nutrition: ''
		});
	});

	it('passes through fields already present, ignoring extras like categories/link', () => {
		const result = pickCleanupFields({
			title: 'Soup',
			ingredients: 'water',
			// @ts-expect-error extra fields from a wider MelaRecipe/RecipeInput are fine to pass in
			categories: ['dinner'],
			link: 'https://example.com'
		});
		expect(result).toEqual({
			title: 'Soup',
			text: '',
			ingredients: 'water',
			instructions: '',
			yield: '',
			prepTime: '',
			cookTime: '',
			totalTime: '',
			notes: '',
			nutrition: ''
		});
	});
});

describe('cleanupRecipe', () => {
	beforeEach(() => {
		process.env.ANTHROPIC_API_KEY = 'sk-test';
		createMock.mockReset();
	});

	it('throws when Claude is not configured', async () => {
		delete process.env.ANTHROPIC_API_KEY;
		await expect(cleanupRecipe(pickCleanupFields({ title: 'Soup' }))).rejects.toThrow(
			'Claude is not configured'
		);
	});

	it('parses the cleaned fields out of the JSON text response', async () => {
		createMock.mockResolvedValue({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						title: 'Tomato Soup',
						text: 'A warming soup.',
						ingredients: '400g tomatoes\n1 onion',
						instructions: 'Simmer everything.',
						yield: '4 servings',
						prepTime: '10 min',
						cookTime: '20 min',
						totalTime: '30 min',
						notes: '',
						nutrition: ''
					})
				}
			]
		});

		const result = await cleanupRecipe(
			pickCleanupFields({ title: 'tomato soup', ingredients: '400g tomatoes,1 onion' })
		);

		expect(result.title).toBe('Tomato Soup');
		expect(result.ingredients).toBe('400g tomatoes\n1 onion');
		expect(createMock).toHaveBeenCalledOnce();
	});

	it('throws when Claude returns unparseable JSON', async () => {
		createMock.mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] });
		await expect(cleanupRecipe(pickCleanupFields({ title: 'Soup' }))).rejects.toThrow(
			'Claude returned an unparseable response'
		);
	});
});

describe('suggestTags', () => {
	const recipe = { title: 'Pad Thai', text: '', ingredients: 'noodles\nprawns', instructions: 'Stir fry.' };

	beforeEach(() => {
		createMock.mockReset();
		process.env.ANTHROPIC_API_KEY = 'sk-test';
	});

	function respond(payload: unknown) {
		createMock.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(payload) }] });
	}

	it('returns existing and new suggestions, excluding tags the recipe already has', async () => {
		respond({ existing: ['Thai', 'noodles', 'Main'], new: ['Street Food', 'Thai'] });
		const out = await suggestTags(recipe, ['Thai', 'Noodles'], ['Main']);
		expect(out.existing).toEqual(['Thai', 'Noodles']);
		// "Thai" is already known so isn't offered as new.
		expect(out.new).toEqual(['Street Food']);
	});

	it('drops "existing" tags that are not in the vocabulary', async () => {
		respond({ existing: ['Klingon'], new: [] });
		const out = await suggestTags(recipe, [], []);
		expect(out.existing).toEqual([]);
	});

	it('passes the vocabulary as an enum in the schema', async () => {
		respond({ existing: [], new: [] });
		await suggestTags(recipe, ['Zesty'], []);
		const schema = createMock.mock.calls[0][0].output_config.format.schema;
		expect(schema.properties.existing.items.enum).toContain('Zesty');
	});

	it('throws when Claude is not configured', async () => {
		delete process.env.ANTHROPIC_API_KEY;
		await expect(suggestTags(recipe, [], [])).rejects.toThrow('not configured');
	});
});
