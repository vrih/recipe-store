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

/** Decode an id encoded by `encodeId`. Throws on malformed input (not a valid encoding). */
export function decodeId(encoded: string): string {
	const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
	const id = Buffer.from(b64, 'base64').toString('utf-8');
	// Round-trip check: rejects garbage that Buffer.from() would otherwise decode
	// "successfully" into nonsense (base64 is very permissive about its input).
	if (encodeId(id) !== encoded) throw new Error('Invalid id');
	return id;
}
