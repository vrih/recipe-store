/**
 * Pure, time-injectable timer logic — no runes, no DOM — so it can be unit
 * tested in the node environment. The reactive store in `timerStore.svelte.ts`
 * wraps these helpers with `$state` and browser APIs (localStorage, Audio,
 * Notification). Timers use an absolute `endsAt` so they don't drift while the
 * tab is backgrounded and throttled.
 */

export type TimerStatus = 'running' | 'paused' | 'done';

export interface TimerData {
	id: string;
	label: string;
	/** Stable cook-step key this timer was started from. */
	stepKey: string;
	/** Encoded recipe id, so the tray can scope to the current recipe. */
	recipeEid: string;
	durationMs: number;
	status: TimerStatus;
	/** Absolute completion time (ms epoch) while running; null when paused. */
	endsAt: number | null;
	/** Authoritative remaining time while paused or done. */
	remainingMs: number;
}

export const STORAGE_KEY = 'recipe-store:timers';
/** Drop finished timers older than this on restore. */
export const DONE_GRACE_MS = 60 * 60 * 1000;

let counter = 0;
function fallbackId(): string {
	counter += 1;
	return `t${Date.now().toString(36)}-${counter}`;
}

export function createTimer(
	opts: { label: string; stepKey: string; recipeEid: string; seconds: number },
	now: number,
	id: string = fallbackId()
): TimerData {
	const durationMs = Math.max(0, Math.round(opts.seconds * 1000));
	return {
		id,
		label: opts.label,
		stepKey: opts.stepKey,
		recipeEid: opts.recipeEid,
		durationMs,
		status: 'running',
		endsAt: now + durationMs,
		remainingMs: durationMs
	};
}

/** Remaining milliseconds, clamped at zero. */
export function remainingMs(timer: TimerData, now: number): number {
	if (timer.status === 'running' && timer.endsAt != null) {
		return Math.max(0, timer.endsAt - now);
	}
	return Math.max(0, timer.remainingMs);
}

/** A running timer whose end time has passed. */
export function isExpired(timer: TimerData, now: number): boolean {
	return timer.status === 'running' && timer.endsAt != null && timer.endsAt <= now;
}

export function pauseTimer(timer: TimerData, now: number): TimerData {
	if (timer.status !== 'running') return timer;
	return { ...timer, status: 'paused', endsAt: null, remainingMs: remainingMs(timer, now) };
}

export function resumeTimer(timer: TimerData, now: number): TimerData {
	if (timer.status !== 'paused') return timer;
	const remaining = Math.max(0, timer.remainingMs);
	return { ...timer, status: 'running', endsAt: now + remaining, remainingMs: remaining };
}

export function completeTimer(timer: TimerData): TimerData {
	// Keep `endsAt` (the finish moment) so restore can age out old done timers.
	return { ...timer, status: 'done', remainingMs: 0 };
}

export function restartTimer(timer: TimerData, now: number): TimerData {
	return { ...timer, status: 'running', endsAt: now + timer.durationMs, remainingMs: timer.durationMs };
}

function isValid(t: unknown): t is TimerData {
	if (!t || typeof t !== 'object') return false;
	const r = t as Record<string, unknown>;
	return (
		typeof r.id === 'string' &&
		typeof r.label === 'string' &&
		typeof r.durationMs === 'number' &&
		(r.status === 'running' || r.status === 'paused' || r.status === 'done')
	);
}

export function serialize(timers: TimerData[]): string {
	return JSON.stringify(timers);
}

/**
 * Restore timers from persisted JSON. Running timers whose end time already
 * passed become `done`; finished timers older than the grace window are dropped.
 */
export function restore(raw: string | null | undefined, now: number, graceMs = DONE_GRACE_MS): TimerData[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	const out: TimerData[] = [];
	for (const item of parsed) {
		if (!isValid(item)) continue;
		let timer = item;
		if (isExpired(timer, now)) timer = completeTimer(timer);
		// Drop long-finished timers so the tray doesn't accumulate stale entries.
		if (timer.status === 'done') {
			const finishedAt = timer.endsAt ?? now;
			if (now - finishedAt > graceMs) continue;
		}
		out.push(timer);
	}
	return out;
}
