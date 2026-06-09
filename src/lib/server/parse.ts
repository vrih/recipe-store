import { createHash } from 'crypto';

export interface IngredientItem {
	type: 'header' | 'item';
	text: string;
	/** Stable key for cook_progress (only meaningful for 'item'). */
	key: string;
}

export interface InstructionStep {
	type: 'header' | 'step';
	text: string;
	/** Stable key for cook_progress (only meaningful for 'step'). */
	key: string;
}

/** Stable per-recipe key: hash of kind + normalized text, plus a dedupe index. */
function makeKey(kind: string, text: string, seen: Map<string, number>): string {
	const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
	const base = createHash('sha1').update(`${kind}:${normalized}`).digest('hex').slice(0, 12);
	const n = seen.get(base) ?? 0;
	seen.set(base, n + 1);
	return n === 0 ? base : `${base}-${n}`;
}

/**
 * Parse Mela's single-string `ingredients` field into discrete items.
 * Lines beginning with `#` are section headers (not strikeable). Blank lines
 * are separators. See PRD §7.7.
 */
export function parseIngredients(raw: string | null | undefined): IngredientItem[] {
	if (!raw) return [];
	const seen = new Map<string, number>();
	const items: IngredientItem[] = [];

	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith('#')) {
			items.push({ type: 'header', text: trimmed.replace(/^#+\s*/, ''), key: '' });
		} else {
			items.push({ type: 'item', text: trimmed, key: makeKey('ingredient', trimmed, seen) });
		}
	}

	return items;
}

/**
 * Parse Mela's single-string `instructions` field into discrete steps. A line
 * beginning with `#` is a **section header** (rendered as a heading, not a
 * numbered step), mirroring ingredient parsing. Steps are blank-line-separated
 * paragraphs, falling back to one step per line when there are no blank-line
 * separators. See PRD §7.7.
 */
export function parseInstructions(raw: string | null | undefined): InstructionStep[] {
	if (!raw) return [];
	if (!raw.trim()) return [];

	const hasBlankLineSeparators = /\n\s*\n/.test(raw);
	const seen = new Map<string, number>();
	const items: InstructionStep[] = [];
	let buffer: string[] = [];

	const flushStep = () => {
		const text = buffer.join('\n').trim();
		buffer = [];
		if (text) items.push({ type: 'step', text, key: makeKey('step', text, seen) });
	};

	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.startsWith('#')) {
			flushStep();
			const text = trimmed.replace(/^#+\s*/, '');
			if (text) items.push({ type: 'header', text, key: makeKey('step-section', text, seen) });
		} else if (trimmed === '') {
			// A blank line ends the current paragraph-step (in blank-line mode).
			if (hasBlankLineSeparators) flushStep();
		} else if (hasBlankLineSeparators) {
			buffer.push(line);
		} else {
			// No blank-line separators: each non-empty line is its own step.
			items.push({ type: 'step', text: trimmed, key: makeKey('step', trimmed, seen) });
		}
	}
	flushStep();

	return items;
}
