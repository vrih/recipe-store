import Anthropic from '@anthropic-ai/sdk';
import type { MelaRecipe } from './mela.js';

/** Whether the Claude-assisted URL import fallback is configured. */
export function claudeAvailable(): boolean {
	return !!process.env.ANTHROPIC_API_KEY;
}

function modelId(): string {
	return process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';
}

// Strict JSON schema for the extracted recipe. All fields required (the model
// emits empty string / empty array when a field isn't present), so the output
// is always a predictable shape.
const RECIPE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		title: { type: 'string' },
		text: { type: 'string', description: 'Short overview/description' },
		ingredients: { type: 'string', description: 'One ingredient per line; "# Heading" lines for sections' },
		instructions: { type: 'string', description: 'Steps separated by blank lines; markdown allowed' },
		yield: { type: 'string', description: 'Servings / quantity' },
		prepTime: { type: 'string' },
		cookTime: { type: 'string' },
		totalTime: { type: 'string' },
		notes: { type: 'string' },
		nutrition: { type: 'string' },
		categories: { type: 'array', items: { type: 'string' }, description: 'Tags / categories (no commas in a tag)' }
	},
	required: [
		'title', 'text', 'ingredients', 'instructions', 'yield',
		'prepTime', 'cookTime', 'totalTime', 'notes', 'nutrition', 'categories'
	]
} as const;

/** Strip tags/scripts/styles to a rough text representation, capped in length. */
function htmlToText(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60000);
}

const SYSTEM_PROMPT =
	'You extract a single cooking recipe from the provided web page content and ' +
	'return it as structured JSON. Use only information present on the page. Leave ' +
	'a field as an empty string (or empty array for categories) if it is not present. ' +
	'For ingredients, put one ingredient per line. For instructions, separate steps ' +
	'with blank lines. Do not prefix new lines with a number. Temperatures should only ' +
        'be presented in Celcius. If metric and imperial weights are both provided then ' +
        'just use the metric. Do not invent quantities, steps, or nutrition values.';

/**
 * Use Claude to extract a recipe from page content when structured data is
 * missing or incomplete. Returns a Mela-shaped recipe to pre-fill the editor.
 */
export async function extractWithClaude(html: string, url: string): Promise<MelaRecipe> {
	if (!claudeAvailable()) throw new Error('Claude fallback is not configured');

	const client = new Anthropic();
	const response = await client.messages.create({
		model: modelId(),
		max_tokens: 4096,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				content: `Source URL: ${url}\n\nPage content:\n${htmlToText(html)}`
			}
		],
		output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } }
	});

	const textBlock = response.content.find((b) => b.type === 'text');
	const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('Claude returned an unparseable response');
	}

	const s = (k: string) => (typeof parsed[k] === 'string' ? (parsed[k] as string) : '');
	return {
		title: s('title'),
		text: s('text'),
		ingredients: s('ingredients'),
		instructions: s('instructions'),
		yield: s('yield'),
		prepTime: s('prepTime'),
		cookTime: s('cookTime'),
		totalTime: s('totalTime'),
		notes: s('notes'),
		nutrition: s('nutrition'),
		categories: Array.isArray(parsed.categories)
			? (parsed.categories as unknown[]).map(String).filter(Boolean)
			: []
	};
}
