import { state } from './state.js';
import { ui } from './ui-module.js';
import { playerManager } from './player-module.js';

export function switchTab(tabId) {
    const tabs = ['search', 'playlists', 'dj', 'stats'];
    tabs.forEach(t => {
        const el = document.getElementById(`${t}Tab`);
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
        playerManager.playSong(state.queue[state.currentQueueIndex]);
    } else {
        state.currentQueueIndex = -1; // Reset
    }
}
