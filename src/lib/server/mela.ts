import { unzipSync } from 'fflate';

/** A single recipe as stored in a `.melarecipe` JSON file. All fields optional. */
export interface MelaRecipe {
	id?: string;
	title?: string;
	text?: string;
	images?: string[];
	categories?: string[];
	yield?: string;
	prepTime?: string;
	cookTime?: string;
	totalTime?: string;
	ingredients?: string;
	instructions?: string;
	notes?: string;
	nutrition?: string;
	link?: string;
	favorite?: boolean;
	wantToCook?: boolean;
	date?: number;
}

/** Result of attempting to parse one recipe entry from an upload. */
export interface ParsedEntry {
	/** Source filename (within the archive, if applicable) for error reporting. */
	source: string;
	recipe?: MelaRecipe;
	error?: string;
}

const DECODER = new TextDecoder('utf-8');

/** Apple's reference epoch (2001-01-01 UTC) in seconds since the Unix epoch. */
export const APPLE_EPOCH_OFFSET = 978307200;

/**
 * Convert a Mela `date` (seconds since 2001-01-01 UTC) to a Unix timestamp in
 * milliseconds. Returns null for missing/invalid values.
 */
export function appleDateToUnixMs(date: number | undefined | null): number | null {
	if (date === undefined || date === null || !Number.isFinite(date)) return null;
	return Math.round((date + APPLE_EPOCH_OFFSET) * 1000);
}

/** Parse a single `.melarecipe` JSON buffer. Throws on malformed JSON. */
export function parseMelaRecipe(data: Uint8Array): MelaRecipe {
	const parsed = JSON.parse(DECODER.decode(data));
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('Recipe is not a JSON object');
	}
	return parsed as MelaRecipe;
}

function isMacOsCruft(name: string): boolean {
	return name.startsWith('__MACOSX/') || name.endsWith('/.DS_Store') || name === '.DS_Store';
}

/**
 * Parse a `.melarecipes` ZIP archive, recursing into any nested `.melarecipes`
 * archives. Each contained recipe becomes a ParsedEntry; per-entry failures are
 * captured rather than thrown so one bad file never aborts the batch.
 */
export function parseMelaArchive(data: Uint8Array, archiveName = 'archive'): ParsedEntry[] {
	const entries: ParsedEntry[] = [];
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(data);
	} catch (err) {
		return [{ source: archiveName, error: `Could not read archive: ${errMessage(err)}` }];
	}

	for (const [name, bytes] of Object.entries(files)) {
		if (name.endsWith('/') || bytes.length === 0 || isMacOsCruft(name)) continue;
		const lower = name.toLowerCase();
		const source = `${archiveName}/${name}`;

		if (lower.endsWith('.melarecipes') || lower.endsWith('.zip')) {
			entries.push(...parseMelaArchive(bytes, source));
		} else if (lower.endsWith('.melarecipe') || lower.endsWith('.json')) {
			try {
				entries.push({ source, recipe: parseMelaRecipe(bytes) });
			} catch (err) {
				entries.push({ source, error: errMessage(err) });
			}
		}
		// Silently ignore any other file types inside the archive.
	}

	return entries;
}

/**
 * Parse an uploaded file (either a single `.melarecipe` or a `.melarecipes`
 * archive) into a list of recipe entries, dispatching on the file extension.
 */
export function parseUpload(filename: string, data: Uint8Array): ParsedEntry[] {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.melarecipes') || lower.endsWith('.zip')) {
		return parseMelaArchive(data, filename);
	}
	try {
		return [{ source: filename, recipe: parseMelaRecipe(data) }];
	} catch (err) {
		return [{ source: filename, error: errMessage(err) }];
	}
}

function errMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export type EntryCallback = (entry: ParsedEntry) => Promise<void> | void;

/**
 * Stream the recipes out of a `.melarecipes` archive, invoking `cb` for each one
 * and freeing its decompressed buffer immediately after. This keeps peak memory
 * to roughly one recipe at a time rather than the whole library — important for
 * large imports on memory-constrained hosts (avoids OOM / exit 137).
 */
export async function walkArchive(
	data: Uint8Array,
	archiveName: string,
	cb: EntryCallback
): Promise<void> {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(data);
	} catch (err) {
		await cb({ source: archiveName, error: `Could not read archive: ${errMessage(err)}` });
		return;
	}

	for (const name of Object.keys(files)) {
		const bytes = files[name];
		if (name.endsWith('/') || bytes.length === 0 || isMacOsCruft(name)) {
			delete files[name];
			continue;
		}
		const lower = name.toLowerCase();
		const source = `${archiveName}/${name}`;

		if (lower.endsWith('.melarecipes') || lower.endsWith('.zip')) {
			await walkArchive(bytes, source, cb);
		} else if (lower.endsWith('.melarecipe') || lower.endsWith('.json')) {
			try {
				await cb({ source, recipe: parseMelaRecipe(bytes) });
			} catch (err) {
				await cb({ source, error: errMessage(err) });
			}
		}
		// Free the decompressed buffer for this entry before moving on.
		delete files[name];
	}
}

/** Stream the recipes out of an uploaded file (single recipe or archive). */
export async function walkUpload(
	filename: string,
	data: Uint8Array,
	cb: EntryCallback
): Promise<void> {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.melarecipes') || lower.endsWith('.zip')) {
		await walkArchive(data, filename, cb);
		return;
	}
	try {
		await cb({ source: filename, recipe: parseMelaRecipe(data) });
	} catch (err) {
		await cb({ source: filename, error: errMessage(err) });
	}
}
