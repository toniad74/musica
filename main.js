/**
 * Amaya's Music - Main Orchestrator
 * Modular implementation v2.0.2
 */

console.log("🔥 main.js module execution started");

import { setupAuthListener, loginWithGoogle, logout } from './src/auth-module.js';
import { ui } from './src/ui-module.js';
import { playerManager } from './src/player-module.js';
import { playlistManager } from './src/playlist-module.js';
import { searchManager } from './src/search-module.js';
import { adminManager } from './src/admin-module.js';
import { switchTab, showHome, showAdmin, hideAdmin, showReport, hideReport } from './src/app-logic.js';
import { state } from './src/state.js';

// --- GLOBAL EXPORTS ---
try {
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

    // Player Controls
    window.togglePlayPause = () => playerManager.togglePlayPause();
    window.playNext = () => playerManager.playNext();
    window.playPrevious = () => playerManager.playPrevious();
    window.seek = (val) => playerManager.updateSeek(val);

    console.log("✅ Global functions exported successfully");
} catch (e) {
    console.error("❌ Error exporting globals:", e);
}

const runInitialization = () => {
    console.log("🚀 Initializing modules...");
    try {
        setupAuthListener();
        playerManager.init();
        ui.init();
        searchManager.renderHistory();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
        console.log("✅ Initialization complete");
    } catch (e) {
        console.error("❌ Error during initialization:", e);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialization);
} else {
    runInitialization();
}

window.onYouTubeIframeAPIReady = () => playerManager.onYouTubeAPIReady();
