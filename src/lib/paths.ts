/** Build the public URL for a stored image relative path (e.g. images/<h>/0.png). */
export function imageUrl(relPath: string): string {
	return '/api/images/' + relPath.replace(/^images\//, '');
}
