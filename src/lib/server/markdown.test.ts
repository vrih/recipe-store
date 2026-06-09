import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderInline } from './markdown.js';

describe('renderMarkdown', () => {
	it('renders basic markdown', () => {
		const html = renderMarkdown('**bold** and *italic*');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>italic</em>');
	});

	it('strips script tags (XSS protection)', () => {
		const html = renderMarkdown('Hello <script>alert(1)</script> world');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('alert(1)');
	});

	it('strips javascript: URLs from links', () => {
		const html = renderMarkdown('[click](javascript:alert(1))');
		expect(html).not.toContain('javascript:');
	});

	it('strips onerror and other event handlers', () => {
		const html = renderMarkdown('<img src=x onerror="alert(1)">');
		expect(html).not.toContain('onerror');
	});

	it('keeps safe links and adds rel/target', () => {
		const html = renderMarkdown('[example](https://example.com)');
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	it('returns empty string for empty input', () => {
		expect(renderMarkdown('')).toBe('');
		expect(renderMarkdown(null)).toBe('');
		expect(renderMarkdown(undefined)).toBe('');
	});
});

describe('renderInline', () => {
	it('does not wrap in a paragraph', () => {
		const html = renderInline('200g **flour**');
		expect(html).not.toContain('<p>');
		expect(html).toContain('<strong>flour</strong>');
	});

	it('sanitizes inline content', () => {
		const html = renderInline('<script>bad()</script>flour');
		expect(html).not.toContain('<script>');
	});
});
