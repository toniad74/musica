import { db } from './firebase-config.js';
import {
    doc,
    getDoc,
    onSnapshot,
    setDoc,
    updateDoc,
    collection,
    getDocs,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { state } from './state.js';
import { ui } from './ui-module.js';

// --- Point 2: IndexedDB (Offline Cache) ---

let idb = null;
const IDB_NAME = "AmayaMusicCache";
const IDB_VERSION = 1;

export async function initIDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("tracks")) {
                db.createObjectStore("tracks", { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => {
            idb = e.target.result;
            resolve(idb);
        }
        request.onerror = (e) => reject(e);
    });
}

export async function cacheTrack(id, meta) {
    if (!idb) await initIDB();
    return new Promise((resolve) => {
        const tx = idb.transaction("tracks", "readwrite");
        const store = tx.objectStore("tracks");
        store.put({ id, ...meta, cachedAt: Date.now() });
        tx.oncomplete = () => resolve();
    });
}

export async function getCachedTrack(id) {
    if (!idb) await initIDB();
    return new Promise((resolve) => {
        const tx = idb.transaction("tracks", "readonly");
        const store = tx.objectStore("tracks");
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
    });
}

// --- Playlist Manager ---

export const playlistManager = {
    async loadPlaylistsFromCloud() {
        if (!state.currentUserUid) return;

        try {
            const userRef = doc(db, "users", state.currentUserUid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                state.playlists = data.playlists || [];
                localStorage.setItem('amaya_playlists', JSON.stringify(state.playlists));
                this.renderPlaylists();
            }
        } catch (error) {
            console.error("Error loading playlists:", error);
            ui.showToast("Error al cargar listas de la nube", "error");
        }
    },

    async savePlaylistsToCloud() {
        if (!state.currentUserUid) return;

        try {
            const userRef = doc(db, "users", state.currentUserUid);
            await updateDoc(userRef, {
                playlists: state.playlists,
                lastUpdated: serverTimestamp()
            });
        } catch (error) {
            console.error("Error saving playlists:", error);
            ui.showToast("Error al sincronizar con la nube", "error");
        }
    },

    renderPlaylists() {
        // Render the list of playlists in the sidebar
        const container = document.getElementById('playlistContainer');
        if (!container) return;

        container.innerHTML = '';
        state.playlists.forEach((pl, idx) => {
            const el = document.createElement('div');
            el.className = `p-3 flex items-center gap-3 rounded-lg hover:bg-white/5 cursor-pointer transition-all ${state.currentlyPlayingPlaylistId === pl.id ? 'bg-white/10' : ''}`;
            el.innerHTML = `
                <div class="w-10 h-10 bg-white/10 rounded overflow-hidden">
                    <img src="${pl.cover || 'img/default-cover.png'}" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-white truncate">${pl.name}</p>
                    <p class="text-[10px] text-gray-400">${pl.tracks?.length || 0} canciones</p>
                </div>
            `;
            el.onclick = () => this.showPlaylistDetail(pl.id);
            container.appendChild(el);
        });
    },

    async showPlaylistDetail(plId) {
        // Navigation and detail view render
    }
};
