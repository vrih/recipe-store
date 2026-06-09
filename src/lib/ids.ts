/**
 * Recipe ids may be a URL-without-scheme (for web imports) and thus contain
 * slashes and other characters unsafe for a single URL path segment. We encode
 * ids as base64url for use in routes.
 */
export function encodeId(id: string): string {
	return Buffer.from(id, 'utf-8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function decodeId(encoded: string): string {
	const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
	return Buffer.from(b64, 'base64').toString('utf-8');
}
