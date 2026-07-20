import { describe, it, expect, vi, afterEach } from 'vitest';

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }));

import { fetchPage } from './scrape.js';

// These exercise assertPublicHost() indirectly through fetchPage — it isn't
// exported since it's an internal guard, not part of the module's public API.
describe('fetchPage — SSRF protection', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		lookupMock.mockReset();
	});

	it('rejects a hostname that resolves to a private address', async () => {
		lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
		global.fetch = vi.fn();
		await expect(fetchPage('http://internal.example.com/recipe')).rejects.toThrow(
			/private or internal/
		);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('rejects the cloud metadata address', async () => {
		lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
		global.fetch = vi.fn();
		await expect(fetchPage('http://metadata.example.com/')).rejects.toThrow(/private or internal/);
	});

	it('rejects loopback and unique-local IPv6 addresses', async () => {
		lookupMock.mockResolvedValue([{ address: '::1', family: 6 }]);
		await expect(fetchPage('http://v6.example.com/')).rejects.toThrow(/private or internal/);

		lookupMock.mockResolvedValue([{ address: 'fd12:3456:789a::1', family: 6 }]);
		await expect(fetchPage('http://v6-ula.example.com/')).rejects.toThrow(/private or internal/);
	});

	it('rejects a numeric private-IP literal without a DNS lookup', async () => {
		global.fetch = vi.fn();
		await expect(fetchPage('http://127.0.0.1/')).rejects.toThrow(/private or internal/);
		expect(lookupMock).not.toHaveBeenCalled();
	});

	it('allows a public address through to fetch', async () => {
		lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
		global.fetch = vi.fn().mockResolvedValue(
			new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } })
		);
		const html = await fetchPage('http://public.example.com/');
		expect(html).toBe('<html>ok</html>');
	});
});
