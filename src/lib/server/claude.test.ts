import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
	default: class {
		messages = { create: createMock };
	}
}));

import { claudeAvailable, pickCleanupFields, cleanupRecipe } from './claude.js';

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
