const CACHE_NAME = 'amaya-music-v183';
// SW Version: 1.8.53 - Time: 17:26 (GMT+1) - Auto-actualización
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json'
];

const CORE_ASSETS = ['index.html', 'main.js', 'style.css', 'manifest.json'];

// Install event - cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting(); // Force immediate activation
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Take control immediately
});

// Fetch event - Network First for core files, Cache First for others
self.addEventListener('fetch', event => {
    const isCoreAsset = CORE_ASSETS.some(asset => event.request.url.includes(asset)) || event.request.url === self.location.origin + '/';

    if (isCoreAsset) {
        // Network-First strategy for code files
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const resClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        // Cache-First for images/fonts
        event.respondWith(
            caches.match(event.request)
                .then(response => response || fetch(event.request))
        );
    }
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
