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

/** Filenames to silently skip when walking an archive (not recipes, not errors). */
export function isMacOsCruft(name: string): boolean {
	return name.startsWith('__MACOSX/') || name.endsWith('/.DS_Store') || name === '.DS_Store';
}
