import { state } from './state.js';

export function getApiKey() {
    const keys = state._D_K.map(k => atob(k));
    const combined = [...keys, ...state.apiKeys.map(k => k.key)];

    if (state.currentKeyIndex >= combined.length) {
        state.currentKeyIndex = 0;
    }

    return combined[state.currentKeyIndex];
}

export function rotateApiKey() {
    const keys = state._D_K.map(k => atob(k));
    const combined = [...keys, ...state.apiKeys.map(k => k.key)];

    state.currentKeyIndex = (state.currentKeyIndex + 1) % combined.length;
    localStorage.setItem('amaya_yt_key_index', state.currentKeyIndex);
    console.log(`[API] Rotated to key #${state.currentKeyIndex}`);
}
