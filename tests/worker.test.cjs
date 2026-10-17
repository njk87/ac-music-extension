const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = path.join(__dirname, '../scripts/background');

function event() {
 const listeners = [];
 return {addListener: listener => listeners.push(listener), emit: (...args) => listeners.forEach(listener => listener(...args))};
}
async function fixture(initial = {}) {
 const messages = [];
 const errors = [];
 const alarms = {};
 const stored = {sync: {...initial}, session: {}};
 const tabs = [{id: 1, audible: false, mutedInfo: {muted: false}}];
 let player = false;
 const onChanged = event();
 const storage = Object.fromEntries(['sync', 'session'].map(area => [area, {
  get: async keys => keys == null ? {...stored[area]} : typeof keys === 'string' ? {[keys]: stored[area][keys]} : Array.isArray(keys) ? Object.fromEntries(keys.map(key => [key, stored[area][key]])) : {...keys, ...stored[area]},
  set: async values => {
   const changes = {};
   for (const [key, value] of Object.entries(values)) {
    if (JSON.stringify(value) !== JSON.stringify(stored[area][key])) changes[key] = {oldValue: stored[area][key], newValue: value};
    stored[area][key] = value;
   }
   if (Object.keys(changes).length) onChanged.emit(changes, area);
  }
 }]));
 storage.onChanged = onChanged;
 const chrome = {
  storage,
  action: {onClicked: event(), setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {},
   setIcon: async ({path: icons}) => {assert.ok(Object.values(icons).every(url => url.startsWith('chrome-extension://test/')));}},
  runtime: {id: 'test', getURL: value => `chrome-extension://test/${value}`, onMessage: event(), onStartup: event(), onInstalled: event(),
   getContexts: async () => player ? [{}] : [],
   sendMessage: async message => {messages.push(message);return {}; }},
  offscreen: {createDocument: async () => {assert.equal(player, false);player = true;}},
  alarms: {get: async name => alarms[name], create: async (name, value) => {alarms[name] = value;}, onAlarm: event()},
  tabs: {onUpdated: event(), onCreated: event(), onRemoved: event(), query: async query => tabs.filter(tab => !query.audible || tab.audible && !tab.mutedInfo.muted)},
  notifications: {create: async () => {}}
 };
 const sandbox = vm.createContext({chrome, navigator: {}, Date, AbortSignal,
  console: {error: (...args) => errors.push(args), warn: () => {}, log: () => {}},
  fetch: async () => ({ok: true, json: async () => ({weather: 'Rain'})})});
 sandbox.importScripts = (...names) => names.forEach(name => vm.runInContext(fs.readFileSync(path.join(directory, name), 'utf8'), sandbox));
 vm.runInContext(fs.readFileSync(path.join(directory, 'service-worker.js'), 'utf8'), sandbox);
 async function settle() {
  for (let i = 0; i < 5; i++) await vm.runInContext('queue', sandbox);
  assert.deepEqual(errors, []);
 }
 await settle();
 return {chrome, messages, alarms, stored, tabs, settle};
}

test('worker creates durable alarms and starts the offscreen player', async () => {
 const f = await fixture();
 assert.equal(f.alarms['ac-clock'].periodInMinutes, 1);
 assert.equal(f.alarms['ac-weather'].periodInMinutes, 10);
 assert.equal(f.messages.at(-1).shouldPlay, true);
});
test('toolbar clicks toggle the persisted paused setting', async () => {
 const f = await fixture();
 f.chrome.action.onClicked.emit(); await f.settle();
 assert.equal(f.stored.sync.paused, true);
 assert.equal(f.messages.at(-1).shouldPlay, false);
 f.chrome.action.onClicked.emit(); await f.settle();
 assert.equal(f.stored.sync.paused, false);
 assert.equal(f.messages.at(-1).shouldPlay, true);
});
test('audible and muted tab events forward the correct playback state', async () => {
 const f = await fixture();
 f.tabs[0].audible = true;
 f.chrome.tabs.onUpdated.emit(1, {audible: true}); await f.settle();
 assert.equal(f.messages.at(-1).audible, true);
 f.tabs[0].mutedInfo.muted = true;
 f.chrome.tabs.onUpdated.emit(1, {mutedInfo: {muted: true}}); await f.settle();
 assert.equal(f.messages.at(-1).audible, false);
});
test('closing all tabs pauses unless background playback is enabled', async () => {
 const f = await fixture();
 f.tabs.length = 0;
 f.chrome.tabs.onRemoved.emit(1); await f.settle();
 assert.equal(f.messages.at(-1).shouldPlay, false);
 await f.chrome.storage.sync.set({enableBackground: true}); await f.settle();
 assert.equal(f.messages.at(-1).shouldPlay, true);
});
test('an hourly alarm can play an absolute town tune while music is paused', async () => {
 const f = await fixture({paused: true, absoluteTownTune: true, enableTownTune: true, enableKK: false});
 f.stored.session.playbackState.hourKey = 'previous-hour';
 f.chrome.alarms.onAlarm.emit({name: 'ac-clock'}); await f.settle();
 assert.equal(f.messages.at(-1).playTownTune, true);
 assert.equal(f.messages.at(-1).shouldPlay, false);
});
test('live weather is fetched and cached in session storage', async () => {
 const f = await fixture({weather: 'live', enableKK: false});
 assert.equal(f.stored.session.weatherCache.weather, 'Rain');
 assert.equal(f.messages.at(-1).plan.weather, 'raining');
});
