import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: true });

// Allowlist of tags/attributes safe to render from imported (untrusted) content.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'blockquote',
		'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'a', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
	],
	allowedAttributes: {
		a: ['href', 'title', 'rel', 'target']
	},
	// Only safe URL schemes; strips javascript: and data: URIs.
	allowedSchemes: ['http', 'https', 'mailto'],
	transformTags: {
		a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
	}
};

/** Render a markdown string to sanitized HTML. Safe for untrusted input. */
export function renderMarkdown(input: string | null | undefined): string {
	if (!input) return '';
	const rawHtml = marked.parse(input, { async: false }) as string;
	return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

/** Render inline markdown (no wrapping <p>), e.g. for a single ingredient line. */
export function renderInline(input: string | null | undefined): string {
	if (!input) return '';
	const rawHtml = marked.parseInline(input, { async: false }) as string;
	return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}
