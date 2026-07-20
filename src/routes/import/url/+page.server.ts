import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import db from '$lib/server/db';
import {
	fetchPage,
	extractJsonLd,
	downloadImage,
	extractImageCandidates,
	FetchStatusError
} from '$lib/server/scrape';
import { extractWithClaude, cleanupRecipe, claudeAvailable, pickCleanupFields } from '$lib/server/claude';
import { createRecipe, addRecipeImages, recipeInputFromForm } from '$lib/server/edit';
import type { MelaRecipe } from '$lib/server/mela';
import { encodeId } from '$lib/ids';

export const load: PageServerLoad = () => ({ claudeAvailable: claudeAvailable() });

function toFormValues(recipe: MelaRecipe, url: string) {
	return {
		title: recipe.title ?? '',
		text: recipe.text ?? '',
		yield: recipe.yield ?? '',
		prepTime: recipe.prepTime ?? '',
		cookTime: recipe.cookTime ?? '',
		totalTime: recipe.totalTime ?? '',
		ingredients: recipe.ingredients ?? '',
		instructions: recipe.instructions ?? '',
		notes: recipe.notes ?? '',
		nutrition: recipe.nutrition ?? '',
		link: url,
		favorite: false,
		wantToCook: false
	};
}

/** Build the fetch-action response. Claude cleanup is offered on-demand (see the `cleanup` action) rather than run eagerly here. */
function buildResult(method: 'structured' | 'claude', url: string, recipe: MelaRecipe, imageUrls: string[]) {
	return {
		fetched: true as const,
		method,
		url,
		values: toFormValues(recipe, url),
		tags: (recipe.categories ?? []).join(', '),
		imageUrls
	};
}

/** Run extraction over already-obtained HTML: structured data first, then Claude. */
async function extractRecipe(
	html: string,
	url: string
): Promise<{ method: 'structured' | 'claude'; recipe: MelaRecipe } | null> {
	const structured = extractJsonLd(html);
	if (structured) return { method: 'structured', recipe: structured.recipe };
	if (claudeAvailable()) {
		const recipe = await extractWithClaude(html, url);
		return { method: 'claude', recipe };
	}
	return null;
}

async function extractFromHtml(html: string, url: string) {
	const extracted = await extractRecipe(html, url);
	if (!extracted) return null;
	const imageUrls = extractImageCandidates(html, url);
	return buildResult(extracted.method, url, extracted.recipe, imageUrls);
}

// Statuses that mean the site refused our server (anti-bot / paywall / blocked IP).
const BLOCK_STATUSES = new Set([401, 402, 403, 429, 451, 503]);

export const actions: Actions = {
	// Fetch + extract a recipe to pre-fill the editor (no DB write).
	fetch: async ({ request }) => {
		const form = await request.formData();
		const url = (form.get('url') ?? '').toString().trim();
		const method = form.get('method') === 'claude' ? 'claude' : 'auto';

		if (!/^https?:\/\//i.test(url)) {
			return fail(400, { url, message: 'Enter a valid http(s) URL.' });
		}

		let html: string;
		try {
			html = await fetchPage(url);
		} catch (err) {
			const blocked = err instanceof FetchStatusError && BLOCK_STATUSES.has(err.status);
			const msg = err instanceof Error ? err.message : 'Could not fetch the page.';
			return fail(502, {
				url,
				blocked,
				message: blocked
					? "This site refused the import request — its server blocks automated access (you can still open it in your browser). Use “Paste page source” below: open the recipe, view source (⌘/Ctrl+U), copy all, and paste it here."
					: `Could not fetch the page: ${msg}`
			});
		}

		if (method === 'claude') {
			if (!claudeAvailable()) return fail(422, { url, message: 'The Claude fallback is not configured.' });
			try {
				const recipe = await extractWithClaude(html, url);
				const imageUrls = extractImageCandidates(html, url);
				return buildResult('claude', url, recipe, imageUrls);
			} catch (err) {
				return fail(502, { url, message: err instanceof Error ? err.message : 'Claude extraction failed.' });
			}
		}

		// Automatic: structured data, then Claude if configured.
		try {
			const result = await extractFromHtml(html, url);
			if (result) return result;
		} catch (err) {
			return fail(502, { url, message: err instanceof Error ? err.message : 'Claude extraction failed.' });
		}
		return fail(422, {
			url,
			noStructuredData: true,
			claudeAvailable: claudeAvailable(),
			message: 'No structured recipe data found on this page.'
		});
	},

	// Extract from page source the user pasted (works even when the site blocks
	// our server-side fetch — the browser can reach pages our IP cannot).
	paste: async ({ request }) => {
		const form = await request.formData();
		const url = (form.get('url') ?? '').toString().trim();
		const html = (form.get('html') ?? '').toString();

		if (!html.trim()) return fail(400, { url, pasteMode: true, message: 'Paste the page source first.' });

		try {
			const result = await extractFromHtml(html, url);
			if (result) return result;
		} catch (err) {
			return fail(502, { url, pasteMode: true, message: err instanceof Error ? err.message : 'Claude extraction failed.' });
		}
		return fail(422, {
			url,
			pasteMode: true,
			message: claudeAvailable()
				? "Couldn't find a recipe in the pasted source. Make sure you copied the full page source (View Source), not just the visible text."
				: "No structured recipe data found in the pasted source, and the Claude fallback isn't configured."
		});
	},

	// Save the reviewed recipe (FR-URL-3: review-then-save, no silent writes).
	create: async ({ request }) => {
		const form = await request.formData();
		const input = recipeInputFromForm(form);
		const selectedImages = form
			.getAll('selectedImages')
			.map((v) => v.toString().trim())
			.filter(Boolean);

		if (!input.title) return fail(400, { message: 'Title is required.' });

		const id = createRecipe(db, input);

		// Best-effort: download and attach the selected images after saving.
		if (selectedImages.length > 0) {
			const buffers: Buffer[] = [];
			for (const url of selectedImages) {
				const buf = await downloadImage(url);
				if (buf) buffers.push(buf);
			}
			if (buffers.length > 0) await addRecipeImages(db, id, buffers);
		}

		throw redirect(303, `/recipe/${encodeId(id)}`);
	},

	// Ask Claude to tidy up the currently-entered text fields (no DB write).
	cleanup: async ({ request }) => {
		if (!claudeAvailable()) return fail(422, { message: 'Claude is not configured.' });

		const form = await request.formData();
		const input = recipeInputFromForm(form);

		try {
			const cleaned = await cleanupRecipe(pickCleanupFields(input));
			return { cleanupResult: true as const, original: pickCleanupFields(input), cleaned };
		} catch (err) {
			return fail(502, { message: err instanceof Error ? err.message : 'Claude cleanup failed.' });
		}
	}
};
