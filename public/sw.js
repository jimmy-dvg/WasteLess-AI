const CACHE_VERSION = "wasteless-v2";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_VERSION)
					.map((key) => caches.delete(key))
			)
		)
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") {
		return;
	}

	const requestUrl = new URL(event.request.url);
	if (requestUrl.origin !== self.location.origin) {
		return;
	}

	if (
		requestUrl.pathname.startsWith("/api/") ||
		requestUrl.pathname.startsWith("/_next/")
	) {
		return;
	}

	if (event.request.mode === "navigate") {
		event.respondWith(
			fetch(event.request)
				.then((networkResponse) => {
					if (networkResponse && networkResponse.status === 200) {
						const responseToCache = networkResponse.clone();
						caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, responseToCache));
					}

					return networkResponse;
				})
				.catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match("/") || Response.error()))
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) {
				return cachedResponse;
			}

			return fetch(event.request)
				.then((networkResponse) => {
					if (
						networkResponse &&
						networkResponse.status === 200 &&
						networkResponse.type === "basic"
					) {
						const responseToCache = networkResponse.clone();
						caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, responseToCache));
					}
					return networkResponse;
				})
				.catch(() => caches.match("/") || Response.error());
		})
	);
});
