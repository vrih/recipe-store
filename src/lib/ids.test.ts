import { describe, it, expect } from 'vitest';
import { encodeId, decodeId } from './ids.js';

describe('encodeId / decodeId', () => {
	it('round-trips plain ids and URL-shaped ids', () => {
		for (const id of ['abc123', 'https://example.com/recipe/foo', '']) {
			expect(decodeId(encodeId(id))).toBe(id);
		}
	});

	it('round-trips unicode', () => {
		const id = 'unicode-café-🍰';
		expect(decodeId(encodeId(id))).toBe(id);
	});

	it('produces a URL-safe encoding (no +, /, or = characters)', () => {
		const encoded = encodeId('https://example.com/a/b?c=d');
		expect(encoded).not.toMatch(/[+/=]/);
	});

	it('throws on malformed input rather than returning garbage', () => {
		expect(() => decodeId('not!!valid')).toThrow();
		expect(() => decodeId('####')).toThrow();
	});
});
