// Shared tagging logic: the canonical tag taxonomy plus the prompts/schemas used
// to ask Claude for tags. Plain JS (type-checked via JSDoc) so that both the app
// (claude.ts) and the one-off sweep script (scripts/retag.mjs) can import it
// without a TypeScript toolchain.
import taxonomy from './taxonomy.json' with { type: 'json' };

export const MAX_TAGS = taxonomy.maxTagsPerRecipe;

/** Every canonical tag, in facet order. */
export function taxonomyTags() {
	return taxonomy.facets.flatMap((f) => f.tags);
}

/** Human-readable taxonomy for inclusion in a prompt. */
function taxonomyOutline() {
	return taxonomy.facets
		.map((f) => `- ${f.name} — ${f.description}\n  Tags: ${f.tags.join(', ')}`)
		.join('\n');
}

const SHARED_RULES = `Tag rules:
- Tags describe the dish as written. Judge from the title, overview, ingredients and method, not from the site it came from.
- Be sparing: ${MAX_TAGS} tags at most, and fewer is better than a doubtful tag. Every tag must be clearly justified by the recipe.
- Never tag Vegetarian or Vegan if any ingredient is meat, fish, or (for Vegan) egg, dairy or honey. Stock/broth, fish sauce, oyster sauce, anchovies and lard count as non-vegetarian.
- Course "Main" is for a dish that is the centrepiece of a meal; use "Side" for accompaniments, "Baking" for bread, cakes, buns, biscuits and pastry (add "Dessert" only if it is served as one).`;

export const SWEEP_SYSTEM_PROMPT = `You assign tags to a cooking recipe from a fixed, curated taxonomy so a personal recipe library has a small, consistent set of useful tags for browsing.

Taxonomy:
${taxonomyOutline()}

${SHARED_RULES}
- Use ONLY tags from the taxonomy, spelled exactly. Return an empty list if nothing fits.`;

export const SUGGEST_SYSTEM_PROMPT = `You suggest tags for a cooking recipe in a personal recipe library. The library already has a curated vocabulary; reuse it wherever it fits.

Canonical taxonomy:
${taxonomyOutline()}

${SHARED_RULES}
- "existing" must contain only tags from the provided library vocabulary, spelled exactly. Prefer taxonomy tags.
- "new" is for a genuinely useful tag the vocabulary lacks (e.g. a cuisine not yet listed). At most 2, short, Title Case, no commas. Leave empty if the vocabulary covers the recipe.
- Do not repeat tags the recipe already has.`;

/**
 * Closed schema for the sweep: tags are constrained to the taxonomy by enum, so
 * the model cannot invent or misspell a tag.
 */
export function buildSweepSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			tags: { type: 'array', items: { type: 'string', enum: taxonomyTags() } }
		},
		required: ['tags']
	};
}

/**
 * Schema for interactive suggestions: `existing` is enum-constrained to the
 * library vocabulary; `new` allows a couple of free-form additions.
 * @param {string[]} vocabulary
 */
export function buildSuggestSchema(vocabulary) {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			existing: { type: 'array', items: { type: 'string', enum: vocabulary } },
			new: { type: 'array', items: { type: 'string' } }
		},
		required: ['existing', 'new']
	};
}

/**
 * Compact recipe text for the model: enough to judge cuisine/ingredients without
 * paying for long method text.
 * @param {{title?: string, text?: string, ingredients?: string, instructions?: string, notes?: string}} r
 */
export function recipeDigest(r) {
	return [
		`Title: ${r.title ?? ''}`,
		r.text ? `Overview: ${r.text}` : '',
		`Ingredients:\n${r.ingredients ?? ''}`,
		`Method (excerpt):\n${(r.instructions ?? '').slice(0, 1500)}`
	]
		.filter(Boolean)
		.join('\n\n');
}

/**
 * Case-insensitively de-dupe and clean tag names; when `allowed` is given, map
 * each to its canonical spelling and drop anything not in it. Capped at MAX_TAGS.
 * @param {unknown[]} names
 * @param {string[] | null} [allowed]
 * @returns {string[]}
 */
export function normaliseTags(names, allowed = null) {
	const canon = allowed ? new Map(allowed.map((t) => [t.toLowerCase(), t])) : null;
	const seen = new Set();
	/** @type {string[]} */
	const out = [];
	for (const raw of names) {
		let name = String(raw ?? '').replace(/[,\n]/g, ' ').replace(/\s+/g, ' ').trim();
		if (!name) continue;
		if (canon) {
			const c = canon.get(name.toLowerCase());
			if (!c) continue;
			name = c;
		}
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
		if (out.length >= MAX_TAGS) break;
	}
	return out;
}
