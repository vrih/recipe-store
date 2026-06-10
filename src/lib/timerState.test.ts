import { describe, it, expect } from 'vitest';
import {
	createTimer,
	remainingMs,
	isExpired,
	pauseTimer,
	resumeTimer,
	completeTimer,
	restartTimer,
	serialize,
	restore
} from './timerState.js';

const opts = { label: '10 min', stepKey: 'abc', recipeEid: 'eid', seconds: 600 };

describe('createTimer', () => {
	it('uses an absolute end time derived from now + duration', () => {
		const t = createTimer(opts, 1000, 'id1');
		expect(t.status).toBe('running');
		expect(t.durationMs).toBe(600_000);
		expect(t.endsAt).toBe(1000 + 600_000);
		expect(remainingMs(t, 1000)).toBe(600_000);
	});
});

describe('remainingMs / isExpired', () => {
	it('counts down from the absolute end time, immune to tick drift', () => {
		const t = createTimer(opts, 0, 'id1');
		// Even if "now" jumps (backgrounded tab), remaining is recomputed exactly.
		expect(remainingMs(t, 60_000)).toBe(540_000);
		expect(remainingMs(t, 600_000)).toBe(0);
		expect(remainingMs(t, 999_999)).toBe(0); // clamped
	});

	it('flags a running timer as expired once its end time passes', () => {
		const t = createTimer(opts, 0, 'id1');
		expect(isExpired(t, 599_999)).toBe(false);
		expect(isExpired(t, 600_000)).toBe(true);
	});
});

describe('pause / resume', () => {
	it('freezes remaining on pause and rebases end time on resume', () => {
		const t = createTimer(opts, 0, 'id1');
		const paused = pauseTimer(t, 100_000);
		expect(paused.status).toBe('paused');
		expect(paused.endsAt).toBeNull();
		expect(paused.remainingMs).toBe(500_000);
		// While paused, time passing does not change remaining.
		expect(remainingMs(paused, 1_000_000)).toBe(500_000);

		const resumed = resumeTimer(paused, 1_000_000);
		expect(resumed.status).toBe('running');
		expect(resumed.endsAt).toBe(1_000_000 + 500_000);
		expect(remainingMs(resumed, 1_000_000)).toBe(500_000);
	});
});

describe('restart', () => {
	it('resets to the full duration from now', () => {
		const t = completeTimer(createTimer(opts, 0, 'id1'));
		const again = restartTimer(t, 50_000);
		expect(again.status).toBe('running');
		expect(again.endsAt).toBe(50_000 + 600_000);
	});
});

describe('persistence round-trip', () => {
	it('recomputes remaining from endsAt after a reload', () => {
		const started = createTimer(opts, 0, 'id1'); // ends at 600_000
		const raw = serialize([started]);
		// Reload 1 minute later: 9 minutes should remain.
		const [restored] = restore(raw, 60_000);
		expect(restored.status).toBe('running');
		expect(remainingMs(restored, 60_000)).toBe(540_000);
	});

	it('marks a timer that finished while away as done', () => {
		const started = createTimer(opts, 0, 'id1');
		const [restored] = restore(serialize([started]), 700_000);
		expect(restored.status).toBe('done');
		expect(remainingMs(restored, 700_000)).toBe(0);
	});

	it('drops finished timers older than the grace window', () => {
		const done = completeTimer(createTimer(opts, 0, 'id1')); // finished at 600_000
		const within = restore(serialize([done]), 600_000 + 1000, 60_000);
		expect(within).toHaveLength(1);
		const after = restore(serialize([done]), 600_000 + 120_000, 60_000);
		expect(after).toHaveLength(0);
	});

	it('tolerates corrupt or empty storage', () => {
		expect(restore(null, 0)).toEqual([]);
		expect(restore('not json', 0)).toEqual([]);
		expect(restore('{}', 0)).toEqual([]);
	});
});
