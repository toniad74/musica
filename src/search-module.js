import { state } from './state.js';
import { ui } from './ui-module.js';
import { getApiKey, rotateApiKey } from './api-utils.js';
import { decodeHtml, parseISO8601Duration, parseISO8601DurationInSeconds } from './utils.js';
import { switchTab } from './app-logic.js';

const HISTORY_KEY = 'amaya_search_history';

export const searchManager = {
    async getSearchHistory() {
        const history = localStorage.getItem(HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    },

    async saveToHistory(query) {
        let history = await this.getSearchHistory();
        history = history.filter(q => q !== query);
        history.unshift(query);
        history = history.slice(0, 5);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        this.renderHistory();
    },

    async fetchSuggestions(query) {
        if (!query || query.length < 3) return [];
        try {
            const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
            const response = await fetch(url);
            const data = await response.json();
            return data[1] || [];
        } catch (e) {
            console.warn("Could not fetch suggestions:", e);
            return [];
        }
    },

    renderHistory() {
        const container = document.getElementById('searchHistoryContainer');
        if (!container) return;

        this.getSearchHistory().then(history => {
            if (history.length === 0) {
                container.classList.add('hidden');
                return;
            }
            container.classList.remove('hidden');
            container.innerHTML = `
                <p class="text-[10px] text-gray-400 uppercase font-black mb-2 opacity-60">Búsquedas Recientes</p>
                <div class="flex flex-wrap gap-2">
                    ${history.map(q => `
                        <button class="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            ${q}
                        </button>
                    `).join('')}
                </div>
            `;
            container.querySelectorAll('button').forEach((btn, idx) => {
                btn.onclick = () => {
                    const input = document.getElementById('searchInput');
                    if (input) {
                        input.value = history[idx];
                        this.performSearch(history[idx]);
                    }
                }
            });
        });
    },

    async performSearch(queryText, pageToken = '', retryCount = 0) {
        if (!queryText) return;
        state.currentSearchQuery = queryText;
        this.saveToHistory(queryText);

        switchTab('search');
        const resultsGrid = document.getElementById('resultsGrid');
        const loading = document.getElementById('loading');
        if (loading) loading.classList.remove('hidden');

        try {
            const currentKey = getApiKey();
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(queryText)}&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&key=${currentKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                if (retryCount < state._D_K.length) {
                    rotateApiKey();
                    return this.performSearch(queryText, pageToken, retryCount + 1);
                }
                throw new Error(data.error.message);
            }

            state.nextSearchToken = data.nextPageToken || '';
            state.prevSearchToken = data.prevPageToken || '';

            const videos = data.items.map(item => ({
                id: item.id.videoId,
                title: decodeHtml(item.snippet.title),
                channel: decodeHtml(item.snippet.channelTitle),
                thumbnail: item.snippet.thumbnails.medium.url,
                duration: '0:00'
            }));

            // Fetch durations
            try {
                const ids = videos.map(v => v.id).join(',');
                const dResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${getApiKey()}`);
                const dData = await dResp.json();
                if (dData.items) {
                    dData.items.forEach(item => {
                        const v = videos.find(vid => vid.id === item.id);
                        if (v) {
                            v.duration = parseISO8601Duration(item.contentDetails.duration);
                            v.durationSec = parseISO8601DurationInSeconds(item.contentDetails.duration);
                        }
                    });
                }
            } catch (e) { console.warn("Durations error:", e); }

            this.renderSearchResults(videos);

        } catch (error) {
            console.error("Search error:", error);
            ui.showToast("Error en la búsqueda", "error");
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    },

    renderSearchResults(videos) {
        const grid = document.getElementById('resultsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        if (videos.length === 0) {
            grid.innerHTML = '<div class="p-8 text-center text-gray-400">No se han encontrado resultados</div>';
            return;
        }

        videos.forEach((video, index) => {
            const row = document.createElement('div');
            row.className = `p-3 flex items-center gap-4 hover:bg-white/5 cursor-pointer rounded-lg transition-all group`;
            row.innerHTML = `
                <div class="w-8 text-center text-xs text-gray-500 group-hover:hidden">${index + 1}</div>
                <div class="hidden group-hover:block w-8 text-center text-green-500">
                    <svg class="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <img src="${video.thumbnail}" class="w-10 h-10 rounded object-cover shadow-lg">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-white truncate">${video.title}</p>
                    <p class="text-xs text-gray-400 truncate opacity-60">${video.channel}</p>
                </div>
                <div class="text-xs text-gray-500">${video.duration}</div>
                <button class="p-2 text-gray-400 hover:text-white transition-colors" onclick="event.stopPropagation(); window.addToQueue(${JSON.stringify(video).replace(/"/g, '&quot;')})">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
            `;
            row.onclick = () => window.playerManager.playSong(video);
            grid.appendChild(row);
        });
    }
};
