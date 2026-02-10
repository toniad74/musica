const CACHE_NAME = 'amaya-music-v5.3.9';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

// CRITICAL: Background sync to keep service worker alive
let keepAliveInterval = null;

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'KEEP_ALIVE_START') {
        console.log('[SW] Keep alive started');

        // Clear any existing interval
        if (keepAliveInterval) clearInterval(keepAliveInterval);

        // Ping every 25 seconds to keep SW active
        keepAliveInterval = setInterval(() => {
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'PING' });
                });
            });
        }, 25000);
    }

    if (event.data && event.data.type === 'KEEP_ALIVE_STOP') {
        console.log('[SW] Keep alive stopped');
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
    }
});
