import { state } from './state.js';
import { ui } from './ui-module.js';

let audioElement = null;
let audioContext = null;
let analyzer = null;
let dataArray = null;

export const playerManager = {
    init() {
        console.log("🎵 Player Module initialized");
        // Placeholder for future init logic (e.g., volume setup)
    },
    playSong(track, plId) {
        state.currentTrack = track;
        state.currentlyPlayingPlaylistId = plId;
        localStorage.setItem('amaya_playing_pl_id', plId);

        if (track.isNative) {
            this.playNative(track);
        } else {
            this.playYouTube(track.id);
        }

        ui.updateMarquee(track.title, 'marqueeTitle');
        this.updateNowPlayingUI(track);
    },

    playYouTube(videoId) {
        if (audioElement) {
            audioElement.pause();
            audioElement = null;
        }

        if (state.player && state.isVideoReady) {
            state.player.loadVideoById(videoId);
            state.player.playVideo();
        } else {
            console.warn("YouTube player not ready yet.");
        }
    },

    playNative(track) {
        if (state.player) state.player.pauseVideo();

        if (audioElement) audioElement.pause();
        audioElement = new Audio(track.url);

        // --- Point 4: Visualizer Setup ---
        this.setupVisualizer(audioElement);

        audioElement.play();

        audioElement.onended = () => {
            this.playNext();
        };

        audioElement.onerror = () => {
            ui.showToast("Error al reproducir audio nativo", "error");
            this.playNext();
        };
    },

    setupVisualizer(element) {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            const source = audioContext.createMediaElementSource(element);
            analyzer = audioContext.createAnalyser();
            source.connect(analyzer);
            analyzer.connect(audioContext.destination);

            analyzer.fftSize = 256;
            const bufferLength = analyzer.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);

            this.animateVisualizer();
        } catch (e) {
            console.warn("Could not setup audio visualizer:", e);
        }
    },

    animateVisualizer() {
        if (!analyzer) return;
        requestAnimationFrame(() => this.animateVisualizer());

        analyzer.getByteFrequencyData(dataArray);

        // Render to canvas (Point 4)
        const canvas = document.getElementById('visualizerCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const barWidth = (width / dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * height;

            ctx.fillStyle = `rgba(30, 215, 96, ${0.4 + (barHeight / height)})`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    },

    updateNowPlayingUI(track) {
        const titleElements = document.querySelectorAll('.current-track-title');
        const artistElements = document.querySelectorAll('.current-track-artist');
        const coverElements = document.querySelectorAll('.current-track-cover');

        titleElements.forEach(el => el.innerText = track.title);
        artistElements.forEach(el => el.innerText = track.artist || 'Artista Desconocido');
        coverElements.forEach(el => el.src = track.thumbnail || track.cover || 'img/default-cover.png');

        // Sync Lyrics logic (Point 4)
        if (track.lyrics) {
            this.renderSyncedLyrics(track.lyrics);
        }
    },

    renderSyncedLyrics(lyrics) {
        const container = document.getElementById('lyricsContent');
        if (!container) return;

        // Simple implementation for now, will improve with timestamps
        container.innerHTML = lyrics.replace(/\n/g, '<br>');
    },

    playNext() {
        // This will call the playlist manager
    },

    playPrev() {
        // This will call the playlist manager
    }
};
