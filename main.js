let player;
let isVideoReady = false;
let currentTrack = null;
let playlist = []; // For the current view (search results or playlist songs)
let queue = [];
let currentQueueIndex = -1;
let playlists = JSON.parse(localStorage.getItem('amaya_playlists')) || [];
let apiKey = localStorage.getItem('amaya_yt_key') || '';
let isShuffle = false;
let repeatMode = 0; // 0: No repeat, 1: Repeat playlist, 2: Repeat one
let nextSearchToken = '';
let prevSearchToken = '';
let currentSearchQuery = '';
let currentSearchPage = 1;

// Track user intent to distinguish between unwanted background pauses and clicks
let isUserPaused = false;

// Native audio player
let nativeAudio = null;
let useNativeAudio = true; // Prefer native audio over YouTube IFrame

// Invidious instances (fallback if one fails)
// Prioritize instances known for speed and M4A support
const INVIDIOUS_INSTANCES = [
    'invidious.drgns.space',      // Usually fast
    'invidious.perennialte.ch',   // Reliable
    'inv.tux.pizza',
    'invidious.privacydev.net',
    'yt.artemislena.eu',
    'invidious.fdn.fr'
];



// Piped instances (Secondary fallback)
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',      // Hero 1 (Official)
    'https://api.piped.privacydev.net',  // Hero 2 (Stable)
    'https://pipedapi.drgns.space',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.tokhmi.xyz',       // New addition
    'https://piped-api.lunar.icu'        // New addition
];

// --- INITIALIZATION ---
window.onload = () => {
    // Initialize native audio player
    nativeAudio = document.getElementById('nativeAudioPlayer');
    setupNativeAudioHandlers();

    // Load YouTube IFrame API (fallback)
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Initial UI load
    if (apiKey) {
        document.getElementById('apiKeyInput').value = apiKey;
        document.getElementById('apiKeySection').classList.add('hidden');
        document.getElementById('apiKeyToggleButton').innerText = "Mostrar clau API";
        document.getElementById('apiWarning').classList.add('hidden');
    }

    setupMediaSessionHandlers();
    renderPlaylists();
    showHome();
    updateQueueCount();

    // Check for mobile-specific messages
    if (window.innerWidth <= 768) {
        document.getElementById('bgPlaybackHint').classList.remove('hidden');
    }

    if (window.location.protocol === 'file:') {
        document.getElementById('fileProtocolWarning').classList.remove('hidden');
    }

    // Register Service Worker for background keepalive
    registerServiceWorker();
};

// Service Worker registration and keepalive
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('✅ Service Worker registrado:', registration);

            // Listen for messages from SW
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'PING') {
                    // Respond to ping to keep connection alive
                    console.log('📡 SW ping recibido');
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
            // ONLY if we are NOT using native audio
            if (!useNativeAudio && state === YT.PlayerState.PAUSED && !isUserPaused) {
                console.log("⚠️ Watchdog: Detected unwanted pause in YT. Force resuming...");
                player.playVideo();
            }

            // If somehow stopped or cued, also try to resume if we have a track
            if (!useNativeAudio && (state === YT.PlayerState.CUED || state === -1) && currentTrack && !isUserPaused) {
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
        if (!useNativeAudio) isUserPaused = false; // Only reset if YT is the active engine

        const path = "M6 4h4v16H6zm8 0h4v16h-4z"; // Pause icon
        playPauseIcon.setAttribute('d', path);
        if (mobilePlayPauseIcon) mobilePlayPauseIcon.innerHTML = `<path d="${path}"/>`;
        if (mobileMainPlayIcon) mobileMainPlayIcon.innerHTML = `<path d="${path}"/>`;

        // Sync mobile full player central button
        const mobileMainBtn = document.getElementById('mobileMainPlayIcon');
        if (mobileMainBtn) mobileMainBtn.innerHTML = `<path d="${path}"/>`;

        document.getElementById('equalizer').classList.remove('hidden');
        document.querySelector('.equalizer-bars').classList.remove('paused');

        if (navigator.mediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            updateMediaSessionPosition();
        }

        startSilentAudio();
        startProgressUpdater();
    } else {
        const path = "M8 5v14l11-7z"; // Play icon
        playPauseIcon.setAttribute('d', path);
        if (mobilePlayPauseIcon) mobilePlayPauseIcon.innerHTML = `<path d="${path}"/>`;
        if (mobileMainPlayIcon) mobileMainPlayIcon.innerHTML = `<path d="${path}"/>`;

        // Sync mobile full player central button
        const mobileMainBtn = document.getElementById('mobileMainPlayIcon');
        if (mobileMainBtn) mobileMainBtn.innerHTML = `<path d="${path}"/>`;

        if (event.data === YT.PlayerState.PAUSED) {
            // --- PROTECTION AGAINST UNWANTED BACKGROUND PAUSES ---
            if (!isUserPaused && !useNativeAudio) {
                console.log("Unwanted YT pause detected! Force resuming...");
                player.playVideo();
                return; // Exit early, don't update UI to paused state
            }

            document.querySelector('.equalizer-bars').classList.add('paused');
            if (navigator.mediaSession) {
                navigator.mediaSession.playbackState = 'paused';
            }
            stopSilentAudio();
        } else {
            document.getElementById('equalizer').classList.add('hidden');
        }

        if (event.data === YT.PlayerState.ENDED) {
            if (!useNativeAudio) handleTrackEnded();
        }
    }
}

// --- NATIVE AUDIO SETUP ---
function setupNativeAudioHandlers() {
    if (!nativeAudio) return;

    nativeAudio.addEventListener('play', () => {
        console.log('🎵 Audio nativo: reproduciendo');
        isUserPaused = false;

        // Ensure YT player is paused if we are using native
        if (player && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
        }

        updatePlayPauseIcons(true);
        // startSilentAudio(); // REMOVED: Conflicts with Media Session controls
        startProgressUpdater();
        startServiceWorkerKeepAlive(); // Keep SW active
        if (navigator.mediaSession) {
            navigator.mediaSession.playbackState = 'playing';
            updateMediaSessionPosition();
        }
    });

    nativeAudio.addEventListener('pause', () => {
        console.log('⏸️ Audio nativo: pausado');
        updatePlayPauseIcons(false);

        // MOBILE FIX: If paused but user didn't intend to pause, resume immediately
        // CRITICAL: Don't auto-resume if the audio actually ended to allow track transition
        if (!isUserPaused && !nativeAudio.ended) {
            console.warn('⚠️ Pausa no autoritzada detectada. Forçant reanudació...');
            setTimeout(() => {
                if (nativeAudio && nativeAudio.paused && !isUserPaused && !nativeAudio.ended) {
                    nativeAudio.play().catch(e => console.error('Error al reanudar:', e));
                }
            }, 100); // Small delay to let the system settle
        } else if (navigator.mediaSession) {
            navigator.mediaSession.playbackState = 'paused';
            stopSilentAudio();
            stopServiceWorkerKeepAlive(); // Stop SW keepalive when user pauses
        }
    });

    nativeAudio.addEventListener('ended', () => {
        console.log('✅ Audio nativo: terminado');
        handleTrackEnded();
    });

    nativeAudio.addEventListener('timeupdate', updateProgressBar);

    nativeAudio.addEventListener('error', (e) => {
        const err = e.target.error;
        console.error('❌ Error en audio nativo:', err);

        // Detailed error logging for debugging
        let errorMsg = 'Error desconocido';
        if (err) {
            switch (err.code) {
                case err.MEDIA_ERR_ABORTED: errorMsg = 'Abortado por el usuario'; break;
                case err.MEDIA_ERR_NETWORK: errorMsg = 'Error de red (posible bloqueo 403)'; break;
                case err.MEDIA_ERR_DECODE: errorMsg = 'Error de decodificación (formato no soportado)'; break;
                case err.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = 'Formato no soportado / 403 Forbidden'; break;
                default: errorMsg = `Código: ${err.code}`;
            }
        }
        showToast(`Error d'àudio: ${errorMsg}`, 'error');

        if (currentTrack) {
            console.log('Intento de fallback a YouTube IFrame...');
            showToast('Reiniciant amb YouTube Player...', 'info');
            useNativeAudio = false;
            loadYouTubeIFrame(currentTrack.id);
        }
    });

    nativeAudio.addEventListener('loadstart', () => console.log('⏳ Cargando audio...'));
    nativeAudio.addEventListener('canplay', () => console.log('✅ Audio listo para reproducir'));

    console.log('✅ Handlers de audio nativo configurados');
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
        if (useNativeAudio && nativeAudio) {
            nativeAudio.play().catch(e => console.error("MS Play error:", e));
        } else if (player) {
            player.playVideo();
        }
    });

    safeSetHandler('pause', () => {
        console.log("MediaSession: Pause");
        isUserPaused = true;
        navigator.mediaSession.playbackState = 'paused';
        if (useNativeAudio && nativeAudio) {
            nativeAudio.pause();
        } else if (player) {
            player.pauseVideo();
        }
    });

    safeSetHandler('stop', () => {
        console.log("MediaSession: Stop");
        isUserPaused = true;
        navigator.mediaSession.playbackState = 'none';
        if (useNativeAudio && nativeAudio) {
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
            if (useNativeAudio && nativeAudio) {
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
        if (useNativeAudio && nativeAudio) {
            nativeAudio.currentTime = Math.max(nativeAudio.currentTime - skipTime, 0);
        } else if (player) {
            player.seekTo(Math.max(player.getCurrentTime() - skipTime, 0));
        }
        updateMediaSessionPosition();
    });

    safeSetHandler('seekforward', (details) => {
        console.log("MediaSession: Seek Forward");
        const skipTime = details.seekOffset || 10;
        if (useNativeAudio && nativeAudio) {
            nativeAudio.currentTime = Math.min(nativeAudio.currentTime + skipTime, nativeAudio.duration || 0);
        } else if (player) {
            player.seekTo(Math.min(player.getCurrentTime() + skipTime, player.getDuration() || 0));
        }
        updateMediaSessionPosition();
    });

    console.log('✅ Media Session handlers configurados (Robust Mode)');
}

function updatePlayPauseIcons(isPlaying) {
    const path = isPlaying ? "M6 4h4v16H6zm8 0h4v16h-4z" : "M8 5v14l11-7z";
    const playPauseIcon = document.getElementById('playPauseIcon');
    const mobilePlayPauseIcon = document.getElementById('mobilePlayPauseIcon');
    const mobileMainPlayIcon = document.getElementById('mobileMainPlayIcon');

    if (playPauseIcon) playPauseIcon.setAttribute('d', path);
    if (mobilePlayPauseIcon) mobilePlayPauseIcon.innerHTML = `<path d="${path}"/>`;
    if (mobileMainPlayIcon) mobileMainPlayIcon.innerHTML = `<path d="${path}"/>`;

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
}

// --- INVIDIOUS & PIPED INTEGRATION ---
async function getAudioUrl(videoId) {
    console.log(`🔍 Obteniendo URL de audio para: ${videoId}`);

    // --- OPTIMIZED PIPED STRATEGY (PARALLEL RACE) ---
    console.log("🚀 Iniciando búsqueda optimizada (Piped Race)...");
    showToast("Cercant àudio...");

    // 1. Try Cached Instance First (Smart Cache)
    const cachedInstance = localStorage.getItem('amaya_fastest_server');
    if (cachedInstance) {
        console.log(`⚡ Usando servidor rápido guardado: ${cachedInstance}`);
        try {
            const url = await fetchFromPiped(cachedInstance, videoId, 2500); // 2.5s strict timeout
            if (url) return url;
        } catch (e) {
            console.warn("Servidor guardado falló, iniciando carrera...");
            localStorage.removeItem('amaya_fastest_server');
        }
    }

    // 2. Race Strategies (Cold Start Fix)
    // Problem: Random 3 might pick 3 slow ones. Mobile cold start takes time.
    // Solution: "Hero Strategy" - Always include the best servers in the race.

    const heroes = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.privacydev.net'
    ];

    // Mix heroes with some randoms for diversity
    const others = PIPED_INSTANCES.filter(i => !heroes.includes(i)).sort(() => 0.5 - Math.random());

    // Candidate list: 2 Heroes + 2 Others (Total 4 racers)
    const raceCandidates = [...heroes, ...others.slice(0, 2)];

    try {
        // Timeout increased to 8000ms (8s) for the initial race.
        // It's better to wait 6s and get proper audio than fail at 4s and get YouTube Player.
        const url = await Promise.any(raceCandidates.map(instance => fetchFromPiped(instance, videoId, 8000)));
        console.log("🏆 Carrera ganada!");
        return url;
    } catch (aggregateError) {
        console.warn("🏁 Carrera de servidores Piped falló:", aggregateError);
    }

    // STAGE 2: Try Invidious Instances (Fallback)
    console.log("⚠️ Piped falló. Intentando Invidious (Fallback)...");
    showToast("Provant servidors de seguretat...");

    for (let instance of INVIDIOUS_INSTANCES) {
        try {
            const url = `https://${instance}/api/v1/videos/${videoId}`;
            // ... (keep invidious logic as sequential last resort) ...

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) continue;

            const data = await response.json();
            if (!data.adaptiveFormats || data.adaptiveFormats.length === 0) continue;

            const audioFormats = data.adaptiveFormats.filter(f => f.type && f.type.includes('audio'))
                .sort((a, b) => {
                    // Prefer MP4/M4A
                    const getScore = (format) => {
                        let score = 0;
                        if (format.type && (format.type.includes('mp4') || format.type.includes('m4a'))) score += 1000;
                        if (format.bitrate) score += parseInt(format.bitrate) / 1000;
                        return score;
                    };
                    return getScore(b) - getScore(a);
                });

            if (audioFormats.length > 0) {
                console.log(`✅ Audio Invidious: ${instance}`);
                showToast("Reproduint...");
                return audioFormats[0].url;
            }
        } catch (error) { continue; }
    }

    throw new Error('No se pudo obtener audio de ninguna fuente (Piped/Invidious)');
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

        // Prefer M4A/MP4
        const audioStreams = data.audioStreams.sort((a, b) => {
            const getScore = (stream) => {
                let score = 0;
                if (stream.mimeType && stream.mimeType.includes('mp4')) score += 1000;
                if (stream.bitrate) score += stream.bitrate / 1000;
                return score;
            };
            return getScore(b) - getScore(a);
        });

        if (audioStreams.length > 0) {
            console.log(`✅ Piped winner: ${apiBase}`);
            showToast(`Connectat a ${apiBase.replace('https://', '').split('.')[0]}`);

            // Save winner for next time to make startup instant
            localStorage.setItem('amaya_fastest_server', apiBase);
            return audioStreams[0].url;
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
        // App went to background
        // Ensure audio context is passing time to keep the thread alive
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
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
            showToast("Cançó restringida. Cercant versió d'àudio compatible...", "error");

            try {
                // Background search for audio version - prioritize "Topic" and "Lyrics" for better compatibility
                const searchQuery = `${currentTrack.title} ${currentTrack.channel} topic audio`;
                const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(searchQuery)}&type=video&videoEmbeddable=true&videoSyndicated=true&videoCategoryId=10&key=${apiKey}`);
                const data = await response.json();

                if (data.items && data.items.length > 0) {
                    const item = data.items[0];
                    const fallbackSong = {
                        id: item.id.videoId,
                        title: decodeHtml(item.snippet.title),
                        channel: decodeHtml(item.snippet.channelTitle),
                        thumbnail: item.snippet.thumbnails.medium.url,
                        isFallback: true // mark to avoid infinite loops
                    };

                    showToast("Reproduint versió alternativa");
                    // Update current track in queue to avoid repeated failures if re-played
                    if (currentQueueIndex >= 0 && currentQueueIndex < queue.length) {
                        queue[currentQueueIndex] = fallbackSong;
                    }
                    playSong(fallbackSong, queue, true);
                    return;
                }
            } catch (fallbackError) {
                console.error("Fallback search failed:", fallbackError);
            }
        }

        showToast("No se pudo encontrar una versión compatible. Saltando...", "error");
    } else {
        showToast("Error de reproducción", "error");
    }

    // Final fallback: skip to next
    if (queue.length > 0) {
        setTimeout(() => playNext(), 2000);
    }
}

// --- API KEY MANAGEMENT ---
function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem('amaya_yt_key', key);
        document.getElementById('apiKeySection').classList.add('hidden');
        document.getElementById('apiKeyToggleButton').innerText = "Mostrar clau API";
        document.getElementById('apiWarning').classList.add('hidden');
        showToast("Clau API desada amb èxit");
    } else {
        showToast("Si us plau, introdueix una clau vàlida", "error");
    }
}

function toggleApiKeySection() {
    const section = document.getElementById('apiKeySection');
    const button = document.getElementById('apiKeyToggleButton');
    const isHidden = section.classList.toggle('hidden');
    button.innerText = isHidden ? "Mostrar clau API" : "Amagar clau API";
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
    showHome();
}

// --- SEARCH ---
async function searchMusic(pageToken = '') {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    if (!apiKey) {
        showToast("Configura la teva clau API primer", "error");
        document.getElementById('apiKeySection').classList.remove('hidden');
        return;
    }

    currentSearchQuery = query;
    if (!pageToken) currentSearchPage = 1;

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('homeSection').classList.add('hidden');
    document.getElementById('playlistView').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');

    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        nextSearchToken = data.nextPageToken || '';
        prevSearchToken = data.prevPageToken || '';

        const videos = data.items.map(item => ({
            id: item.id.videoId,
            title: decodeHtml(item.snippet.title),
            channel: decodeHtml(item.snippet.channelTitle),
            thumbnail: item.snippet.thumbnails.medium.url,
            duration: '0:00' // Search API doesn't give durations, we'll fetch them next
        }));

        // Fetch durations for these videos
        const ids = videos.map(v => v.id).join(',');
        const detailsResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${apiKey}`);
        const detailsData = await detailsResp.json();

        if (detailsData.items) {
            detailsData.items.forEach(item => {
                const video = videos.find(v => v.id === item.id);
                if (video) {
                    video.duration = parseISO8601Duration(item.contentDetails.duration);
                }
            });
        }

        renderSearchResults(videos);
        updateSearchPagination();
    } catch (error) {
        document.getElementById('errorText').innerText = "Error: " + error.message;
        document.getElementById('errorMessage').classList.remove('hidden');
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function renderSearchResults(videos) {
    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = '';

    if (videos.length === 0) {
        grid.innerHTML = '<div class="p-8 text-center text-gray-400">No s\'han trobat resultats</div>';
    } else {
        videos.forEach((video, index) => {
            const inQueue = isSongInQueue(video.id);
            const inQueueClass = inQueue ? 'text-green-500' : 'text-[#b3b3b3]';

            const row = document.createElement('div');
            row.className = 'result-row flex items-center gap-4 p-3 cursor-pointer group';
            row.dataset.videoId = video.id;
            row.onclick = () => playSong(video, [video]);

            row.innerHTML = `
                <div class="w-10 text-center text-sm text-[#b3b3b3] track-number group-hover:hidden">${(currentSearchPage - 1) * 20 + index + 1}</div>
                <div class="hidden group-hover:block w-10 text-center">
                    <svg class="w-4 h-4 text-white mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <img src="${video.thumbnail}" class="w-10 h-10 rounded object-cover">
                <div class="flex-1 min-w-0">
                    <div class="marquee-container">
                        <h3 class="text-white font-medium marquee-content">${video.title}</h3>
                    </div>
                    <p class="text-[#b3b3b3] text-sm truncate">${video.channel}</p>
                </div>
                <div class="flex items-center gap-2 transition-opacity">
                    <button onclick="event.stopPropagation(); addToQueue(${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                        class="queue-btn p-2 hover:text-white ${inQueueClass}" 
                        data-song-id="${video.id}"
                        title="Afegir a la cua">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); showAddToPlaylistMenu(event, ${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                        class="p-2 hover:text-white text-[#b3b3b3]" title="Afegir a la llista">
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

function searchNextPage() {
    if (nextSearchToken) {
        currentSearchPage++;
        searchMusic(nextSearchToken);
    }
}
function searchPrevPage() {
    if (prevSearchToken) {
        currentSearchPage--;
        searchMusic(prevSearchToken);
    }
}

function updateSearchPagination() {
    document.getElementById('nextPageBtn').disabled = !nextSearchToken;
    document.getElementById('prevPageBtn').disabled = !prevSearchToken;
    const info = document.getElementById('searchPageInfo');
    if (info) info.innerText = `Pàgina ${currentSearchPage}`;
}

// --- PLAYBACK ---
async function playSong(song, list = [], fromQueue = false) {
    isUserPaused = false; // Reset intent state: starting a song implies active user intent
    currentTrack = song;
    if (!fromQueue) {
        queue = [...list];
        currentQueueIndex = list.findIndex(s => s.id === song.id);
    }

    // Update Queue Count 2.0
    updateQueueCount();

    // Highlight active track in all lists
    highlightCurrentTrack(song.id);

    // CRITICAL MOBILE FIX: Initialize audio context IMMEDIATELY on user click
    try {
        startSilentAudio();

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
    } catch (e) { console.error("Early audio init failed", e); }

    // Update UI
    document.getElementById('playerSection').classList.remove('hidden');
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

    // Try native audio first
    if (useNativeAudio && nativeAudio) {
        try {
            console.log(`🎵 Intentando reproducir con audio nativo: ${song.title}`);
            const audioUrl = await getAudioUrl(song.id);

            nativeAudio.src = audioUrl;
            await nativeAudio.play();

            console.log('✅ Reproducción nativa exitosa');
        } catch (error) {
            console.error('❌ Error con audio nativo:', error);

            // Handle "NotAllowedError" (Autoplay blocked)
            if (error.name === 'NotAllowedError') {
                showToast("⚠️ Toca 'Play' per iniciar", "warning");
                // The user interaction requirement was lost during the async fetch.
                // We leave the player in "paused" state but with src loaded.
                // The user just needs to hit the main play button now.
                return;
            }
            console.log('📡 Usando motor secundario...');
            showToast('Fent servir reproductor secundari', 'info');
            useNativeAudio = false; // Disable for this session
            loadYouTubeIFrame(song.id);
        }
    } else {
        console.log('📡 Usando motor secundario directamente');
        loadYouTubeIFrame(song.id);
    }
}

// --- QUEUE MANAGEMENT ---
function isSongInQueue(songId) {
    return queue.some(s => s.id === songId);
}

function updateQueueIcons() {
    // Update all queue buttons in search results and playlists
    document.querySelectorAll('.queue-btn').forEach(btn => {
        const songId = btn.dataset.songId;
        if (isSongInQueue(songId)) {
            btn.classList.add('text-green-500');
            btn.classList.remove('text-[#b3b3b3]');
        } else {
            btn.classList.remove('text-green-500');
            btn.classList.add('text-[#b3b3b3]');
        }
    });
}

function addToQueue(song) {
    // Add to queue array
    queue.push(song);

    // Update visual count
    updateQueueCount();

    // Update icons colors
    updateQueueIcons();

    // Feedback
    showToast(`Afegit a la cua: ${song.title}`);
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
    console.log(`📺 Cargando YouTube IFrame para: ${videoId}`);

    if (isVideoReady && player && player.loadVideoById) {
        player.loadVideoById(videoId);
        player.playVideo();
    } else {
        console.log("Player not ready, retrying in 500ms...");
        setTimeout(() => loadYouTubeIFrame(videoId), 500);
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
    if (useNativeAudio && nativeAudio) {
        // Native audio control
        if (nativeAudio.paused) {
            nativeAudio.play();
        } else {
            isUserPaused = true;
            nativeAudio.pause();
        }
    } else if (player) {
        // YouTube IFrame control
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            isUserPaused = true;
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    }
}

function playNext() {
    if (repeatMode === 2) {
        if (useNativeAudio && nativeAudio) {
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
    showToast(isShuffle ? "Mode aleatori activat" : "Mode aleatori desactivat");
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    const btns = document.querySelectorAll('.repeat-btn, #repeatBtn');
    const labels = ["No repetir", "Repetir llista", "Repetir-ne una"];

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

function hideCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.add('hidden');
}

function createPlaylist() {
    const name = document.getElementById('newPlaylistName').value.trim();
    if (!name) return;

    const newPlaylist = {
        id: 'pl_' + Date.now(),
        name: name,
        description: '',
        cover: '',
        songs: []
    };

    playlists.push(newPlaylist);
    savePlaylists();
    renderPlaylists();
    hideCreatePlaylistModal();
    document.getElementById('newPlaylistName').value = '';
    showToast(`Llista "${name}" creada`);
}

function savePlaylists() {
    localStorage.setItem('amaya_playlists', JSON.stringify(playlists));
}

function renderPlaylists() {
    const sidebar = document.getElementById('playlistsSidebar');
    sidebar.innerHTML = '';

    if (playlists.length === 0) {
        sidebar.innerHTML = '<p class="text-xs text-center text-gray-500 py-4 px-2">Encara no tens cap llista. Crea la primera!</p>';
    }

    playlists.forEach(pl => {
        // Sidebar item
        const sideItem = document.createElement('div');
        sideItem.className = 'playlist-item flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a1a1a] cursor-pointer group transition-colors';
        sideItem.onclick = () => openPlaylist(pl.id);

        const coverImg = pl.cover || 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=100&h=100&fit=crop';
        sideItem.innerHTML = `
            <img src="${coverImg}" class="w-12 h-12 rounded object-cover shadow-md">
            <div class="flex-1 min-w-0">
                <p class="text-white text-sm font-semibold truncate">${pl.name}</p>
                <p class="text-[#b3b3b3] text-xs">${pl.songs.length} cançons</p>
            </div>
        `;
        sidebar.appendChild(sideItem);
    });

    // Also update the main library rows
    renderHomePlaylists();
}

let activePlaylistId = null;

function openPlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;

    activePlaylistId = id;
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('homeSection').classList.add('hidden');
    document.getElementById('playlistView').classList.remove('hidden');

    const totalSeconds = getPlaylistTotalDuration(pl);
    const durationStr = formatDuration(totalSeconds, true);

    document.getElementById('playlistTitle').innerText = pl.name;
    document.getElementById('playlistInfo').innerText = `${pl.songs.length} canç. • Total: ${durationStr}`;

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

    const songsList = document.getElementById('playlistSongs');
    songsList.innerHTML = '';

    if (pl.songs.length === 0) {
        songsList.innerHTML = '<div class="p-8 text-center text-gray-500">Aquesta llista està buida</div>';
    } else {
        pl.songs.forEach((song, index) => {
            const inQueue = isSongInQueue(song.id);
            const inQueueClass = inQueue ? 'text-green-500' : 'text-[#b3b3b3]';

            const row = document.createElement('div');
            row.className = 'result-row flex items-center gap-4 p-3 cursor-pointer group hover:bg-white/5';
            row.dataset.videoId = song.id;
            row.onclick = () => playSong(song, pl.songs);

            row.innerHTML = `
                <div class="w-10 text-center text-sm text-[#b3b3b3] group-hover:hidden">${index + 1}</div>
                <div class="hidden group-hover:block w-10 text-center">
                    <svg class="w-4 h-4 text-white mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <img src="${song.thumbnail}" class="w-10 h-10 rounded object-cover">
                <div class="flex-1 min-w-0">
                    <div class="marquee-container">
                        <h3 class="text-white font-medium marquee-content song-title">${song.title}</h3>
                    </div>
                    <p class="text-[#b3b3b3] text-sm truncate">${song.channel}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="event.stopPropagation(); addToQueue(${JSON.stringify(song).replace(/"/g, '&quot;')})" 
                        class="queue-btn p-2 hover:text-white ${inQueueClass}" 
                        data-song-id="${song.id}"
                        title="Afegir a la cua">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation(); removeSongFromPlaylist('${pl.id}', '${song.id}')" class="text-gray-500 hover:text-red-500 p-2 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity" title="Eliminar de la llista">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            `;
            songsList.appendChild(row);
        });
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
        items.innerHTML = '<p class="px-4 py-2 text-xs text-gray-500">No tens cap llista</p>';
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
                    showToast(`Afegit a ${pl.name}`);
                } else {
                    showToast("Ja és a la llista", "error");
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
    showToast("Cançó eliminada de la llista");
}

function triggerPlaylistCoverUpload() {
    document.getElementById('playlistCoverInput').click();
}

function handlePlaylistCoverChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const pl = playlists.find(p => p.id === activePlaylistId);
        if (pl) {
            pl.cover = e.target.result;
            savePlaylists();
            renderPlaylists();
            openPlaylist(activePlaylistId);
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
    showToast("Llista actualitzada");
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
    showToast("Llista eliminada");
}

function playCurrentPlaylist() {
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (pl && pl.songs.length > 0) {
        playSong(pl.songs[0], pl.songs);
    }
}

// --- QUEUE ---
function showQueue() {
    const modal = document.getElementById('queueModal');
    const content = document.getElementById('queueContent');
    content.innerHTML = '';

    if (queue.length === 0) {
        content.innerHTML = '<p class="text-center text-gray-500 py-8">La cua està buida</p>';
    } else {
        queue.forEach((song, index) => {
            const row = document.createElement('div');
            row.className = `flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer group ${index === currentQueueIndex ? 'bg-green-500/10' : ''}`;

            // Clicking the row plays the song
            row.onclick = () => {
                currentQueueIndex = index;
                playSong(song, queue, true);
                hideQueue();
            };

            row.innerHTML = `
                <span class="text-xs text-gray-500 w-4">${index + 1}</span>
                <img src="${song.thumbnail}" class="w-10 h-10 rounded object-cover">
                <div class="flex-1 min-w-0">
                    <div class="marquee-container">
                        <p class="text-white text-sm font-medium marquee-content ${index === currentQueueIndex ? 'text-green-500' : ''}">${song.title}</p>
                    </div>
                    <p class="text-gray-400 text-xs truncate">${song.channel}</p>
                </div>
                <button onclick="event.stopPropagation(); removeFromQueue(${index})" 
                    class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Eliminar de la cua">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>
            `;
            content.appendChild(row);
        });
    }

    modal.classList.remove('hidden');
    // Apply marquees to queue items
    content.querySelectorAll('.marquee-content').forEach(el => updateMarquee(el));
}

function removeFromQueue(index) {
    if (index === currentQueueIndex) {
        showToast("No pots eliminar la cançó que està sonant", "warning");
        return;
    }

    const removedSong = queue.splice(index, 1)[0];

    // Adjust currentQueueIndex if needed
    if (index < currentQueueIndex) {
        currentQueueIndex--;
    }

    showToast(`Eliminat: ${removedSong.title}`);
    updateQueueCount();
    updateQueueIcons();
    showQueue(); // Refresh the list
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
    showToast("Cua buidada");
}


function highlightCurrentTrack(videoId) {
    // Remove highlight from all rows
    document.querySelectorAll('.result-row').forEach(row => {
        row.classList.remove('is-playing');
    });

    // Add highlight to rows matching current videoId
    document.querySelectorAll(`.result-row[data-video-id="${videoId}"]`).forEach(row => {
        row.classList.add('is-playing');
    });
}

// --- UI UPDATES ---
function showHome() {
    document.getElementById('playlistView').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');

    const resultsGrid = document.getElementById('resultsGrid');
    const resultsSection = document.getElementById('resultsSection');
    const homeSection = document.getElementById('homeSection');

    // If there are search results, show resultsSection and hide homeSection
    if (resultsGrid && resultsGrid.children.length > 0) {
        resultsSection.classList.remove('hidden');
        homeSection.classList.add('hidden');
        if (currentTrack) highlightCurrentTrack(currentTrack.id);
    } else {
        // Show homeSection with playlists library
        resultsSection.classList.add('hidden');
        homeSection.classList.remove('hidden');
        renderHomePlaylists();
    }

    activePlaylistId = null;
}

function renderHomePlaylists() {
    const list = document.getElementById('homePlaylistsList');
    if (!list) return;

    list.innerHTML = '';

    if (playlists.length === 0) {
        list.innerHTML = `
            <div class="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p class="text-gray-400 mb-4">Encara no tens cap llista</p>
                <button onclick="showCreatePlaylistModal()" class="text-green-500 font-bold hover:underline">Comença'n a crear una aquí</button>
            </div>
        `;
        return;
    }

    playlists.forEach(pl => {
        const totalSeconds = getPlaylistTotalDuration(pl);
        const durationStr = formatDuration(totalSeconds, true);
        const coverImg = pl.cover || 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=300&h=300&fit=crop';

        const row = document.createElement('div');
        row.className = 'group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/10';
        row.onclick = () => openPlaylist(pl.id);

        row.innerHTML = `
            <div class="flex items-center gap-4 flex-1 min-w-0">
                <img src="${coverImg}" class="w-16 h-16 rounded-lg object-cover shadow-lg">
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-bold text-lg truncate">${pl.name}</h3>
                    <div class="flex items-center gap-2 text-gray-400 text-sm truncate">
                        <span>${pl.songs.length} canç.</span>
                        <span class="opacity-30">•</span>
                        <span>Total: ${durationStr}</span>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(row);
    });
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
        playSong(pl.songs[0], pl.songs);
    } else {
        showToast("Aquesta llista no té cançons", "error");
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    container.innerHTML = ''; // Overwrite previous notifications

    const toast = document.createElement('div');
    toast.className = `px-6 py-3 rounded-full text-white font-bold shadow-2xl transition-all translate-y-10 opacity-0 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);
}

let progressUpdaterInterval; // Renamed from progressInterval to avoid conflict and be more descriptive

// --- PROGRESS BAR ---
function updateProgressBar() {
    let currentTime, duration;

    if (useNativeAudio && nativeAudio && !nativeAudio.paused) {
        currentTime = nativeAudio.currentTime;
        duration = nativeAudio.duration;
    } else if (player && typeof player.getCurrentTime === 'function') {
        currentTime = player.getCurrentTime();
        duration = player.getDuration();
    } else {
        return;
    }

    if (!duration || isNaN(duration)) return;

    const progress = (currentTime / duration) * 100;

    // Update desktop progress
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const progressThumb = document.getElementById('progressThumb');

    if (progressBar) progressBar.value = progress;
    if (progressFill) progressFill.style.width = progress + '%';
    if (progressThumb) progressThumb.style.left = progress + '%';

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

    const mobileCurrentTime = document.getElementById('mobileCurrentTime');
    const mobileRemainingTime = document.getElementById('mobileRemainingTime');
    if (mobileCurrentTime) mobileCurrentTime.textContent = formatTime(currentTime);
    if (mobileRemainingTime) mobileRemainingTime.textContent = '-' + formatTime(duration - currentTime);

    // Update Media Session position state
    updateMediaSessionPosition();
}

function updateMediaSessionPosition() {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;

    let currentTime, duration, playbackRate;

    if (useNativeAudio && nativeAudio && !isNaN(nativeAudio.duration)) {
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
    progressUpdaterInterval = setInterval(updateProgressBar, 500);
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
            ${user.id === currentUser.id ? '<p class="text-green-500 text-[10px] uppercase font-black mt-2">Actiu</p>' : ''}
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
    showToast(`Usuari "${name}" creat`);
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
    showToast(`Canviat a ${currentUser.name}`);
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

    showToast("Llista exportada correctament");
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
                throw new Error("Format d'arxiu invàlid");
            }

            // Assign a new ID to avoid collisions
            importedPl.id = 'pl_' + Date.now();

            playlists.push(importedPl);
            savePlaylists();
            renderPlaylists();
            showToast(`Llista "${importedPl.name}" importada`);

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

// Background playback recovery & Heartbeat
let wasPlaying = false;
let heartbeatInterval = null;

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (!useNativeAudio && player && player.getPlayerState) {
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
        const deep = `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 1)`;

        bg.style.background = `radial - gradient(circle at 30 % 30 %, ${accent}, transparent 40 %),
            radial - gradient(circle at 70 % 70 %, rgba(100, 50, 255, 0.08), transparent 40 %),
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
