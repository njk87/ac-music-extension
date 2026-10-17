// Only chrome.runtime is available in an offscreen document.
'use strict';
function sendPlayerStatus(status) {
    chrome.runtime.sendMessage({target: 'ac-worker', type: 'status', ...status}).catch(console.error);
}
const player = new AudioManager(sendPlayerStatus);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.target !== 'ac-player' || sender.id !== chrome.runtime.id) return;
    if (message.type === 'configure') {
        if ('mediaSession' in navigator) navigator.mediaSession.setActionHandler('nexttrack',
            message.plan.mode === 'kk' ? () => player.nextTrack() : null);
        player.configure(message);
        sendResponse(player.getStatus());
    } else if (message.type === 'status') {
        sendResponse(player.getStatus());
    }
});
if ('mediaSession' in navigator) {
    for (const [action, playing] of [['play', true], ['pause', false], ['stop', false]]) {
        navigator.mediaSession.setActionHandler(action, () => {
            chrome.runtime.sendMessage({target: 'ac-worker', type: 'set-playing', playing}).catch(console.error);
        });
    }
}
