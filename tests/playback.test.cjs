// Run with Node.js: node --test tests/playback.test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/background/PlaybackState.js'), 'utf8'), context);
const {selectPlayback, DEFAULT_OPTIONS} = context;
const at = (hour, minute = 0, day = 17) => new Date(2026, 9, day, hour, minute);
const options = values => ({...DEFAULT_OPTIONS, ...values});

test('hourly selection follows local time and dates', () => {
 const first = selectPlayback(options({enableKK: false}), {}, at(9));
 const second = selectPlayback(options({enableKK: false}), first.state, at(10));
 assert.equal(second.plan.hour, 10);
 assert.equal(second.hourChanged, true);
 const nextDay = selectPlayback(options({enableKK: false}), first.state, at(9, 0, 18));
 assert.equal(nextDay.hourChanged, true);
 assert.notEqual(nextDay.plan.key, first.plan.key);
});
test('K.K. Saturday schedule starts at 8pm and ends on Sunday', () => {
 assert.equal(selectPlayback(DEFAULT_OPTIONS, {}, at(19)).plan.mode, 'hourly');
 assert.equal(selectPlayback(DEFAULT_OPTIONS, {}, at(20)).plan.mode, 'kk');
 assert.equal(selectPlayback(DEFAULT_OPTIONS, {}, at(0, 0, 18)).plan.mode, 'hourly');
 assert.equal(selectPlayback(options({alwaysKK: true}), {}, at(9)).plan.mode, 'kk');
});
test('live weather mapping and original-game rain fallback', () => {
 assert.equal(selectPlayback(options({weather: 'live'}), {}, at(9), 'Rain').plan.weather, 'raining');
 assert.equal(selectPlayback(options({weather: 'live'}), {}, at(9), 'Snow').plan.weather, 'snowing');
 assert.equal(selectPlayback(options({music: 'animal-crossing', weather: 'raining'}), {}, at(9)).plan.weather, 'snowing');
});
test('random selections persist across service worker restarts', () => {
 const opts = options({music: 'game-random', weather: 'weather-random'});
 const first = selectPlayback(opts, {}, at(9), 'Clear', () => 0);
 const same = selectPlayback(opts, first.state, at(9, 3), 'Clear', () => .99);
 assert.equal(same.plan.key, first.plan.key);
});
test('alternating random music and weather rotate each quarter without repeating', () => {
 const opts = options({music: 'game-random', weather: 'weather-random', alternatingMusic: true, alternatingWeather: true});
 const first = selectPlayback(opts, {}, at(9), 'Clear', () => 0);
 const next = selectPlayback(opts, first.state, at(9, 15), 'Clear', () => 0);
 assert.notEqual(next.plan.game, first.plan.game);
 assert.notEqual(next.plan.weather, first.plan.weather);
});
test('non-alternating random choices remain for the hour', () => {
 const opts = options({music: 'game-random'});
 const first = selectPlayback(opts, {}, at(9), 'Clear', () => 0);
 const quarter = selectPlayback(opts, first.state, at(9, 15), 'Clear', () => .99);
 assert.equal(quarter.plan.game, first.plan.game);
 const hour = selectPlayback(opts, quarter.state, at(10), 'Clear', () => .99);
 assert.notEqual(hour.plan.game, first.plan.game);
});
test('K.K. selection and version changes refresh the playlist', () => {
 const initial = selectPlayback(options({alwaysKK: true}), {}, at(9));
 const changed = selectPlayback(options({alwaysKK: true, kkVersion: 'aircheck'}), initial.state, at(9));
 assert.notEqual(changed.plan.key, initial.plan.key);
 const playlist = selectPlayback(options({alwaysKK: true, kkSelectedSongsEnable: true, kkSelectedSongs: ['test']}), initial.state, at(9));
 assert.notEqual(playlist.plan.key, initial.plan.key);
});
test('MV3 manifest and all packaged local script references are valid', () => {
 const root = path.join(__dirname, '..');
 const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
 assert.equal(manifest.manifest_version, 3);
 assert.equal(manifest.background.service_worker, 'scripts/background/service-worker.js');
 assert.ok(manifest.permissions.includes('offscreen'));
 assert.ok(!manifest.permissions.some(value => value.startsWith('http')));
 for (const name of ['options.html', 'offscreen.html']) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
   assert.ok(fs.existsSync(path.join(root, src)), src);
   new vm.Script(fs.readFileSync(path.join(root, src), 'utf8'), {filename: src});
  }
 }
 new vm.Script(fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8'));
});
