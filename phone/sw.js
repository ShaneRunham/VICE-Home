// Vice Phone: makes it installable. Everything comes from the network (vice-tv sends no-cache), nothing is kept.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
