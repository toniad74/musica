/**
 * Amaya's Music - Main Orchestrator
 * Modular implementation v2.0
 */

import { setupAuthListener, loginWithGoogle, logout } from './src/auth-module.js';
import { ui } from './src/ui-module.js';
import { playerManager } from './src/player-module.js';
import { playlistManager } from './src/playlist-module.js';
import { searchManager } from './src/search-module.js';
import { adminManager } from './src/admin-module.js';
import { switchTab, showHome, showAdmin, hideAdmin, showReport, hideReport } from './src/app-logic.js';
import { state } from './src/state.js';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Initializing Amaya's Music (Modular)...");

    // 1. Initialize Auth
    setupAuthListener();

    // 2. Initialize Player
    playerManager.init();

    // 3. Initialize UI/Navigation
    ui.init();

    // 4. Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered'))
            .catch(err => console.warn('SW Registration failed', err));
    }

    // Export key managers to global window for index.html onclick handlers
    window.loginWithGoogle = loginWithGoogle;
    window.logout = logout;
    window.switchTab = switchTab;
    window.showHome = showHome;
    window.showAdmin = () => {
        showAdmin();
        adminManager.loadUserList();
    };
    window.hideAdmin = hideAdmin;
    window.showReport = showReport;
    window.hideReport = hideReport;

    // Modules
    window.playerManager = playerManager;
    window.playlistManager = playlistManager;
    window.searchManager = searchManager;
    window.adminManager = adminManager;
    window.ui = ui;

    // Search History Init
    searchManager.renderHistory();

    // Global toggle functions
    window.togglePlayPause = () => playerManager.togglePlayPause();
    window.playNext = () => playerManager.playNext();
    window.playPrevious = () => playerManager.playPrevious();
    window.seek = (val) => playerManager.updateSeek(val);
    window.seekMobile = (val) => playerManager.updateSeek(val);

    window.toggleRepeat = () => {
        state.repeatMode = state.repeatMode === 'none' ? 'one' : (state.repeatMode === 'one' ? 'all' : 'none');
        ui.updateRepeatButtonState(state.repeatMode);
    };

    window.toggleShuffle = () => {
        state.isShuffleActive = !state.isShuffleActive;
        ui.updateShuffleButtonState(state.isShuffleActive);
    };

    window.toggleMute = () => {
        state.isMuted = !state.isMuted;
        playerManager.setMuted(state.isMuted);
    };

    window.clearSearch = () => {
        const input = document.getElementById('searchInput');
        if (input) input.value = '';
        const grid = document.getElementById('resultsGrid');
        if (grid) grid.innerHTML = '';
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) resultsSection.classList.add('hidden');
    };

    window.toggleLyrics = () => {
        const overlay = document.getElementById('lyricsOverlay');
        if (overlay) overlay.classList.toggle('hidden');
    };

    window.openMobilePlayer = () => {
        const full = document.getElementById('mobilePlayerFull');
        if (full) full.classList.add('active');
        playerManager.initVisualizer();
    };

    window.closeMobilePlayer = () => {
        const full = document.getElementById('mobilePlayerFull');
        if (full) full.classList.remove('active');
    };

    window.addToQueue = (song) => {
        state.queue.push(song);
        ui.updateQueueCount(state.queue.length);
        ui.showToast(`"${song.title}" añadida a la cola`);
    };

    console.log("✅ Core modules loaded and exported to window context.");
});

// YouTube API Callback
window.onYouTubeIframeAPIReady = () => {
    playerManager.onYouTubeAPIReady();
};
