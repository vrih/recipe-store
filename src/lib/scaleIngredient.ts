/**
 * Scale a free-text ingredient line by a numeric factor.
 *
 * Parses the leading quantity (including ranges like "2-3"), multiplies it,
 * and formats the result back with nice fractions where appropriate.  When no
 * recognisable quantity is present the line is returned unchanged.
 *
 * Pure / client-safe — no DOM or Node APIs.
 */

// ── Unicode fractions ──────────────────────────────────────────────────────
const FRAC_MAP: [string, number][] = [
	['⅛', 1 / 8],
	['¼', 1 / 4],
	['⅓', 1 / 3],
	['⅜', 3 / 8],
	['½', 1 / 2],
	['⅝', 5 / 8],
	['⅔', 2 / 3],
	['¾', 3 / 4],
	['⅞', 7 / 8]
];
const FRAC_CHARS = FRAC_MAP.map(([c]) => c).join('');

// ── Number token pattern (longest alternatives first) ─────────────────────
// Group names (by capture index):
//  1 – mixed number + ascii frac  "1 1/2"
//  2 – ascii fraction             "3/4"
//  3 – decimal                    "1.5"
//  4 – integer + unicode frac     "1½"
//  5 – unicode fraction alone     "½"
//  6 – plain integer              "2"
//  7 – indefinite article         "a" / "an"
const NUM_PAT = `(\\d+\\s+\\d+\\/\\d+)|(\\d+\\/\\d+)|(\\d+\\.\\d+)|(\\d+[${FRAC_CHARS}])|(${FRAC_CHARS.split('').join('|')})|(\\d+)|(an?)`;

// ── Range separator ────────────────────────────────────────────────────────
const RANGE_SEP_PAT = `\\s*[-–—]\\s*|\\s+(?:to|or)\\s+`;

// Full leading-quantity pattern: optional number, optional range, must have a number
const LEADING_QTY_RE = new RegExp(
	`^((?:${NUM_PAT})(?:(?:${RANGE_SEP_PAT})(?:${NUM_PAT}))?)\\s*`,
	'i'
);

// ── Parse a single numeric token into a float ─────────────────────────────
function parseToken(s: string): number {
	const t = s.trim().toLowerCase();
	if (t === 'a' || t === 'an') return 1;

	// integer + unicode frac "1½"
	for (const [ch, val] of FRAC_MAP) {
		if (t.endsWith(ch)) {
			const whole = parseInt(t.slice(0, -ch.length), 10);
			return (isNaN(whole) ? 0 : whole) + val;
		}
	}
	// lone unicode fraction
	for (const [ch, val] of FRAC_MAP) {
		if (t === ch) return val;
	}
	// mixed number "1 1/2"
	const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed) {
		const denom = parseInt(mixed[3], 10);
		return denom ? parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / denom : parseInt(mixed[1], 10);
	}
	// ascii fraction "3/4"
	const frac = t.match(/^(\d+)\/(\d+)$/);
	if (frac) {
		const denom = parseInt(frac[2], 10);
		return denom ? parseInt(frac[1], 10) / denom : 0;
	}
	// decimal / integer
	const n = parseFloat(t);
	return isNaN(n) ? 0 : n;
}

// ── Format a scaled float back to a nice string ───────────────────────────
export function formatQuantity(n: number): string {
	if (n <= 0) return '0';

	const whole = Math.floor(n);
	const frac = n - whole;

	// Close enough to a whole number?
	if (frac < 0.055 || frac > 0.945) return String(Math.round(n));

	// Find closest unicode fraction (tolerance ±0.02 to avoid e.g. 1.6 → 1⅝)
	let best: string | null = null;
	let bestDist = 0.02;
	for (const [ch, val] of FRAC_MAP) {
		const d = Math.abs(frac - val);
		if (d < bestDist) {
			bestDist = d;
			best = ch;
		}
	}
	if (best) return whole > 0 ? `${whole}${best}` : best;

	// Fall back to 1 decimal place (trimming trailing zero)
	const d1 = Math.round(n * 10) / 10;
	return d1 % 1 === 0 ? String(d1) : d1.toFixed(1);
}

// ── Scale a quantity string (possibly a range "2-3") ─────────────────────
function scaleQtyString(qtyStr: string, scale: number): string {
	// Split on range separator
	const rangeSepRe = /\s*[-–—]\s*|\s+(?:to|or)\s+/i;
	const sepMatch = qtyStr.match(rangeSepRe);
	if (sepMatch) {
		const idx = qtyStr.search(rangeSepRe);
		const lo = qtyStr.slice(0, idx);
		const sep = sepMatch[0];
		const hi = qtyStr.slice(idx + sep.length);
		const scaledLo = formatQuantity(parseToken(lo) * scale);
		const scaledHi = formatQuantity(parseToken(hi) * scale);
		// Normalise range separator to "–" (en dash)
		return `${scaledLo}–${scaledHi}`;
	}
	return formatQuantity(parseToken(qtyStr) * scale);
}

/**
 * Scale a single free-text ingredient line.
 *
 * @param line  Raw ingredient text, e.g. "200g spaghetti", "1½ cups flour"
 * @param scale Multiplier, e.g. 2 to double the recipe
 * @returns     The line with its leading quantity scaled; unchanged if no
 *              recognisable quantity is found or scale ≈ 1.
 */
export function scaleIngredient(line: string, scale: number): string {
	if (Math.abs(scale - 1) < 0.0001) return line;

	const m = line.match(LEADING_QTY_RE);
	if (!m) return line;

	const qtyStr = m[1];
	const rest = line.slice(m[0].length);
	const scaledQty = scaleQtyString(qtyStr, scale);

	// Re-attach with the same leading whitespace/spacing the original had
	// (m[0] may have trailing spaces that we included in `rest` offset)
	return scaledQty + (rest.length ? ' ' + rest : '');
}
