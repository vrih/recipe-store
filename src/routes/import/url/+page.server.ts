import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import db from '$lib/server/db';
import { fetchPage, extractJsonLd, downloadImage } from '$lib/server/scrape';
import { extractWithClaude, claudeAvailable } from '$lib/server/claude';
import { createRecipe, addRecipeImages, recipeInputFromForm } from '$lib/server/edit';
import type { MelaRecipe } from '$lib/server/mela';
import { encodeId } from '$lib/ids';

export const load: PageServerLoad = () => ({ claudeAvailable: claudeAvailable() });

function toFormValues(recipe: MelaRecipe) {
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
		link: '',
		favorite: false,
		wantToCook: false
	};
}

function success(method: 'structured' | 'claude', url: string, recipe: MelaRecipe, imageUrl = '') {
	return {
		fetched: true as const,
		method,
		url,
		values: { ...toFormValues(recipe), tags: (recipe.categories ?? []).join(', ') },
		imageUrl
	};
}

/** Run extraction over already-obtained HTML: structured data first, then Claude. */
async function extractFromHtml(html: string, url: string) {
	const structured = extractJsonLd(html);
	if (structured) return success('structured', url, structured.recipe, structured.imageUrl ?? '');
	if (claudeAvailable()) {
		const recipe = await extractWithClaude(html, url);
		return success('claude', url, recipe);
	}
	return null;
}

// Statuses that mean the site refused our server (anti-bot / paywall / blocked IP).
const BLOCK_STATUS = /HTTP (401|402|403|429|451|503)/;

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
			const msg = err instanceof Error ? err.message : 'Could not fetch the page.';
			const blocked = BLOCK_STATUS.test(msg);
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
				return success('claude', url, recipe);
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
		const sourceUrl = (form.get('link') ?? '').toString().trim();
		const imageUrl = (form.get('imageUrl') ?? '').toString().trim();
		input.link = sourceUrl;

		if (!input.title) return fail(400, { message: 'Title is required.' });

		const id = createRecipe(db, input);

		// Best-effort: download and attach the lead image after saving.
		if (imageUrl) {
			const buf = await downloadImage(imageUrl);
			if (buf) await addRecipeImages(db, id, [buf]);
		}

		throw redirect(303, `/recipe/${encodeId(id)}`);
	}
};
