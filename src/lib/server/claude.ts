import Anthropic from '@anthropic-ai/sdk';
import type { MelaRecipe } from './mela.js';
import {
	SUGGEST_SYSTEM_PROMPT,
	buildSuggestSchema,
	normaliseTags,
	recipeDigest,
	taxonomyTags
} from './tagging.js';

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

const SYSTEM_PROMPT = `You extract a single cooking recipe from the provided web page content and return it as structured JSON.

- Use only information present on the page. Never invent quantities, steps, times, or nutrition values. Leave a field as an empty string (or empty array for categories) if the page does not provide it.
- If the page contains more than one recipe, extract only the main one — the recipe the page title is about — and ignore "related recipes", ads, and comments.
- title: the dish name only. Drop site names, author names, and SEO fluff like "Best Ever!" or "| SiteName".
- text: a one- or two-sentence overview of the dish. Put storage advice, substitutions, and serving tips in notes instead.
- ingredients: one ingredient per line, in the order given. Begin a section heading line with "# " (e.g. "# For the sauce"). No bullets or numbering.
- instructions: one step per paragraph, separated by blank lines. Begin a section heading line with "# ". Do not number steps. Keep every step and its stated times and temperatures.
- Times (prepTime/cookTime/totalTime): short form, e.g. "10 min", "1 hr 30 min".
- Units: metric only. If metric and imperial are both given, keep just the metric. Temperatures in Celsius only — convert from Fahrenheit or gas mark if needed.
- categories: a few short tags (course, cuisine, main ingredient). No commas inside a tag.
- nutrition: only values the page states, one per line as "- **Label:** value".`;

/** Pull the JSON text block out of a Claude response and parse it. */
function parseJsonResponse(response: Anthropic.Messages.Message): Record<string, unknown> {
	const textBlock = response.content.find((b) => b.type === 'text');
	const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
	try {
		return JSON.parse(raw);
	} catch {
		throw new Error('Claude returned an unparseable response');
	}
}

const CLEANUP_FIELD_KEYS = [
	'title', 'text', 'ingredients', 'instructions', 'yield',
	'prepTime', 'cookTime', 'totalTime', 'notes', 'nutrition'
] as const;

/** Pull the shared recipe-text fields out of a parsed Claude JSON response, defaulting missing/non-string values to ''. */
function extractCleanupFields(parsed: Record<string, unknown>): CleanupInput {
	const out = {} as CleanupInput;
	for (const key of CLEANUP_FIELD_KEYS) {
		out[key] = typeof parsed[key] === 'string' ? (parsed[key] as string) : '';
	}
	return out;
}

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

	const parsed = parseJsonResponse(response);
	return {
		...extractCleanupFields(parsed),
		categories: Array.isArray(parsed.categories)
			? (parsed.categories as unknown[]).map(String).filter(Boolean)
			: []
	};
}

/** The recipe text fields eligible for Claude cleanup (no categories/link/flags). */
export interface CleanupInput {
	title: string;
	text: string;
	ingredients: string;
	instructions: string;
	yield: string;
	prepTime: string;
	cookTime: string;
	totalTime: string;
	notes: string;
	nutrition: string;
}

/** Narrow any object with (at least) the cleanup fields down to CleanupInput. */
export function pickCleanupFields(x: Partial<CleanupInput>): CleanupInput {
	return {
		title: x.title ?? '',
		text: x.text ?? '',
		ingredients: x.ingredients ?? '',
		instructions: x.instructions ?? '',
		yield: x.yield ?? '',
		prepTime: x.prepTime ?? '',
		cookTime: x.cookTime ?? '',
		totalTime: x.totalTime ?? '',
		notes: x.notes ?? '',
		nutrition: x.nutrition ?? ''
	};
}

const CLEANUP_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		title: { type: 'string' },
		text: { type: 'string' },
		ingredients: { type: 'string' },
		instructions: { type: 'string' },
		yield: { type: 'string' },
		prepTime: { type: 'string' },
		cookTime: { type: 'string' },
		totalTime: { type: 'string' },
		notes: { type: 'string' },
		nutrition: { type: 'string' }
	},
	required: [
		'title', 'text', 'ingredients', 'instructions', 'yield',
		'prepTime', 'cookTime', 'totalTime', 'notes', 'nutrition'
	]
} as const;

const CLEANUP_SYSTEM_PROMPT = `You tidy up a recipe's text for readability without changing its meaning. Fix broken formatting, stray HTML entities, mangled characters, and inconsistent spacing or line breaks.

- Keep the ingredient list and instructions the same in substance — do not invent, reorder, merge, or split steps or ingredients, and do not change quantities, units, or temperatures.
- Never remove a time or duration from an instruction step (e.g. "fry for 2–3 minutes") — the app turns these into timers.
- You may remove information a competent cook would not need — filler commentary, backstory, marketing copy, or restated obvious technique — but never an actual ingredient, quantity, or instruction step.
- title: the dish name only; strip site branding and SEO phrases.
- One ingredient per line; blank line between instruction steps; no numbering prefixes. Precede section headings with "# ".
- Normalise the prep/cook/total time fields to short form, e.g. "10 min", "1 hr 30 min".
- Where a quantity, unit, or temperature is given in both metric and imperial, keep only the metric; temperatures in Celsius only.
- Preserve the original language. Make instructions direct — avoid flowery language. If a field is already clean, return it unchanged; leave empty fields empty.`;

/**
 * Ask Claude to tidy up a recipe's text fields. Returns a cleaned copy —
 * callers present it alongside the original for the user to choose from.
 */
export async function cleanupRecipe(input: CleanupInput): Promise<CleanupInput> {
	if (!claudeAvailable()) throw new Error('Claude is not configured');

	const client = new Anthropic();
	const response = await client.messages.create({
		model: modelId(),
		max_tokens: 4096,
		system: CLEANUP_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: JSON.stringify(input) }],
		output_config: { format: { type: 'json_schema', schema: CLEANUP_SCHEMA } }
	});

	return extractCleanupFields(parseJsonResponse(response));
}

export interface TagSuggestions {
	/** Suggestions drawn from the library's existing vocabulary. */
	existing: string[];
	/** Suggestions that would create a brand-new tag. */
	new: string[];
}

/**
 * Ask Claude to suggest tags for a recipe. `libraryTags` is the set of tags
 * already in use; the canonical taxonomy is always included. Tags the recipe
 * already has are excluded from the result.
 */
export async function suggestTags(
	recipe: Pick<CleanupInput, 'title' | 'text' | 'ingredients' | 'instructions'>,
	libraryTags: string[],
	currentTags: string[]
): Promise<TagSuggestions> {
	if (!claudeAvailable()) throw new Error('Claude is not configured');

	// Full de-duped vocabulary (not capped, so not via normaliseTags).
	const seen = new Set<string>();
	const vocab: string[] = [];
	for (const t of [...taxonomyTags(), ...libraryTags]) {
		const k = t.trim().toLowerCase();
		if (!k || seen.has(k)) continue;
		seen.add(k);
		vocab.push(t.trim());
	}

	const client = new Anthropic();
	const response = await client.messages.create({
		model: modelId(),
		max_tokens: 512,
		system: SUGGEST_SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				content:
					`Library vocabulary: ${JSON.stringify(vocab)}\n` +
					`Tags the recipe already has: ${JSON.stringify(currentTags)}\n\n` +
					recipeDigest(recipe)
			}
		],
		output_config: { format: { type: 'json_schema', schema: buildSuggestSchema(vocab) } }
	});

	const parsed = parseJsonResponse(response);
	const have = new Set(currentTags.map((t) => t.toLowerCase()));
	const notHave = (t: string) => !have.has(t.toLowerCase());
	const existing = normaliseTags(Array.isArray(parsed.existing) ? parsed.existing : [], vocab).filter(notHave);
	const known = new Set(vocab.map((t) => t.toLowerCase()));
	const fresh = normaliseTags(Array.isArray(parsed.new) ? parsed.new : [])
		.filter((t) => !known.has(t.toLowerCase()) && notHave(t))
		.slice(0, 2);
	return { existing, new: fresh };
}
