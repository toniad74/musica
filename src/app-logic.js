import { state } from './state.js';
import { ui } from './ui-module.js';

export function switchTab(tabId) {
    const tabs = ['search', 'playlists', 'dj', 'stats'];
    tabs.forEach(t => {
        const el = document.getElementById(`${t}Section`); // Note: earlier logic said ${t}Tab, but index.html uses Section usually
        const btn = document.getElementById(`${t}Btn`);
        const btnM = document.getElementById(`${t}BtnMobile`);

        if (t === tabId) {
            if (el) el.classList.remove('hidden');
            if (btn) btn.classList.add('active');
            if (btnM) btnM.classList.add('active');
        } else {
            if (el) el.classList.add('hidden');
            if (btn) btn.classList.remove('active');
            if (btnM) btnM.classList.remove('active');
        }
    });

    state.currentTab = tabId;
}

export function showHome() {
    switchTab('playlists');
}

export function showAdmin() {
    const adminSection = document.getElementById('adminSection');
    if (adminSection) {
        adminSection.classList.remove('hidden');
        adminSection.classList.add('flex');
    }
}

export function hideAdmin() {
    const adminSection = document.getElementById('adminSection');
    if (adminSection) {
        adminSection.classList.add('hidden');
        adminSection.classList.remove('flex');
    }
}

export function showReport() {
    const reportModal = document.getElementById('reportModal');
    if (reportModal) {
        reportModal.classList.remove('hidden');
        reportModal.classList.add('flex');
    }
}

export function hideReport() {
    const reportModal = document.getElementById('reportModal');
    if (reportModal) {
        reportModal.classList.add('hidden');
        reportModal.classList.remove('flex');
    }
}

export function addToQueue(track) {
    state.queue.push(track);
    ui.showToast(`Añadido a la cola: ${track.title}`);
}

export function playNext() {
    if (state.isShuffle) {
        state.currentQueueIndex = Math.floor(Math.random() * state.queue.length);
    } else {
        state.currentQueueIndex++;
    }

    if (state.currentQueueIndex < state.queue.length) {
        // We'll need playerManager imported elsewhere or passed in
        // For simplicity, we'll use the window global as a fallback if needed
        if (window.playerManager) window.playerManager.playSong(state.queue[state.currentQueueIndex]);
    } else {
        state.currentQueueIndex = -1; // Reset
    }
}
