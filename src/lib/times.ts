/**
 * Detects cooking durations in free text (e.g. "cook for 10 minutes",
 * "bake 1 hour 30 minutes", "simmer 1-2 mins") so the cook view can offer a
 * one-tap timer. Pure and client-safe — no DOM or Node APIs — so it can be
 * unit-tested and run in the browser.
 */

export interface TimeMatch {
	/** Human label preserving the source phrasing, e.g. "10 min", "1-2 min". */
	label: string;
	/** Canonical duration in seconds (lower bound for ranges). */
	seconds: number;
	/** Inclusive start index into the source text. */
	start: number;
	/** Exclusive end index into the source text. */
	end: number;
}

const HOUR = 3600;
const MINUTE = 60;

/** Unicode fraction glyphs → numeric value. */
const FRACTIONS: Record<string, number> = {
	'¼': 0.25,
	'½': 0.5,
	'¾': 0.75,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'⅛': 0.125
};

const FRACTION_CHARS = Object.keys(FRACTIONS).join('');

// A numeric quantity: a word ("a"/"an"/"half"/"half a"), a unicode/ascii
// fraction, a mixed number ("1½", "1 1/2"), a decimal, or a plain integer.
// Longer alternatives come first so "half an" wins over "an".
const NUMBER = `(?:\\d+\\s*\\d+\\/\\d+|\\d+\\s*[${FRACTION_CHARS}]|\\d+\\/\\d+|[${FRACTION_CHARS}]|\\d+(?:\\.\\d+)?|half\\s+an?\\b|half\\b|an?\\b)`;

// Unit words. Single-letter abbreviations (h/m/s) are intentionally excluded —
// they produce too many false positives in prose ("add 2 m..." etc.).
const HOURS = `(?:hours|hour|hrs|hr)`;
const MINUTES = `(?:minutes|minute|mins|min)`;
const SECONDS = `(?:seconds|second|secs|sec)`;
const UNIT = `(?:${HOURS}|${MINUTES}|${SECONDS})`;

// Optional range separator: "-", "–", "—", "to", "or".
const RANGE_SEP = `\\s*(?:-|–|—|to|or)\\s*`;

// One "<number><unit>" clause, with an optional range upper bound before the
// unit. A clause may chain a second unit ("1 hour 30 minutes").
const CLAUSE = `${NUMBER}(?:${RANGE_SEP}${NUMBER})?\\s*${UNIT}`;
const PHRASE = `${CLAUSE}(?:\\s*(?:and\\s+)?${NUMBER}\\s*${UNIT})?`;

const PHRASE_RE = new RegExp(PHRASE, 'gi');
// Splits a phrase into its individual "<number(s)> <unit>" clauses.
const CLAUSE_RE = new RegExp(`(${NUMBER}(?:${RANGE_SEP}${NUMBER})?)\\s*(${UNIT})`, 'gi');

function unitToSeconds(unit: string): number {
	const u = unit.toLowerCase();
	if (u.startsWith('h')) return HOUR;
	if (u.startsWith('m')) return MINUTE;
	return 1;
}

/** Parse a single numeric token (no range) into a number, or null. */
function parseNumber(raw: string): number | null {
	const token = raw.trim().toLowerCase().replace(/\s+/g, ' ');
	if (token === 'a' || token === 'an') return 1;
	// "half", "half a", "half an" → 0.5.
	if (token === 'half' || token.startsWith('half ')) return 0.5;

	// Mixed number with a unicode fraction, e.g. "1½".
	const mixedUni = token.match(new RegExp(`^(\\d+)\\s*([${FRACTION_CHARS}])$`));
	if (mixedUni) return parseInt(mixedUni[1], 10) + FRACTIONS[mixedUni[2]];

	// Lone unicode fraction, e.g. "½".
	if (token.length === 1 && token in FRACTIONS) return FRACTIONS[token];

	// Mixed number with an ascii fraction, e.g. "1 1/2".
	const mixedAscii = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixedAscii) {
		const denom = parseInt(mixedAscii[3], 10);
		return denom ? parseInt(mixedAscii[1], 10) + parseInt(mixedAscii[2], 10) / denom : null;
	}

	// Lone ascii fraction, e.g. "1/2".
	const ascii = token.match(/^(\d+)\/(\d+)$/);
	if (ascii) {
		const denom = parseInt(ascii[2], 10);
		return denom ? parseInt(ascii[1], 10) / denom : null;
	}

	const num = Number(token);
	return Number.isFinite(num) ? num : null;
}

/** Take the lower bound of a (possibly) range number token. */
function lowerBound(raw: string): number | null {
	const parts = raw.split(new RegExp(RANGE_SEP, 'i')).filter((p) => p.trim());
	const values = parts.map(parseNumber).filter((v): v is number => v !== null);
	if (values.length === 0) return null;
	return Math.min(...values);
}

/**
 * Find all durations in `text`. Returns matches in source order; ranges resolve
 * to their lower bound (so "simmer 1-2 min" rings at 1 minute).
 */
export function detectTimes(text: string | null | undefined): TimeMatch[] {
	if (!text) return [];

	const matches: TimeMatch[] = [];
	for (const m of text.matchAll(PHRASE_RE)) {
		const phrase = m[0];
		const start = m.index ?? 0;

		let seconds = 0;
		for (const clause of phrase.matchAll(CLAUSE_RE)) {
			const value = lowerBound(clause[1]);
			if (value === null) continue;
			seconds += value * unitToSeconds(clause[2]);
		}

		seconds = Math.round(seconds);
		if (seconds <= 0) continue;

		matches.push({
			label: formatDuration(seconds),
			seconds,
			start,
			end: start + phrase.length
		});
	}

	return matches;
}

/**
 * Compact, human-readable duration. Used both for chip labels and the live
 * countdown ("mm:ss" when under an hour and a precise count is wanted).
 */
export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const h = Math.floor(total / HOUR);
	const m = Math.floor((total % HOUR) / MINUTE);
	const s = total % MINUTE;

	const parts: string[] = [];
	if (h) parts.push(`${h} hr`);
	if (m) parts.push(`${m} min`);
	if (s && !h) parts.push(`${s} sec`);
	return parts.length ? parts.join(' ') : '0 sec';
}

/** Live countdown clock, e.g. "09:59" or "1:02:03". */
export function formatClock(seconds: number): string {
	const total = Math.max(0, Math.ceil(seconds));
	const h = Math.floor(total / HOUR);
	const m = Math.floor((total % HOUR) / MINUTE);
	const s = total % MINUTE;
	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');
	return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
