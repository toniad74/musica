import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBHCTj7Jhlklf2ZL7AcE6ggkOvdgP9eotY",
    authDomain: "musica-amaya.firebaseapp.com",
    projectId: "musica-amaya",
    storageBucket: "musica-amaya.firebasestorage.app",
    messagingSenderId: "754394913699",
    appId: "1:754394913699:web:f2f0c8f8f0ee30de65d816",
    measurementId: "G-077C93FT2T"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let currentUserUid = null;
let sharedPlaylistData = null; // Store temp data for shared playlists
let player;
let isVideoReady = false;
let currentTrack = null;
let playlist = []; // For the current view (search results or playlist songs)
let queue = [];
let currentQueueIndex = -1;
let currentlyPlayingPlaylistId = localStorage.getItem('amaya_playing_pl_id') || null;
let playlists = JSON.parse(localStorage.getItem('amaya_playlists')) || [];
let apiKeys = JSON.parse(localStorage.getItem('amaya_yt_keys')) || [];
let currentKeyIndex = parseInt(localStorage.getItem('amaya_yt_key_index')) || 0;

// DJ Mode / Shared Sessions
let djSessionId = null;
let djSessionUnsubscribe = null;
let isDjHost = false;

// Internal API keys (Obfuscated to avoid GitHub detection)
const _D_K = [
    "QUl6YVN5RG9idGhLY3VXS05US2M0d0VSYWQwQnB0S1hKVUNPaE93",
    "QUl6YVN5QjNmdXFKZTJOYmJaZjVPc185NGtQTkxjMG9JamFtUk1J",
    "QUl6YVN5Q2xGQ090eUxjellQSm12NGxrVzRxM01aZFhuVlh0YWkxRQ==",
    "QUl6YVN5QTcyLXdLY0ZRcndIQzJTVG1MYktKZHYzUEJDT0ZiV25z",
    "QUl6YVN5QTlOa3h6dE1MY3k5SG9tY1JfOE1NcTdCQU1BbWRjTms=",
    "QUl6YVN5Q2tVN0poLXM1d0NZN203UUVXVEdrSFh6UFBuQkh6MVhB",
    "QUl6YVN5Q0owU1l3TDBybTFYU0p2cUNIb3VPb19LQXQtTW1wcF9Z",
    "QUl6YVN5RDlSNkE2QXR2bThDS3BRUEl3a0NLWFdpRHd5NFNwS2lv",
    "QUl6YVN5RDhCZTZxU1lUVlRQdHFvNzBXeTlyQ3BqNV9Ebld3THFj",
    "QUl6YVN5RFhTcFZkN01CT1FFdThQbXFCYnU4ZXdYMUNKV2w3M1Vz",
    "QUl6YVN5QjU5S19Ka2tqdkNZUS15U0E3UF9GMDF6UlF0SGRXUkhR",
    "QUl6YVN5QVNmeGt5V3RfcXdpM180X0NEUE5MbFV2ckVTX0xpSTlV",
    "QUl6YVN5QjNmbzJPZ0w5U3BhVkxnNEJIVmhNTUJoLXBUNU1yQzVR",
    "QUl6YVN5Qm52SU9ONHBJTXZCTmgtQUtRODkxZk5ETWwtSElSeF9R"
];
const DEFAULT_KEYS = _D_K.map(k => atob(k));

const APP_LOGO_URL = 'https://raw.githubusercontent.com/handbolmolins/URLimagenes/refs/heads/main/LOGO%20MUSICA.png';

let isShuffle = false;
let repeatMode = 0; // 0: No repeat, 1: Repeat playlist, 2: Repeat one
let nextSearchToken = '';

// Real listening tracking
let currentListenSession = null; // { docId, songId, startTime, listenedSeconds }
let lastRecordedSeconds = 0;
let prevSearchToken = '';
let currentSearchQuery = '';
let currentSearchPage = 1;
let pageItemCounts = {}; // Store accumulated item counts per page for correct numbering

// Track user intent to distinguish between unwanted background pauses and clicks
let isUserPaused = false;
let songsToAddToNewPlaylist = null; // Temp storage for queue -> playlist conversion
let isVideoModeActive = false; // Video mode state

// Native audio player
let nativeAudio = null;
let secondaryAudio = null; // Audio player for next track (DJ Mode)
let useNativeAudio = true; // Prefer native audio over YouTube IFrame
let isCurrentlyUsingNative = false; // Track engine active for CURRENT track
let isMediaPlaying = false;

// DJ Mix Mode (Crossfade)
let isDjMixMode = localStorage.getItem('amaya_dj_mix_mode') === 'true'; // User preference
let isCrossfading = false;
let crossfadeInterval = null;
const CROSSFADE_DURATION = 8; // Seconds to crossfade
const PRELOAD_OFFSET = 15; // Seconds before end to load next track

// SponsorBlock data
let currentSponsorSegments = [];
let pendingSponsorFetch = null; // Promise tracker for sync

// News State
let isNewsLoaded = false;
let newsVideos = [];
let newsNextPageToken = '';
let isLoadingMoreNews = false;

// Instance Blacklist for current session
const FAILED_INSTANCES = new Set();

// Invidious instances (fallback if one fails)
// Prioritize instances known for speed and M4A support
const INVIDIOUS_INSTANCES = [
    'inv.nadeko.net',
    'invidious.lunar.icu',
    'invidious.projectsegfau.lt',
    'invidious.asir.dev',
    'invidious.privacydev.net',
    'invidious.drgns.space',
    'inv.tux.pizza',
    'invidious.fdn.fr',
    'yewtu.be',
    'vid.puffyan.us',
    'invidious.perennialte.ch',
    'invidious.jing.rocks',
    'invidious.nohost.network',
    'invidious.nixnet.social',
    'invidious.silkky.cloud'
];

const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://pipedapi.projectsegfau.lt',
    'https://pipedapi.mha.fi',
    'https://api.piped.li',
    'https://pipedapi.privacy.com.de',
    'https://pipedapi.hostux.net',
    'https://pipedapi.artemislena.eu',
    'https://pipedapi.mint.lgbt',
    'https://pipedapi.silkky.cloud',
    'https://pipedapi.sync-tube.de',
    'https://piped-api.garudalinux.org',
    'https://piped-api.lunar.icu',
    'https://pipedapi.moe.xyz',
    'https://pipedapi.astartes.nl',
    'https://pipedapi.vube.app',
    'https://piped-api.glauca.digital',
    'https://piped-api.rivo.cc',
    'https://piped-api.adminforge.de',
    'https://api.piped.video'
];

// Cobalt instances (Primary alternatives in 2025)
const COBALT_INSTANCES = [
    'https://cobalt.canine.tools',
    'https://cobalt.meowing.de',
    'https://api.cobalt.tools', // Official (has ratelimit, but good fallback)
    'https://cobalt.perennialte.ch',
    'https://cobalt.asir.dev',
    'https://cobalt.hot-as.ice',
    'https://cobalt.qwer.host'
];

// --- INITIALIZATION ---
window.onload = () => {
    // Initialize native audio player
    nativeAudio = document.getElementById('nativeAudioPlayer');
    secondaryAudio = document.getElementById('secondaryAudioPlayer'); // Secondary audio for crossfading
    setupAudioListeners(nativeAudio);
    setupAudioListeners(secondaryAudio);
    updateDjMixButtonState(); // Update UI based on preference

    // Load YouTube IFrame API (fallback)
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Initial UI load
    const activeKeys = apiKeys.length > 0 ? apiKeys : DEFAULT_KEYS;

    if (apiKeys.length > 0) {
        apiKeys.forEach((key, i) => {
            const input = document.getElementById(`apiKeyInput${i + 1}`);
            if (input) input.value = key;
        });
    }

    // Always keep API Section and Warning hidden as keys are now handled automatically
    const apiKeySection = document.getElementById('apiKeySection');
    if (apiKeySection) apiKeySection.classList.add('hidden');
    const apiWarning = document.getElementById('apiWarning');
    if (apiWarning) apiWarning.classList.add('hidden');

    setupMediaSessionHandlers();
    renderPlaylists();
    // Check for shared playlists in URL
    checkSharedPlaylist();

    setupAuthListener();
    switchTab('playlists');
    updateQueueCount();

    // Close profile dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('profileDropdown');
        const trigger = document.getElementById('loggedInUI');
        const mobileDropdown = document.getElementById('profileDropdownMobile');
        const mobileTrigger = document.getElementById('loggedInUIMobile');

        if (dropdown && !dropdown.classList.contains('hidden')) {
            if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        }
        if (mobileDropdown && !mobileDropdown.classList.contains('hidden')) {
            if (!mobileDropdown.contains(e.target) && !mobileTrigger.contains(e.target)) {
                mobileDropdown.classList.add('hidden');
            }
        }
    });

    // Check for mobile-specific messages
    if (window.innerWidth <= 768) {
        const bgHint = document.getElementById('bgPlaybackHint');
        if (bgHint) bgHint.classList.remove('hidden');
    }

    if (window.location.protocol === 'file:') {
        const warning = document.getElementById('fileProtocolWarning');
        if (warning) warning.classList.remove('hidden');
    }

    // Register Service Worker for background keepalive and auto-update
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            const updateApp = () => {
                let countdown = 10;
                const message = "¡Nueva versión disponible! Actualizando en ";

                // Initial message
                showToast(message + countdown + " segundos...", "info", 12000);

                // Countdown interval
                const countdownInterval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        showToast(message + countdown + " segundos...", "info", 12000);
                    } else {
                        clearInterval(countdownInterval);
                    }
                }, 1000);

                setTimeout(() => window.location.reload(), 10000);
            };

            // 1. If there's already a waiting worker, update immediately
            if (reg.waiting) {
                updateApp();
            }

            // 2. Detect when a new worker is found and finished installing
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                if (!installingWorker) return;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            updateApp();
                        }
                    }
                };
            };

            // 3. Periodic background check every 10s
            setInterval(() => {
                reg.update().then(() => {
                    if (reg.waiting) {
                        console.log('🔄 Nueva versión detectada, actualizando...');
                        updateApp();
                    }
                });
                console.log('🔍 Buscando actualizaciones...');
            }, 10000);

            // 4. Immediate update check on load
            reg.update().then(() => {
                if (reg.waiting) {
                    console.log('🔄 Nueva versión detectada al cargar, actualizando...');
                    updateApp();
                }
            });
        }).catch(e => console.error('SW registration error:', e));
    }

    // Check if coming from a shared DJ session link
    const urlParams = new URLSearchParams(window.location.search);
    const sessionCode = urlParams.get('join_session');
    if (sessionCode) {
        document.getElementById('djSessionCodeInput').value = sessionCode;
        switchTab('dj');
        joinDJSession();
    }
};



function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserUid = user.uid;

            // Toggle Desktop UI
            const loggedOutUI = document.getElementById('loggedOutUI');
            const loggedInUI = document.getElementById('loggedInUI');
            if (loggedOutUI) loggedOutUI.classList.add('hidden');
            if (loggedInUI) loggedInUI.classList.remove('hidden');

            // Toggle Mobile UI
            const loggedOutUIMobile = document.getElementById('loggedOutUIMobile');
            const loggedInUIMobile = document.getElementById('loggedInUIMobile');
            if (loggedOutUIMobile) loggedOutUIMobile.classList.add('hidden');
            if (loggedInUIMobile) loggedInUIMobile.classList.remove('hidden');

            // Set Data
            const userName = document.getElementById('userName');
            const userAvatar = document.getElementById('userAvatar');
            const userNameMobile = document.getElementById('userNameMobile');
            const userAvatarMobile = document.getElementById('userAvatarMobile');

            if (userName) userName.innerText = user.displayName;
            if (userAvatar) userAvatar.src = user.photoURL;
            if (userNameMobile) userNameMobile.innerText = user.displayName.split(' ')[0]; // First name only for mobile
            if (userAvatarMobile) userAvatarMobile.src = user.photoURL;

            loadPlaylistsFromCloud();

            // Unlock UI
            document.getElementById('loginOverlay').classList.add('hidden', 'opacity-0');
            document.getElementById('appContent').classList.remove('hidden');

            // Redirect to Search on login
            switchTab('search');

            // Show Brave browser recommendation (once per session)
            showBraveRecommendation();
        } else {
            currentUserUid = null;

            // Lock UI
            document.getElementById('loginOverlay').classList.remove('hidden', 'opacity-0');
            document.getElementById('appContent').classList.add('hidden');

            // Toggle Desktop UI
            const loggedOutUI = document.getElementById('loggedOutUI');
            const loggedInUI = document.getElementById('loggedInUI');
            if (loggedOutUI) loggedOutUI.classList.remove('hidden');
            if (loggedInUI) loggedInUI.classList.add('hidden');

            // Toggle Mobile UI
            const loggedOutUIMobile = document.getElementById('loggedOutUIMobile');
            const loggedInUIMobile = document.getElementById('loggedInUIMobile');
            if (loggedOutUIMobile) loggedOutUIMobile.classList.remove('hidden');
            if (loggedInUIMobile) loggedInUIMobile.classList.add('hidden');

            // Reset playlists - NO LOCAL PLAYLISTS ALLOWED
            playlists = [];
            renderPlaylists();
        }
    });
}

// --- DJ MODE / SHARED SESSIONS ---

async function createDJSession() {
    if (!currentUserUid) {
        showToast("Debes iniciar sesión para crear una sala", "warning");
        loginWithGoogle();
        return;
    }

    // Use tab input if available, otherwise use modal input (backward compatibility)
    const nameInputTab = document.getElementById('djSessionNameInputTab');
    const nameInput = document.getElementById('djSessionNameInput');
    const sessionName = (nameInputTab ? nameInputTab.value : (nameInput ? nameInput.value : '')).trim() || "Sala sin nombre";

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sessionRef = doc(db, "sessions", code);

    const sessionData = {
        hostId: currentUserUid,
        hostName: document.getElementById('userName').innerText,
        name: sessionName,
        code: code,
        currentTrack: currentTrack ? {
            id: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist || 'Desconocido',
            thumbnail: currentTrack.thumbnail,
            duration: currentTrack.duration
        } : null,
        queue: queue || [],
        isPlaying: isMediaPlaying,
        timestamp: serverTimestamp(),
        members: [currentUserUid],
        memberNames: [document.getElementById('userName').innerText],
        createdAt: serverTimestamp() // For sorting
    };

    try {
        await setDoc(sessionRef, sessionData);

        // Save to user's sessions list
        const userSessionsRef = doc(db, "users", currentUserUid, "sessions", code);
        await setDoc(userSessionsRef, {
            code: code,
            createdAt: serverTimestamp(),
            isHost: true
        });

        djSessionId = code;
        isDjHost = true;

        // Update tab view
        document.getElementById('djInitialViewTab').classList.add('hidden');
        document.getElementById('djActiveViewTab').classList.remove('hidden');
        document.getElementById('djSessionCodeDisplayTab').innerText = code;
        document.getElementById('djSessionNameDisplayTab').innerText = sessionName;
        document.getElementById('djHostControlsTab').classList.remove('hidden');
        document.getElementById('djGuestControlsTab').classList.add('hidden');
        updateDJMembersListTab([currentUserUid], [document.getElementById('userName').innerText]);

        showToast(`Sala "${sessionName}" creada: ${code}`);
        subscribeToDJSession(code);
        updateDJTabStyle();
    } catch (e) {
        console.error("Error creating session:", e);
        showToast("Error al crear la sala", "error");
    }
}

async function joinDJSession() {
    // Use tab input if available, otherwise use modal input
    const codeInputTab = document.getElementById('djSessionCodeInputTab');
    const codeInput = document.getElementById('djSessionCodeInput');
    let code = (codeInputTab ? codeInputTab.value : (codeInput ? codeInput.value : '')).toUpperCase().trim();

    if (!code) {
        const urlParams = new URLSearchParams(window.location.search);
        code = urlParams.get('join_session') || '';
    }

    if (!code) {
        showToast("Introduce un código válido", "warning");
        return;
    }

    const sessionRef = doc(db, "sessions", code);

    try {
        const docSnap = await getDoc(sessionRef);
        if (docSnap.exists()) {
            djSessionId = code;
            isDjHost = (docSnap.data().hostId === currentUserUid);

            // Add user to members list if not already there
            const sessionData = docSnap.data();
            const members = sessionData.members || [];
            const memberNames = sessionData.memberNames || [];

            if (!members.includes(currentUserUid) && currentUserUid) {
                members.push(currentUserUid);
                memberNames.push(document.getElementById('userName').innerText);
                await updateDoc(sessionRef, {
                    members: members,
                    memberNames: memberNames
                });
            }

            // Save to user's sessions list if not already saved
            if (currentUserUid) {
                const userSessionsRef = doc(db, "users", currentUserUid, "sessions", code);
                const existingSnap = await getDoc(userSessionsRef);
                if (!existingSnap.exists()) {
                    await setDoc(userSessionsRef, {
                        code: code,
                        createdAt: serverTimestamp(),
                        isHost: isDjHost
                    });
                }
            }

            // Update tab view
            document.getElementById('djInitialViewTab').classList.add('hidden');
            document.getElementById('djActiveViewTab').classList.remove('hidden');
            document.getElementById('djSessionCodeDisplayTab').innerText = code;
            document.getElementById('djSessionNameDisplayTab').innerText = docSnap.data().name || "Sala sin nombre";
            updateDJMembersListTab(docSnap.data().members || [], docSnap.data().memberNames || []);

            if (isDjHost) {
                document.getElementById('djHostControlsTab').classList.remove('hidden');
                document.getElementById('djGuestControlsTab').classList.add('hidden');
            } else {
                document.getElementById('djHostControlsTab').classList.add('hidden');
                document.getElementById('djGuestControlsTab').classList.remove('hidden');
                showToast("Conectado a la sala. Sincronizando...", "success");
            }

            // Limpiar estado local antes de unirse para evitar "fugas" entre salas
            queue = [];
            currentQueueIndex = -1;
            updateQueueCount();
            updateQueueIcons();

            subscribeToDJSession(code);
            updateDJTabStyle();
            // Refresh sessions list UI immediately if visible
            if (!document.getElementById('djMySessionsViewTab').classList.contains('hidden')) {
                loadMySessionsTab();
            }
        } else {
            showToast("Sala no encontrada", "error");
        }
    } catch (e) {
        console.error("Error joining session:", e);
        showToast("Error al unirse", "error");
    }
}

function editDJSessionName() {
    const nameDisplay = document.getElementById('djSessionNameDisplayTab');
    const nameInput = document.getElementById('djSessionNameInputEditTab');

    // If currently showing display (hidden input), switch to edit mode
    if (nameInput.classList.contains('hidden')) {
        nameInput.value = nameDisplay.innerText;
        nameDisplay.classList.add('hidden');
        nameInput.classList.remove('hidden');
        nameInput.focus();
        nameInput.select();
    } else {
        // If already in edit mode (visible input), save and exit
        const newName = nameInput.value.trim() || "Sala sin nombre";

        // Prevent recursive calls if called from both Enter and Blur
        if (nameDisplay.classList.contains('hidden')) {
            nameInput.classList.add('hidden');
            nameDisplay.classList.remove('hidden');
            nameDisplay.innerText = newName;

            if (djSessionId) {
                const sessionRef = doc(db, "sessions", djSessionId);
                updateDoc(sessionRef, { name: newName }).then(() => {
                    showToast("Nombre actualizado");
                }).catch(e => {
                    console.error("Error updating name:", e);
                    showToast("Error al actualizar el nombre", "error");
                });
            }
        }
    }
}

function updateDJMembersList(members, memberNames) {
    const membersList = document.getElementById('djMembersList');
    if (!membersList) return;

    membersList.innerHTML = '';

    if (!members || members.length === 0) {
        membersList.innerHTML = '<p class="text-gray-500 text-sm">Sin integrantes</p>';
        return;
    }

    members.forEach((memberId, index) => {
        const name = memberNames && memberNames[index] ? memberNames[index] : 'Usuario';
        const isHost = memberId === members[0];

        const memberEl = document.createElement('div');
        memberEl.className = 'flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full text-xs';
        memberEl.innerHTML = `
            <span class="text-white">${name}</span>
            ${isHost ? '<span class="text-yellow-400">👑</span>' : ''}
        `;
        membersList.appendChild(memberEl);
    });
}

function updateDJTabStyle() {
    const tabDj = document.getElementById('tab-dj');
    if (!tabDj) return;
    if (djSessionId) {
        tabDj.classList.add('tab-dj-active');
    } else {
        tabDj.classList.remove('tab-dj-active');
    }
}

// --- DJ TAB FUNCTIONS ---

function createDJSessionTab() {
    createDJSession().then(() => {
        // Clear input after creation
        const nameInputTab = document.getElementById('djSessionNameInputTab');
        if (nameInputTab) nameInputTab.value = '';
    });
}

function joinDJSessionTab() {
    joinDJSession().then(() => {
        // Clear input after joining
        const codeInputTab = document.getElementById('djSessionCodeInputTab');
        if (codeInputTab) codeInputTab.value = '';
    });
}

function leaveDJSession() {
    console.log("Saliendo de la sala DJ...");

    // Detener la suscripción a Firebase
    if (djSessionUnsubscribe) {
        djSessionUnsubscribe();
        djSessionUnsubscribe = null;
    }

    // Limpiar variables de estado
    djSessionId = null;
    isDjHost = false;

    // Resetear cola de reproducción y estado de audio al salir
    queue = [];
    currentQueueIndex = -1;

    // Detener reproducción si estábamos en una sala (opcional, pero recomendado para resetear el estado)
    if (nativeAudio) {
        nativeAudio.pause();
        nativeAudio.src = "";
    }
    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }
    isMediaPlaying = false;
    currentTrack = null;

    if (typeof updateQueueCount === 'function') updateQueueCount();
    if (typeof updateQueueIcons === 'function') updateQueueIcons();
    if (typeof updatePlayPauseIcons === 'function') updatePlayPauseIcons(false);
    if (typeof refreshUIHighlights === 'function') refreshUIHighlights();
    updateDJTabStyle();

    // Helper para obtener elementos
    const el = (id) => document.getElementById(id);

    // Resetear vistas de la pestaña DJ
    if (el('djInitialViewTab')) el('djInitialViewTab').classList.remove('hidden');
    if (el('djActiveViewTab')) el('djActiveViewTab').classList.add('hidden');
    if (el('djMySessionsViewTab')) el('djMySessionsViewTab').classList.add('hidden');

    // Limpiar campos de entrada
    if (el('djSessionCodeInputTab')) el('djSessionCodeInputTab').value = '';
    if (el('djSessionNameInputTab')) el('djSessionNameInputTab').value = '';

    // Resetear visualización de nombre
    if (el('djSessionNameInputEditTab')) el('djSessionNameInputEditTab').classList.add('hidden');
    if (el('djSessionNameDisplayTab')) el('djSessionNameDisplayTab').classList.remove('hidden');

    // Ocultar controles de host/invitado
    if (el('djHostControlsTab')) el('djHostControlsTab').classList.add('hidden');
    if (el('djGuestControlsTab')) el('djGuestControlsTab').classList.add('hidden');

    // Limpiar integrantes
    const membersList = el('djMembersListTab');
    if (membersList) membersList.innerHTML = '';

    showToast("Has salido de la sala");

    // Limpiar parámetro de URL
    const url = new URL(window.location);
    if (url.searchParams.has('join_session')) {
        url.searchParams.delete('join_session');
        window.history.pushState({}, '', url);
    }

    // Refrescar la lista de sesiones guardadas
    if (currentUserUid) {
        loadMySessionsTab();
    }
}

function showMySessionsTab() {
    document.getElementById('djInitialViewTab').classList.add('hidden');
    document.getElementById('djMySessionsViewTab').classList.remove('hidden');
    loadMySessionsTab();
}

function backToDJInitialTab() {
    const djMySessionsViewTab = document.getElementById('djMySessionsViewTab');
    const djInitialViewTab = document.getElementById('djInitialViewTab');
    const djActiveViewTab = document.getElementById('djActiveViewTab');

    if (djMySessionsViewTab) djMySessionsViewTab.classList.add('hidden');

    if (djSessionId) {
        if (djActiveViewTab) djActiveViewTab.classList.remove('hidden');
        if (djInitialViewTab) djInitialViewTab.classList.add('hidden');
        syncDJToTab();
    } else {
        if (djInitialViewTab) djInitialViewTab.classList.remove('hidden');
        if (djActiveViewTab) djActiveViewTab.classList.add('hidden');
    }
}

function loadMySessionsTab() {
    if (!currentUserUid) return;

    const container = document.getElementById('mySessionsListTab');
    if (!container) return;

    container.innerHTML = '<div class="text-center text-gray-400 py-4">Cargando...</div>';

    getDocs(query(collection(db, "users", currentUserUid, "sessions"), orderBy("createdAt", "desc")))
        .then(snapshot => {
            if (snapshot.empty) {
                container.innerHTML = '<div class="text-center text-gray-400 py-4">No tienes salas guardadas</div>';
                return;
            }

            container.innerHTML = '';
            // Using a Map to avoid duplicates and handle async fetching
            const sessionPromises = snapshot.docs.map(docSnap => {
                const sessionData = docSnap.data();
                return getDoc(doc(db, "sessions", sessionData.code)).then(snap => {
                    return snap.exists() ? { ...snap.data(), isHost: sessionData.isHost } : null;
                });
            });

            Promise.all(sessionPromises).then(sessions => {
                const validSessions = sessions.filter(s => s !== null);
                if (validSessions.length === 0) {
                    container.innerHTML = '<div class="text-center text-gray-400 py-4">No tienes salas guardadas</div>';
                    return;
                }

                container.innerHTML = '';
                validSessions.forEach(session => {
                    const code = session.code;
                    const isCurrent = code === djSessionId;

                    const el = document.createElement('div');
                    el.className = `flex items-center justify-between p-3 rounded-lg mb-2 transition-all ${isCurrent ? 'bg-green-500/20 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'bg-white/5 hover:bg-white/10'}`;
                    el.innerHTML = `
                        <div class="flex-1 cursor-pointer" onclick="${isCurrent ? "showToast('Ya estás en esta sala')" : `rejoinSessionTab('${code}')`}">
                            <p class="font-bold text-white text-sm">${session.name || 'Sala sin nombre'}</p>
                            <p class="text-xs text-gray-400">Código: ${code}</p>
                            <p class="text-xs ${session.isHost ? 'text-yellow-400' : 'text-blue-400'}">${session.isHost ? '👑 Anfitrión' : '🎧 Invitado'}</p>
                            <p class="text-xs ${isCurrent ? 'text-green-400' : 'text-gray-500'}">${isCurrent ? '🟢 Activa (actual)' : '🔴 Inactiva'}</p>
                        </div>
                        <button onclick="deleteSavedSession('${code}')" class="text-red-400 hover:text-red-300 p-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    `;
                    container.appendChild(el);
                });
            });
        })
        .catch(e => {
            console.error("Error loading sessions:", e);
            container.innerHTML = '<div class="text-center text-red-400 py-4">Error al cargar</div>';
        });
}

function rejoinSessionTab(code) {
    document.getElementById('djSessionCodeInputTab').value = code;
    joinDJSessionTab();
}

function syncDJToTab() {
    if (!djSessionId) return;

    document.getElementById('djInitialViewTab').classList.add('hidden');
    document.getElementById('djActiveViewTab').classList.remove('hidden');
    document.getElementById('djSessionCodeDisplayTab').innerText = djSessionId;

    getDoc(doc(db, "sessions", djSessionId)).then(docSnap => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('djSessionNameDisplayTab').innerText = data.name || "Sala sin nombre";
            updateDJMembersListTab(data.members || [], data.memberNames || []);

            if (isDjHost) {
                document.getElementById('djHostControlsTab').classList.remove('hidden');
                document.getElementById('djGuestControlsTab').classList.add('hidden');
            } else {
                document.getElementById('djHostControlsTab').classList.add('hidden');
                document.getElementById('djGuestControlsTab').classList.remove('hidden');
            }
        }
    });
}

function updateDJMembersListTab(members, memberNames) {
    const membersList = document.getElementById('djMembersListTab');
    if (!membersList) return;

    membersList.innerHTML = '';

    if (!members || members.length === 0) {
        membersList.innerHTML = '<p class="text-gray-500 text-sm">Sin integrantes</p>';
        return;
    }

    members.forEach((memberId, index) => {
        const name = memberNames && memberNames[index] ? memberNames[index] : 'Usuario';
        const isHost = memberId === members[0];

        const memberEl = document.createElement('div');
        memberEl.className = 'flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full text-xs';
        memberEl.innerHTML = `
            <span class="text-white">${name}</span>
            ${isHost ? '<span class="text-yellow-400">👑</span>' : ''}
        `;
        membersList.appendChild(memberEl);
    });
}

// function leaveDJSession consolidated above

// --- SAVED SESSIONS ---
async function loadMySessions() {
    if (!currentUserUid) return;

    const container = document.getElementById('mySessionsList');
    if (!container) return;

    container.innerHTML = '<div class="text-center text-gray-400 py-4">Cargando...</div>';

    try {
        const sessionsRef = collection(db, "users", currentUserUid, "sessions");
        const q = query(sessionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<div class="text-center text-gray-400 py-4">No tienes salas guardadas</div>';
            return;
        }

        container.innerHTML = '';

        for (const docSnap of snapshot.docs) {
            const sessionData = docSnap.data();
            const code = sessionData.code;

            // Check if session still exists
            const sessionRef = doc(db, "sessions", code);
            const sessionSnap = await getDoc(sessionRef);

            const sessionEl = document.createElement('div');
            sessionEl.className = 'flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 mb-2';

            if (sessionSnap.exists()) {
                const session = sessionSnap.data();
                const isActive = session.members && session.members.includes(currentUserUid);

                sessionEl.innerHTML = `
                    <div class="flex-1 cursor-pointer" onclick="rejoinSession('${code}')">
                        <p class="font-bold text-white text-sm">${session.name || 'Sala sin nombre'}</p>
                        <p class="text-xs text-gray-400">Código: ${code}</p>
                        <p class="text-xs ${sessionData.isHost ? 'text-yellow-400' : 'text-blue-400'}">${sessionData.isHost ? '👑 Anfitrión' : '🎧 Invitado'}</p>
                        <p class="text-xs text-gray-500">${isActive ? '🟢 Activa' : '🔴 Inactiva'}</p>
                    </div>
                    <button onclick="deleteSavedSession('${code}')" class="text-red-400 hover:text-red-300 p-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                `;
            } else {
                // Session no longer exists, auto-delete
                await deleteDoc(doc(db, "users", currentUserUid, "sessions", code));
                continue;
            }

            container.appendChild(sessionEl);
        }
    } catch (e) {
        console.error("Error loading sessions:", e);
        container.innerHTML = '<div class="text-center text-red-400 py-4">Error al cargar</div>';
    }
}

async function rejoinSession(code) {
    document.getElementById('djSessionCodeInput').value = code;
    await joinDJSession();
}

async function deleteSavedSession(code) {
    if (!currentUserUid) return;

    try {
        await deleteDoc(doc(db, "users", currentUserUid, "sessions", code));
        showToast("Sala eliminada", "success", 2000);
        loadMySessionsTab(); // Refresh the sessions list
    } catch (e) {
        console.error("Error deleting session:", e);
        showToast("Error al eliminar", "error", 2000);
    }
}

function showMySessions() {
    document.getElementById('djInitialView').classList.add('hidden');
    document.getElementById('djMySessionsView').classList.remove('hidden');
    loadMySessions();
}

function backToDJInitial() {
    document.getElementById('djMySessionsView').classList.add('hidden');
    document.getElementById('djInitialView').classList.remove('hidden');
}

function subscribeToDJSession(code) {
    if (djSessionUnsubscribe) djSessionUnsubscribe();

    const sessionRef = doc(db, "sessions", code);
    let isFirstSnapshot = true;

    djSessionUnsubscribe = onSnapshot(sessionRef, (doc) => {
        if (!doc.exists()) {
            leaveDJSession();
            showToast("La sala ha sido cerrada por el anfitrión", "error");
            return;
        }

        const data = doc.data();

        // Sincronización de cola (Queue sync)
        const remoteQueue = data.queue || [];
        const localIds = queue.map(s => s.id).join(',');
        const remoteIds = remoteQueue.map(s => s.id).join(',');

        // IMPORTANTE: Si es la primera carga (isFirstSnapshot), sincronizamos siempre 
        // para que el host recupere la cola de la sala si ya existía.
        if (isFirstSnapshot || localIds !== remoteIds || queue.length !== remoteQueue.length) {
            console.log("DJ Mode: Syncing queue", remoteQueue.length, "songs");
            queue = remoteQueue;
            updateQueueCount();
            updateQueueIcons();
        }

        // Playback sync for guests
        if (!isDjHost && data.currentTrack) {
            if (!currentTrack || currentTrack.id !== data.currentTrack.id) {
                console.log("DJ Mode: Host changed track to", data.currentTrack.title);
                playSong(data.currentTrack, queue, true, true);
            }
        }

        // El host no sincroniza track de vuelta (él es el origen), pero sí carga el inicial si no tiene nada
        if (isDjHost && isFirstSnapshot && data.currentTrack && !currentTrack) {
            currentTrack = data.currentTrack;
            refreshUIHighlights();
        }

        isFirstSnapshot = false;

        if (!isDjHost && data.isPlaying !== isMediaPlaying) {
            if (data.isPlaying) {
                if (isCurrentlyUsingNative && nativeAudio) nativeAudio.play().catch(e => { });
                else if (player && player.playVideo) player.playVideo();
            } else {
                if (isCurrentlyUsingNative && nativeAudio) nativeAudio.pause();
                else if (player && player.pauseVideo) player.pauseVideo();
            }
        }

        // Update members list
        if (data.members) {
            updateDJMembersList(data.members || [], data.memberNames || []);
            updateDJMembersListTab(data.members || [], data.memberNames || []);
        }
    });
}

async function updateDJSessionState() {
    if (!djSessionId) return;

    const sessionRef = doc(db, "sessions", djSessionId);
    try {
        const trackData = currentTrack ? {
            id: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist || 'Desconocido',
            thumbnail: currentTrack.thumbnail,
            duration: currentTrack.duration
        } : null;

        await updateDoc(sessionRef, {
            currentTrack: trackData,
            queue: queue,
            isPlaying: isMediaPlaying,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Error updating session state:", e);
    }
}

async function addSongToDJQueue(song) {
    if (!djSessionId) return;

    const sessionRef = doc(db, "sessions", djSessionId);
    try {
        const docSnap = await getDoc(sessionRef);
        if (docSnap.exists()) {
            const currentQueue = docSnap.data().queue || [];

            if (!currentQueue.some(s => s.id === song.id)) {
                const newQueue = [...currentQueue, song];
                await updateDoc(sessionRef, { queue: newQueue });
                showToast("Añadido a la cola compartida");
            } else {
                showToast("Ya está en la cola", "warning");
            }
        }
    } catch (e) {
        console.error("Error adding to DJ queue:", e);
    }
}


async function loginWithGoogle() {
    try {
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, googleProvider);
        showToast("Sesión iniciada correctamente");
    } catch (error) {
        console.error("Login error:", error);
        showToast("Error al iniciar sesión", "error");
    }
}

async function logout() {
    try {
        if (djSessionId) leaveDJSession();
        await signOut(auth);

        // Stop Playback Forcefully
        if (nativeAudio) { nativeAudio.pause(); nativeAudio.currentTime = 0; }
        if (player && typeof player.stopVideo === 'function') { player.stopVideo(); }
        isMediaPlaying = false;
        updatePlayPauseIcons(false);

        // Reset local state
        playlists = [];
        playlist = [];
        queue = [];
        currentQueueIndex = -1;
        sharedPlaylistData = null;

        // Clear UI sections
        const homeList = document.getElementById('homePlaylistsList');
        if (homeList) homeList.innerHTML = '';

        const sidebar = document.getElementById('playlistsSidebar');
        if (sidebar) sidebar.innerHTML = '';

        const resultsGrid = document.getElementById('resultsGrid');
        if (resultsGrid) resultsGrid.innerHTML = '';

        // Clear search
        clearSearch();

        // Return to playlists tab (search is restricted)
        switchTab('playlists');

        const dropdown = document.getElementById('profileDropdown');
        const mobileDropdown = document.getElementById('profileDropdownMobile');
        if (dropdown) dropdown.classList.add('hidden');
        if (mobileDropdown) mobileDropdown.classList.add('hidden');

        showToast("Sesión cerrada");
    } catch (error) {
        console.error("Logout error:", error);
    }
}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

function toggleProfileDropdownMobile() {
    const dropdown = document.getElementById('profileDropdownMobile');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

async function loadPlaylistsFromCloud() {
    if (!currentUserUid) return;
    try {
        const docRef = doc(db, "users", currentUserUid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const cloudPlaylists = docSnap.data().playlists;
            if (cloudPlaylists && cloudPlaylists.length > 0) {
                playlists = cloudPlaylists;
                renderPlaylists();
                console.log("☁️ Playlists cargadas desde la nube para el usuario:", currentUserUid);
            }
        }
    } catch (e) {
        console.error("Error al cargar desde la nube:", e);
    }
}

async function addToHistory(song) {
    if (!currentUserUid || !song) return null;

    try {
        // Try to get more metadata (like genres/topics) if they are missing
        let genre = "Unknown";
        try {
            const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=topicDetails&id=${song.id}&key=${getCurrentApiKey()}`);
            const data = await response.json();
            if (data.items && data.items[0] && data.items[0].topicDetails) {
                const topicDetails = data.items[0].topicDetails;
                const categories = topicDetails.topicCategories || [];
                const topics = topicDetails.relevantTopicIds || [];

                // Mapping for Wikipedia URLs (Topic Categories)
                const categoryMap = {
                    'Christian_music': 'Cristiana',
                    'Classical_music': 'Clásica',
                    'Country_music': 'Country',
                    'Electronic_music': 'Electrónica',
                    'Hip_hop_music': 'Hip Hop',
                    'Independent_music': 'Indie',
                    'Jazz': 'Jazz',
                    'Music_of_Asia': 'Asiática',
                    'Music_of_Latin_America': 'Latina',
                    'Pop_music': 'Pop',
                    'Reggae': 'Reggae',
                    'Rhythm_and_blues': 'R&B',
                    'Rock_music': 'Rock',
                    'Soul_music': 'Soul'
                };

                for (const catUrl of categories) {
                    const parts = catUrl.split('/');
                    const key = parts[parts.length - 1];
                    if (categoryMap[key]) {
                        genre = categoryMap[key];
                        break;
                    }
                }

                // Fallback to topic IDs if still unknown
                if (genre === "Unknown") {
                    if (topics.includes('/m/064t9')) genre = "Pop";
                    if (topics.includes('/m/06by7')) genre = "Rock";
                    if (topics.includes('/m/04k94')) genre = "Hip Hop";
                    if (topics.includes('/m/02mscn')) genre = "Cristiana";
                    if (topics.includes('/m/033zz')) genre = "Electrónica";
                    if (topics.includes('/m/03_d0')) genre = "Jazz";
                    if (topics.includes('/m/0zdp')) genre = "Reggae";
                    if (topics.includes('/m/0ggq0m')) genre = "Latina";
                    if (topics.includes('/m/02lkt')) genre = "Electrónica";
                }
            }
        } catch (e) { console.warn("Failed to fetch genre metadata:", e); }

        const historyRef = collection(db, "users", currentUserUid, "history");
        const docRef = await addDoc(historyRef, {
            songId: song.id,
            title: song.title,
            artist: song.channel,
            thumbnail: song.thumbnail,
            duration: song.duration,
            durationSeconds: parseDurationToSeconds(song.duration),
            listenedSeconds: 0, // Will be updated with actual listening time
            genre: genre,
            timestamp: serverTimestamp()
        });

        console.log("📊 Historia guardada:", song.title);
        console.log("📊 Session created:", docRef.id, "durationSeconds:", parseDurationToSeconds(song.duration));

        // Track listening session
        currentListenSession = {
            docId: docRef.id,
            songId: song.id,
            startTime: Date.now(),
            listenedSeconds: 0,
            durationSeconds: parseDurationToSeconds(song.duration)
        };
        lastRecordedSeconds = 0;

        return docRef.id;
    } catch (e) {
        console.error("Error al guardar en el historial:", e);
    }
    return null;
}

// Update listening progress while song plays
async function updateListenProgress(currentSeconds) {
    if (!currentListenSession) {
        console.warn('📊 updateListenProgress: No session');
        return;
    }
    if (!currentUserUid) {
        console.warn('📊 updateListenProgress: No user');
        return;
    }

    // Only update if we've advanced at least 2 seconds to avoid excessive writes
    if (currentSeconds - lastRecordedSeconds < 2) return;

    lastRecordedSeconds = Math.floor(currentSeconds);
    currentListenSession.listenedSeconds = lastRecordedSeconds;

    // Also save to Firestore to ensure we don't lose data if user closes app
    try {
        const historyRef = doc(db, "users", currentUserUid, "history", currentListenSession.docId);
        await updateDoc(historyRef, {
            listenedSeconds: lastRecordedSeconds
        });
        console.log('📊 Progress saved:', lastRecordedSeconds, 's for', currentListenSession.songId);
    } catch (e) {
        console.error('❌ Firestore update error:', e.code, e.message);
    }
}

async function finalizeListenSession(finalSeconds) {
    if (!currentListenSession || !currentUserUid) {
        console.warn('📊 finalizeListenSession: No hay sesión activa o usuario no logueado');
        return;
    }

    const finalTime = Math.floor(finalSeconds);
    currentListenSession.listenedSeconds = finalTime;
    console.log('📊 Finalizing session:', finalTime, 's for', currentListenSession.songId);

    try {
        const historyRef = doc(db, "users", currentUserUid, "history", currentListenSession.docId);
        await updateDoc(historyRef, {
            listenedSeconds: finalTime
        });
        console.log(`✅ Firestore actualizado: listenedSeconds = ${finalTime}`);
        console.log(`📊 Escucha finalizada: ${Math.floor(finalTime / 60)}m ${finalTime % 60}s de "${currentListenSession.songId}"`);
    } catch (e) {
        console.error(`❌ Error actualizando Firestore:`, e.message);
        console.error(`📊 Doc ID:`, currentListenSession.docId);
        console.error(`📊 User ID:`, currentUserUid);
    }

    currentListenSession = null;
    lastRecordedSeconds = 0;
}

// --- OTHER FUNCTIONS ---

// Show Brave browser recommendation
function showBraveRecommendation() {
    // Check if we've already shown the message this session
    if (sessionStorage.getItem('braveRecommendationShown')) {
        return;
    }

    // Detect if the user is using Brave browser
    const isBrave = navigator.brave && typeof navigator.brave.isBrave === 'function';

    if (!isBrave) {
        // Show recommendation after a short delay to not overwhelm the user
        setTimeout(() => {
            showToast("💡 Consejo: Usa el navegador Brave para una experiencia sin anuncios", "info");
            sessionStorage.setItem('braveRecommendationShown', 'true');
        }, 2000);
    }
}


// Service Worker registration and keepalive
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('✅ Service Worker registrado:', registration);

            // Force update check immediately
            registration.update();

            // Detect NEW Service Worker installation
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('📦 Nueva versión detectada, instalando...');

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('📦 Nueva versión instalada. Esperando activación...');
                        showToast("Nueva actualización disponible. Recargando...", "info", 3000);
                    }
                });
            });

            // Listen for messages from SW
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'PING') {
                    // Respond to ping to keep connection alive
                    console.log('📡 SW ping recibido');
                }
            });

            // RELOAD ON CONTROLLER CHANGE (This is the key for auto-updates)
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    console.log('🔄 Controlador cambiado. Recargando página...');
                    window.location.reload();
                }
            });

        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
        }
    }
}

function startServiceWorkerKeepAlive() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'KEEP_ALIVE_START' });
        console.log('🔄 Service Worker keep-alive activado');
    }
}

function stopServiceWorkerKeepAlive() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'KEEP_ALIVE_STOP' });
        console.log('⏹️ Service Worker keep-alive detenido');
    }
}

function onYouTubeIframeAPIReady() {
    const origin = window.location.protocol === 'file:' ? '*' : window.location.origin;
    player = new YT.Player('youtubePlayer', {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
            'autoplay': 1,
            'controls': 1,
            'modestbranding': 1,
            'rel': 0,
            'playsinline': 1,
            'origin': origin,
            'widget_referrer': origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    isVideoReady = true;

    // ===== AGGRESSIVE WATCHDOG =====
    // Check every second if engine is paused without user permission
    setInterval(() => {
        if (!player) return;

        try {
            const state = player.getPlayerState();

            // If paused but user didn't pause it, force resume
            // ONLY if we are NOT using any native audio for this track
            if (!isCurrentlyUsingNative && state === YT.PlayerState.PAUSED && !isUserPaused) {
                console.log("⚠️ Watchdog: Detected unwanted pause in YT. Force resuming...");
                player.playVideo();
            }

            // If somehow stopped or cued, also try to resume if we have a track
            if (!isCurrentlyUsingNative && (state === YT.PlayerState.CUED || state === -1) && currentTrack && !isUserPaused) {
                console.log("⚠️ Watchdog: YT Player stopped. Attempting recovery...");
                player.playVideo();
            }
        } catch (e) {
            // Ignore errors silently
        }
    }, 1000); // Check every second

    console.log("✅ Watchdog activated - monitoring playback state");
}

function onPlayerStateChange(event) {
    const playPauseIcon = document.getElementById('playPauseIcon');
    const mobilePlayPauseIcon = document.getElementById('mobilePlayPauseIcon');
    const mobileMainPlayIcon = document.getElementById('mobileMainPlayIcon');

    if (event.data === YT.PlayerState.PLAYING) {
        if (!isCurrentlyUsingNative) isUserPaused = false; // Only reset if YT is the active engine
        isMediaPlaying = true;

        const path = "M6 4h4v16H6zm8 0h4v16h-4z"; // Pause icon
        playPauseIconsUpdate(path, true);

        if (navigator.mediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            updateMediaSessionPosition();
        }

        startSilentAudio();
        startProgressUpdater();
        refreshUIHighlights();
    } else {
        const path = "M8 5v14l11-7z"; // Play icon

        if (event.data === YT.PlayerState.PAUSED) {
            // --- PROTECTION AGAINST UNWANTED BACKGROUND PAUSES ---
            if (!isUserPaused && !isCurrentlyUsingNative) {
                console.log("Unwanted YT pause detected! Force resuming...");
                player.playVideo();
                return; // Exit early, don't update UI to paused state
            }
            isMediaPlaying = false;
            playPauseIconsUpdate(path, false);
            if (navigator.mediaSession) {
                navigator.mediaSession.playbackState = 'paused';
            }
            stopSilentAudio();
            refreshUIHighlights();
        } else if (event.data === YT.PlayerState.ENDED) {
            isMediaPlaying = false;
            playPauseIconsUpdate(path, false);
            refreshUIHighlights();
            if (!isCurrentlyUsingNative) handleTrackEnded();
        } else {
            playPauseIconsUpdate(path, false);
            document.getElementById('equalizer').classList.add('hidden');
        }
    }
}

function refreshUIHighlights() {
    renderHomePlaylists();

    // Refresh highlight in the currently open playlist/search view
    if (currentTrack) {
        highlightCurrentTrack(currentTrack.id);
    }

    // Refresh queue modal if it's open
    const queueModal = document.getElementById('queueModal');
    if (queueModal && !queueModal.classList.contains('hidden')) {
        showQueue();
    }
}

// Helper for YT specific icon updates to keep onPlayerStateChange clean
function playPauseIconsUpdate(path, isPlaying) {
    updatePlayPauseIcons(isPlaying);
}


// --- NATIVE AUDIO SETUP ---
function setupAudioListeners(audioElement) {
    if (!audioElement) return;

    audioElement.addEventListener('play', () => {
        // Only allow the current primary audio to drive global state logs
        if (audioElement === nativeAudio) {
            console.log('🎵 Audio nativo: reproduciendo');
            isUserPaused = false;

            // Ensure YT player is paused if we are using native
            if (player && typeof player.pauseVideo === 'function') {
                player.pauseVideo();
            }

            updatePlayPauseIcons(true);
            startProgressUpdater();
            startServiceWorkerKeepAlive();
            if (navigator.mediaSession) {
                navigator.mediaSession.playbackState = 'playing';
            }
        }
    });

    audioElement.addEventListener('pause', () => {
        if (audioElement === nativeAudio) {
            console.log('⏸️ Audio nativo: pausado');
            if (!isCrossfading) {
                updatePlayPauseIcons(false);
            }

            if (navigator.mediaSession) {
                navigator.mediaSession.playbackState = 'paused';
                stopSilentAudio();
                stopServiceWorkerKeepAlive();
            }
        }
    });

    audioElement.addEventListener('ended', () => {
        if (audioElement === nativeAudio) {
            console.log('✅ Audio nativo: terminado');
            handleTrackEnded();
        }
    });

    // Monitoreo continuo de anuncios durante la reproducción
    let lastCheckedTime = -1;

    audioElement.addEventListener('timeupdate', () => {
        // Guard: Only the active nativeAudio drives the UI
        if (audioElement !== nativeAudio) return;

        const currentTime = audioElement.currentTime;

        // Solo verificar si el tiempo cambió significativamente (evitar spam)
        if (Math.abs(currentTime - lastCheckedTime) > 0.3) {
            lastCheckedTime = currentTime;

            if (currentSponsorSegments && currentSponsorSegments.length > 0) {
                const skipped = checkSponsorSegments(currentTime);
                if (skipped) {
                    console.log('🛡️ Anuncio bloqueado en reproducción activa');
                    lastCheckedTime = audioElement.currentTime; // Actualizar después del skip
                }
            }
        }

        // AUTO-MIX / DJ MODE CHECK
        checkAutoMixTransition();
    });

    audioElement.addEventListener('error', async (e) => {
        if (audioElement !== nativeAudio) return;

        const err = e.target.error;
        console.error('❌ Error en audio nativo:', err);

        let errorMsg = 'Error desconocido';
        if (err) {
            switch (err.code) {
                case err.MEDIA_ERR_ABORTED: errorMsg = 'Abortado'; break;
                case err.MEDIA_ERR_NETWORK: errorMsg = 'Error de Red'; break;
                case err.MEDIA_ERR_DECODE: errorMsg = 'Error de Decodificación'; break;
                case err.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = '403 / Fuente no soportada'; break;
                default: errorMsg = `Código: ${err.code}`;
            }
        }

        // Recovery logic
        if (currentTrack && err && (err.code === err.MEDIA_ERR_NETWORK || err.code === err.MEDIA_ERR_SRC_NOT_SUPPORTED)) {
            console.log('🔄 Error detectado (403/Red). Reintentando con otro servidor...');
            showToast("Error de conexión. Buscando servidor nuevo...", "warning");

            const savedTime = audioElement.currentTime;
            localStorage.removeItem('amaya_fastest_server');

            try {
                const newUrl = await getAudioUrl(currentTrack.id);
                if (newUrl) {
                    audioElement.src = newUrl;
                    audioElement.currentTime = savedTime;
                    await audioElement.play();
                    console.log('✅ Recuperado con éxito de otro servidor.');
                    return;
                }
            } catch (retryError) {
                console.error("Reintento fallido:", retryError);
            }
        }

        console.log('📡 Fallback final a YouTube por fallo crítico de audio nativo');
        console.warn('Cambiando a reproductor secundario:', errorMsg);
        if (currentTrack) {
            loadYouTubeIFrame(currentTrack.id);
        }
    });

    audioElement.addEventListener('loadstart', () => {
        if (audioElement === nativeAudio) console.log('⏳ Cargando audio...');
    });
    audioElement.addEventListener('canplay', () => {
        if (audioElement === nativeAudio) console.log('✅ Audio listo para reproducir');
    });

    console.log('✅ Handlers de audio configurados para:', audioElement.id);
}

function playNativeAudio(url) {
    if (!nativeAudio) return;

    // Update Media Session
    if (navigator.mediaSession && currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTrack.title,
            artist: currentTrack.channel,
            album: 'Amaya Musica',
            artwork: [
                { src: currentTrack.thumbnail, sizes: '300x300', type: 'image/jpeg' }
            ]
        });
    }

    nativeAudio.src = url;
    nativeAudio.play().then(() => {
        console.log("✅ Native playback started");
        isUserPaused = false;
        isCurrentlyUsingNative = true;
        updatePlayPauseIcons(true);
        if (currentTrack && currentTrack.thumbnail) {
            updateAmbientBackground(currentTrack.thumbnail);
        }
    }).catch(error => {
        console.error("❌ Native playback failed:", error);
        if (error.name === 'NotAllowedError') {
            showToast("⚠️ Toca 'Play' para iniciar", "warning");
        } else {
            showToast("Error de audio. Reintentando con YouTube...", "info");
            // SOLO fallback para esta canción, no desactivamos el motor globalmente
            if (currentTrack) loadYouTubeIFrame(currentTrack.id);
        }
    });
}

// --- MEDIA SESSION SETUP ---
function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;

    // Use a robust approach to set action handlers
    const safeSetHandler = (action, handler) => {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
            console.log(`Media Session action "${action}" is not supported.`);
        }
    };

    safeSetHandler('play', () => {
        console.log("MediaSession: Play");
        isUserPaused = false;
        navigator.mediaSession.playbackState = 'playing';
        if (isCurrentlyUsingNative && nativeAudio) {
            nativeAudio.play().catch(e => console.error("MS Play error:", e));
        } else if (player) {
            player.playVideo();
        }
    });

    safeSetHandler('pause', () => {
        console.log("MediaSession: Pause");
        isUserPaused = true;
        navigator.mediaSession.playbackState = 'paused';
        if (isCurrentlyUsingNative && nativeAudio) {
            nativeAudio.pause();
        } else if (player) {
            player.pauseVideo();
        }
    });

    safeSetHandler('stop', () => {
        console.log("MediaSession: Stop");
        isUserPaused = true;
        navigator.mediaSession.playbackState = 'none';
        if (isCurrentlyUsingNative && nativeAudio) {
            nativeAudio.pause();
            nativeAudio.currentTime = 0;
        } else if (player) {
            player.stopVideo();
        }
    });

    safeSetHandler('previoustrack', () => {
        console.log("MediaSession: Previous Track");
        playPrevious();
    });

    safeSetHandler('nexttrack', () => {
        console.log("MediaSession: Next Track");
        playNext();
    });

    safeSetHandler('seekto', (details) => {
        console.log("MediaSession: Seek To", details.seekTime);
        if (details.seekTime !== undefined) {
            if (isCurrentlyUsingNative && nativeAudio) {
                nativeAudio.currentTime = details.seekTime;
            } else if (player && player.seekTo) {
                player.seekTo(details.seekTime);
            }
            updateMediaSessionPosition();
        }
    });

    safeSetHandler('seekbackward', (details) => {
        console.log("MediaSession: Seek Backward");
        const skipTime = details.seekOffset || 10;
        if (isCurrentlyUsingNative && nativeAudio) {
            nativeAudio.currentTime = Math.max(nativeAudio.currentTime - skipTime, 0);
        } else if (player) {
            player.seekTo(Math.max(player.getCurrentTime() - skipTime, 0));
        }
        updateMediaSessionPosition();
    });

    safeSetHandler('seekforward', (details) => {
        console.log("MediaSession: Seek Forward");
        const skipTime = details.seekOffset || 10;
        if (isCurrentlyUsingNative && nativeAudio) {
            nativeAudio.currentTime = Math.min(nativeAudio.currentTime + skipTime, nativeAudio.duration || 0);
        } else if (player) {
            player.seekTo(Math.min(player.getCurrentTime() + skipTime, player.getDuration() || 0));
        }
        updateMediaSessionPosition();
    });

    console.log('✅ Media Session handlers configurados (Robust Mode)');
}

function updatePlayPauseIcons(isPlaying) {
    isMediaPlaying = isPlaying;
    const path = isPlaying ? "M6 4h4v16H6zm8 0h4v16h-4z" : "M8 5v14l11-7z";
    const playPauseIcon = document.getElementById('playPauseIcon');
    const mobilePlayPauseIcon = document.getElementById('mobilePlayPauseIcon');
    const mobileMainPlayIcon = document.getElementById('mobileMainPlayIcon');

    if (playPauseIcon) playPauseIcon.setAttribute('d', path);
    if (mobilePlayPauseIcon) mobilePlayPauseIcon.innerHTML = `<path d="${path}"/>`;
    if (mobileMainPlayIcon) mobileMainPlayIcon.innerHTML = `<path d="${path}"/>`;

    // Update all play/pause buttons color (Desktop, Mini, Full)
    const playButtons = ['playPauseBtn', 'mobilePlayPauseBtn', 'mobileMainPlayBtn'];
    playButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (isPlaying) {
                btn.classList.add('is-playing-icon');
            } else {
                btn.classList.remove('is-playing-icon');
            }
        }
    });

    const equalizer = document.getElementById('equalizer');
    const equalizerBars = document.querySelector('.equalizer-bars');
    if (equalizer && equalizerBars) {
        if (isPlaying) {
            equalizer.classList.remove('hidden');
            equalizerBars.classList.remove('paused');
        } else {
            equalizerBars.classList.add('paused');
        }
    }

    // Update Ad-Free UI status based on current engine
    updateAdFreeStatus(isCurrentlyUsingNative);

    // Dynamic Icon Updates for News Cards
    // 1. Reset ALL news cards to PLAY icon
    document.querySelectorAll('.card-play-icon path').forEach(pathEl => {
        pathEl.setAttribute('d', "M8 5v14l11-7z");
    });

    // 2. Set CURRENT news card to PAUSE icon (if playing)
    if (currentTrack) {
        const activeCard = document.querySelector(`.news-card[data-video-id="${currentTrack.id}"] .card-play-icon path`);
        if (activeCard && isPlaying) {
            activeCard.setAttribute('d', "M6 4h4v16H6zm8 0h4v16h-4z");
        }
    }

    // Refresh UI highlights
    refreshUIHighlights();
}

function updateAdFreeStatus(active) {
    const badges = [document.getElementById('adFreeBadge'), document.getElementById('mobileAdFreeBadge')];
    badges.forEach(b => {
        if (b) {
            if (active) b.classList.remove('hidden');
            else b.classList.add('hidden');
        }
    });
}

// --- INVIDIOUS & PIPED INTEGRATION (ULTRA-FAST PARALLEL RACING) ---
async function getAudioUrl(videoId) {
    console.log(`🔍 Buscando audio proxeado (Cobalt/Piped/Invidious) para: ${videoId}`);

    // 1. Try Cached Instance + Parallel Racing for backups
    const cachedInstance = localStorage.getItem('amaya_fastest_server');
    const cachedType = localStorage.getItem('amaya_fastest_server_type');

    // Create a list of candidates excluding the cached one
    const backupCandidates = [...COBALT_INSTANCES.map(url => ({ url, type: 'cobalt' })), ...PIPED_INSTANCES.map(url => ({ url, type: 'piped' }))]
        .filter(inst => inst.url !== cachedInstance && !FAILED_INSTANCES.has(inst.url))
        .sort(() => 0.5 - Math.random())
        .slice(0, 3); // Take top 3 random backups

    if (cachedInstance && !FAILED_INSTANCES.has(cachedInstance)) {
        console.log(`⚡ Racing cached server: ${cachedInstance} with ${backupCandidates.length} backups...`);

        try {
            // Race the cached server with backups but give cached a slight "head start" 
            // by using a shorter timeout for it if it fails.
            const winner = await Promise.any([
                (cachedType === 'cobalt' ? fetchFromCobalt(cachedInstance, videoId, 1500) : fetchFromPiped(cachedInstance, videoId, 1500))
                    .then(url => ({ url, instance: cachedInstance, type: cachedType })),
                ...backupCandidates.map(c =>
                    (c.type === 'cobalt' ? fetchFromCobalt(c.url, videoId, 2500) : fetchFromPiped(c.url, videoId, 2500))
                        .then(url => ({ url, instance: c.url, type: c.type }))
                )
            ]);

            if (winner && winner.url) {
                if (winner.instance !== cachedInstance) {
                    localStorage.setItem('amaya_fastest_server', winner.instance);
                    localStorage.setItem('amaya_fastest_server_type', winner.type);
                }
                return winner.url;
            }
        } catch (e) {
            console.warn("Cached + Initial race failed, falling back to full batch race...");
            FAILED_INSTANCES.add(cachedInstance);
            localStorage.removeItem('amaya_fastest_server');
        }
    }

    // 2. Parallel Racing Strategy (Cobalt + Piped)
    const pipedCandidates = PIPED_INSTANCES
        .filter(inst => !FAILED_INSTANCES.has(inst))
        .map(inst => ({ url: inst, type: 'piped' }));

    const cobaltCandidates = COBALT_INSTANCES
        .filter(inst => !FAILED_INSTANCES.has(inst))
        .map(inst => ({ url: inst, type: 'cobalt' }));

    // Prioritize Cobalt in 2025
    const candidates = [...cobaltCandidates, ...pipedCandidates]
        .sort(() => 0.5 - Math.random());

    const batchSize = 10;

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        console.log(`🚀 Racing Batch ${Math.floor(i / batchSize) + 1} (${batch.map(c => c.type).join(', ')})...`);

        try {
            const winner = await Promise.any(batch.map(item => {
                if (item.type === 'cobalt') {
                    return fetchFromCobalt(item.url, videoId, 6000).then(url => ({ url, instance: item.url, type: 'cobalt' }));
                } else {
                    return fetchFromPiped(item.url, videoId, 6000).then(url => ({ url, instance: item.url, type: 'piped' }));
                }
            }));

            if (winner && winner.url) {
                localStorage.setItem('amaya_fastest_server', winner.instance);
                localStorage.setItem('amaya_fastest_server_type', winner.type);
                return winner.url;
            }
        } catch (e) {
            batch.forEach(item => FAILED_INSTANCES.add(item.url));
            console.warn("Batch failed, trying next set...");
        }
    }

    // STAGE 3: Invidious Fallback (Proxied)
    console.log("⚠️ Cobalt/Piped fallaron. Intentando Invidious Proxeado...");
    const invidiousBatch = INVIDIOUS_INSTANCES.slice(0, 5);
    try {
        const winnerUrl = await Promise.any(invidiousBatch.map(instance =>
            fetchFromInvidious(instance, videoId, 6000)
        ));
        if (winnerUrl) return winnerUrl;
    } catch (e) { }

    throw new Error('No se encontró audio proxeado compatible.');
}

// Dedicated helper for Cobalt Fetch
async function fetchFromCobalt(apiBase, videoId, timeoutMs) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                url: videoUrl,
                videoQuality: '720', // Doesn't matter for audio-only but required by some instances
                audioFormat: 'opus', // Best quality for YouTube
                downloadMode: 'audio',
                isAudioOnly: true
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Cobalt status ${response.status}`);

        const data = await response.json();
        if (data.status === 'redirect' || data.status === 'stream') {
            const streamUrl = data.url;
            console.log(`✅ Cobalt winner: ${apiBase}`);
            return streamUrl;
        }
        throw new Error(`Cobalt returned status: ${data.status}`);
    } catch (e) {
        throw e;
    }
}

// Dedicated helper for Invidious Fetch with Scoring
async function fetchFromInvidious(instance, videoId, timeoutMs) {
    const url = `https://${instance}/api/v1/videos/${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error("Invidious error");

        const data = await response.json();
        if (!data.adaptiveFormats || data.adaptiveFormats.length === 0) throw new Error("No formats");

        const audioFormats = data.adaptiveFormats.filter(f => f.type && f.type.includes('audio'))
            .sort((a, b) => {
                const getScore = (format) => {
                    let score = 0;
                    if (format.type && (format.type.includes('mp4') || format.type.includes('m4a'))) score += 1000;
                    if (format.bitrate) score += parseInt(format.bitrate) / 1000;
                    return score;
                };
                return getScore(b) - getScore(a);
            });

        if (audioFormats.length > 0) {
            console.log(`✅ Invidious winner: ${instance}`);
            return audioFormats[0].url;
        }
        throw new Error("No audio formats");
    } catch (e) {
        throw e;
    }
}

// --- SPONSORBLOCK INTEGRATION ---
async function fetchSponsorSegments(videoId) {
    currentSponsorSegments = [];
    pendingSponsorFetch = (async () => {
        try {
            // Expandir categorías para capturar TODOS los tipos de anuncios
            const categories = [
                "sponsor", "intro", "outro", "interaction",
                "selfpromo", "music_offtopic", "preview", "filler",
                "poi_highlight", "exclusive_access"
            ];
            const response = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${JSON.stringify(categories)}`);

            if (response.ok) {
                const data = await response.json();
                currentSponsorSegments = data;

                // LOG DETALLADO
                if (data.length > 0) {
                    console.log(`🛡️ SponsorBlock: ${data.length} segmento(s) detectado(s):`);
                    data.forEach((seg, i) => {
                        const [start, end] = seg.segment;
                        console.log(`  ${i + 1}. [${start.toFixed(1)}s - ${end.toFixed(1)}s] ${seg.category}`);
                    });
                } else {
                    console.log("⚠️ SponsorBlock: Este video NO tiene segmentos marcados");
                }

                // Ultra-aggressive check for first 3 seconds
                for (let delay of [0, 50, 150, 400, 800, 1500, 3000]) {
                    setTimeout(() => {
                        const time = isCurrentlyUsingNative ? (nativeAudio ? nativeAudio.currentTime : 0) : (player ? player.getCurrentTime() : 0);
                        checkSponsorSegments(time || 0);
                    }, delay);
                }
            }
        } catch (e) {
            console.log("ℹ️ SponsorBlock: Servidor no disponible");
        }
    })();
    return pendingSponsorFetch;
}

function checkSponsorSegments(currentTime) {
    if (!currentSponsorSegments || currentSponsorSegments.length === 0) return false;

    let skippedTotal = false;
    let iteration = 0;
    let activeTime = currentTime;

    // Recursive search for consecutive segments (multiple ads)
    while (iteration < 5) {
        let jumpFound = false;
        for (const segment of currentSponsorSegments) {
            const [start, end] = segment.segment;

            // If current time is within or slightly before the segment
            if (activeTime >= start - 0.1 && activeTime < end - 0.1) {
                console.log(`⏩ SALTANDO ANUNCIO: ${activeTime.toFixed(2)}s → ${end.toFixed(2)}s [${segment.category}]`);

                // CRÍTICO: Añadir buffer de seguridad (0.2s después del final)
                activeTime = end + 0.2;
                jumpFound = true;
                skippedTotal = true;
                break;
            }
        }
        if (!jumpFound) break;
        iteration++;
    }

    if (skippedTotal) {
        // EJECUTAR SKIP INMEDIATAMENTE
        if (isCurrentlyUsingNative && nativeAudio) {
            console.log(`🛡️ EJECUTANDO SALTO A: ${activeTime.toFixed(2)}s`);

            // PAUSAR primero para evitar que suene mientras salta
            const wasPaused = nativeAudio.paused;
            if (!wasPaused) {
                nativeAudio.pause();
            }

            // Ejecutar el skip
            nativeAudio.currentTime = activeTime;

            // Reanudar SOLO si estaba reproduciendo antes
            if (!wasPaused && !isUserPaused) {
                setTimeout(() => {
                    nativeAudio.play().catch(e => console.error('Error resumiendo después de skip:', e));
                }, 50);
            }
        } else if (player && typeof player.seekTo === 'function') {
            player.seekTo(activeTime, true); // true = allowSeekAhead
        }

        showToast(`🛡️ ${iteration} anuncio(s) bloqueado(s)`, "success");
    }
    return skippedTotal;
}



// Helper for Racing
async function fetchFromPiped(apiBase, videoId, timeoutMs) {
    const url = `${apiBase}/streams/${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Status ${response.status}`);

        const data = await response.json();
        if (!data.audioStreams || data.audioStreams.length === 0) throw new Error("No streams");

        // FILTER: Strictly EXCLUDE direct googlevideo.com links to avoid Error 403
        const proxiedStreams = data.audioStreams.filter(s => !s.url.includes('googlevideo.com'));
        if (proxiedStreams.length === 0) throw new Error("No proxied streams found");
        const targetList = proxiedStreams;

        const audioStreams = targetList.sort((a, b) => {
            const getScore = (stream) => {
                let score = 0;
                if (stream.mimeType && stream.mimeType.includes('mp4')) score += 1000;
                if (stream.bitrate) score += stream.bitrate / 1000;
                return score;
            };
            return getScore(b) - getScore(a);
        });

        if (audioStreams.length > 0) {
            const winnerUrl = audioStreams[0].url;
            console.log(`✅ Piped winner: ${apiBase} (${proxiedStreams.length > 0 ? 'PROXIED' : 'DIRECT'})`);

            if (proxiedStreams.length === 0) {
                console.warn(`⚠️ Instance ${apiBase} is returning non-proxied URLs. High risk of 403.`);
            }

            localStorage.setItem('amaya_fastest_server', apiBase);
            return winnerUrl;
        }
        throw new Error("No valid streams");
    } catch (e) {
        throw e;
    }
}

// --- BACKGROUND PLAYBACK & OPIMIZATION ---

let wakeLock = null;
let wakeLockRequested = false;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLockRequested = true;
        console.log("🔒 Wake Lock activado");

        // Re-request if released by system
        wakeLock.addEventListener('release', () => {
            console.warn('⚠️ Wake Lock liberado por el sistema');
            if (wakeLockRequested && !isUserPaused) {
                setTimeout(() => requestWakeLock(), 1000);
            }
        });
    } catch (err) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
    }
}

function releaseWakeLock() {
    wakeLockRequested = false;
    if (wakeLock) {
        wakeLock.release().then(() => {
            wakeLock = null;
            console.log("🔓 Wake Lock liberado");
        });
    }
}

// Re-request wake lock on visibility change (it can be released by the OS)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        await requestWakeLock();
    } else {
        // App went to background - save listen session
        if (currentListenSession) {
            const currentTime = isCurrentlyUsingNative ? (nativeAudio?.currentTime || 0) : (player?.getCurrentTime() || 0);
            console.log('📊 Visibility change - saving session:', currentTime, 's');
            finalizeListenSession(currentTime);
        }
        // Ensure audio context is passing time to keep the thread alive
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }
});

// Save listen session when user closes tab or navigates away
window.addEventListener('beforeunload', () => {
    if (currentListenSession) {
        const currentTime = isCurrentlyUsingNative ? (nativeAudio?.currentTime || 0) : (player?.getCurrentTime() || 0);
        console.log('📊 beforeunload - saving session:', currentTime, 's');
        // Use synchronous write for beforeunload
        const historyRef = doc(db, "users", currentUserUid, "history", currentListenSession.docId);
        updateDoc(historyRef, { listenedSeconds: Math.floor(currentTime) });
    }
});

let audioCtx = null;
let oscillator = null;
let gainNode = null;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function keepAudioAlive() {
    try {
        initAudioContext();

        // Stop existing oscillator to avoid stacking
        if (oscillator) {
            try { oscillator.stop(); } catch (e) { }
            oscillator.disconnect();
        }

        // Create a "pulsing" oscillator
        // Changing parameters forces the audio engine to stay active calculating mixing
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 60; // Low frequency

        // Very low volume, effectively silent but mathematically present
        gainNode.gain.value = 0.001;

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();

        // "Pulse" the frequency every few seconds to prevent optimization
        // (Some engines sleep if the graph is static)
        setInterval(() => {
            if (audioCtx && audioCtx.state === 'running' && oscillator) {
                const newFreq = oscillator.frequency.value === 60 ? 65 : 60;
                oscillator.frequency.setValueAtTime(newFreq, audioCtx.currentTime);
            }
        }, 5000);

        console.log("Enhanced Web Audio Heartbeat active");
    } catch (e) {
        console.error("Web Audio Heartbeat failed:", e);
    }
}

function startSilentAudio() {
    const audio = document.getElementById('silentAudio');
    if (audio) {
        audio.volume = 0.01; // Not zero, to prevent "mute" optimization
        // Manual loop: better than loop attribute for some browsers
        audio.onended = () => {
            audio.currentTime = 0;
            audio.play().catch(() => { });
        };
        audio.play().catch(e => console.log("Silent audio failed to start:", e));
    }

    keepAudioAlive();
    requestWakeLock();
}

function stopSilentAudio() {
    // We actually DON'T want to unwantedly stop the heartbeat if we want background resilience,
    // but we can lower the priority if paused. 
    // For now, we'll clear resources to be good citizens when explicitly paused.

    const audio = document.getElementById('silentAudio');
    if (audio) {
        audio.pause();
    }

    if (oscillator) {
        try { oscillator.stop(); } catch (e) { }
        oscillator = null;
    }

    releaseWakeLock();
}

// --- PICTURE IN PICTURE ---
async function togglePictureInPicture() {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            // NOTE: YouTube IFrame API doesn't expose the video element directly for PiP 
            // easily unless we hack it or use the Media Session API actions.
            // HOWEVER, we can try to use the MediaSession 'enterpictureinpicture' action if supported,
            // OR simply suggest the user use the native controls if we can't force it.

            // BUT, strictly speaking, `document.pictureInPictureElement` works on VIDEO tags.
            // The YT Iframe contains a video tag but it's cross-origin usually.
            // So we might depend on the User activating it via the native player controls if the API blocks us.

            // Let's try a workaround: create a dummy video for PiP that "proxies" the audio?
            // No, that's too complex.

            // Alternative: The user might be on Android/iOS knowing the native player has PiP.
            // We will just show a Toast explaining how to use it if we can't trigger it programmatically
            // for the YT frame.

            showToast("Usa el botón PiP del reproductor de YouTube");
        }
    } catch (error) {
        console.error(error);
        showToast("Error al activar PiP: " + error.message, "error");
    }
}

// Helper to try to enable background playback capabilities
function enableBackgroundPlayback() {
    // iOS Safari requires a user interaction to start audio context
    document.addEventListener('touchstart', function () {
        initAudioContext();
    }, { once: true });

    document.addEventListener('click', function () {
        initAudioContext();
    }, { once: true });
}

enableBackgroundPlayback();

async function onPlayerError(event) {
    console.error("YT Player Error:", event.data);

    // Restrictions (External playback forbidden)
    if (event.data === 101 || event.data === 150) {
        if (currentTrack && !currentTrack.isFallback) {
            console.warn('Canción restringida. Buscando versión de audio compatible...');

            try {
                // Background search for audio version - prioritize "Topic" and "Lyrics" for better compatibility
                // REPLACED: Use Piped instead of Google API to avoid quota issues
                const fallbackSongResult = await findPipedFallback(currentTrack);

                if (fallbackSongResult) {
                    console.log('Reproduciendo versión alternativa');

                    // Force native audio for the fallback, as IFrame will likely fail for the same reason (restriction)
                    useNativeAudio = true;

                    // Update current track in queue to avoid repeated failures if re-played
                    if (currentQueueIndex >= 0 && currentQueueIndex < queue.length) {
                        queue[currentQueueIndex] = fallbackSongResult;
                    }
                    playSong(fallbackSongResult, queue, true);
                    return;
                }
            } catch (fallbackError) {
                console.warn("Fallback search failed:", fallbackError);
            }
        }

        console.warn('Error de reproducción');
    }

    // Final fallback: skip to next
    if (queue.length > 0) {
        setTimeout(() => playNext(), 2000);
    }
}

// --- PIPED SEARCH FALLBACK ---
async function searchPiped(query) {
    console.log("🕵️ Iniciando búsqueda de respaldo en Piped para:", query);
    console.log("Usando buscador alternativo...");

    // CORS proxy to avoid browser blocking
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    // Try multiple instances until one works
    const candidates = [...PIPED_INSTANCES].sort(() => 0.5 - Math.random());

    for (let instance of candidates) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const pipedUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_videos`;
            const response = await fetch(CORS_PROXY + encodeURIComponent(pipedUrl), {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) continue;

            const data = await response.json();
            if (!data.items || data.items.length === 0) continue;

            console.log(`✅ Búsqueda Piped exitosa en: ${instance}`);

            // Map Piped format to our internal format
            return data.items.map(item => {
                let videoId = '';
                // Robust ID extraction from Piped
                if (item.url && item.url.includes('v=')) {
                    videoId = item.url.split('v=')[1].split('&')[0];
                } else if (item.url && item.url.includes('/')) {
                    videoId = item.url.split('/').pop().split('?')[0];
                }

                return {
                    id: videoId || item.url,
                    title: item.title,
                    channel: item.uploaderName,
                    thumbnail: item.thumbnail,
                    duration: item.duration ? formatPipedDuration(item.duration) : '0:00',
                    durationSec: item.duration || 0
                };
            });

        } catch (e) {
            continue;
        }
    }
    throw new Error("Piped search failed on all instances");
}

function formatPipedDuration(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper to find audio-only fallback without using API key
async function findPipedFallback(song) {
    const query = `${song.title} ${song.channel} topic audio`;
    try {
        const results = await searchPiped(query);
        if (results && results.length > 0) {
            return {
                ...results[0],
                isFallback: true
            };
        }
    } catch (e) {
        console.error("Piped fallback search failed:", e);
    }
    return null;
}

// --- DJ MIX MODE (AUTO-CROSSFADE) ---
function toggleDjMixMode() {
    isDjMixMode = !isDjMixMode;
    localStorage.setItem('amaya_dj_mix_mode', isDjMixMode);

    if (isDjMixMode) {
        showToast("🎛️ Modo DJ activado (Crossfade)");
    } else {
        showToast("Modo DJ desactivado");
        // Clean up if currently mixing
        if (isCrossfading) {
            stopCrossfade();
        }
    }
    updateDjMixButtonState();
}

function updateDjMixButtonState() {
    const desktopBtn = document.getElementById('djMixBtn');
    const mobileBtn = document.getElementById('mobileDjMixBtn');

    [desktopBtn, mobileBtn].forEach(btn => {
        if (!btn) return;

        if (isDjMixMode) {
            btn.classList.add('text-green-500');
            btn.classList.remove('text-[#b3b3b3]', 'text-gray-400');
            btn.style.filter = "drop-shadow(0 0 5px rgba(34,197,94,0.5))";
        } else {
            btn.classList.remove('text-green-500');
            if (btn.id === 'mobileDjMixBtn') {
                btn.classList.add('text-gray-400');
            } else {
                btn.classList.add('text-[#b3b3b3]');
            }
            btn.style.filter = "none";
        }
    });
}

function stopCrossfade() {
    isCrossfading = false;
    if (crossfadeInterval) {
        clearInterval(crossfadeInterval);
        crossfadeInterval = null;
    }
    // Ensure volumes are reset if cancelled manually
    if (nativeAudio) nativeAudio.volume = 1;
    if (secondaryAudio) {
        secondaryAudio.pause();
        secondaryAudio.volume = 0;
        secondaryAudio.currentTime = 0;
    }
}

// Check if we should start crossfading (called on timeupdate)
function checkAutoMixTransition() {
    if (!isDjMixMode || !nativeAudio || isCrossfading || !currentTrack) return;

    // Only works if we have a next song
    if (queue.length === 0) return;

    // Check remaining time
    const duration = nativeAudio.duration;
    const currentTime = nativeAudio.currentTime;

    if (!duration || isNaN(duration)) return;

    const remaining = duration - currentTime;

    // 1. Preload Next Track (15s before end)
    if (remaining <= PRELOAD_OFFSET && remaining > CROSSFADE_DURATION + 2) {
        preloadNextTrack();
    }

    // 2. Start Crossfade (8s before end)
    // Extra check: secondaryAudio MUST be ready
    if (remaining <= CROSSFADE_DURATION && secondaryAudio && secondaryAudio.readyState >= 2) {
        console.log("🎛️ Starting DJ Mix Crossfade...");
        startCrossfade();
    }
}

let nextTrackUrl = null;
let nextTrackId = null;

async function preloadNextTrack() {
    // Determine next track index
    let nextIndex = currentQueueIndex + 1;
    if (nextIndex >= queue.length) {
        if (repeatMode === 1) nextIndex = 0; // Loop playlist
        else return; // End of queue
    }

    const nextSong = queue[nextIndex];
    if (!nextSong || nextTrackId === nextSong.id) return; // Already preloaded/preloading

    console.log(`🎧 DJ Mode: Preloading next track: ${nextSong.title}`);
    nextTrackId = nextSong.id;

    try {
        // Use existing getAudioUrl logic
        // IMPORTANT: Fetch URL but don't play yet
        const url = await getAudioUrl(nextSong.id);
        if (url && secondaryAudio) {
            secondaryAudio.src = url;
            secondaryAudio.volume = 0; // Start silent
            secondaryAudio.load();
            nextTrackUrl = url;
        }
    } catch (e) {
        console.warn("DJ Mode: Failed to preload next track", e);
        nextTrackId = null; // Reset so we can try again or fail gracefully
    }
}

function startCrossfade() {
    if (isCrossfading || !secondaryAudio || !nativeAudio) return;

    isCrossfading = true;

    // Prepare secondary audio
    secondaryAudio.volume = 0;

    // Start playing next track
    const playPromise = secondaryAudio.play();

    if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log("🎛️ Mix: Secondary audio started");

            // Perform Crossfade
            const stepTime = 100; // ms
            const steps = (CROSSFADE_DURATION * 1000) / stepTime;
            let currentStep = 0;

            crossfadeInterval = setInterval(() => {
                currentStep++;
                const progress = currentStep / steps;

                // Linear fade
                // nativeAudio: 1 -> 0
                // secondaryAudio: 0 -> 1
                nativeAudio.volume = Math.max(0, 1 - progress);
                secondaryAudio.volume = Math.min(1, progress);

                if (progress >= 1) {
                    finishCrossfade();
                }
            }, stepTime);

        }).catch(e => {
            console.error("DJ Mix: Failed to start secondary audio", e);
            isCrossfading = false;
        });
    }
}

function finishCrossfade() {
    console.log("🎛️ Mix: Transition complete. Swapping players.");
    clearInterval(crossfadeInterval);
    crossfadeInterval = null;
    isCrossfading = false;

    // 1. Swap Player References
    // We want 'nativeAudio' to always point to the ACTIVE player for the rest of the app logic
    const oldPrimary = nativeAudio;
    const newPrimary = secondaryAudio;

    // Temporarily remove listeners from old primary to avoid conflict during swap
    // (Ideally we should have a cleaner architecture, but this hacks it in)
    oldPrimary.pause();
    oldPrimary.currentTime = 0;
    oldPrimary.volume = 1; // Reset for next time it becomes secondary
    // Unhide new, hide old? No, both are hidden in HTML, we just control logic

    // 2. Logic Update
    // We need to manually trigger the "User Interface" updates that normally happen in playSong
    // But we don't want to reload the audio because it is ALREADY playing.

    // Calculate next index again
    let nextIndex = currentQueueIndex + 1;
    if (nextIndex >= queue.length) {
        if (repeatMode === 1) nextIndex = 0;
    }

    // Update Global State
    currentQueueIndex = nextIndex;
    const newSong = queue[currentQueueIndex];
    currentTrack = newSong;

    // SWAP DOM IDS (Trick to keep `nativeAudio` variable pointing to the same DOM element logic if re-queried, 
    // OR we just swap global variables. Swapping global variables is riskier if event listeners are bound to specific elements.
    // BETTER: Just swap the variables and re-bind listeners?
    // Actually, `nativeAudio` is a global variable.

    nativeAudio = newPrimary;
    secondaryAudio = oldPrimary;

    // Re-bind listeners to the NEW primary (and strip from old?)
    // This is tricky. A better way:
    // Have a `activePlayer` and `nextPlayer`.
    // But `nativeAudio` is used everywhere.

    // SOLUTION:
    // We must detach listeners from old `nativeAudio` and attach to `newPrimary`.
    // Since `setupNativeAudioHandlers` attaches anonymous functions, we can't easily remove them.
    // ALTERNATIVE: Don't swap IDs. Just tell the app that `nativeAudio` is now the other element?
    // No, existing code queries `document.getElementById('nativeAudioPlayer')`.

    // HACK: Swap the `src` and `currentTime`? No, that skips.

    // CORRECT APPROACH FOR THIS CODEBASE:
    // 1. Update global `nativeAudio` to point to `newPrimary` (which is the element currently playing).
    // 2. Update global `secondaryAudio` to point to `oldPrimary`.
    // 3. IMPORTANT: The event listeners are attached to the DOM ELEMENT, not the variable.
    // So both elements need to have the handlers attached, OR we attach handlers to both at start.

    // Action: Ensure `setupNativeAudioHandlers` is called for BOTH players at init (we only did one).
    // We will do that in a follow-up step.

    // For now, let's assume we swapped.

    // Trigger UI updates
    document.getElementById('currentTitle').innerText = newSong.title;
    document.getElementById('currentChannel').innerText = newSong.channel;
    document.getElementById('currentThumbnail').src = newSong.thumbnail;
    updateAmbientBackground(newSong.thumbnail);
    updateQueueIcons();
    highlightCurrentTrack(newSong.id);
    addToHistory(newSong);

    // Reset nextTrack state
    nextTrackId = null;
    nextTrackUrl = null;

    // Force volume
    nativeAudio.volume = 1;

    console.log("🎛️ Mix: Swapped. Now playing:", newSong.title);
}

function saveApiKey() {
    const keys = [];
    for (let i = 1; i <= 3; i++) {
        const val = document.getElementById(`apiKeyInput${i}`).value.trim();
        if (val) keys.push(val);
    }

    if (keys.length > 0) {
        apiKeys = keys;
        currentKeyIndex = 0;
        localStorage.setItem('amaya_yt_keys', JSON.stringify(keys));
        localStorage.setItem('amaya_yt_key_index', 0);
        document.getElementById('apiKeySection').classList.add('hidden');
        document.getElementById('apiKeyToggleButton').innerText = "Mostrar clave API";
        document.getElementById('apiWarning').classList.add('hidden');
        showToast(`Guardadas ${keys.length} claves con éxito`);
    } else {
        showToast("Por favor, introduce al menos una clave", "error");
    }
}

function getMergedApiKeys() {
    // Return unique keys from both user input and internal pool
    const merged = [...apiKeys, ...DEFAULT_KEYS];
    return [...new Set(merged)].filter(k => k && k.trim() !== "");
}

function rotateApiKey() {
    const allKeys = getMergedApiKeys();
    if (allKeys.length <= 1) return false;
    currentKeyIndex = (currentKeyIndex + 1) % allKeys.length;
    localStorage.setItem('amaya_yt_key_index', currentKeyIndex);
    console.log(`🔄 Rotando a clave API #${currentKeyIndex + 1} (Total: ${allKeys.length})`);
    return true;
}

function getCurrentApiKey() {
    const allKeys = getMergedApiKeys();
    if (allKeys.length === 0) return '';
    return allKeys[currentKeyIndex % allKeys.length];
}

function toggleApiKeySection() {
    const section = document.getElementById('apiKeySection');
    const button = document.getElementById('apiKeyToggleButton');
    const isHidden = section.classList.toggle('hidden');
    button.innerText = isHidden ? "Mostrar clave API" : "Ocultar clave API";
}

function showApiInstructions() {
    document.getElementById('instructionsModal').classList.remove('hidden');
}

function hideApiInstructions() {
    document.getElementById('instructionsModal').classList.add('hidden');
}

function toggleClearButton() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('clearSearchBtn');
    if (input.value.length > 0) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    input.value = '';
    toggleClearButton();
    document.getElementById('resultsGrid').innerHTML = '';
    document.getElementById('resultsSection').classList.add('hidden');
}

// --- SEARCH ---
async function searchMusic(pageToken = '', retryCount = 0) {
    const input = document.getElementById('searchInput');
    const query = input.value.trim();
    if (!query) return;

    if (!currentUserUid) {
        showToast("Inicia sesión para buscar música", "warning");
        return;
    }

    // Robust keyboard closing: Multiple blurs and focus shift
    input.blur();
    setTimeout(() => input.blur(), 50);
    window.focus();

    const currentKey = getCurrentApiKey();
    // Allow search even if no key - go straight to fallback
    if (!currentKey) {
        console.warn("No API Key. Attempting Piped fallback directly.");
    }

    currentSearchQuery = query;
    currentSearchQuery = query;
    if (!pageToken) {
        currentSearchPage = 1;
        pageItemCounts = {}; // Reset counts for new search
    }

    switchTab('search');
    document.getElementById('loading').classList.remove('hidden');

    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&key=${currentKey}${pageToken ? `&pageToken=${pageToken}` : ''}`);
        const data = await response.json();

        if (data.error) {
            console.error("YouTube API Error:", data.error);
            // Check for quota error OR other common errors that warrant rotation
            const activeKeys = apiKeys.length > 0 ? apiKeys : DEFAULT_KEYS;
            const errorReason = data.error.errors ? data.error.errors[0].reason : '';

            if (rotateApiKey() && retryCount < activeKeys.length) {
                console.warn(`Attempting rotation due to: ${errorReason}. Retry ${retryCount + 1}/${activeKeys.length}`);
                return searchMusic(pageToken, retryCount + 1);
            }
            throw new Error(`YouTube API: ${data.error.message} (${errorReason})`);
        }

        nextSearchToken = data.nextPageToken || '';
        prevSearchToken = data.prevPageToken || '';

        const videos = data.items.map(item => ({
            id: item.id.videoId,
            title: decodeHtml(item.snippet.title),
            channel: decodeHtml(item.snippet.channelTitle),
            thumbnail: item.snippet.thumbnails.medium.url,
            duration: '0:00'
        }));

        // Fetch durations - Wrap in try/catch to ensure results show even if metadata fetch fails
        try {
            const ids = videos.map(v => v.id).join(',');
            const detailsResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${getCurrentApiKey()}`);
            const detailsData = await detailsResp.json();

            if (detailsData.items) {
                detailsData.items.forEach(item => {
                    const video = videos.find(v => v.id === item.id);
                    if (video) {
                        video.duration = parseISO8601Duration(item.contentDetails.duration);
                        video.durationSec = parseISO8601DurationInSeconds(item.contentDetails.duration);
                    }
                });
            }
        } catch (durationError) {
            console.warn("Failed to fetch durations, showing results without them.", durationError);
        }

        // Filter out videos shorter than 2 minutes
        const filteredVideos = videos.filter(v => v.durationSec >= 120);

        renderSearchResults(filteredVideos);
        updateSearchPagination();
    } catch (error) {
        console.warn("Google API failed. Trying Piped Fallback...", error);

        // Hide API error message if we are trying fallback
        document.getElementById('errorMessage').classList.add('hidden');

        try {
            const pipedResults = await searchPiped(query);
            const filteredPipedResults = pipedResults.filter(v => v.durationSec >= 120);
            renderSearchResults(filteredPipedResults);

            // Disable pagination buttons for Piped (shim)
            nextSearchToken = '';
            prevSearchToken = '';
            updateSearchPagination();

            showToast("Resultados de respaldo cargados", "info");
        } catch (pipedError) {
            console.error("Piped Fallback Silenced Error:", pipedError);
        }
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function renderSearchResults(videos) {
    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = '';

    if (videos.length === 0) {
        grid.innerHTML = '<div class="p-8 text-center text-gray-400">No se han encontrado resultados</div>';
    } else {
        // Store the count of items on this page
        pageItemCounts[currentSearchPage] = videos.length;

        // Calculate starting index based on previous pages
        let startIndex = 0;
        for (let i = 1; i < currentSearchPage; i++) {
            startIndex += (pageItemCounts[i] || 0);
        }

        videos.forEach((video, index) => {
            const inQueue = isSongInQueue(video.id);
            const inQueueClass = inQueue ? 'in-queue' : 'text-[#b3b3b3]';

            const row = document.createElement('div');
            row.className = `result-row flex items-center gap-4 p-3 cursor-pointer group ${isMediaPlaying && currentTrack && String(currentTrack.id) === String(video.id) ? 'is-playing' : ''}`;
            row.dataset.videoId = video.id;
            row.onclick = () => {
                currentlyPlayingPlaylistId = null;
                localStorage.removeItem('amaya_playing_pl_id');
                renderHomePlaylists();
                const isCurrentSong = currentTrack && String(currentTrack.id) === String(video.id);
                const playerState = player?.getPlayerState();
                const isActuallyPlaying = playerState === YT.PlayerState.PLAYING ||
                    (isCurrentlyUsingNative && !nativeAudio?.paused);

                if (isCurrentSong && isActuallyPlaying) {
                    // Pause current song - mark as user intentional
                    isUserPaused = true;
                    if (isCurrentlyUsingNative) {
                        nativeAudio?.pause();
                    } else if (player && typeof player.pauseVideo === 'function') {
                        player.pauseVideo();
                    }
                    isMediaPlaying = false;
                    updatePlayPauseIcons(false);
                } else if (isCurrentSong && player && typeof player.playVideo === 'function') {
                    // Same song, just resume
                    isUserPaused = false;
                    player.playVideo();
                    isMediaPlaying = true;
                    updatePlayPauseIcons(true);
                } else {
                    playSong(video, [video]);
                }
            };

            const isCurrentSong = isMediaPlaying && currentTrack && String(currentTrack.id) === String(video.id);
            row.innerHTML = `
                <div class="w-10 text-center text-sm text-[#b3b3b3] track-number group-hover:hidden">${startIndex + index + 1}</div>
                <div class="hidden group-hover:block w-10 text-center">
                    <svg class="w-4 h-4 text-white mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <img src="${video.thumbnail}" class="w-10 h-10 rounded object-cover">
                <div class="flex-1 min-w-0">
                    <div class="marquee-container">
                        <h3 class="text-white font-medium marquee-content">${video.title}${isCurrentSong ? ' <span class="playing-badge">SONANDO</span>' : ''}</h3>
                    </div>
                    <p class="text-[#b3b3b3] text-sm truncate">${video.channel}</p>
                </div>
                <div class="flex items-center gap-2 transition-opacity">
                    <button onclick="event.stopPropagation(); toggleQueue(${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                        class="queue-btn p-2 hover:text-white ${inQueueClass}" 
                        data-song-id="${video.id}"
                        title="Añadir/Quitar de la cola">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); showAddToPlaylistMenu(event, ${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                        class="p-2 hover:text-white text-[#b3b3b3]" title="Añadir a la lista">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </button>
                </div>
            `;
            grid.appendChild(row);
        });
    }

    document.getElementById('resultsSection').classList.remove('hidden');
    document.getElementById('searchPagination').classList.toggle('hidden', !nextSearchToken && !prevSearchToken);

    // Apply marquees to all result rows
    grid.querySelectorAll('.marquee-content').forEach(el => updateMarquee(el));
}

async function searchNextPage() {
    if (nextSearchToken) {
        currentSearchPage++;
        await searchMusic(nextSearchToken);
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function searchPrevPage() {
    if (prevSearchToken) {
        currentSearchPage--;
        await searchMusic(prevSearchToken);
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function updateSearchPagination() {
    document.getElementById('nextPageBtn').disabled = !nextSearchToken;
    document.getElementById('prevPageBtn').disabled = !prevSearchToken;
    const info = document.getElementById('searchPageInfo');
    if (info) info.innerText = `Página ${currentSearchPage}`;
}

// --- PLAYBACK ---
async function playSong(song, list = [], fromQueue = false, singlePlay = false) {
    try {
        if (!currentUserUid) {
            showToast("Inicia sesión para reproducir canciones", "warning");
            return;
        }

        isUserPaused = false; // Reset intent state: starting a song implies active user intent
        currentTrack = song;

        // If singlePlay is true, we play ONLY this song without touching the main queue flow
        if (singlePlay) {
            // No need to change the global queue or currentQueueIndex
            // The logic below will handle the playback of 'song'
        } else if (!fromQueue) {
            // Standard behavior: load the provided list into the queue
            queue = [...list];
            currentQueueIndex = list.findIndex(s => String(s.id) === String(song.id));
            if (currentQueueIndex === -1) currentQueueIndex = 0;
        }

        currentTrack = song;
        isMediaPlaying = true;
        isUserPaused = false;

        // Finalize previous listen session before starting new song
        if (currentListenSession) {
            const lastPlayerTime = isCurrentlyUsingNative ? (nativeAudio?.currentTime || 0) : (player?.getCurrentTime() || 0);
            console.log('📊 playSong - Finalizing previous session:', lastPlayerTime, 's');
            finalizeListenSession(lastPlayerTime);
        } else {
            console.log('📊 playSong - No previous session to finalize');
        }

        // Highlight in UI
        highlightCurrentTrack(song.id);
        updateQueueIcons();
        updateQueueCount();
        refreshUIHighlights();

        // CRITICAL MOBILE FIX: Initialize audio context IMMEDIATELY on user click
        try {
            startSilentAudio();

            // Ensure engine state is set BEFORE messing with players to avoid watchdog fighting
            isCurrentlyUsingNative = true;

            // Ensure ALL audio engines are stopped immediately to avoid overlaps
            if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
            if (nativeAudio) {
                nativeAudio.pause();
                nativeAudio.src = ""; // Clear src to stop buffering old track
            }

            // Reset progress UI while loading
            if (navigator.mediaSession) {
                try {
                    navigator.mediaSession.setPositionState(null);
                    navigator.mediaSession.playbackState = 'paused';
                } catch (e) { }
            }

            // Force reset visual progress bar to avoid "jumping" effect
            const progressBar = document.getElementById('progressBar');
            if (progressBar) progressBar.value = 0;
            const progressFill = document.getElementById('progressFill');
            if (progressFill) progressFill.style.width = '0%';
            const progressThumb = document.getElementById('progressThumb');
            if (progressThumb) progressThumb.style.left = '0%';

            const currentTimeEl = document.getElementById('currentTime');
            if (currentTimeEl) currentTimeEl.innerText = "0:00";
            const remainingTimeEl = document.getElementById('remainingTime');
            if (remainingTimeEl) remainingTimeEl.innerText = "-0:00";

            // Also reset mobile player
            const mobileProgressBar = document.getElementById('mobileProgressBar');
            if (mobileProgressBar) mobileProgressBar.value = 0;
            const mobileProgressFill = document.getElementById('mobileProgressFill');
            if (mobileProgressFill) mobileProgressFill.style.width = '0%';
            const mobileCurrentTime = document.getElementById('mobileCurrentTime');
            if (mobileCurrentTime) mobileCurrentTime.innerText = "0:00";
        } catch (e) { console.error("Early audio init failed", e); }
        document.getElementById('currentTitle').innerText = song.title;
        document.getElementById('currentChannel').innerText = song.channel;
        document.getElementById('currentThumbnail').src = song.thumbnail;
        document.getElementById('currentThumbnail').classList.remove('hidden');

        // Mobile updates
        const miniPlayer = document.getElementById('mobilePlayerMini');
        if (miniPlayer) miniPlayer.classList.remove('hidden');

        const fullTitle = document.getElementById('mobileFullTitle');
        if (fullTitle) fullTitle.innerText = song.title;

        const fullChannel = document.getElementById('mobileFullChannel');
        if (fullChannel) fullChannel.innerText = song.channel;

        // Artwork
        const mobileArt = document.getElementById('mobileFullArt');
        if (mobileArt) mobileArt.src = song.thumbnail;

        // Update Ambient Background 2.0
        updateAmbientBackground(song.thumbnail);

        // Dynamic Marquee update
        updateMarquees();
        // Media Session API - Metadata Update
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: song.channel,
                album: "Amaya's Music",
                artwork: [
                    { src: song.thumbnail, sizes: '96x96', type: 'image/jpeg' },
                    { src: song.thumbnail, sizes: '128x128', type: 'image/jpeg' },
                    { src: song.thumbnail, sizes: '192x192', type: 'image/jpeg' },
                    { src: song.thumbnail, sizes: '256x256', type: 'image/jpeg' },
                    { src: song.thumbnail, sizes: '384x384', type: 'image/jpeg' },
                    { src: song.thumbnail, sizes: '512x512', type: 'image/jpeg' },
                ]
            });
            navigator.mediaSession.playbackState = 'playing';
        }

        // Fetch SponsorBlock segments
        fetchSponsorSegments(song.id);

        // Primary Execution (PROXIED AUDIO + ADS SYNC)
        if (useNativeAudio && nativeAudio && !isVideoModeActive) {
            isCurrentlyUsingNative = true;
            try {
                showToast("🚀 Iniciando reproducción...", "info");

                // Start fetching URL and segments in parallel
                const audioPromise = getAudioUrl(song.id);
                // We DON'T await fetchSponsorSegments here to avoid blocking playback start
                fetchSponsorSegments(song.id);

                const audioUrl = await audioPromise;
                if (!audioUrl) throw new Error('No audio URL found');

                // If playback starts before SponsorBlock fetch finishes, the 'timeupdate' 
                // handler in setupNativeAudioHandlers will catch segments as they arrive.

                nativeAudio.src = audioUrl;

                // CRITICAL: Aggressive check BEFORE playing starts
                const skipped = checkSponsorSegments(0);
                if (skipped) {
                    console.log("🛡️ Prevención inicial: Anuncio bloqueado antes de sonar.");
                }

                await nativeAudio.play();
                isMediaPlaying = true;
                updatePlayPauseIcons(true);
                console.log('✅ Reproducción limpia iniciada');

                // Track listening history
                addToHistory(song);
            } catch (error) {
                console.error('❌ Error con audio nativo:', error);

                // Handle "NotAllowedError" (Autoplay blocked)
                if (error.name === 'NotAllowedError') {
                    showToast("⚠️ Toca 'Play' para iniciar", "warning");
                    return;
                }

                console.log('📡 Fallback final a YouTube Player...');
                showToast('Buscando servidor alternativo...', 'info');
                isCurrentlyUsingNative = false;
                loadYouTubeIFrame(song.id);
                // Track listening history even on fallback
                addToHistory(song);
            }
        } else {
            console.log('📡 Usando YouTube Player directamente');
            isCurrentlyUsingNative = false;
            loadYouTubeIFrame(song.id);
            // Track listening history
            addToHistory(song);
        }

        // DJ Mode sync (host only)
        if (djSessionId && isDjHost) {
            updateDJSessionState();
        }
    } catch (error) {
        console.error("Error playing song:", error);
        console.warn(`Error al reproducir: ${error.message}`);
        isMediaPlaying = false;
        updatePlayPauseIcons(false);
    }
}

// --- QUEUE MANAGEMENT ---
function isSongInQueue(songId) {
    if (!songId) return false;
    return queue.some(s => String(s.id) === String(songId));
}

function updateQueueIcons() {
    // 1. Update standard .queue-btn (Search & Playlists)
    document.querySelectorAll('.queue-btn').forEach(btn => {
        const songId = btn.getAttribute('data-song-id');
        if (isSongInQueue(songId)) {
            btn.classList.add('in-queue');
            btn.classList.remove('text-[#b3b3b3]');
        } else {
            btn.classList.remove('in-queue');
            btn.classList.add('text-[#b3b3b3]');
        }
    });

    document.querySelectorAll('.news-card-queue-btn').forEach(btn => {
        const songId = btn.getAttribute('data-song-id');
        btn.classList.toggle('in-queue-active', isSongInQueue(songId));
    });
}

function toggleQueue(song) {
    // DJ Mode logic
    if (djSessionId) {
        const index = queue.findIndex(s => String(s.id) === String(song.id));

        if (index !== -1) {
            // Song is in queue - remove it
            if (currentTrack && index === currentQueueIndex) {
                showToast("No puedes eliminar la canción que está sonando", "warning");
                return;
            }

            // Remove from local queue
            queue.splice(index, 1);
            if (index < currentQueueIndex) currentQueueIndex--;
            showToast(`- ${song.title}`);
        } else {
            // Song not in queue - add it
            queue.push(song);
            showToast(`+ ${song.title}`);
        }

        updateQueueCount();
        updateQueueIcons();
        const modal = document.getElementById('queueModal');
        if (modal && !modal.classList.contains('hidden')) showQueue();

        // Sync to Firestore (works for both host and guests)
        updateDJSessionState();
        return;
    }

    // Standard offline logic
    const index = queue.findIndex(s => String(s.id) === String(song.id));

    if (index !== -1) {
        // Already in queue, remove it
        if (currentTrack && index === currentQueueIndex) {
            showToast("No puedes eliminar la canción que está sonando", "warning");
            return;
        }

        const removedSong = queue.splice(index, 1)[0];

        // Adjust currentQueueIndex if needed
        if (currentTrack && index < currentQueueIndex) {
            currentQueueIndex--;
        }

        showToast(`- ${removedSong.title}`);
    } else {
        // Not in queue, add it
        queue.push(song);
        showToast(`+ ${song.title}`);
    }

    // Update visual count
    updateQueueCount();

    // Update icons colors
    updateQueueIcons();

    // Refresh queue modal if visible
    const modal = document.getElementById('queueModal');
    if (modal && !modal.classList.contains('hidden')) {
        showQueue();
    }
}

function updateQueueCount() {
    const queueCountEl = document.getElementById('queueCount');
    const queueCountMiniEl = document.getElementById('queueCountMini');
    const total = queue.length;

    if (queueCountEl) {
        queueCountEl.innerText = total;
        if (total > 0) {
            queueCountEl.classList.remove('hidden');
        } else {
            queueCountEl.classList.add('hidden');
        }
    }

    if (queueCountMiniEl) {
        queueCountMiniEl.innerText = total;
        if (total > 0) {
            queueCountMiniEl.classList.remove('hidden');
        } else {
            queueCountMiniEl.classList.add('hidden');
        }
    }
}

// Function to load YouTube IFrame as fallback
function loadYouTubeIFrame(videoId) {
    if (!videoId) return;

    // Stop and clear native audio to prevent conflicting error messages and double audio
    if (nativeAudio) {
        nativeAudio.pause();
        nativeAudio.removeAttribute('src');
        nativeAudio.load();
    }

    console.log(`📺 Cargando YouTube IFrame para: ${videoId}`);
    isCurrentlyUsingNative = false;
    updateAdFreeStatus(false);

    if (isVideoReady && player && typeof player.loadVideoById === 'function') {
        player.loadVideoById(videoId);
        player.playVideo();
    } else {
        console.log("YouTube Player no listo, reintentando...");
        // Re-init if player missing
        if (!player && typeof onYouTubeIframeAPIReady === 'function') {
            onYouTubeIframeAPIReady();
        }
        setTimeout(() => loadYouTubeIFrame(videoId), 1000);
    }
}

async function resumePlaybackBruteForce() {
    if (!player) return;

    // Always start silent audio first to regain audio context focus
    startSilentAudio();

    // Attempt multiple ways to kickstart the YouTube player
    player.playVideo();

    // If it's potentially stuck (common in background), try a tiny seek to wake it up
    setTimeout(() => {
        if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
            const cur = player.getCurrentTime();
            player.seekTo(cur + 0.1);
            player.playVideo();
        }
    }, 100);
}

function togglePlayPause() {
    console.log("⏯️ togglePlayPause. Engine:", isCurrentlyUsingNative ? "Native" : "YouTube");

    if (isCurrentlyUsingNative && nativeAudio) {
        console.log("  Native Audio - paused:", nativeAudio.paused, "src:", nativeAudio.src ? "set" : "empty");
        if (nativeAudio.paused) {
            console.log("  Attempting nativeAudio.play()...");
            nativeAudio.play().then(() => {
                console.log("  ✅ nativeAudio.play() success");
                isUserPaused = false;
            }).catch(e => {
                console.error("  nativeAudio.play() error:", e);
                console.warn("Error al reproducir. Reintentando...");
            });
        } else {
            console.log("  Attempting nativeAudio.pause()...");
            isUserPaused = true;
            nativeAudio.pause();
        }
    } else if (player && typeof player.getPlayerState === 'function') {
        const state = player.getPlayerState();
        console.log("  YT Player - state:", state);
        if (state === 1) { // YT.PlayerState.PLAYING
            isUserPaused = true;
            player.pauseVideo();
        } else {
            isUserPaused = false;
            player.playVideo();
        }
    } else {
        console.warn("  ⚠️ No active player to toggle. isCurrentlyUsingNative:", isCurrentlyUsingNative, "nativeAudio:", !!nativeAudio, "player:", !!player);
    }
}

function playNext() {
    if (repeatMode === 2) {
        if (isCurrentlyUsingNative && nativeAudio) {
            nativeAudio.currentTime = 0;
            nativeAudio.play();
        } else if (player && player.seekTo) {
            player.seekTo(0);
            player.playVideo();
        }
        return;
    }

    if (isShuffle) {
        currentQueueIndex = Math.floor(Math.random() * queue.length);
    } else {
        currentQueueIndex++;
        if (currentQueueIndex >= queue.length) {
            if (repeatMode === 1) {
                currentQueueIndex = 0;
            } else {
                currentQueueIndex = queue.length - 1;
                // If we reached the end and won't repeat, reset the session state
                if (navigator.mediaSession) navigator.mediaSession.playbackState = 'none';
                return;
            }
        }
    }
    playSong(queue[currentQueueIndex], queue, true);
}

function playPrevious() {
    currentQueueIndex--;
    if (currentQueueIndex < 0) {
        if (repeatMode === 1) {
            currentQueueIndex = queue.length - 1;
        } else {
            currentQueueIndex = 0;
            return;
        }
    }
    playSong(queue[currentQueueIndex], queue, true);
}

function handleTrackEnded() {
    console.log('📊 handleTrackEnded called');
    // Finalize listen session with actual listened time
    if (currentListenSession) {
        const currentPlayerTime = isCurrentlyUsingNative ? (nativeAudio?.currentTime || 0) : (player?.getCurrentTime() || 0);
        console.log('📊 handleTrackEnded - currentTime:', currentPlayerTime);
        // Update listenedSeconds with the final player time before finalizing
        currentListenSession.listenedSeconds = Math.floor(currentPlayerTime);
        finalizeListenSession(currentListenSession.listenedSeconds);
    } else {
        console.warn('📊 handleTrackEnded - No currentListenSession');
    }
    playNext();
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    // Update all shuffle buttons (Desktop, Mobile Mini, Mobile Full)
    const btns = document.querySelectorAll('.shuffle-btn, #shuffleBtn');
    btns.forEach(btn => {
        if (isShuffle) {
            btn.classList.add('text-green-500');
            btn.classList.remove('text-white', 'text-gray-400', 'text-[#b3b3b3]');
            btn.style.setProperty('color', '', 'important');
        } else {
            btn.classList.remove('text-green-500');
            // If it's in the mini player, default to white, otherwise to gray
            if (btn.closest('.mobile-player-mini')) {
                btn.classList.add('text-white');
            } else {
                btn.classList.add('text-[#b3b3b3]');
            }
        }
    });
    showToast(isShuffle ? "Modo aleatorio activado" : "Modo aleatorio desactivado");
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    const btns = document.querySelectorAll('.repeat-btn, #repeatBtn');
    const labels = ["No repetir", "Repetir lista", "Repetir una"];

    btns.forEach(btn => {
        btn.classList.remove('text-green-500', 'text-white', 'text-gray-400', 'text-[#b3b3b3]');
        btn.style.setProperty('color', '', 'important');

        if (repeatMode > 0) {
            btn.classList.add('text-green-500');
        } else {
            if (btn.closest('.mobile-player-mini')) {
                btn.classList.add('text-white');
            } else {
                btn.classList.add('text-[#b3b3b3]');
            }
        }

        // "Repeat One" indicator
        if (repeatMode === 2) {
            btn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v6z"/><text x="10" y="16" font-size="8" font-weight="bold">1</text></svg>`;
        } else {
            btn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v6z"/></svg>`;
        }
    });

    showToast(labels[repeatMode]);
}

// --- PLAYLISTS ---
function showCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.remove('hidden');
    document.getElementById('newPlaylistName').focus();
}

function saveQueueAsPlaylist() {
    if (!queue || queue.length === 0) {
        showToast("La cola está vacía", "warning");
        return;
    }
    songsToAddToNewPlaylist = [...queue];
    showCreatePlaylistModal();
    // Update modal title temporarily
    const modalTitle = document.querySelector('#createPlaylistModal h3');
    if (modalTitle) modalTitle.innerText = "Guardar cola como lista";
}

function hideCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.add('hidden');
    document.getElementById('newPlaylistName').value = '';
    songsToAddToNewPlaylist = null; // Reset
    // Reset title
    const modalTitle = document.querySelector('#createPlaylistModal h3');
    if (modalTitle) modalTitle.innerText = "Crear lista";
}

function createPlaylist() {
    const nameInput = document.getElementById('newPlaylistName');
    const name = nameInput.value.trim();
    if (!name) return;

    const newPlaylist = {
        id: 'pl_' + Date.now(),
        name: name,
        description: songsToAddToNewPlaylist ? 'Lista creada desde la cola de reproducción' : '',
        cover: APP_LOGO_URL,
        songs: songsToAddToNewPlaylist || []
    };

    playlists.push(newPlaylist);
    savePlaylists();
    renderPlaylists();
    hideCreatePlaylistModal();

    if (songsToAddToNewPlaylist) {
        showToast(`Lista "${name}" creada con ${songsToAddToNewPlaylist.length} canciones`);
    } else {
        showToast(`Lista "${name}" creada`);
    }

    songsToAddToNewPlaylist = null;
}

async function savePlaylists() {
    localStorage.setItem('amaya_playlists', JSON.stringify(playlists));
    if (!currentUserUid) {
        console.log("ℹ️ Sesión no iniciada. Guardando solo localmente.");
        return;
    }
    try {
        await setDoc(doc(db, "users", currentUserUid), {
            playlists: playlists,
            lastUpdate: new Date().toISOString()
        });
        console.log("☁️ Playlists sincronizadas con la nube para el usuario:", currentUserUid);
    } catch (e) {
        console.error("Error al sincronizar con la nube:", e);
        if (e.message && e.message.includes('large')) {
            showToast("Error: Los datos son demasiado grandes para la nube", "error");
        } else {
            showToast("Error de sincronización", "error");
        }
    }
}

async function shareCurrentPlaylist() {
    if (!activePlaylistId) return;
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (!pl) return;

    try {
        // Upload to a public 'shared_playlists' collection
        await setDoc(doc(db, "shared_playlists", pl.id), {
            ...pl,
            ownerName: auth.currentUser ? auth.currentUser.displayName : 'Usuario Amaya',
            sharedAt: new Date().toISOString()
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${pl.id}`;

        // WhatsApp Share Link
        const message = `¡Escucha mi lista "${pl.name}" en Amaya's Music! 🎵\n\n${shareUrl}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');

        await navigator.clipboard.writeText(shareUrl);
        showToast("¡Enlace abierto en WhatsApp y copiado al portapapeles! 🔗");
    } catch (e) {
        console.error("Error en compartir:", e);
        showToast("Error al compartir la lista", "error");
    }
}

async function checkSharedPlaylist() {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('share');
    if (!sharedId) return;

    try {
        const docRef = doc(db, "shared_playlists", sharedId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            sharedPlaylistData = docSnap.data();
            renderSharedPlaylist(sharedPlaylistData);
        } else {
            showToast("La lista compartida no existe", "error");
        }
    } catch (e) {
        console.error("Error fetching shared playlist:", e);
    }
}

function renderSharedPlaylist(pl) {
    activePlaylistId = pl.id;

    // UI elements
    document.getElementById('playlistTitle').innerText = pl.name;
    document.getElementById('playlistInfo').innerText = `Compartida por ${pl.ownerName || 'Amaya User'} • ${pl.songs.length} canciones`;

    // Handle cover
    const coverImg = document.getElementById('playlistCoverImage');
    const coverIcon = document.getElementById('playlistCoverIcon');
    if (pl.cover) {
        coverImg.src = pl.cover;
        coverImg.classList.remove('hidden');
        coverIcon.classList.add('hidden');
    } else {
        coverImg.classList.add('hidden');
        coverIcon.classList.remove('hidden');
    }

    // Toggle actions
    document.getElementById('playlistOwnerActions').classList.add('hidden');
    document.getElementById('playlistSharedActions').classList.remove('hidden');

    // Render songs
    const container = document.getElementById('playlistSongs');
    container.innerHTML = '';
    playlist = pl.songs; // Use shared songs for playback

    pl.songs.forEach((song, index) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer group';
        row.onclick = () => playSong(index);
        row.innerHTML = `
            <span class="w-8 text-center text-gray-500 group-hover:hidden">${index + 1}</span>
            <div class="hidden group-hover:flex w-8 justify-center">
                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <img src="${song.thumbnail}" class="w-10 h-10 rounded object-cover">
            <div class="flex-1 min-w-0">
                <p class="font-medium text-white truncate">${song.title}</p>
                <p class="text-sm text-gray-400 truncate">${song.channelTitle}</p>
            </div>
            <span class="text-sm text-gray-500">${song.duration || ''}</span>
        `;
        container.appendChild(row);
    });

    // Show view
    document.getElementById('homeSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('playlistView').classList.remove('hidden');
}

function importSharedPlaylist() {
    if (!sharedPlaylistData) return;

    // Check if already exists
    if (playlists.find(p => p.id === sharedPlaylistData.id)) {
        showToast("Esta lista ya está en tu biblioteca");
        return;
    }

    const newPl = {
        ...sharedPlaylistData,
        id: 'pl_' + Date.now(),
        cover: sharedPlaylistData.cover || APP_LOGO_URL
    };
    playlists.push(newPl);
    savePlaylists();
    renderPlaylists();

    // Return to owner view for this new copy
    openPlaylist(newPl.id);
    showToast(`¡Lista "${newPl.name}" añadida a tu biblioteca!`);
}

function renderPlaylists() {
    const sidebar = document.getElementById('playlistsSidebar');
    sidebar.innerHTML = '';

    if (playlists.length === 0) {
        sidebar.innerHTML = '<p class="text-xs text-center text-gray-500 py-4 px-2">Aún no tienes ninguna lista. ¡Crea la primera!</p>';
    }

    playlists.forEach(pl => {
        // Sidebar item
        const sideItem = document.createElement('div');
        sideItem.className = 'playlist-item flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a1a1a] cursor-pointer group transition-colors';
        sideItem.onclick = () => openPlaylist(pl.id);

        const coverImg = pl.cover || APP_LOGO_URL;
        sideItem.innerHTML = `
            <img src="${coverImg}" class="w-12 h-12 rounded object-cover shadow-md">
            <div class="flex-1 min-w-0">
                <p class="text-white text-sm font-semibold truncate">${pl.name}</p>
                <p class="text-[#b3b3b3] text-xs">${pl.songs.length} canciones</p>
            </div>
        `;
        sidebar.appendChild(sideItem);
    });

    // Initialize Sortable for sidebar playlists
    if (typeof Sortable !== 'undefined' && sidebar.children.length > 0) {
        if (window.sidebarSortable) {
            try { window.sidebarSortable.destroy(); } catch (e) { }
        }
        window.sidebarSortable = new Sortable(sidebar, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                if (evt.oldIndex === evt.newIndex) return;
                const [movedPl] = playlists.splice(evt.oldIndex, 1);
                playlists.splice(evt.newIndex, 0, movedPl);
                savePlaylists();
                renderHomePlaylists(); // Sync home view
                showToast("Orden de listas actualizado");
            }
        });
    }

    // Also update the main library rows
    renderHomePlaylists();
}

let activePlaylistId = null;

function openPlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;

    activePlaylistId = id;
    sharedPlaylistData = null; // Standard playlist, not shared view

    // Maintain tab state
    const tabPlaylists = document.getElementById('tab-playlists');
    const tabSearch = document.getElementById('tab-search');
    if (tabPlaylists) tabPlaylists.classList.add('active');
    if (tabSearch) tabSearch.classList.remove('active');

    // Switch views
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('homeSection').classList.add('hidden');
    document.getElementById('playlistView').classList.remove('hidden');

    // Hide search input section when viewing a playlist
    const searchInputSection = document.getElementById('searchInputSection');
    if (searchInputSection) searchInputSection.classList.add('hidden');

    // Toggle actions (show owner actions)
    document.getElementById('playlistOwnerActions').classList.remove('hidden');
    document.getElementById('playlistSharedActions').classList.add('hidden');

    const totalSeconds = getPlaylistTotalDuration(pl);
    const durationStr = formatDuration(totalSeconds, true);

    document.getElementById('playlistTitle').innerText = pl.name;
    document.getElementById('playlistInfo').innerText = `${pl.songs.length} canciones • Total: ${durationStr}`;

    const coverImg = document.getElementById('playlistCoverImage');
    const coverIcon = document.getElementById('playlistCoverIcon');
    const displayCover = pl.cover || APP_LOGO_URL;
    if (displayCover) {
        coverImg.src = displayCover;
        coverImg.classList.remove('hidden');
        coverIcon.classList.add('hidden');
    } else {
        coverImg.classList.add('hidden');
        coverIcon.classList.remove('hidden');
    }

    const songsList = document.getElementById('playlistSongs');
    songsList.innerHTML = '';

    if (pl.songs.length === 0) {
        songsList.innerHTML = '<div class="p-8 text-center text-gray-500">Esta lista está vacía</div>';
    } else {
        pl.songs.forEach((song, index) => {
            const inQueue = isSongInQueue(song.id);
            const inQueueClass = inQueue ? 'in-queue' : 'text-[#b3b3b3]';

            const isCurrent = isMediaPlaying && currentTrack && String(currentTrack.id) === String(song.id);
            const row = document.createElement('div');
            row.className = `result-row flex items-center gap-4 p-3 cursor-pointer group hover:bg-white/5 ${isCurrent ? 'is-playing' : ''}`;
            row.dataset.videoId = song.id;
            row.onclick = () => {
                currentlyPlayingPlaylistId = id;
                localStorage.setItem('amaya_playing_pl_id', id);
                renderHomePlaylists();
                playSong(song, pl.songs);
            };

            row.innerHTML = `
                <div class="w-10 text-center text-sm text-[#b3b3b3] group-hover:hidden">${index + 1}</div>
                <div class="hidden group-hover:flex w-8 justify-center">
                    <svg class="w-4 h-4 text-white mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <img src="${song.thumbnail}" class="w-10 h-10 rounded object-cover drag-handle-thumbnail pointer-events-auto">
                <div class="flex-1 min-w-0">
                    <div class="marquee-container">
                        <h3 class="text-white font-medium marquee-content song-title">${song.title}${isCurrent ? ' <span class="playing-badge">SONANDO</span>' : ''}</h3>
                    </div>
                    <p class="text-[#b3b3b3] text-sm truncate">${song.channel}</p>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="event.stopPropagation(); toggleQueue(${JSON.stringify(song).replace(/"/g, '&quot;')})" 
                        class="queue-btn p-1.5 hover:text-white ${inQueueClass}" 
                        data-song-id="${song.id}"
                        title="Añadir/Quitar de la cola">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); removeSongFromPlaylist('${pl.id}', '${song.id}')" 
                        class="text-gray-500 hover:text-red-500 p-1.5 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity" 
                        title="Eliminar de la lista">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            `;
            songsList.appendChild(row);
        });

        // Initialize Sortable for the playlist songs
        if (typeof Sortable !== 'undefined') {
            if (window.playlistSortable) {
                try { window.playlistSortable.destroy(); } catch (e) { }
            }
            window.playlistSortable = new Sortable(songsList, {
                handle: '.drag-handle-thumbnail',
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                forceFallback: true,
                fallbackTolerance: 3,
                onEnd: function (evt) {
                    if (evt.oldIndex === evt.newIndex) return;

                    const pl = playlists.find(p => p.id === activePlaylistId);
                    if (!pl) return;

                    // Reorder the array
                    const [movedSong] = pl.songs.splice(evt.oldIndex, 1);
                    pl.songs.splice(evt.newIndex, 0, movedSong);

                    savePlaylists();

                    // Refresh after a tiny delay so Sortable finishes its work
                    setTimeout(() => {
                        openPlaylist(activePlaylistId);
                        showToast("Orden guardado");
                    }, 50);
                }
            });
        }
    }
    // Apply marquees to playlist songs
    songsList.querySelectorAll('.marquee-content').forEach(el => updateMarquee(el));
}

function showAddToPlaylistMenu(event, song) {
    event.stopPropagation();
    const menu = document.getElementById('addToPlaylistMenu');
    const items = document.getElementById('playlistMenuItems');
    items.innerHTML = '';

    if (playlists.length === 0) {
        items.innerHTML = '<p class="px-4 py-2 text-xs text-gray-500">No tienes ninguna lista</p>';
    } else {
        playlists.forEach(pl => {
            const btn = document.createElement('button');
            btn.className = 'w-full text-left px-4 py-2 hover:bg-[#3e3e3e] truncate text-sm';
            btn.innerText = pl.name;
            btn.onclick = () => {
                const targetSong = song || currentTrack;
                if (!pl.songs.some(s => s.id === targetSong.id)) {
                    pl.songs.push(targetSong);
                    savePlaylists();
                    renderPlaylists();
                    showToast(`Añadido a ${pl.name}`);
                } else {
                    showToast("Ya está en la lista", "error");
                }
                hideAddToPlaylistMenu();
            };
            items.appendChild(btn);
        });
    }

    menu.classList.remove('hidden');

    // Position menu near cursor
    const x = Math.min(event.clientX, window.innerWidth - 220);
    const y = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 100);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Close menu when clicking outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            hideAddToPlaylistMenu();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

function hideAddToPlaylistMenu() {
    document.getElementById('addToPlaylistMenu').classList.add('hidden');
}

function removeSongFromPlaylist(plId, songId) {
    const pl = playlists.find(p => p.id === plId);
    if (!pl) return;
    pl.songs = pl.songs.filter(s => s.id !== songId);
    savePlaylists();
    renderPlaylists();
    openPlaylist(plId);
    showToast("Canción eliminada de la lista");
}

function moveSongInPlaylist(plId, fromIndex, direction) {
    // Deprecated in favor of drag and drop, but keeping for compatibility if needed
    const pl = playlists.find(p => p.id === plId);
    if (!pl) return;

    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= pl.songs.length) return;

    const [movedSong] = pl.songs.splice(fromIndex, 1);
    pl.songs.splice(toIndex, 0, movedSong);

    savePlaylists();
    renderPlaylists();
    openPlaylist(plId);
    showToast("Posición actualizada");
}

function triggerPlaylistCoverUpload() {
    document.getElementById('playlistCoverInput').click();
}

function handlePlaylistCoverChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const pl = playlists.find(p => p.id === activePlaylistId);
        if (pl) {
            showToast("Procesando imagen...", "info");
            try {
                // Resize and compress to stay under Firestore and LocalStorage limits
                const compressed = await compressImage(e.target.result, 600, 600, 0.7);
                pl.cover = compressed;
                savePlaylists();
                renderPlaylists();
                openPlaylist(activePlaylistId);
                showToast("Portada actualizada");
            } catch (err) {
                console.error("Error processing image:", err);
                showToast("Error al procesar la imagen", "error");
            }
        }
    };
    reader.readAsDataURL(file);
}

function openEditPlaylistModal(id) {
    activePlaylistId = id;
    showEditPlaylistModal();
}

function showEditPlaylistModal() {
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (!pl) return;

    document.getElementById('editPlaylistName').value = pl.name;
    document.getElementById('editPlaylistDescription').value = pl.description || '';
    document.getElementById('editPlaylistModal').classList.remove('hidden');
}

function hideEditPlaylistModal() {
    document.getElementById('editPlaylistModal').classList.add('hidden');
}

function savePlaylistEdits() {
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (!pl) return;

    pl.name = document.getElementById('editPlaylistName').value.trim() || pl.name;
    pl.description = document.getElementById('editPlaylistDescription').value.trim();

    savePlaylists();
    renderPlaylists();
    openPlaylist(activePlaylistId);
    hideEditPlaylistModal();
    showToast("Lista actualizada");
}

function showDeletePlaylistConfirm() {
    document.getElementById('deletePlaylistModal').classList.remove('hidden');
}

function hideDeletePlaylistConfirm() {
    document.getElementById('deletePlaylistModal').classList.add('hidden');
}

function deleteCurrentPlaylist() {
    if (!activePlaylistId) return;
    playlists = playlists.filter(p => p.id !== activePlaylistId);
    savePlaylists();
    renderPlaylists();
    hideDeletePlaylistConfirm();
    showHome();
    showToast("Lista eliminada");
}

function playCurrentPlaylist() {
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (pl && pl.songs.length > 0) {
        currentlyPlayingPlaylistId = activePlaylistId;
        localStorage.setItem('amaya_playing_pl_id', currentlyPlayingPlaylistId);
        renderHomePlaylists();
        playSong(pl.songs[0], pl.songs);
    }
}

// --- QUEUE ---
function showQueue() {
    const modal = document.getElementById('queueModal');
    const content = document.getElementById('queueContent');
    content.innerHTML = '';

    if (queue.length === 0) {
        content.innerHTML = '<p class="text-center text-gray-500 py-8">La cola está vacía</p>';
    } else {
        queue.forEach((song, index) => {
            const isPlaying = index === currentQueueIndex;
            const row = document.createElement('div');
            row.className = `flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer group ${isPlaying ? 'bg-green-500/10' : ''}`;

            // Clicking the row plays the song
            row.onclick = () => {
                currentQueueIndex = index;
                playSong(song, queue, true);
                hideQueue();
            };

            row.innerHTML = `
                <span class="text-xs text-gray-500 w-4">${index + 1}</span>
                <img src="${song.thumbnail}" class="w-10 h-10 rounded object-cover drag-handle-thumbnail pointer-events-auto">
                <div class="flex-1 min-w-0">
                    <div class="marquee-container">
                        <p class="text-white text-sm font-medium marquee-content ${isPlaying ? 'text-green-500' : ''}">${song.title}</p>
                    </div>
                    <p class="text-gray-400 text-xs truncate">${song.channel}</p>
                </div>
                <button onclick="event.stopPropagation(); removeFromQueue(${index})" 
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Eliminar de la cola">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>
            `;
            content.appendChild(row);
        });

        // Initialize Sortable for the queue
        if (typeof Sortable !== 'undefined') {
            if (window.queueSortable) {
                try { window.queueSortable.destroy(); } catch (e) { }
            }
            window.queueSortable = new Sortable(content, {
                handle: '.drag-handle-thumbnail',
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                forceFallback: true,
                fallbackTolerance: 3,
                onEnd: function (evt) {
                    if (evt.oldIndex === evt.newIndex) return;

                    // Reorder the array
                    const [movedSong] = queue.splice(evt.oldIndex, 1);
                    queue.splice(evt.newIndex, 0, movedSong);

                    // Update currentQueueIndex to match the new position of the playing song
                    if (currentQueueIndex === evt.oldIndex) {
                        currentQueueIndex = evt.newIndex;
                    } else if (currentQueueIndex > evt.oldIndex && currentQueueIndex <= evt.newIndex) {
                        currentQueueIndex--;
                    } else if (currentQueueIndex < evt.oldIndex && currentQueueIndex >= evt.newIndex) {
                        currentQueueIndex++;
                    }

                    // Refresh after a tiny delay
                    setTimeout(() => {
                        showQueue();
                    }, 50);
                }
            });
        }
    }

    modal.classList.remove('hidden');
    // Apply marquees to queue items
    content.querySelectorAll('.marquee-content').forEach(el => updateMarquee(el));
}

function removeFromQueue(index) {
    if (index === currentQueueIndex) {
        showToast("No puedes eliminar la canción que está sonando", "warning");
        return;
    }

    const removedSong = queue.splice(index, 1)[0];

    // Adjust currentQueueIndex if needed
    if (index < currentQueueIndex) {
        currentQueueIndex--;
    }

    showToast(`- ${removedSong.title}`);
    updateQueueCount();
    updateQueueIcons();
    showQueue(); // Refresh the list

    // DJ Mode sync (both host and guests can remove)
    if (djSessionId) {
        updateDJSessionState();
    }
}

function hideQueue() {
    document.getElementById('queueModal').classList.add('hidden');
}

function clearQueue() {
    queue = [];
    currentQueueIndex = -1;
    updateQueueCount();
    updateQueueIcons();
    hideQueue();
    showToast("Cola vacía");

    // DJ Mode sync (both host and guests can clear)
    if (djSessionId) {
        updateDJSessionState();
    }
}


function highlightCurrentTrack(videoId) {
    if (!videoId) return;

    // 1. CLEANUP: Remove highlight class and badges from ALL elements
    document.querySelectorAll('.is-playing, .result-row, .playlist-item, [data-video-id]').forEach(row => {
        row.classList.remove('is-playing');

        // Remove badge while preserving title text
        const titleEl = row.querySelector('.song-title, .marquee-content, h3');
        if (titleEl) {
            const badge = titleEl.querySelector('.playing-badge');
            if (badge) {
                // If the badge exists, we remove only the badge element
                badge.remove();
                // If it was a text span within h3, sometimes it's easier to just strip the badge
            }
        }
    });

    // 2. APPLY: Add highlight to rows matching current videoId
    // We target both .result-row (search) and [data-video-id] (playlist views)
    document.querySelectorAll('.result-row, [data-video-id]').forEach(row => {
        if (String(row.dataset.videoId) === String(videoId)) {
            row.classList.add('is-playing');

            // Add badge if not present
            const titleEl = row.querySelector('.song-title, .marquee-content, h3');
            if (titleEl && !titleEl.querySelector('.playing-badge')) {
                const badge = document.createElement('span');
                badge.className = 'playing-badge';
                badge.innerText = 'SONANDO';
                titleEl.appendChild(badge);
            }
        }
    });
}

// --- UI UPDATES ---
function switchTab(tab) {
    const homeSection = document.getElementById('homeSection');
    const resultsSection = document.getElementById('resultsSection');
    const playlistView = document.getElementById('playlistView');
    const newsSection = document.getElementById('newsSection');
    const djSection = document.getElementById('djSection');
    const tabPlaylists = document.getElementById('tab-playlists');
    const tabSearch = document.getElementById('tab-search');
    const tabNews = document.getElementById('tab-news');
    const tabDj = document.getElementById('tab-dj');

    // RESTRICCIÓN: Login obligatorio para Buscar y Novedades
    if ((tab === 'search' || tab === 'news') && !currentUserUid) {
        showToast("Inicia sesión con Google para acceder", "warning");
        return;
    }

    // Update tab buttons
    if (tabPlaylists) tabPlaylists.classList.toggle('active', tab === 'playlists');
    if (tabSearch) tabSearch.classList.toggle('active', tab === 'search');
    if (tabNews) tabNews.classList.toggle('active', tab === 'news');
    if (tabDj) tabDj.classList.toggle('active', tab === 'dj');

    const searchInputSection = document.getElementById('searchInputSection');
    const mainElement = document.querySelector('main');

    if (tab === 'playlists') {
        homeSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        playlistView.classList.add('hidden');
        if (newsSection) newsSection.classList.add('hidden');
        if (searchInputSection) searchInputSection.classList.add('hidden');
        if (djSection) djSection.classList.add('hidden');
        if (mainElement) mainElement.style.overflowY = 'auto';
        renderHomePlaylists();
        activePlaylistId = null;
    } else if (tab === 'search') {
        homeSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        playlistView.classList.add('hidden');
        if (newsSection) newsSection.classList.add('hidden');
        if (searchInputSection) searchInputSection.classList.remove('hidden');
        if (djSection) djSection.classList.add('hidden');
        if (mainElement) mainElement.style.overflowY = 'auto';
    } else if (tab === 'news') {
        homeSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        playlistView.classList.add('hidden');
        if (newsSection) newsSection.classList.remove('hidden');
        if (searchInputSection) searchInputSection.classList.add('hidden');
        if (djSection) djSection.classList.add('hidden');
        if (mainElement) mainElement.style.overflowY = 'auto';

        // Auto-load news if section is now visible and not loaded
        if (!isNewsLoaded) {
            loadNewReleases();
        }
    } else if (tab === 'dj') {
        homeSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        playlistView.classList.add('hidden');
        if (newsSection) newsSection.classList.add('hidden');
        if (searchInputSection) searchInputSection.classList.add('hidden');
        if (djSection) djSection.classList.remove('hidden');
        if (mainElement) {
            mainElement.style.overflowY = 'hidden';
            mainElement.scrollTop = 0;
        }

        // Si hay una sesión activa, asegurar que vemos la vista activa
        if (djSessionId) {
            syncDJToTab();
        } else {
            // Si no hay sesión y no estamos explícitamente en "Mis Salas", volver al inicio
            const mySessionsVisible = !document.getElementById('djMySessionsViewTab').classList.contains('hidden');
            if (!mySessionsVisible) {
                if (document.getElementById('djInitialViewTab')) document.getElementById('djInitialViewTab').classList.remove('hidden');
                if (document.getElementById('djActiveViewTab')) document.getElementById('djActiveViewTab').classList.add('hidden');
            }
        }
    }
}

function showHome() {
    switchTab('playlists');
}

function renderHomePlaylists() {
    const list = document.getElementById('homePlaylistsList');
    if (!list) return;

    list.innerHTML = '';

    if (playlists.length === 0) {
        list.innerHTML = `
            <div class="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p class="text-gray-400 mb-4">Aún no tienes ninguna lista</p>
                <button onclick="showCreatePlaylistModal()" class="text-green-500 font-bold hover:underline">Empieza a crear una aquí</button>
            </div>
        `;
        return;
    }

    playlists.forEach(pl => {
        const totalSeconds = getPlaylistTotalDuration(pl);
        const durationStr = formatDuration(totalSeconds, true);
        const coverImg = pl.cover || APP_LOGO_URL;

        const isPlaying = isMediaPlaying && currentlyPlayingPlaylistId && String(currentlyPlayingPlaylistId) === String(pl.id);
        const row = document.createElement('div');
        row.className = `group flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer border ${isPlaying ? 'bg-white/10 border-green-500/50 shadow-[0_0_15px_rgba(30,215,96,0.1)]' : 'hover:bg-white/5 border-transparent hover:border-white/10'}`;
        row.onclick = () => openPlaylist(pl.id);

        row.innerHTML = `
            <div class="flex items-center gap-4 flex-1 min-w-0">
                <div class="relative playlist-cover-img">
                    <img src="${coverImg}" class="w-16 h-16 rounded-lg object-cover shadow-lg pointer-events-none">
                    ${isPlaying ? `
                    <div class="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <div class="flex gap-1 items-end h-4">
                            <div class="playing-bar"></div>
                            <div class="playing-bar"></div>
                            <div class="playing-bar"></div>
                        </div>
                    </div>` : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="${isPlaying ? 'text-green-500' : 'text-white'} font-bold text-lg truncate">${pl.name}${isPlaying ? ' <span class="playing-badge">SONANDO</span>' : ''}</h3>
                    <div class="flex items-center gap-2 text-gray-400 text-sm truncate">
                        <span>${pl.songs.length} canciones</span>
                        <span class="opacity-30">•</span>
                        <span>Total: ${durationStr}</span>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(row);
    });

    // Initialize Sortable for home playlists (dragging by cover)
    if (typeof Sortable !== 'undefined' && list.children.length > 0) {
        if (window.homeSortable) {
            try { window.homeSortable.destroy(); } catch (e) { }
        }
        window.homeSortable = new Sortable(list, {
            handle: '.playlist-cover-img', // Reorder by dragging image
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                if (evt.oldIndex === evt.newIndex) return;
                const [movedPl] = playlists.splice(evt.oldIndex, 1);
                playlists.splice(evt.newIndex, 0, movedPl);
                savePlaylists();
                renderPlaylists(); // Sync sidebar view
                showToast("Orden de listas actualizado");
            }
        });
    }
}

// Extract top genres and artists from history for personalization
async function getTopUserInterests() {
    if (!currentUserUid) return { genres: [], artists: [] };

    try {
        const historyRef = collection(db, "users", currentUserUid, "history");
        // Get last 100 songs to keep it relevant and fast
        const q = query(historyRef, orderBy("timestamp", "desc"), limit(100));
        const querySnapshot = await getDocs(q);

        const history = [];
        querySnapshot.forEach((doc) => history.push(doc.data()));

        if (history.length === 0) return { genres: [], artists: [] };

        const stats = calculateStatistics(history);

        return {
            genres: stats.topGenres.slice(0, 5).map(g => g.name),
            artists: stats.topArtists.slice(0, 5).map(a => a.name)
        };
    } catch (error) {
        console.error("Error fetching user interests:", error);
        return { genres: [], artists: [] };
    }
}

async function loadNewReleases(force = false) {
    if (!currentUserUid) {
        showToast("Inicia sesión para ver novedades", "warning");
        return;
    }
    if (isNewsLoaded && !force) return;

    const grid = document.getElementById('newsGrid');
    if (!grid) return;

    if (!force) {
        grid.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center animate-pulse">
                <div class="w-12 h-12 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin mb-4"></div>
                <p class="text-gray-400 font-medium text-lg">Cargando las tendencias actuales...</p>
            </div>
        `;
    }

    try {
        const apiKey = getCurrentApiKey();
        let totalVideos = [];
        const seenIds = new Set();

        // 1. Fetch Personalized Suggestions (Top Artists and Genres)
        const interests = await getTopUserInterests();
        const queries = [
            ...interests.genres.map(g => `${g} music new releases`),
            ...interests.artists.map(a => `${a} official music video`)
        ].slice(0, 10); // Expanded to 10 queries for more variety

        if (queries.length > 0) {
            console.log("✨ Buscando sugerencias personalizadas para:", queries);
            for (const q of queries) {
                try {
                    const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&key=${apiKey}`);
                    const searchData = await searchResp.json();
                    if (searchData.items) {
                        searchData.items.forEach(item => {
                            if (!seenIds.has(item.id.videoId)) {
                                seenIds.add(item.id.videoId);
                                totalVideos.push({
                                    id: item.id.videoId,
                                    title: decodeHtml(item.snippet.title),
                                    channel: decodeHtml(item.snippet.channelTitle),
                                    thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.medium.url,
                                    isSuggested: true // Special flag for UI
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.warn(`Error fetching suggestions for ${q}:`, e);
                }
            }
        }

        // 2. Fetch Trending News (Standard)
        const pageTokenParam = newsNextPageToken ? `&pageToken=${newsNextPageToken}` : '';
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&chart=mostPopular&maxResults=50&videoCategoryId=10&regionCode=ES${pageTokenParam}&key=${apiKey}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        data.items.forEach(item => {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                totalVideos.push({
                    id: item.id,
                    title: decodeHtml(item.snippet.title),
                    channel: decodeHtml(item.snippet.channelTitle),
                    thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
                    duration: parseISO8601Duration(item.contentDetails.duration),
                    durationSec: parseISO8601DurationInSeconds(item.contentDetails.duration),
                    isSuggested: false
                });
            }
        });

        newsNextPageToken = data.nextPageToken || '';

        // 3. Metadata cleanup and Shuffle
        // Fetch durations for search results (suggestions) that don't have them
        const missingDurationIds = totalVideos.filter(v => !v.duration).map(v => v.id);
        if (missingDurationIds.length > 0) {
            const detailsResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${missingDurationIds.join(',')}&key=${apiKey}`);
            const detailsData = await detailsResp.json();
            if (detailsData.items) {
                detailsData.items.forEach(item => {
                    const video = totalVideos.find(v => v.id === item.id);
                    if (video) {
                        video.duration = parseISO8601Duration(item.contentDetails.duration);
                        video.durationSec = parseISO8601DurationInSeconds(item.contentDetails.duration);
                    }
                });
            }
        }

        // Filter and Shuffle
        newsVideos = totalVideos.filter(v => (v.durationSec || 0) >= 120);
        // Shuffle to mix suggestions and trends, but keep a balance
        newsVideos.sort(() => Math.random() - 0.5);

        isNewsLoaded = true;
        renderNewsResults(newsVideos, false); // Initial render (replace)
        updateLoadMoreButton();
        setupNewsInfiniteScroll();
    } catch (error) {
        console.warn("Error loading News:", error);
        if (grid) {
            grid.innerHTML = `
                <div class="col-span-full py-12 text-center bg-red-500/10 rounded-2xl border border-red-500/20">
                    <p class="text-red-400 mb-4">No se han podido cargar las novedades</p>
                    <button onclick="loadNewReleases(true)" class="bg-white text-black px-6 py-2 rounded-full font-bold">Reintentar</button>
                </div>
            `;
        }
    }
}

async function fetchNewsDurations(videos) {
    const ids = videos.filter(v => v.duration === '...').map(v => v.id).join(',');
    if (!ids) return;

    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${getCurrentApiKey()}`);
        const data = await response.json();

        data.items.forEach(item => {
            const video = videos.find(v => v.id === item.id);
            if (video) {
                const durationRaw = item.contentDetails.duration;
                video.duration = parseISO8601Duration(durationRaw);
                video.durationSec = parseISO8601DurationInSeconds(durationRaw);
            }
        });

        // REQUISITO: Filtrar canciones de menos de 2 minutos (120s)
        newsVideos = newsVideos.filter(v => {
            // If duration unknown yet, keep it (will be filtered in next batch or once data arrives)
            if (v.duration === '...') return true;
            return v.durationSec >= 120;
        });

        renderNewsResults(newsVideos);
    } catch (e) { console.warn("Failed to fetch news durations:", e); }
}

async function loadMoreNews() {
    if (isLoadingMoreNews || !newsNextPageToken) return;
    isLoadingMoreNews = true;

    // Show loading indicator
    const container = document.getElementById('newsLoadMoreContainer');
    if (container) {
        container.innerHTML = `
            <div class="flex items-center gap-2 text-gray-400">
                <div class="w-6 h-6 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>
                <span>Cargando más canciones...</span>
            </div>
        `;
        container.classList.remove('hidden');
    }

    try {
        const apiKey = getCurrentApiKey();
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&chart=mostPopular&maxResults=50&videoCategoryId=10&regionCode=ES&pageToken=${newsNextPageToken}&key=${apiKey}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        const newBatch = data.items.map(item => ({
            id: item.id,
            title: decodeHtml(item.snippet.title),
            channel: decodeHtml(item.snippet.channelTitle),
            thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
            duration: parseISO8601Duration(item.contentDetails.duration),
            durationSec: parseISO8601DurationInSeconds(item.contentDetails.duration)
        })).filter(v => v.durationSec >= 120);

        newsVideos = [...newsVideos, ...newBatch];
        newsNextPageToken = data.nextPageToken || '';

        // If batch was empty due to filtering, try next page immediately
        if (newBatch.length === 0 && newsNextPageToken) {
            isLoadingMoreNews = false; // Reset lock to allow recursion
            await loadMoreNews();
            return;
        }

        renderNewsResults(newBatch, true);

        // Re-setup infinite scroll observer after content is added
        setupNewsInfiniteScroll();
    } catch (error) {
        console.error("Error loading more news:", error);
        showToast("Error al cargar más novedades", "warning");
        if (container) {
            container.innerHTML = `
                <button onclick="loadMoreNews()" class="bg-white text-black px-6 py-2 rounded-full font-bold">
                    Reintentar
                </button>
            `;
        }
    } finally {
        isLoadingMoreNews = false;
        updateLoadMoreButton();
    }
}

function setupNewsInfiniteScroll() {
    // Remove old container if exists and create new one at bottom of grid
    const grid = document.getElementById('newsGrid');
    const oldContainer = document.getElementById('newsLoadMoreContainer');
    if (oldContainer) oldContainer.remove();

    if (!grid) return;

    // Create new observer container at the bottom
    const observerContainer = document.createElement('div');
    observerContainer.id = 'newsLoadMoreContainer';
    observerContainer.className = 'col-span-full py-8 text-center';
    observerContainer.innerHTML = newsNextPageToken
        ? `<div class="flex items-center justify-center gap-2 text-gray-400"><div class="w-5 h-5 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div><span>Scroll para cargar más...</span></div>`
        : `<span class="text-gray-500">No hay más contenido</span>`;

    grid.appendChild(observerContainer);

    // Disconnect previous observer
    if (window.newsObserver) window.newsObserver.disconnect();

    window.newsObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && newsNextPageToken && !isLoadingMoreNews) {
            loadMoreNews();
        }
    }, {
        rootMargin: '600px', // Trigger loading well before reaching the bottom
        threshold: 0
    });

    window.newsObserver.observe(observerContainer);
}

function updateLoadMoreButton() {
    // Button is now handled by setupNewsInfiniteScroll
}

// --- LYRICS SYSTEM ---
let currentLyricsArr = [];
let lyricsSyncMode = false;
let isLyricsOpen = false;
let lastLyricsVideoId = null;

function toggleVideoMode() {
    if (!currentTrack) return;

    isVideoModeActive = !isVideoModeActive;
    document.body.classList.toggle('video-mode-active', isVideoModeActive);

    // Toggle button active state
    const btn = document.getElementById('toggleVideoBtn');
    if (btn) btn.classList.toggle('active', isVideoModeActive);

    if (isVideoModeActive) {
        // Switch to YouTube if using native audio
        if (isCurrentlyUsingNative) {
            console.log("📺 Switching to YouTube engine for Video Mode...");
            const currentTime = nativeAudio ? nativeAudio.currentTime : 0;

            isCurrentlyUsingNative = false;
            if (nativeAudio) nativeAudio.pause();

            if (player && typeof player.loadVideoById === 'function') {
                player.loadVideoById(currentTrack.id, currentTime);
                player.playVideo();
            }
        }
        showToast("Modo Videoclip activado", "info");
    } else {
        showToast("Modo Videoclip desactivado", "info");
    }
}

async function toggleLyrics() {
    const overlay = document.getElementById('lyricsOverlay');
    const container = document.getElementById('lyricsContainer');
    isLyricsOpen = !isLyricsOpen;

    overlay.classList.toggle('hidden', !isLyricsOpen);
    setTimeout(() => overlay.classList.toggle('visible', isLyricsOpen), 50);

    if (isLyricsOpen) {
        // Update header info
        document.getElementById('lyricsArt').src = currentTrack.thumbnail;
        document.getElementById('lyricsTitle').innerText = currentTrack.title;
        document.getElementById('lyricsArtist').innerText = currentTrack.artist || currentTrack.channel;

        // Setup scroll listener for gradient visibility
        container.addEventListener('scroll', handleLyricsScroll);
        handleLyricsScroll(); // Initial check

        if (lastLyricsVideoId !== currentTrack.id) {
            await fetchLyricsForCurrent();
        }
    } else {
        container.removeEventListener('scroll', handleLyricsScroll);
    }
}

function handleLyricsScroll() {
    const container = document.getElementById('lyricsContainer');
    if (!container) return;

    const isAtTop = container.scrollTop <= 10;
    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 10;

    container.classList.toggle('is-at-top', isAtTop);
    container.classList.toggle('is-at-bottom', isAtBottom);
}

async function fetchLyricsForCurrent() {
    if (!currentTrack) return;

    const content = document.getElementById('lyricsContent');
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center space-y-4 py-20">
            <div class="w-12 h-12 border-4 border-white/10 border-t-green-500 rounded-full animate-spin"></div>
            <p class="text-gray-400 font-bold tracking-widest uppercase text-xs">Buscando letra en múltiples fuentes...</p>
            <p class="text-gray-600 text-xs" id="lyricsSourceIndicator">LRCLib</p>
        </div>
    `;

    lastLyricsVideoId = currentTrack.id;

    // Advanced Title Cleaning to improve hit rate
    let cleanTitle = currentTrack.title
        .replace(/\(.*\)|\[.*\]/g, '') // Remove parenthesis content
        .replace(/ft\.|feat\.|featuring|prod\.|with/gi, '') // Remove collaboration markers
        .replace(/official video|audio|lyric video|lyrics|official/gi, '') // Remove meta words
        .replace(/[-_]/g, ' ') // Replace separators with spaces
        .trim();

    // Clean Artist
    let cleanArtist = (currentTrack.artist || currentTrack.channel || '')
        .replace(/ - Topic|VEVO|Official|Topic/gi, '')
        .replace(/,\s*.*$/, '') // Use only primary artist (remove stuff after comma)
        .trim();

    console.log(`🎤 Buscando letra para: "${cleanTitle}" de "${cleanArtist}"`);

    function updateSourceIndicator(source) {
        const indicator = document.getElementById('lyricsSourceIndicator');
        if (indicator) indicator.innerText = source;
    }

    try {
        // STRATEGY 1: LRCLIB (Specific Search)
        // Best for synced lyrics
        let foundData = null;
        try {
            updateSourceIndicator('LRCLib');
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
            const response = await fetch(url);
            if (response.ok) {
                foundData = await response.json();
            } else if (response.status === 404) {
                // STRATEGY 2: LRCLIB (Broad Search)
                const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanArtist + " " + cleanTitle)}`;
                const searchRes = await fetch(searchUrl);
                const searchData = await searchRes.json();
                if (searchData && searchData.length > 0) {
                    foundData = searchData[0];
                }
            }
        } catch (lrcError) {
            console.warn("LRCLib failed:", lrcError);
        }

        if (foundData) {
            console.log("✅ Letra encontrada en LRCLib");
            renderLyrics(foundData, 'LRCLib');
            return;
        }

        // STRATEGY 3: Musixmatch (via huggy歌词)
        console.log("⚠️ LRCLib no tuvo resultados. Intentando Musixmatch...");
        updateSourceIndicator('Musixmatch');
        try {
            const mxmUrl = `https://api.huggylyrics.com/sync?q=${encodeURIComponent(cleanArtist + " " + cleanTitle)}`;
            const mxmRes = await fetch(mxmUrl);
            if (mxmRes.ok) {
                const mxmData = await mxmRes.json();
                if (mxmData && (mxmData.lyrics || mxmData.exactLyrics || mxmData.subLyrics)) {
                    console.log("✅ Letra encontrada en Musixmatch");
                    renderLyrics({
                        plainLyrics: mxmData.lyrics || mxmData.exactLyrics || mxmData.subLyrics,
                        syncedLyrics: mxmData.lyrics || null
                    }, 'Musixmatch');
                    return;
                }
            }
        } catch (mxmError) {
            console.warn("Musixmatch failed:", mxmError);
        }

        // STRATEGY 4: Genius (Scraped lyrics)
        console.log("⚠️ Musixmatch no tuvo resultados. Intentando Genius...");
        updateSourceIndicator('Genius');
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center space-y-4 py-20">
                <div class="w-12 h-12 border-4 border-white/10 border-t-yellow-500 rounded-full animate-spin"></div>
                <p class="text-yellow-400 font-bold tracking-widest uppercase text-xs">Buscando en Genius...</p>
            </div>
        `;

        try {
            const geniusSearchUrl = `https://api.genius.com/search?q=${encodeURIComponent(cleanArtist + " " + cleanTitle)}&access_token=${atob('RzFBa1kxQWdNRU8yT0dWeU1HRnliRzFwZEdsaQ==')}`;
            const geniusSearchRes = await fetch(geniusSearchUrl);
            if (geniusSearchRes.ok) {
                const geniusData = await geniusSearchRes.json();
                const bestMatch = geniusData.response?.hits?.find(hit =>
                    hit.result?.artist_names?.toLowerCase().includes(cleanArtist.toLowerCase()) ||
                    hit.result?.title?.toLowerCase().includes(cleanTitle.toLowerCase())
                );

                if (bestMatch) {
                    const songUrl = bestMatch.result.url;
                    // Fetch and parse Genius page
                    const geniusPageRes = await fetch(songUrl);
                    if (geniusPageRes.ok) {
                        const html = await geniusPageRes.text();
                        // Extract lyrics from Genius page
                        const lyricsMatch = html.match(/<div[^>]*class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                        if (lyricsMatch) {
                            const plainLyrics = lyricsMatch[1]
                                .replace(/<[^>]*>/g, '\n')
                                .replace(/&amp;/g, '&')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/&#\d+;/g, '')
                                .replace(/\n\s*\n/g, '\n')
                                .trim();

                            if (plainLyrics.length > 50) {
                                console.log("✅ Letra encontrada en Genius");
                                renderLyrics({
                                    plainLyrics: plainLyrics,
                                    syncedLyrics: null
                                }, 'Genius');
                                return;
                            }
                        }
                    }
                }
            }
        } catch (geniusError) {
            console.warn("Genius failed:", geniusError);
        }

        // STRATEGY 5: Lyrics.ovh Fallback (Text only, no sync)
        console.log("⚠️ Genius no tuvo resultados. Intentando Lyrics.ovh...");
        updateSourceIndicator('Lyrics.ovh');
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center space-y-4 py-20">
                <div class="w-12 h-12 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
                <p class="text-blue-400 font-bold tracking-widest uppercase text-xs">Última fuente...</p>
            </div>
        `;

        const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`;
        const ovhRes = await fetch(ovhUrl);

        if (ovhRes.ok) {
            const ovhData = await ovhRes.json();
            if (ovhData.lyrics) {
                console.log("✅ Letra encontrada en Lyrics.ovh");
                renderLyrics({
                    plainLyrics: ovhData.lyrics,
                    syncedLyrics: null
                }, 'Lyrics.ovh');
                return;
            }
        }

        // STRATEGY 6: MegaLyrics (Spanish focus)
        console.log("⚠️ Lyrics.ovh no tuvo resultados. Intentando MegaLyrics...");
        updateSourceIndicator('MegaLyrics');
        try {
            const megaUrl = `https://www.megalyrics.com/search?q=${encodeURIComponent(cleanArtist + " " + cleanTitle)}`;
            const megaRes = await fetch(megaUrl);
            if (megaRes.ok) {
                const html = await megaRes.text();
                // Look for results
                if (html.includes('resultados') || html.includes('lyrics')) {
                    console.log("⚠️ MegaLyrics tiene resultados pero no podemos extraer fácilmente");
                }
            }
        } catch (megaError) {
            console.warn("MegaLyrics failed:", megaError);
        }

        throw new Error("No lyrics found in any source");

    } catch (e) {
        console.error("Lyrics Error:", e);
        content.innerHTML = `
            <div class="text-center py-20 animate-fade-in">
                <p class="text-white/20 text-6xl mb-4">⊙﹏⊙</p>
                <p class="text-gray-500 font-bold mb-2">No hemos encontrado la letra.</p>
                <p class="text-gray-600 text-xs">Intenta reproducir la versión oficial de la canción.</p>
                <p class="text-gray-700 text-[10px] mt-4">Fuentes probadas: LRCLib, Musixmatch, Genius, Lyrics.ovh</p>
            </div>
        `;
        document.getElementById('syncedLyricsIndicator').classList.add('hidden');
        document.getElementById('syncedLyricsIndicatorMobile').classList.add('hidden');
    }
}

function renderLyrics(data, source = 'Unknown') {
    const content = document.getElementById('lyricsContent');
    content.innerHTML = '';

    lyricsSyncMode = !!data.syncedLyrics;
    const lyricsText = data.syncedLyrics || data.plainLyrics || "";

    // Add source indicator
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'text-center mb-8';
    sourceDiv.innerHTML = `<span class="text-xs text-gray-600 uppercase tracking-widest">Letra de ${source}</span>`;
    content.appendChild(sourceDiv);

    if (lyricsSyncMode) {
        currentLyricsArr = parseLRC(lyricsText);
        document.getElementById('lyricsOverlay').classList.add('lyrics-synced');
        document.getElementById('syncedLyricsIndicator').classList.remove('hidden');
        document.getElementById('syncedLyricsIndicatorMobile').classList.remove('hidden');
    } else {
        currentLyricsArr = lyricsText.split('\n').map(line => ({ text: line }));
        document.getElementById('lyricsOverlay').classList.remove('lyrics-synced');
        document.getElementById('syncedLyricsIndicator').classList.add('hidden');
        document.getElementById('syncedLyricsIndicatorMobile').classList.add('hidden');
    }

    currentLyricsArr.forEach((line, index) => {
        if (!line.text.trim() && lyricsSyncMode) return;
        const p = document.createElement('p');
        p.className = 'lyric-line';
        p.innerText = line.text || '♪';
        p.dataset.index = index;
        if (lyricsSyncMode) {
            p.onclick = () => {
                const targetTime = line.time;
                if (isCurrentlyUsingNative && nativeAudio) {
                    nativeAudio.currentTime = targetTime;
                } else if (player && player.seekTo) {
                    player.seekTo(targetTime);
                }
            };
        }
        content.appendChild(p);
    });
}

function parseLRC(lrc) {
    const lines = lrc.split('\n');
    const result = [];
    const timeReg = /\[(\d+):(\d+\.\d+)\]/;

    lines.forEach(line => {
        const match = timeReg.exec(line);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseFloat(match[2]);
            const text = line.replace(timeReg, '').trim();
            result.push({
                time: minutes * 60 + seconds,
                text: text
            });
        }
    });
    return result.sort((a, b) => a.time - b.time);
}

function updateLyricsSync(currentTime) {
    if (!isLyricsOpen || !lyricsSyncMode || !currentLyricsArr.length) return;

    // Find current line - more precise with binary search approach
    let activeIndex = -1;
    for (let i = 0; i < currentLyricsArr.length; i++) {
        if (currentTime >= currentLyricsArr[i].time) {
            activeIndex = i;
        } else {
            break;
        }
    }

    if (activeIndex !== -1) {
        const activeLine = document.querySelector(`.lyric-line[data-index="${activeIndex}"]`);

        if (activeLine) {
            // Only update if it's a new line
            const wasActive = document.querySelector('.lyric-line.active');
            const wasActiveIndex = wasActive ? parseInt(wasActive.dataset.index) : -1;

            if (wasActiveIndex !== activeIndex) {
                document.querySelectorAll('.lyric-line.active').forEach(l => l.classList.remove('active'));
                activeLine.classList.add('active');

                // Smooth scroll to active line with offset for better visibility
                const container = document.getElementById('lyricsContainer');
                if (container) {
                    const containerHeight = container.clientHeight;
                    const lineTop = activeLine.offsetTop;
                    const lineHeight = activeLine.clientHeight;
                    const targetScroll = lineTop - (containerHeight / 2) + (lineHeight / 2);

                    container.scrollTo({
                        top: targetScroll,
                        behavior: 'smooth'
                    });
                }
            }
        }
    }
}

function renderNewsResults(videos, append = false) {
    const grid = document.getElementById('newsGrid');
    if (!grid) return;

    if (!append) grid.innerHTML = '';
    videos.forEach((video, index) => {
        const inQueue = isSongInQueue(video.id);
        const inQueueClass = inQueue ? 'in-queue-active' : '';
        const isSuggested = video.isSuggested || false;

        const card = document.createElement('div');
        card.className = `news-card animate-fade-in group hover:scale-[1.02] transition-all duration-300 ${isSuggested ? 'suggested-card' : ''}`;
        card.setAttribute('data-video-id', video.id);
        card.style.animationDelay = `${index * 50}ms`;

        // Badge para sugerencias
        const badgeHtml = isSuggested
            ? `<div class="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg border border-white/20 uppercase tracking-tighter flex items-center gap-1 animate-bounce-subtle">
                <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Para ti
               </div>`
            : '';

        card.innerHTML = `
            <div class="thumbnail-container relative overflow-hidden rounded-xl shadow-2xl">
                ${badgeHtml}
                <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy">
                <button onclick="event.stopPropagation(); handleNewsPlay(${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                    class="play-btn-overlay absolute bottom-4 right-4 bg-green-500 w-12 h-12 rounded-full flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 shadow-2xl transition-all duration-300 hover:scale-110 active:scale-90">
                    <svg class="w-8 h-8 card-play-icon transition-all duration-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </button>
                <div class="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded text-[11px] font-bold text-white">
                    ${video.duration}
                </div>
                
                <!-- Action Buttons Overlay (Split: Queue Left, Playlist Right) -->
                <div class="absolute top-2 left-2 z-10">
                    <button onclick="event.stopPropagation(); toggleQueue(${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                        class="p-2 news-card-queue-btn ${inQueueClass} rounded-full"
                        title="Añadir a la cola"
                        data-song-id="${video.id}">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>
                    </button>
                </div>
                <div class="absolute top-2 right-2 z-10">
                    <button onclick="event.stopPropagation(); showAddToPlaylistMenu(event, ${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                        class="p-2 bg-black/60 hover:bg-white hover:text-black rounded-full text-white backdrop-blur-sm transition-colors"
                        title="Añadir a playlist">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </button>
                </div>
            </div>
            <div class="mt-3 min-w-0">
                <h3 class="font-bold text-white text-sm md:text-base leading-tight line-clamp-2" title="${video.title}">${video.title}</h3>
                <p class="text-gray-400 text-xs mt-1.5 font-medium truncate" title="${video.channel}">${video.channel}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function handleNewsPlay(video) {
    const isCurrentSong = currentTrack && String(currentTrack.id) === String(video.id);
    const playerState = player?.getPlayerState();
    const isActuallyPlaying = playerState === YT.PlayerState.PLAYING ||
        (isCurrentlyUsingNative && !nativeAudio?.paused);

    console.log('📱 handleNewsPlay - isCurrentSong:', isCurrentSong, 'isActuallyPlaying:', isActuallyPlaying);

    if (isCurrentSong && isActuallyPlaying) {
        // Pause current song
        isUserPaused = true;
        if (isCurrentlyUsingNative) {
            nativeAudio?.pause();
        } else if (player && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
        }
        isMediaPlaying = false;
        updatePlayPauseIcons(false);
    } else if (isCurrentSong && player && typeof player.playVideo === 'function') {
        // Same song, just resume
        isUserPaused = false;
        player.playVideo();
        isMediaPlaying = true;
        updatePlayPauseIcons(true);
    } else {
        // Play as one-off
        playSong(video, [], false, true);
    }
}

function getPlaylistTotalDuration(pl) {
    return pl.songs.reduce((acc, song) => {
        const sec = parseDurationToSeconds(song.duration);
        return acc + sec;
    }, 0);
}

function parseDurationToSeconds(duration) {
    if (!duration || duration === '0:00') return 0;
    // Handle standard MM:SS or HH:MM:SS
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return 0;
}

function formatDuration(seconds, verbose = false) {
    if (!seconds) return verbose ? "0 min" : "0:00";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (verbose) {
        let res = [];
        if (h > 0) res.push(`${h} h`);
        if (m > 0 || h > 0) res.push(`${m} min`);
        if (h === 0 && s > 0) res.push(`${s} seg`);
        return res.join(' ') || "0 min";
    }

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
    }
    return `${m}:${s.toString().padStart(2, '0')} `;
}

function playPlaylist(event, plId) {
    event.stopPropagation();
    const pl = playlists.find(p => p.id === plId);
    if (pl && pl.songs.length > 0) {
        currentlyPlayingPlaylistId = plId;
        localStorage.setItem('amaya_playing_pl_id', plId);
        renderHomePlaylists();
        playSong(pl.songs[0], pl.songs);
    } else {
        showToast("Esta lista no tiene canciones", "error");
    }
}

function showToast(m, t = 'success', duration = 4000) {
    if (t === 'error') return; // Do not show error toasts as requested

    const c = document.getElementById('toastContainer');
    if (!c) return;

    let bgColor = 'bg-green-600';
    if (t === 'warning') bgColor = 'bg-yellow-600';
    if (t === 'info') bgColor = 'bg-blue-600/80';

    c.innerHTML = `<div class="px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-2xl animate-fade-in ${bgColor} backdrop-blur-md border border-white/10 text-center min-w-[200px]">${m}</div>`;
    clearTimeout(window.toastT);
    window.toastT = setTimeout(() => c.innerHTML = '', duration);
}

let progressUpdaterInterval; // Renamed from progressInterval to avoid conflict and be more descriptive

// --- PROGRESS BAR ---
function updateProgressBar() {
    let currentTime, duration;

    // STRICT SEPARATION: prevent reading from YouTube player if we are in Native mode
    if (isCurrentlyUsingNative) {
        if (!nativeAudio) return;
        currentTime = nativeAudio.currentTime;
        duration = nativeAudio.duration;
    } else if (player && typeof player.getCurrentTime === 'function') {
        currentTime = player.getCurrentTime();
        duration = player.getDuration();
    } else {
        return;
    }

    if (!duration || isNaN(duration)) return;

    // --- SponsorBlock ---
    const wasSkipped = checkSponsorSegments(currentTime);
    if (wasSkipped) return; // Skip the rest of this frame to avoid visual glitches

    const progress = (currentTime / duration) * 100;

    // Update desktop progress
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const progressThumb = document.getElementById('progressThumb');

    if (progressBar) progressBar.value = progress;
    if (progressFill) progressFill.style.width = progress + '%';
    if (progressThumb) progressThumb.style.left = progress + '%';

    // --- Lyrics Sync ---
    if (isLyricsOpen && lyricsSyncMode) {
        updateLyricsSync(currentTime);
    }

    // Update mobile progress
    const mobileProgressBar = document.getElementById('mobileProgressBar');
    const mobileProgressFill = document.getElementById('mobileProgressFill');
    const progressFillMini = document.getElementById('progressFillMini');

    if (mobileProgressBar) mobileProgressBar.value = progress;
    if (mobileProgressFill) mobileProgressFill.style.width = progress + '%';
    if (progressFillMini) progressFillMini.style.width = progress + '%';

    // Update time labels
    document.getElementById('currentTime').textContent = formatTime(currentTime);
    document.getElementById('remainingTime').textContent = '-' + formatTime(duration - currentTime);

    // Update listen progress for stats
    updateListenProgress(currentTime);

    const mobileCurrentTime = document.getElementById('mobileCurrentTime');
    const mobileRemainingTime = document.getElementById('mobileRemainingTime');
    if (mobileCurrentTime) mobileCurrentTime.textContent = formatTime(currentTime);
    if (mobileRemainingTime) mobileRemainingTime.textContent = '-' + formatTime(duration - currentTime);

    // Update Media Session position state
    updateMediaSessionPosition();
}

let lastMediaSessionUpdate = 0; // To prevent excessive updates

function setupNativeAudioHandlers() {
    if (!nativeAudio) return;

    nativeAudio.addEventListener('timeupdate', () => {
        const currentTime = nativeAudio.currentTime;
        const duration = nativeAudio.duration || 1;
        const progressPercent = (currentTime / duration) * 100;

        // Update progress bars
        const progressBar = document.getElementById('progressBar');
        const progressFill = document.getElementById('progressFill');
        const progressThumb = document.getElementById('progressThumb');
        const mobileProgressBar = document.getElementById('mobileProgressBar');
        const mobileProgressFill = document.getElementById('mobileProgressFill');
        const progressFillMini = document.getElementById('progressFillMini'); // Added for mini player

        if (progressBar && !isDraggingProgress) {
            progressBar.value = progressPercent;
            if (progressFill) progressFill.style.width = `${progressPercent}%`;
            if (progressThumb) progressThumb.style.left = `${progressPercent}%`;
            document.getElementById('currentTime').innerText = formatTime(currentTime);
            document.getElementById('remainingTime').innerText = "-" + formatTime(duration - currentTime);
        }

        if (mobileProgressBar && !isDraggingProgress) {
            mobileProgressBar.value = progressPercent;
            if (mobileProgressFill) mobileProgressFill.style.width = `${progressPercent}%`;
            if (document.getElementById('mobileCurrentTime')) document.getElementById('mobileCurrentTime').innerText = formatTime(currentTime);
            if (document.getElementById('mobileRemainingTime')) document.getElementById('mobileRemainingTime').innerText = "-" + formatTime(duration - currentTime);
        }
        if (progressFillMini) progressFillMini.style.width = progressPercent + '%'; // Update mini player progress

        // Update listen progress for stats
        updateListenProgress(currentTime);

        // --- Lyrics Sync ---
        if (isLyricsOpen && lyricsSyncMode) {
            updateLyricsSync(currentTime);
        }

        if (navigator.mediaSession && Math.abs(currentTime - lastMediaSessionUpdate) > 2) {
            updateMediaSessionPosition();
            lastMediaSessionUpdate = currentTime;
        }

        // Check for SponsorBlock segments
        checkSponsorSegments(currentTime);

        // Check for DJ Auto-Mix Transition
        checkAutoMixTransition();
    });

    // SETUP SECONDARY AUDIO HANDLERS (for DJ Mode)
    if (secondaryAudio) {
        // We need to attach error handling at least
        secondaryAudio.addEventListener('error', (e) => {
            console.warn("DJ Mode: Secondary Audio Error", e);
            // If secondary fails, we should probably abort mix and let normal flow handle it
            nextTrackId = null;
        });

        // When secondary ends (if it ever plays to end without swap... shouldn't happen in crossfade but safety)
        secondaryAudio.addEventListener('ended', () => {
            console.log("Secondary audio ended unexpectedly");
        });
    }
}

function updateMediaSessionPosition() {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;

    let currentTime, duration, playbackRate;

    if (isCurrentlyUsingNative && nativeAudio && !isNaN(nativeAudio.duration)) {
        currentTime = nativeAudio.currentTime;
        duration = nativeAudio.duration;
        playbackRate = nativeAudio.playbackRate;
    } else if (player && typeof player.getCurrentTime === 'function') {
        currentTime = player.getCurrentTime();
        duration = player.getDuration();
        playbackRate = player.getPlaybackRate ? player.getPlaybackRate() : 1;
    } else {
        return;
    }

    if (!duration || isNaN(duration) || isNaN(currentTime)) return;

    try {
        navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: playbackRate || 1,
            position: Math.min(currentTime, duration)
        });
    } catch (e) {
        console.error("Error setting MediaSession position:", e);
    }
}

function startProgressUpdater() {
    if (progressUpdaterInterval) clearInterval(progressUpdaterInterval);
    progressUpdaterInterval = setInterval(updateProgressBar, 50); // Faster update for better lyrics sync
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')} `;
}

// --- CONTROLS INTERACTION ---
document.getElementById('progressBar').oninput = function () {
    if (!player) return;
    const time = (this.value / 100) * player.getDuration();
    player.seekTo(time);
};

document.getElementById('volumeBar').oninput = function () {
    if (!player) return;
    const vol = this.value;
    player.setVolume(vol);
    document.getElementById('volumeFill').style.width = vol + '%';
    document.getElementById('volumeThumb').style.left = vol + '%';

    const icon = document.getElementById('volumeIcon');
    if (vol == 0) icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    else if (vol < 50) icon.innerHTML = '<path d="M7 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    else icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
};

function toggleMute() {
    if (!nativeAudio) return;
    nativeAudio.muted = !nativeAudio.muted;
    const icon = document.getElementById('volumeIcon');
    if (nativeAudio.muted) {
        icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else {
        icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
}


// --- MOBILE PLAYER ---
function openMobilePlayer() {
    const fullPlayer = document.getElementById('mobilePlayerFull');
    const miniPlayer = document.getElementById('mobilePlayerMini');

    fullPlayer.classList.add('active');
    if (miniPlayer) miniPlayer.classList.add('opacity-0', 'pointer-events-none');

    // Disable body scroll
    document.body.style.overflow = 'hidden';

    // Update marquees once visible
    setTimeout(updateMarquees, 600);
}

function closeMobilePlayer() {
    const fullPlayer = document.getElementById('mobilePlayerFull');
    const miniPlayer = document.getElementById('mobilePlayerMini');

    fullPlayer.classList.remove('active');
    if (miniPlayer) miniPlayer.classList.remove('opacity-0', 'pointer-events-none');

    // Re-enable body scroll
    document.body.style.overflow = '';

    // Exit video mode if active
    if (isVideoModeActive) toggleVideoMode();
}

// --- USER SWITCHER FUNCTIONS ---
function showUserSwitcher() {
    const modal = document.getElementById('userSwitcherModal');
    const list = document.getElementById('userList');
    list.innerHTML = '';

    users.forEach(user => {
        const card = document.createElement('div');
        card.className = `profile - card group ${user.id === currentUser.id ? 'active' : ''} `;
        card.onclick = () => switchUser(user.id);

        const initial = user.name.charAt(0).toUpperCase();

        card.innerHTML = `
            < div class="w-20 h-20 md:w-32 md:h-32 rounded-lg bg-green-500 flex items-center justify-center text-4xl font-black text-black mx-auto mb-4 group-hover:scale-110 transition-transform" >
                ${user.avatar ? `<img src="${user.avatar}" class="w-full h-full object-cover rounded-lg">` : initial}
            </div >
            <p class="text-white font-bold md:text-xl">${user.name}</p>
            ${user.id === currentUser.id ? '<p class="text-green-500 text-[10px] uppercase font-black mt-2">Activo</p>' : ''}
        `;
        list.appendChild(card);
    });

    modal.classList.remove('hidden');
}

function hideUserSwitcher() {
    document.getElementById('userSwitcherModal').classList.add('hidden');
}

function showAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
}

function hideAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

function createNewUser() {
    const nameInput = document.getElementById('newUserName');
    const name = nameInput.value.trim();
    if (!name) return;

    const newUser = {
        id: 'user_' + Date.now(),
        name: name,
        avatar: ''
    };

    users.push(newUser);
    localStorage.setItem('amaya_users', JSON.stringify(users));

    nameInput.value = '';
    hideAddUserModal();
    showUserSwitcher(); // Refresh list
    showToast(`Usuario "${name}" creado`);
}

function switchUser(userId) {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    currentUser = targetUser;
    localStorage.setItem('amaya_current_user', JSON.stringify(currentUser));

    updateUserUI();
    renderPlaylists();
    showHome();
    hideUserSwitcher();
    showToast(`Cambiado a ${currentUser.name}`);
}

function updateUserUI() {
    const nameEl = document.getElementById('currentUserName');
    const avatarEl = document.getElementById('currentUserAvatar');
    const avatarMobileEl = document.getElementById('currentUserAvatarMobile');

    if (nameEl) nameEl.innerText = currentUser.name;

    const avatarContent = currentUser.avatar
        ? `< img src = "${currentUser.avatar}" > `
        : currentUser.name.charAt(0).toUpperCase();

    if (avatarEl) avatarEl.innerHTML = avatarContent;
    if (avatarMobileEl) avatarMobileEl.innerHTML = avatarContent;
}

// --- SHARING (IMPORT/EXPORT) ---
function exportCurrentPlaylist() {
    if (!activePlaylistId) return;
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (!pl) return;

    const dataStr = JSON.stringify(pl, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `${pl.name.toLowerCase().replace(/\s+/g, '_')} _amaya.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showToast("Lista exportada correctamente");
}



function triggerPlaylistImport() {
    document.getElementById('playlistImportInput').click();
}

function handlePlaylistImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedPl = JSON.parse(e.target.result);

            // Validate basic structure
            if (!importedPl.name || !Array.isArray(importedPl.songs)) {
                throw new Error("Formato de archivo inválido");
            }

            // Assign a new ID to avoid collisions
            importedPl.id = 'pl_' + Date.now();

            playlists.push(importedPl);
            savePlaylists();
            renderPlaylists();
            showToast(`Lista "${importedPl.name}" importada`);

        } catch (error) {
            showToast("Error en importar: " + error.message, "error");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

function seekMobile(val) {
    if (!player) return;
    const time = (val / 100) * player.getDuration();
    player.seekTo(time);
}

function showMobileMenu() {
    document.getElementById('mobileMenu').classList.remove('hidden');
}

function hideMobileMenu() {
    document.getElementById('mobileMenu').classList.add('hidden');
}

// --- HELPERS ---
function decodeHtml(html) {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

function parseISO8601Duration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';

    const h = parseInt(match[1]) || 0;
    const m = parseInt(match[2]) || 0;
    const s = parseInt(match[3]) || 0;

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
    }
    return `${m}:${s.toString().padStart(2, '0')} `;
}

function parseISO8601DurationInSeconds(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const h = parseInt(match[1]) || 0;
    const m = parseInt(match[2]) || 0;
    const s = parseInt(match[3]) || 0;
    return h * 3600 + m * 60 + s;
}

// Background playback recovery & Heartbeat
let wasPlaying = false;
let heartbeatInterval = null;

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (!isCurrentlyUsingNative && player && player.getPlayerState) {
            const state = player.getPlayerState();
            // If it stopped but it should be playing (based on our state)
            if (state === YT.PlayerState.PAUSED && wasPlaying && !isUserPaused) {
                console.log("Heartbeat: Detected forced pause, attempting recovery...");
                resumePlaybackBruteForce();
            }
        }
    }, 1000);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (player && player.getPlayerState() === YT.PlayerState.PLAYING) {
            wasPlaying = true;
            startHeartbeat();
        }
    } else {
        if (wasPlaying && player && player.getPlayerState() === YT.PlayerState.PAUSED) {
            resumePlaybackBruteForce();
            wasPlaying = false;
            if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
    }
});
// Helper to resize and compress images
function compressImage(base64Str, maxWidth = 600, maxHeight = 600, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onerror = reject;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
    });
}

// --- DYNAMIC THEMING ---
function updateAmbientBackground(imageUrl) {
    const bg = document.getElementById('ambient-bg');
    if (!bg) return;

    // Use a canvas to extract the dominant color (simplified approach)
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1;
        canvas.height = 1;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

        const accent = `rgba(${r}, ${g}, ${b}, 0.2)`;

        bg.style.background = `radial-gradient(circle at 30% 30%, ${accent}, transparent 40%),
            radial-gradient(circle at 70% 70%, rgba(100, 50, 255, 0.08), transparent 40%),
            #050505`;
    };
}

// --- MARQUEE LOGIC ---
function updateMarquees() {
    ['currentTitle', 'currentChannel', 'mobileFullTitle', 'mobileFullChannel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) updateMarquee(el);
    });
}

function updateMarquee(el) {
    if (!el) return;

    const container = el.parentElement;
    if (!container || !container.classList.contains('marquee-container')) return;

    // Reset state
    container.classList.remove('marquee-active');
    el.classList.remove('truncate'); // Ensure no truncation during measurement
    el.style.setProperty('--marquee-width', '0px');
    el.style.animationDuration = '';

    // Small delay to allow layout calculation
    setTimeout(() => {
        const textWidth = el.scrollWidth;
        const containerWidth = container.offsetWidth;

        if (textWidth > containerWidth) {
            const scrollDistance = textWidth - containerWidth + 40;
            el.style.setProperty('--marquee-width', `${scrollDistance}px`);
            container.classList.add('marquee-active');

            // Adjust duration based on distance
            const duration = Math.max(8, scrollDistance / 20);
            el.style.animationDuration = `${duration}s`;
        }
    }, 200);
}

window.addEventListener('resize', () => {
    // Debounced resize update
    clearTimeout(window.marqueeResizeTimeout);
    window.marqueeResizeTimeout = setTimeout(updateMarquees, 500);
});
// --- REPORTING LOGIC ---
let currentReportPeriod = '7d';

async function showReport() {
    if (!currentUserUid) return;
    document.getElementById('reportModal').classList.remove('hidden');
    // Set default dates (1 day)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);

    document.getElementById('reportEndDate').value = end.toISOString().split('T')[0];
    document.getElementById('reportStartDate').value = start.toISOString().split('T')[0];

    await updateReportPeriod('1d');
}

function hideReport() {
    document.getElementById('reportModal').classList.add('hidden');
}

async function updateReportPeriod(period) {
    console.log('updateReportPeriod called:', period);
    currentReportPeriod = period;

    // Update tabs UI
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === period);
    });

    const now = new Date();
    let startDate;
    let endDate = new Date(now);

    if (period === '1d') {
        // Full current day: from 00:00:00 to 23:59:59
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate.setHours(23, 59, 59, 999);
    } else if (period === '7d') {
        startDate = new Date();
        startDate.setDate(now.getDate() - 7);
    } else if (period === '30d') {
        startDate = new Date();
        startDate.setDate(now.getDate() - 30);
    } else if (period === 'all') {
        startDate = new Date(2024, 0, 1);
        endDate.setHours(23, 59, 59, 999); // Ensure it covers everything today too
    }

    if (startDate) {
        const startInput = document.getElementById('reportStartDate');
        const endInput = document.getElementById('reportEndDate');

        if (startInput && endInput) {
            window.isUpdatingDatesProgrammatically = true;

            // Fix: Use local date parts instead of toISOString() which shifts date to UTC (yesterday in some cases)
            const toLocalYYYYMMDD = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            startInput.value = toLocalYYYYMMDD(startDate);
            endInput.value = toLocalYYYYMMDD(endDate);

            setTimeout(() => { window.isUpdatingDatesProgrammatically = false; }, 500);
        }

        await fetchAndRenderReport(startDate, endDate);
    }
}

async function updateReportCustomRange() {
    if (window.isUpdatingDatesProgrammatically) return;
    const startStr = document.getElementById('reportStartDate').value;
    const endStr = document.getElementById('reportEndDate').value;

    if (!startStr || !endStr) return;

    const start = new Date(startStr);
    const end = new Date(endStr);
    end.setHours(23, 59, 59, 999);

    // Clear active period tags
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    await fetchAndRenderReport(start, end);
}

async function fetchAndRenderReport(startDate, endDate) {
    if (!currentUserUid) return;

    showToast("Generando reporte...", "info");

    try {
        const historyRef = collection(db, "users", currentUserUid, "history");
        const q = query(
            historyRef,
            where("timestamp", ">=", startDate),
            where("timestamp", "<=", endDate),
            orderBy("timestamp", "desc")
        );

        console.log('📊 Fetching history data from Firebase...');
        const snapshot = await getDocs(q);
        console.log('📊 Found', snapshot.size, 'history entries');

        if (snapshot.empty) {
            console.log('📊 No history data found');
            renderReport(null, []);
            return;
        }

        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('📊 Sample data:', data[0]);

        const stats = calculateStatistics(data);
        renderReport(stats, data);
    } catch (e) {
        console.error("Error fetching report data:", e);
        showToast("Error al obtener datos: " + e.message, "error");
    }
}

function calculateStatistics(history) {
    const stats = {
        totalSeconds: 0,
        totalSongs: history.length,
        uniqueArtists: new Set(),
        artistsMap: {}, // artist -> seconds
        genresMap: {},  // genre -> count
        songsData: [] // Store individual song data for display
    };

    history.forEach(item => {
        // DEBUG: Log what we're receiving from Firestore
        console.log('📊 Item:', item.title, 'listenedSeconds:', item.listenedSeconds, 'durationSeconds:', item.durationSeconds);

        // Use actual listened time instead of full duration
        const listenedSecs = item.listenedSeconds || 0;
        const secs = listenedSecs > 0 ? listenedSecs : (item.durationSeconds || 0);
        console.log('📊 Using secs:', secs, 'for:', item.title);
        stats.totalSeconds += secs;
        stats.uniqueArtists.add(item.artist);

        stats.artistsMap[item.artist] = (stats.artistsMap[item.artist] || 0) + secs;

        if (item.genre && item.genre !== "Unknown") {
            stats.genresMap[item.genre] = (stats.genresMap[item.genre] || 0) + 1;
        }

        // Store individual song data
        stats.songsData.push({
            title: item.title,
            artist: item.artist,
            listenedSeconds: listenedSecs,
            durationSeconds: item.durationSeconds || 0
        });
    });

    stats.totalSeconds = Math.round(stats.totalSeconds);
    stats.uniqueArtistsCount = stats.uniqueArtists.size;

    // Sort artists by seconds
    stats.topArtists = Object.entries(stats.artistsMap)
        .sort((a, b) => b[1] - a[1]) // Sort by total seconds
        .slice(0, 5)
        .map(([name, seconds]) => ({
            name,
            seconds,
            hours: Math.floor(seconds / 3600),
            min: Math.floor((seconds % 3600) / 60),
            sec: seconds % 60
        }));

    // Sort genres by count
    stats.topGenres = Object.entries(stats.genresMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    stats.totalMin = Math.floor(stats.totalSeconds / 60);
    stats.totalSec = Math.floor(stats.totalSeconds % 60);

    return stats;
}

function formatTimeHMSS(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds)) return '0:00';
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);

    if (hours > 0) {
        return `${hours}h ${mins}m ${secs}s`;
    } else {
        return `${mins}m ${secs}s`;
    }
}

function renderReport(stats, history) {
    // Handle empty or null data
    if (!stats) {
        document.getElementById('stat-total-time').innerText = '0:00';
        document.getElementById('stat-total-songs').innerText = '0';
        document.getElementById('stat-unique-artists').innerText = '0';
        document.getElementById('top-artists-list').innerHTML = '<p class="text-gray-500 italic">No hay datos para este periodo.</p>';
        document.getElementById('top-genres-list').innerHTML = '<p class="text-gray-500 italic">No hay datos para este periodo.</p>';
        document.getElementById('recent-activity-list').innerHTML = '<p class="text-gray-500 italic p-4 text-sm text-center">Sin actividad reciente</p>';
        return;
    }

    // Show total time in hours:minutes:seconds
    const totalTimeDisplay = formatTimeHMSS(stats.totalSeconds);
    document.getElementById('stat-total-time').innerText = totalTimeDisplay;
    document.getElementById('stat-total-songs').innerText = stats.totalSongs.toLocaleString();
    document.getElementById('stat-unique-artists').innerText = stats.uniqueArtistsCount.toLocaleString();

    // Render Artists
    const artistList = document.getElementById('top-artists-list');
    artistList.innerHTML = stats.topArtists.length > 0 ? '' : '<p class="text-gray-500 italic">No hay datos.</p>';

    const maxSeconds = stats.topArtists.length > 0 ? stats.topArtists[0].seconds : 1;

    stats.topArtists.forEach((artist, i) => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        const percent = (artist.seconds / maxSeconds) * 100;

        // Show hours:minutes:seconds format
        const artistTime = formatTimeHMSS(artist.seconds);

        item.innerHTML = `
            <div class="stat-rank">${i + 1}</div>
            <div class="flex-1">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-white">${artist.name}</span>
                    <span class="text-xs font-mono text-green-500">${artistTime}</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
        artistList.appendChild(item);
    });

    // Render Genres
    const genreList = document.getElementById('top-genres-list');
    genreList.innerHTML = stats.topGenres.length > 0 ? '' : '<p class="text-gray-500 italic">No hay datos.</p>';

    const maxGenre = stats.topGenres.length > 0 ? stats.topGenres[0].count : 1;

    stats.topGenres.forEach((genre, i) => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        const percent = (genre.count / maxGenre) * 100;

        item.innerHTML = `
            <div class="stat-rank">${i + 1}</div>
            <div class="flex-1">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-white">${genre.name}</span>
                    <span class="text-xs font-mono text-blue-500">${genre.count} veces</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
        genreList.appendChild(item);
    });

    // Render Recent Activity (Mini rows) - Limit to last 24h
    const activityList = document.getElementById('recent-activity-list');
    activityList.innerHTML = '';

    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

    const recentHistory = history.filter(item => {
        const itemTime = item.timestamp ? (item.timestamp.seconds * 1000) : now;
        return itemTime >= twentyFourHoursAgo;
    }).slice(0, 10);

    if (recentHistory.length === 0) {
        activityList.innerHTML = '<p class="text-gray-500 italic p-4 text-sm text-center">Sin actividad en las últimas 24h</p>';
    }

    recentHistory.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-4 p-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer';

        // Calculate duration display - show actual listened time
        let durationDisplay = '';
        const listenedSecs = item.listenedSeconds || 0;
        const durationSecs = item.durationSeconds || 0;

        if (listenedSecs > 0) {
            // Show listened time
            durationDisplay = `<span class="text-xs text-green-500 font-mono">${formatTimeHMSS(listenedSecs)}</span>`;
        } else if (durationSecs > 0) {
            // Fallback to full duration if no listened time recorded yet
            durationDisplay = `<span class="text-xs text-gray-500 font-mono">${formatTimeHMSS(durationSecs)}</span>`;
        }

        row.innerHTML = `
            <img src="${item.thumbnail}" class="w-10 h-10 rounded object-cover">
            <div class="flex-1 min-w-0">
                <p class="text-white text-sm font-bold truncate">${item.title}</p>
                <div class="flex items-center gap-2">
                    <p class="text-gray-400 text-xs truncate">${item.artist}</p>
                    ${durationDisplay}
                </div>
            </div>
            <div class="text-xs text-gray-500 whitespace-nowrap">
                ${item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
        `;
        activityList.appendChild(row);
    });
}

// --- EXPOSE TO GLOBAL SCOPE (For HTML onclick handlers) ---
// Only expose functions that are actually defined in this file or imported
Object.assign(window, {
    showHome,
    renderHomePlaylists,
    switchTab,
    showCreatePlaylistModal,
    hideCreatePlaylistModal,
    createPlaylist,
    searchMusic,
    loadNewReleases,
    toggleClearButton,
    clearSearch,
    searchPrevPage,
    searchNextPage,
    openPlaylist,
    removeSongFromPlaylist,
    showAddToPlaylistMenu,
    hideAddToPlaylistMenu,
    toggleShuffle,
    playPrevious,
    togglePlayPause,
    playNext,
    toggleRepeat,
    showQueue,
    hideQueue,
    clearQueue,
    toggleQueue,
    saveQueueAsPlaylist,
    playSong,
    handleNewsPlay,
    hideApiInstructions,
    showApiInstructions,
    toggleApiKeySection,
    saveApiKey,
    shareCurrentPlaylist,
    importSharedPlaylist,
    updateMarquees,
    updateMarquee,
    loginWithGoogle,
    logout,
    toggleProfileDropdown,
    toggleProfileDropdownMobile,
    onYouTubeIframeAPIReady,
    onPlayerReady,
    onPlayerStateChange,
    onPlayerError,
    playNativeAudio,
    setupAuthListener,
    openMobilePlayer,
    closeMobilePlayer,
    seekMobile,
    showMobileMenu,
    hideMobileMenu,
    triggerPlaylistImport,
    handlePlaylistImport,
    triggerPlaylistCoverUpload,
    handlePlaylistCoverChange,
    openEditPlaylistModal,
    showEditPlaylistModal,
    savePlaylistEdits,
    hideEditPlaylistModal,
    showDeletePlaylistConfirm,
    hideDeletePlaylistConfirm,
    deleteCurrentPlaylist,
    playCurrentPlaylist,
    toggleMute,
    removeFromQueue,
    moveSongInPlaylist,
    showReport,
    hideReport,
    updateReportPeriod,
    updateReportCustomRange,
    loadMoreNews,
    toggleLyrics,
    toggleVideoMode,
    createDJSession,
    joinDJSession,
    leaveDJSession,
    editDJSessionName,
    loadMySessions,
    rejoinSession,
    deleteSavedSession,
    showMySessions,
    backToDJInitial,
    createDJSessionTab,
    joinDJSessionTab,
    leaveDJSession,
    showMySessionsTab,
    backToDJInitialTab,
    loadMySessionsTab,
    rejoinSessionTab,
    syncDJToTab,
    updateDJMembersListTab
});

console.log("🚀 MAIN.JS CARGADO CORRECTAMENTE");
