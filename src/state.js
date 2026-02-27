// --- SHARED GLOBAL STATE ---
export const state = {
    currentUserUid: null,
    sharedPlaylistData: null,
    player: null,
    isVideoReady: false,
    currentTrack: null,
    playlist: [], // Current view
    queue: [],
    currentQueueIndex: -1,
    currentlyPlayingPlaylistId: localStorage.getItem('amaya_playing_pl_id') || null,
    playlists: JSON.parse(localStorage.getItem('amaya_playlists')) || [],
    apiKeys: JSON.parse(localStorage.getItem('amaya_yt_keys')) || [],
    currentKeyIndex: parseInt(localStorage.getItem('amaya_yt_key_index')) || 0,

    // DJ Mode
    djSessionId: null,
    djSessionUnsubscribe: null,
    isDjHost: false,

    // Internal Keys (Obfuscated)
    _D_K: [
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
        "QUl6YVN5QjU5S19Ka2tqdkNZUS15U0E3UF9GMDF6UlF0SGRXUkhR"
    ],

    // Settings
    isShuffle: localStorage.getItem('amaya_shuffle') === 'true',
    repeatMode: 0, // 0: No, 1: PL, 2: Track
    nextSearchToken: '',
    prevSearchToken: '',
    currentSearchQuery: '',
    currentSearchPage: 1
};
