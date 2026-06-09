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
			return fail(502, { url, message: err instanceof Error ? err.message : 'Could not fetch the page.' });
		}

		if (method === 'auto') {
			const result = extractJsonLd(html);
			if (result) {
				return {
					fetched: true,
					method: 'structured' as const,
					url,
					values: { ...toFormValues(result.recipe), tags: (result.recipe.categories ?? []).join(', ') },
					imageUrl: result.imageUrl ?? ''
				};
			}
			// No structured data — offer Claude (if available).
			return fail(422, {
				url,
				noStructuredData: true,
				claudeAvailable: claudeAvailable(),
				message: claudeAvailable()
					? 'No structured recipe data found on this page. Try extracting it with Claude.'
					: 'No structured recipe data found, and the Claude fallback is not configured.'
			});
		}

		// Claude fallback path.
		if (!claudeAvailable()) {
			return fail(422, { url, message: 'The Claude fallback is not configured.' });
		}
		try {
			const recipe = await extractWithClaude(html, url);
			return {
				fetched: true,
				method: 'claude' as const,
				url,
				values: { ...toFormValues(recipe), tags: (recipe.categories ?? []).join(', ') },
				imageUrl: ''
			};
		} catch (err) {
			return fail(502, { url, message: err instanceof Error ? err.message : 'Claude extraction failed.' });
		}
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
