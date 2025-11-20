const CACHE_NAME = "dynamic-cache";
const REALTIME_PATHS = ["/", "/index.html", "/README.md", "/lyc8503_gpg_public.key"];
const EXCLUDE_PATHS = [];

const shouldCache = (url) => {
  const u = new URL(url, self.location);
  return u.hostname === self.location.hostname && !EXCLUDE_PATHS.includes(u.pathname);
};


const fetchAndUpdate = async (request, timeout) => {
  const response = await fetch(request, { signal: AbortSignal.timeout(timeout) });
  if (response.ok && response.type === 'basic' && shouldCache(request.url)) {
    console.log("Updating cache for", request.url);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  if (response.status >= 500) {
    throw new Error(`Server error: ${response.status}`);
  }
  return response;
};

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;

  const url = new URL(request.url);
  const isRealTime = REALTIME_PATHS.includes(url.pathname);

  event.respondWith((async () => {
    // A. real-time content, use cache only as fallback
    if (isRealTime) {
      try {
        return await fetchAndUpdate(request, 3000);
      } catch (err) {
        console.log(`Realtime fetch failed for ${url.pathname}, fallback to cache.`);
        return (await caches.match(request)) || Response.error();
      }
    }

    // B. non-real-time content, stale-while-revalidate
    const cachedResp = await caches.match(request);
    const networkPromise = fetchAndUpdate(request, 5000);

    if (cachedResp) {
      // return cached response immediately, update cache in background
      event.waitUntil(networkPromise.catch(err => console.log("Background update", url.pathname, "failed", err)));
      return cachedResp;
    }
    
    // no cache: wait for network
    return networkPromise;
  })());
});