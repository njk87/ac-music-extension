// Chrome MV3 port: browser events, storage, weather and durable scheduling live here.
'use strict';
importScripts('Utility.js', 'PlaybackState.js');

const PLAYER_URL = chrome.runtime.getURL('offscreen.html');
const CLOCK_ALARM = 'ac-clock';
const WEATHER_ALARM = 'ac-weather';
let queue = Promise.resolve();
let creatingPlayer;

function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(reportError);
    return result;
}

async function reportError(error) {
    console.error('Animal Crossing Music:', error);
    await chrome.action.setBadgeText({text: 'x'});
    await chrome.action.setBadgeBackgroundColor({color: '#e60000'});
    await chrome.action.setTitle({title: `Animal Crossing Music: ${error.message || error}`});
}

async function hasPlayer() {
    return (await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [PLAYER_URL]})).length > 0;
}

async function ensurePlayer() {
    if (creatingPlayer) return creatingPlayer;
    if (await hasPlayer()) return;
    creatingPlayer = chrome.offscreen.createDocument({
        url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play hourly Animal Crossing music and town tunes while browsing.'
    });
    try { await creatingPlayer; } finally { creatingPlayer = null; }
}

async function playerMessage(message) {
    return chrome.runtime.sendMessage({target: 'ac-player', ...message});
}

async function ensureAlarms() {
    // Recreate missing alarms on every worker start; Chrome can clear them on restart.
    if (!await chrome.alarms.get(CLOCK_ALARM)) {
        const nextMinute = Math.floor(Date.now() / 60000) * 60000 + 60000;
        await chrome.alarms.create(CLOCK_ALARM, {when: nextMinute, periodInMinutes: 1});
    }
    if (!await chrome.alarms.get(WEATHER_ALARM)) {
        await chrome.alarms.create(WEATHER_ALARM, {periodInMinutes: 10});
    }
}

async function getWeather(options, force) {
    const {weatherCache} = await chrome.storage.session.get('weatherCache');
    const location = `${options.countryCode}/${options.zipCode}`;
    if (!force && weatherCache?.location === location && Date.now() - weatherCache.updated < 600000) return weatherCache.weather;
    try {
        const response = await fetch(`https://acmusicext.com/api/weather-v1/${encodeURIComponent(options.countryCode)}/${encodeURIComponent(options.zipCode)}`, {signal: AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
        const data = await response.json();
        if (typeof data.weather !== 'string') throw new Error('Invalid weather response');
        await chrome.storage.session.set({weatherCache: {location, weather: data.weather, updated: Date.now()}});
        return data.weather;
    } catch (error) {
        console.warn('Live weather unavailable; using the last known weather or sunny music.', error);
        const fallback = weatherCache?.location === location ? weatherCache.weather : 'Clear';
        await chrome.storage.session.set({weatherCache: {location, weather: fallback, updated: Date.now() - 540000}});
        return fallback;
    }
}

async function updateBadge(plan, options, audible, status = {}) {
    const tabPaused = audible && options.tabAudio === 'pause';
    let icon = options.paused || tabPaused ? 'paused' : plan.mode === 'kk' ? 'kk' : plan.weather;
    let text = options.paused ? '' : tabPaused ? 'll' : options.enableBadgeText ? plan.mode === 'kk' ? 'KK' : formatHour(plan.hour) : '';
    if (status.error && !options.paused) text = 'x';
    const directory = icon === 'kk' ? 'img/icons/kk' : `img/icons/status/${icon}`;
    await Promise.all([
        chrome.action.setBadgeText({text}),
        chrome.action.setBadgeBackgroundColor({color: status.error ? '#e60000' : '#39e600'}),
        chrome.action.setIcon({path: {32: chrome.runtime.getURL(`${directory}/32.png`), 64: chrome.runtime.getURL(`${directory}/64.png`), 128: chrome.runtime.getURL(`${directory}/128.png`)}}),
        chrome.action.setTitle({title: status.error ? 'Animal Crossing Music: audio could not be loaded. Check your connection and the music server.' : `Animal Crossing Music — ${options.paused ? 'Paused' : tabPaused ? 'Paused for another tab' : plan.mode === 'kk' ? 'K.K. Slider' : `${formatHour(plan.hour)} (${plan.weather})`}`})
    ]);
}

async function notify(message, icon = 'clock') {
    await chrome.notifications.create('animal-crossing-music', {
        type: 'basic', title: 'Animal Crossing Music',
        iconUrl: chrome.runtime.getURL(`img/${icon}.png`), silent: true, message
    });
}

async function reconcile({weather = false} = {}) {
    const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
    const {playbackState = {}, lastPlanKey} = await chrome.storage.session.get(['playbackState', 'lastPlanKey']);
    const liveWeather = options.weather === 'live' ? await getWeather(options, weather) : 'Clear';
    const selection = selectPlayback(options, playbackState, new Date(), liveWeather);
    const {plan, hourChanged} = selection;
    await chrome.storage.session.set({playbackState: selection.state, lastPlanKey: plan.key});
    const tabs = await chrome.tabs.query({});
    const audible = tabs.some(tab => tab.audible && !tab.mutedInfo?.muted);
    const browserOpen = options.enableBackground || tabs.length > 0;
    const shouldPlay = !options.paused && browserOpen;
    const playTownTune = hourChanged && browserOpen && options.enableTownTune && options.absoluteTownTune && options.paused && plan.mode !== 'kk' && !(audible && options.tabAudio === 'pause');
    let status = {};
    if ((shouldPlay && !(audible && options.tabAudio === 'pause')) || playTownTune) await ensurePlayer();
    if (await hasPlayer()) {
        status = await playerMessage({type: 'configure', options, plan, audible, shouldPlay, playTownTune, allowTownTune: browserOpen,
            hourChanged: hourChanged && plan.mode === 'hourly'}) || {};
    }
    await updateBadge(plan, {...options, paused: !shouldPlay}, audible, status);
    if (shouldPlay && options.enableNotifications && lastPlanKey !== plan.key && plan.mode === 'hourly') {
        await notify(`It is now ${formatHour(plan.hour)} and ${plan.weather}`);
    }
}

// All event listeners are registered synchronously so they survive worker suspension.
chrome.action.onClicked.addListener(() => {
    enqueue(async () => {
        const {paused} = await chrome.storage.sync.get(DEFAULT_OPTIONS);
        await chrome.storage.sync.set({paused: !paused});
        await reconcile();
    });
});
chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') enqueue(() => reconcile());
});
chrome.tabs.onUpdated.addListener((_id, change) => {
    if ('audible' in change || 'mutedInfo' in change) enqueue(() => reconcile());
});
chrome.tabs.onCreated.addListener(() => enqueue(() => reconcile()));
chrome.tabs.onRemoved.addListener(() => enqueue(() => reconcile()));
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === CLOCK_ALARM || alarm.name === WEATHER_ALARM) enqueue(() => reconcile({weather: alarm.name === WEATHER_ALARM}));
});
chrome.runtime.onInstalled.addListener(() => enqueue(async () => {await ensureAlarms(); await reconcile();}));
chrome.runtime.onStartup.addListener(() => enqueue(async () => {await ensureAlarms(); await reconcile();}));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.target !== 'ac-worker' || sender.id !== chrome.runtime.id || sender.url !== PLAYER_URL) return;
    const result = enqueue(async () => {
        if (message.type === 'set-playing') {
            await chrome.storage.sync.set({paused: !message.playing});
            await reconcile();
        } else if (message.type === 'status') {
            const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
            const {playbackState = {}} = await chrome.storage.session.get('playbackState');
            const {weatherCache} = await chrome.storage.session.get('weatherCache');
            const {plan} = selectPlayback(options, playbackState, new Date(), weatherCache?.weather);
            const tabs = await chrome.tabs.query({audible: true, muted: false});
            await updateBadge(plan, options, tabs.length > 0, message);
            if (message.songTitle && options.enableNotifications && !options.paused) await notify(`K.K. Slider is now playing ${message.songTitle}`, 'kk');
        }
        return {ok: true};
    });
    result.then(sendResponse, error => sendResponse({error: error.message}));
    return true;
});

enqueue(async () => {await ensureAlarms(); await reconcile();});
