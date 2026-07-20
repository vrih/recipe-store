import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { MelaRecipe } from './mela.js';

export interface ScrapeResult {
	recipe: MelaRecipe;
	imageUrl?: string;
}

/** Thrown when a fetch completes with a non-2xx HTTP status. */
export class FetchStatusError extends Error {
	constructor(public status: number) {
		super(`Could not fetch page (HTTP ${status})`);
		this.name = 'FetchStatusError';
	}
}

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function isPrivateAddress(address: string): boolean {
	if (address === '::1' || address === '0.0.0.0') return true;
	if (address.startsWith('127.') || address.startsWith('169.254.') || address.startsWith('10.')) {
		return true;
	}
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true; // 172.16.0.0/12
	if (address.startsWith('192.168.')) return true;
	if (/^f[cd][0-9a-f]{2}:/i.test(address)) return true; // fc00::/7 (unique local)
	if (/^fe[89ab][0-9a-f]:/i.test(address)) return true; // fe80::/10 (link-local)
	return false;
}

/**
 * Reject URLs whose hostname resolves to a private/loopback/link-local
 * address, so the server-side URL import can't be used to probe internal
 * services (SSRF) — including the cloud-metadata address 169.254.169.254.
 * Best-effort: resolves once here and doesn't pin the IP `fetch()` actually
 * connects to, so it doesn't protect against DNS-rebinding attacks.
 */
async function assertPublicHost(rawUrl: string): Promise<void> {
	const { hostname } = new URL(rawUrl);
	let addresses: { address: string }[];
	try {
		addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
	} catch {
		throw new Error('Could not resolve host');
	}
	if (addresses.some((a) => isPrivateAddress(a.address))) {
		throw new Error('This URL points to a private or internal address and cannot be imported.');
	}
}

/** Read a fetch Response body up to `maxBytes`, aborting early rather than buffering it all. */
async function readWithLimit(res: Response, maxBytes: number, label: string): Promise<Buffer> {
	const lengthHeader = res.headers.get('content-length');
	if (lengthHeader && Number(lengthHeader) > maxBytes) {
		throw new Error(`${label} is too large to process`);
	}

	const reader = res.body?.getReader();
	if (!reader) {
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > maxBytes) throw new Error(`${label} is too large to process`);
		return buf;
	}

	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.length;
			if (total > maxBytes) {
				await reader.cancel();
				throw new Error(`${label} is too large to process`);
			}
			chunks.push(value);
		}
	}
	return Buffer.concat(chunks);
}

/** Fetch a page's HTML with a timeout, UA header, and a size cap. */
export async function fetchPage(url: string): Promise<string> {
	await assertPublicHost(url);
	const res = await fetch(url, {
		headers: {
			// Present as a real browser; some sites 403 unknown/bot agents.
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'en-GB,en;q=0.9'
		},
		redirect: 'follow',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new FetchStatusError(res.status);
	const buf = await readWithLimit(res, MAX_HTML_BYTES, 'Page');
	return buf.toString('utf-8');
}

/** Download a remote image to a buffer, with content-type and size checks. */
export async function downloadImage(url: string): Promise<Buffer | null> {
	try {
		await assertPublicHost(url);
		const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) return null;
		const type = res.headers.get('content-type') ?? '';
		if (!type.startsWith('image/')) return null;
		const buf = await readWithLimit(res, MAX_IMAGE_BYTES, 'Image');
		if (buf.length === 0) return null;
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

/** All image URLs referenced by a schema.org `image` value (string, array, or ImageObject(s)). */
function collectAllImageUrls(v: unknown): string[] {
	const out: string[] = [];
	const add = (item: unknown) => {
		if (typeof item === 'string') {
			if (item) out.push(item);
		} else if (item && typeof item === 'object') {
			const url = (item as JsonObject).url;
			if (typeof url === 'string' && url) out.push(url);
		}
	};
	if (Array.isArray(v)) v.forEach(add);
	else add(v);
	return out;
}

/** Pull og:image / twitter:image URLs out of a page's <meta> tags. */
function extractMetaImages(html: string): string[] {
	const out: string[] = [];
	const IMAGE_META = new Set([
		'og:image',
		'og:image:url',
		'og:image:secure_url',
		'twitter:image',
		'twitter:image:src'
	]);
	for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
		const tag = m[0];
		const propMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
		const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
		if (!propMatch || !contentMatch) continue;
		if (IMAGE_META.has(propMatch[1].toLowerCase())) out.push(contentMatch[1]);
	}
	return out;
}

function resolveUrl(u: string, base: string): string | null {
	try {
		return new URL(u, base).href;
	} catch {
		return null;
	}
}

/**
 * Collect candidate hero/lead images for a page: the schema.org Recipe's
 * `image` value(s) first (if present), then og:image/twitter:image meta
 * tags, resolved against `baseUrl` and de-duplicated.
 */
export function extractImageCandidates(html: string, baseUrl: string): string[] {
	const node = findRecipeNode(html);
	const raw: string[] = [];
	if (node) raw.push(...collectAllImageUrls(node.image));
	raw.push(...extractMetaImages(html));

	const out: string[] = [];
	for (const u of raw) {
		const resolved = resolveUrl(u, baseUrl);
		if (resolved && !out.includes(resolved)) out.push(resolved);
	}
	return out.slice(0, 8);
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
