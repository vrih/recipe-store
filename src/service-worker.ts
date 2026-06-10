/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Service worker for installable-PWA support. It precaches the immutable app
// shell (hashed build assets + static files + the prerendered offline page) and
// serves them cache-first, while keeping all dynamic SSR/SQLite traffic on the
// network so recipe data is never stale. SvelteKit auto-registers this file.

import { build, files, prerendered, version, base } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const OFFLINE_URL = `${base}/offline`;

// Everything that is safe to serve cache-first: content-hashed build output,
// static assets, and the prerendered offline fallback.
const PRECACHE = [...build, ...files, ...prerendered];
const PRECACHE_SET = new Set(PRECACHE.map((path) => new URL(path, sw.location.origin).pathname));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only GET is cacheable; let POST/DELETE (e.g. /api/.../progress) hit the
	// network untouched.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Same-origin only; ignore cross-origin requests (CDNs, analytics, etc.).
	if (url.origin !== sw.location.origin) return;

	// Never serve dynamic API responses (SQLite reads/writes) from cache.
	if (url.pathname.startsWith('/api/')) return;

	// Content-hashed shell assets: cache-first, fall back to network.
	if (PRECACHE_SET.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(request);
				return cached ?? fetch(request);
			})()
		);
		return;
	}

	// SSR navigations are dynamic: network-first, with the offline page as the
	// fallback when there's no connection.
	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					return await fetch(request);
				} catch {
					const offline = await caches.match(OFFLINE_URL);
					return offline ?? Response.error();
				}
			})()
		);
	}
});

// Bring the app back to the foreground when a timer notification is tapped.
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		(async () => {
			const clientList = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of clientList) {
				if ('focus' in client) return client.focus();
			}
			return sw.clients.openWindow(base || '/');
		})()
	);
});

export {};
