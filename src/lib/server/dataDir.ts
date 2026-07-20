/** Data directory root, read at call time so tests can override it via env. */
export function dataDir(): string {
	return process.env.DATA_DIR ?? './data';
}
