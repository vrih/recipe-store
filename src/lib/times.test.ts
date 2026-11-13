import { describe, it, expect } from 'vitest';
import { detectTimes, formatDuration, formatClock } from './times.js';

/** Convenience: just the canonical seconds for each detected match. */
const secs = (text: string) => detectTimes(text).map((m) => m.seconds);

describe('detectTimes — basic units', () => {
	it('detects minutes in long, short, and abbreviated forms', () => {
		expect(secs('cook for 10 minutes')).toEqual([600]);
		expect(secs('cook for 10 mins')).toEqual([600]);
		expect(secs('cook for 10 min')).toEqual([600]);
	});

	it('detects hours and seconds', () => {
		expect(secs('rest for 1 hour')).toEqual([3600]);
		expect(secs('bake 2 hrs')).toEqual([7200]);
		expect(secs('blanch for 90 seconds')).toEqual([90]);
		expect(secs('whisk 30 secs')).toEqual([30]);
	});
});

describe('detectTimes — compound durations', () => {
	it('sums chained hour + minute clauses', () => {
		expect(secs('roast for 1 hour 30 minutes')).toEqual([5400]);
		expect(secs('roast for 1 hr 30 min')).toEqual([5400]);
		expect(secs('roast for 1 hour and 30 minutes')).toEqual([5400]);
	});
});

describe('detectTimes — ranges use the lower bound', () => {
	it('picks the lower bound for hyphen, dash, and "to" ranges', () => {
		expect(secs('simmer 1-2 minutes')).toEqual([60]);
		expect(secs('simmer 1 to 2 minutes')).toEqual([60]);
		expect(secs('fry 10–15 mins')).toEqual([600]);
	});

	it('keeps the range text in the label', () => {
		const [m] = detectTimes('simmer 1-2 minutes');
		expect(m.seconds).toBe(60);
		expect(m.label).toBe('1 min');
	});
});

describe('detectTimes — fractions and words', () => {
	it('handles decimals, unicode and ascii fractions', () => {
		expect(secs('bake 1.5 hours')).toEqual([5400]);
		expect(secs('bake 1½ hours')).toEqual([5400]);
		expect(secs('bake 1 1/2 hours')).toEqual([5400]);
	});

	it('handles "a", "an" and "half"', () => {
		expect(secs('leave for an hour')).toEqual([3600]);
		expect(secs('wait a minute')).toEqual([60]);
		expect(secs('rest for half an hour')).toEqual([1800]);
		expect(secs('rest for half a minute')).toEqual([30]);
	});
});

describe('detectTimes — no false positives', () => {
	it('ignores numbers without time units', () => {
		expect(secs('preheat to 350°F')).toEqual([]);
		expect(secs('Serves 4')).toEqual([]);
		expect(secs('add 180g flour')).toEqual([]);
		expect(secs('add 2 eggs')).toEqual([]);
		expect(secs('see section 3')).toEqual([]);
	});

	it('returns empty for blank input', () => {
		expect(detectTimes('')).toEqual([]);
		expect(detectTimes(null)).toEqual([]);
		expect(detectTimes(undefined)).toEqual([]);
	});
});

describe('detectTimes — multiple matches', () => {
	it('returns matches in source order with positions', () => {
		const text = 'Fry for 5 minutes, then bake for 1 hour.';
		const matches = detectTimes(text);
		expect(matches.map((m) => m.seconds)).toEqual([300, 3600]);
		expect(matches[0].start).toBeLessThan(matches[1].start);
		// Positions point at the matched phrase.
		expect(text.slice(matches[0].start, matches[0].end)).toContain('5 minutes');
		expect(text.slice(matches[1].start, matches[1].end)).toContain('1 hour');
	});

	it('does not consume trailing "or until" guidance', () => {
		expect(secs('Bake for 20 minutes or until golden')).toEqual([1200]);
	});
});

describe('formatDuration', () => {
	it('formats compact human labels', () => {
		expect(formatDuration(600)).toBe('10 min');
		expect(formatDuration(5400)).toBe('1 hr 30 min');
		expect(formatDuration(3600)).toBe('1 hr');
		expect(formatDuration(90)).toBe('1 min 30 sec');
		expect(formatDuration(45)).toBe('45 sec');
	});
});

describe('formatClock', () => {
	it('formats mm:ss and h:mm:ss countdowns', () => {
		expect(formatClock(599)).toBe('09:59');
		expect(formatClock(60)).toBe('01:00');
		expect(formatClock(3723)).toBe('1:02:03');
		expect(formatClock(-5)).toBe('00:00');
	});
});
