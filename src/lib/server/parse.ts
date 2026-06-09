import { createHash } from 'crypto';

export interface IngredientItem {
	type: 'header' | 'item';
	text: string;
	/** Stable key for cook_progress (only meaningful for 'item'). */
	key: string;
}

export interface InstructionStep {
	text: string;
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
 * Parse Mela's single-string `instructions` field into discrete steps, split on
 * blank-line-separated paragraphs (falling back to single newlines when no
 * blank-line separators are present). See PRD §7.7.
 */
export function parseInstructions(raw: string | null | undefined): InstructionStep[] {
	if (!raw) return [];
	const text = raw.trim();
	if (!text) return [];

	const hasBlankLineSeparators = /\n\s*\n/.test(text);
	const chunks = hasBlankLineSeparators ? text.split(/\n\s*\n/) : text.split(/\r?\n/);

	const seen = new Map<string, number>();
	const steps: InstructionStep[] = [];
	for (const chunk of chunks) {
		const step = chunk.trim();
		if (!step) continue;
		steps.push({ text: step, key: makeKey('step', step, seen) });
	}

	return steps;
}
