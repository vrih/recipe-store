/**
 * Reactive, browser-side timer store. Wraps the pure helpers in `timerState.ts`
 * with Svelte runes and the browser APIs needed for kitchen timers:
 * localStorage persistence, completion notifications (via the service worker so
 * they fire when the tab is backgrounded on mobile), a short beep, and vibration.
 *
 * A single 1s interval drives all timers; each timer's remaining time is derived
 * from its absolute `endsAt`, so backgrounding the tab can't cause drift.
 */
import { browser } from '$app/environment';
import {
	STORAGE_KEY,
	createTimer,
	remainingMs as remainingMsOf,
	isExpired,
	pauseTimer,
	resumeTimer,
	completeTimer,
	restartTimer,
	restore,
	serialize,
	type TimerData
} from './timerState';

class TimerStore {
	timers = $state<TimerData[]>([]);
	now = $state(Date.now());
	/** Notification permission, surfaced to the UI. 'unsupported' when no API. */
	permission = $state<NotificationPermission | 'unsupported'>('unsupported');

	#interval: ReturnType<typeof setInterval> | null = null;
	#fired = new Set<string>();
	#audio: AudioContext | null = null;

	constructor() {
		if (!browser) return;
		this.timers = restore(localStorage.getItem(STORAGE_KEY), Date.now());
		// Suppress completion side effects for timers that already finished while
		// the app was closed, but keep them visible in the tray.
		for (const t of this.timers) if (t.status === 'done') this.#fired.add(t.id);

		if ('Notification' in window) this.permission = Notification.permission;

		this.#start();
		document.addEventListener('visibilitychange', this.#onVisibility);
	}

	/** Live remaining time for a timer, in milliseconds. */
	remaining(timer: TimerData): number {
		return remainingMsOf(timer, this.now);
	}

	/** Timers belonging to a given recipe, active ones first. */
	forRecipe(recipeEid: string): TimerData[] {
		return this.timers.filter((t) => t.recipeEid === recipeEid);
	}

	async start(opts: { label: string; stepKey: string; recipeEid: string; seconds: number }) {
		// Unlock audio and ask for notification permission within the user gesture.
		this.#unlockAudio();
		await this.#ensurePermission();

		const timer = createTimer(opts, Date.now(), this.#id());
		this.timers = [...this.timers, timer];
		this.#start();
		this.#persist();
	}

	pause(id: string) {
		this.#update(id, (t) => pauseTimer(t, Date.now()));
	}

	resume(id: string) {
		this.#update(id, (t) => resumeTimer(t, Date.now()));
	}

	restart(id: string) {
		this.#fired.delete(id);
		this.#update(id, (t) => restartTimer(t, Date.now()));
		this.#start();
	}

	cancel(id: string) {
		this.#fired.delete(id);
		this.timers = this.timers.filter((t) => t.id !== id);
		this.#persist();
	}

	/** Remove a finished timer from the tray. */
	dismiss(id: string) {
		this.cancel(id);
	}

	clearDone() {
		this.timers = this.timers.filter((t) => t.status !== 'done');
		this.#persist();
	}

	// --- internals ---

	#id(): string {
		return typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}

	#update(id: string, fn: (t: TimerData) => TimerData) {
		this.timers = this.timers.map((t) => (t.id === id ? fn(t) : t));
		this.#persist();
	}

	#start() {
		if (this.#interval || !browser) return;
		this.#tick();
		this.#interval = setInterval(() => this.#tick(), 1000);
	}

	#stopIfIdle() {
		const anyRunning = this.timers.some((t) => t.status === 'running');
		if (!anyRunning && this.#interval) {
			clearInterval(this.#interval);
			this.#interval = null;
		}
	}

	#tick() {
		this.now = Date.now();
		let changed = false;
		this.timers = this.timers.map((t) => {
			if (isExpired(t, this.now)) {
				changed = true;
				return completeTimer(t);
			}
			return t;
		});
		// Fire completion side effects once per timer.
		for (const t of this.timers) {
			if (t.status === 'done' && !this.#fired.has(t.id)) {
				this.#fired.add(t.id);
				this.#onComplete(t);
			}
		}
		if (changed) this.#persist();
		this.#stopIfIdle();
	}

	#onVisibility = () => {
		if (document.visibilityState === 'visible') this.#tick();
	};

	#persist() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, serialize(this.timers));
		} catch {
			// Storage full / unavailable — timers still work for this session.
		}
	}

	async #ensurePermission() {
		if (!browser || !('Notification' in window)) return;
		if (Notification.permission === 'default') {
			try {
				this.permission = await Notification.requestPermission();
			} catch {
				this.permission = Notification.permission;
			}
		} else {
			this.permission = Notification.permission;
		}
	}

	async #onComplete(timer: TimerData) {
		this.#beep();
		try {
			navigator.vibrate?.([200, 100, 200]);
		} catch {
			/* ignore */
		}
		await this.#notify(timer);
	}

	async #notify(timer: TimerData) {
		if (!browser || !('Notification' in window) || Notification.permission !== 'granted') return;
		const body = `${timer.label} timer finished`;
		const options: NotificationOptions = {
			body,
			tag: timer.id,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			// vibrate is non-standard in the TS lib but honoured by Android.
			...({ vibrate: [200, 100, 200] } as object),
			requireInteraction: true
		};
		try {
			const reg = await navigator.serviceWorker?.getRegistration();
			if (reg) {
				await reg.showNotification('Timer done', options);
				return;
			}
		} catch {
			/* fall through to the constructor */
		}
		try {
			new Notification('Timer done', options);
		} catch {
			/* notifications unavailable — beep + vibrate already fired */
		}
	}

	#unlockAudio() {
		if (!browser || this.#audio) return;
		const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		try {
			this.#audio = new Ctx();
			if (this.#audio.state === 'suspended') void this.#audio.resume();
		} catch {
			this.#audio = null;
		}
	}

	#beep() {
		const ctx = this.#audio;
		if (!ctx) return;
		try {
			if (ctx.state === 'suspended') void ctx.resume();
			const now = ctx.currentTime;
			// Two short pulses so it reads as an alert, not a stray blip.
			for (const offset of [0, 0.3]) {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = 'sine';
				osc.frequency.value = 880;
				gain.gain.setValueAtTime(0.0001, now + offset);
				gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now + offset);
				osc.stop(now + offset + 0.24);
			}
		} catch {
			/* ignore audio failures */
		}
	}
}

export const timers = new TimerStore();
