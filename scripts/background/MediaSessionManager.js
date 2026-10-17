// Chrome MV3 port: artwork URLs resolve from the extension root.
'use strict';
function MediaSessionManager() {
    const names = {'animal-crossing': 'Animal Crossing', 'wild-world': 'Animal Crossing: Wild World',
        'new-leaf': 'Animal Crossing: New Leaf', 'new-horizons': 'Animal Crossing: New Horizons'};
    this.updateMetadata = function(game, hour, weather) {
        if (!supportsMediaSession) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `${formatHour(hour)} (${capitalize(weather)})`, artist: names[game], album: 'Animal Crossing Music',
            artwork: [{src: chrome.runtime.getURL(`img/cover/${game}.png`), sizes: '512x512', type: 'image/png'}]
        });
    };
    this.updateMetadataKK = function(title, song) {
        if (!supportsMediaSession) return;
        navigator.mediaSession.metadata = new MediaMetadata({title, artist: 'K.K. Slider', album: 'Animal Crossing Music',
            artwork: [{src: `https://acmusicext.com/static/kk/art/${encodeURIComponent(song)}.png`, sizes: '128x128', type: 'image/png'}]});
    };
}
