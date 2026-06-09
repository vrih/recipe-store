import type { MelaRecipe } from './mela.js';

export interface ScrapeResult {
	recipe: MelaRecipe;
	imageUrl?: string;
}

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Fetch a page's HTML with a timeout, UA header, and a size cap. */
export async function fetchPage(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (compatible; RecipeStore/1.0)',
			Accept: 'text/html,application/xhtml+xml'
		},
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Could not fetch page (HTTP ${res.status})`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length > MAX_HTML_BYTES) throw new Error('Page is too large to process');
	return buf.toString('utf-8');
}

/** Download a remote image to a buffer, with content-type and size checks. */
export async function downloadImage(url: string): Promise<Buffer | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) return null;
		const type = res.headers.get('content-type') ?? '';
		if (!type.startsWith('image/')) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
		return buf;
	} catch {
		return null;
	}
}

// --- JSON-LD / schema.org Recipe extraction ---

const LD_JSON_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Extract a schema.org Recipe from a page's JSON-LD blocks, mapped to Mela. */
export function extractJsonLd(html: string): ScrapeResult | null {
	const recipeNode = findRecipeNode(html);
	if (!recipeNode) return null;
	return mapSchemaRecipe(recipeNode);
}

type JsonObject = Record<string, unknown>;

function findRecipeNode(html: string): JsonObject | null {
	const matches = html.matchAll(LD_JSON_RE);
	for (const m of matches) {
		let data: unknown;
		try {
			data = JSON.parse(m[1].trim());
		} catch {
			continue;
		}
		const found = searchForRecipe(data);
		if (found) return found;
	}
	return null;
}

function isRecipeType(node: JsonObject): boolean {
	const t = node['@type'];
	if (typeof t === 'string') return t.toLowerCase() === 'recipe';
	if (Array.isArray(t)) return t.some((x) => String(x).toLowerCase() === 'recipe');
	return false;
}

/** Recursively search JSON-LD (handling arrays and @graph) for a Recipe node. */
function searchForRecipe(data: unknown): JsonObject | null {
	if (Array.isArray(data)) {
		for (const item of data) {
			const found = searchForRecipe(item);
			if (found) return found;
		}
		return null;
	}
	if (data && typeof data === 'object') {
		const obj = data as JsonObject;
		if (isRecipeType(obj)) return obj;
		if (Array.isArray(obj['@graph'])) return searchForRecipe(obj['@graph']);
	}
	return null;
}

function asString(v: unknown): string {
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return String(v);
	if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(', ');
	return '';
}

/** Convert an ISO 8601 duration (PT1H30M) into a friendly string. */
function formatDuration(v: unknown): string {
	const s = typeof v === 'string' ? v : '';
	const m = s.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
	if (!m) return s.startsWith('P') ? '' : s;
	const [, d, h, min] = m;
	const parts: string[] = [];
	if (d) parts.push(`${d} day${+d > 1 ? 's' : ''}`);
	if (h) parts.push(`${h} hr`);
	if (min) parts.push(`${min} min`);
	return parts.join(' ');
}

function flattenInstructions(v: unknown): string {
	if (typeof v === 'string') return v;
	if (!Array.isArray(v)) return '';
	const parts: string[] = [];
	for (const step of v) {
		if (typeof step === 'string') {
			parts.push(step);
		} else if (step && typeof step === 'object') {
			const obj = step as JsonObject;
			const type = String(obj['@type'] ?? '').toLowerCase();
			if (type === 'howtosection') {
				const name = asString(obj.name);
				if (name) parts.push(`# ${name}`);
				const items = obj.itemListElement;
				if (Array.isArray(items)) {
					for (const it of items) {
						const t = it && typeof it === 'object' ? asString((it as JsonObject).text) : asString(it);
						if (t) parts.push(t);
					}
				}
			} else {
				const t = asString(obj.text) || asString(obj.name);
				if (t) parts.push(t);
			}
		}
	}
	return parts.join('\n\n');
}

function extractImageUrl(v: unknown): string | undefined {
	if (typeof v === 'string') return v;
	if (Array.isArray(v) && v.length > 0) return extractImageUrl(v[0]);
	if (v && typeof v === 'object') {
		const url = (v as JsonObject).url;
		if (typeof url === 'string') return url;
	}
	return undefined;
}

function collectCategories(node: JsonObject): string[] {
	const out: string[] = [];
	const push = (v: unknown) => {
		if (typeof v === 'string') {
			// keywords are often comma-separated
			for (const part of v.split(',')) {
				const t = part.trim();
				if (t) out.push(t);
			}
		} else if (Array.isArray(v)) {
			for (const item of v) push(item);
		}
	};
	push(node.recipeCategory);
	push(node.recipeCuisine);
	push(node.keywords);
	// De-dupe (case-insensitive) and forbid commas (Mela constraint).
	const seen = new Set<string>();
	return out.filter((t) => {
		const k = t.toLowerCase();
		if (t.includes(',') || seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

function formatNutrition(v: unknown): string {
	if (!v || typeof v !== 'object') return '';
	const n = v as JsonObject;
	const labels: [string, string][] = [
		['calories', 'Calories'],
		['servingSize', 'Serving size'],
		['fatContent', 'Fat'],
		['saturatedFatContent', 'Saturated fat'],
		['carbohydrateContent', 'Carbohydrates'],
		['sugarContent', 'Sugar'],
		['proteinContent', 'Protein'],
		['sodiumContent', 'Sodium'],
		['fiberContent', 'Fiber']
	];
	const lines = labels
		.filter(([key]) => n[key])
		.map(([key, label]) => `- **${label}:** ${asString(n[key])}`);
	return lines.join('\n');
}

function mapSchemaRecipe(node: JsonObject): ScrapeResult {
	const ingredients = node.recipeIngredient ?? node.ingredients;
	const recipe: MelaRecipe = {
		title: asString(node.name),
		text: asString(node.description),
		ingredients: Array.isArray(ingredients)
			? ingredients.map(asString).filter(Boolean).join('\n')
			: asString(ingredients),
		instructions: flattenInstructions(node.recipeInstructions),
		yield: asString(node.recipeYield),
		prepTime: formatDuration(node.prepTime),
		cookTime: formatDuration(node.cookTime),
		totalTime: formatDuration(node.totalTime),
		categories: collectCategories(node),
		nutrition: formatNutrition(node.nutrition)
	};
	return { recipe, imageUrl: extractImageUrl(node.image) };
}
