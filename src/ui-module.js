import { state } from './state.js';

export const ui = {
    init() {
        console.log("🎨 UI Module initialized");
        // Initial visibility check
        const loginOverlay = document.getElementById('loginOverlay');
        const appContent = document.getElementById('appContent');
        if (loginOverlay && !appContent.classList.contains('hidden')) {
            loginOverlay.classList.add('hidden');
        }
    },
    showToast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-bold shadow-2xl z-[300] transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2 border border-white/10 backdrop-blur-md`;

        if (type === 'success') {
            toast.classList.add('bg-green-500/80', 'text-black');
            toast.innerHTML = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> ${message}`;
        } else if (type === 'error') {
            toast.classList.add('bg-red-500/80', 'text-white');
            toast.innerHTML = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg> ${message}`;
        } else if (type === 'warning') {
            toast.classList.add('bg-yellow-500/80', 'text-black');
            toast.innerHTML = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg> ${message}`;
        }

        document.body.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 100);
        setTimeout(() => {
            toast.classList.add('translate-y-2', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    renderLoggedInUI(user, userData) {
        // Toggle Desktop
        const loggedOutUI = document.getElementById('loggedOutUI');
        const loggedInUI = document.getElementById('loggedInUI');
        if (loggedOutUI) loggedOutUI.classList.add('hidden');
        if (loggedInUI) loggedInUI.classList.remove('hidden');

        // Toggle Mobile
        const loggedOutUIMobile = document.getElementById('loggedOutUIMobile');
        const loggedInUIMobile = document.getElementById('loggedInUIMobile');
        if (loggedOutUIMobile) loggedOutUIMobile.classList.add('hidden');
        if (loggedInUIMobile) loggedInUIMobile.classList.remove('hidden');

        // Common Data
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');
        const userNameMobile = document.getElementById('userNameMobile');
        const userAvatarMobile = document.getElementById('userAvatarMobile');
        const userAvatarFull = document.getElementById('userAvatarFull');

        if (userName) userName.innerText = user.displayName;
        if (userAvatar) userAvatar.src = user.photoURL;
        if (userNameMobile) userNameMobile.innerText = user.displayName.split(' ')[0];
        if (userAvatarMobile) userAvatarMobile.src = user.photoURL;
        if (userAvatarFull) userAvatarFull.src = user.photoURL;

        // Admin styling (Point 1/4)
        [userAvatar, userAvatarMobile, userAvatarFull].forEach(img => {
            if (img) {
                if (userData.isAdmin) img.classList.add('border-2', 'border-yellow-500', 'shadow-[0_0_10px_rgba(255,215,0,0.5)]');
                else img.classList.remove('border-2', 'border-yellow-500', 'shadow-[0_0_10px_rgba(255,215,0,0.5)]');
            }
        });

        // Toggle Admin UI
        const adminProfileBtn = document.getElementById('adminProfileBtn');
        const adminProfileBtnMobile = document.getElementById('adminProfileBtnMobile');
        const adminProfileBtnFull = document.getElementById('adminProfileBtnFull');
        if (userData.isAdmin) {
            [adminProfileBtn, adminProfileBtnMobile, adminProfileBtnFull].forEach(btn => btn && btn.classList.remove('hidden'));
        } else {
            [adminProfileBtn, adminProfileBtnMobile, adminProfileBtnFull].forEach(btn => btn && btn.classList.add('hidden'));
        }

        // Hide overlay and show app
        const loginOverlay = document.getElementById('loginOverlay');
        const appContent = document.getElementById('appContent');
        if (loginOverlay) loginOverlay.classList.add('hidden', 'opacity-0');
        if (appContent) appContent.classList.remove('hidden');
    },

    renderLoggedOutUI() {
        const loginOverlay = document.getElementById('loginOverlay');
        const appContent = document.getElementById('appContent');
        if (loginOverlay) loginOverlay.classList.remove('hidden', 'opacity-0');
        if (appContent) appContent.classList.add('hidden');

        // Reset toggles
        const loggedOutUI = document.getElementById('loggedOutUI');
        const loggedInUI = document.getElementById('loggedInUI');
        if (loggedOutUI) loggedOutUI.classList.remove('hidden');
        if (loggedInUI) loggedInUI.classList.add('hidden');

        const loggedOutUIMobile = document.getElementById('loggedOutUIMobile');
        const loggedInUIMobile = document.getElementById('loggedInUIMobile');
        if (loggedOutUIMobile) loggedOutUIMobile.classList.remove('hidden');
        if (loggedInUIMobile) loggedInUIMobile.classList.add('hidden');
    },

    toggleLyrics(show) {
        const container = document.getElementById('lyricsContainer');
        if (!container) return;
        if (show) container.classList.remove('hidden');
        else container.classList.add('hidden');
    },

    updateMarquee(text, targetId) {
        const container = document.getElementById(targetId);
        if (!container) return;
        const span = container.querySelector('span');
        if (span) span.innerText = text;
    },

    showReport() {
        // Implementation plan mentions point 5 Stats. 
        // We'll call a function from there.
    }
};
