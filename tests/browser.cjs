const {chromium} = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn, description, timeout = 20000) {
 const end = Date.now() + timeout;
 let last;
 while (Date.now() < end) {
  try {last = await fn(); if (last) {checks.push(description); console.log('PASS', description); return last;}} catch (e) {last = e.message;}
  await wait(200);
 }
 throw new Error(`Timed out: ${description} (${JSON.stringify(last)})`);
}
(async () => {
 const extension = path.resolve(__dirname, '..');
 const workDirectory = path.join(extension, 'work');
 fs.mkdirSync(workDirectory, {recursive: true});
 const context = await chromium.launchPersistentContext(path.join(workDirectory, `chrome-integration-profile-${Date.now()}`), {
  executablePath: process.env.AC_TEST_BROWSER || undefined, headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--mute-audio', '--no-first-run']
 });
 const errors = [];
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  worker.on('console', msg => {if (msg.type() === 'error') errors.push(msg.text());});
  const origin = worker.url().split('/scripts/')[0];
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const failedRequests = [];
  page.on('response', response => {if (response.status() >= 400) failedRequests.push([response.status(), response.url()]);});
  await page.goto(origin + '/options.html');
  const set = values => page.evaluate(values => chrome.storage.sync.set(values), values);
  const status = () => page.evaluate(() => chrome.runtime.sendMessage({target: 'ac-player', type: 'status'}));
  await set({enableNotifications: false, paused: false, music: 'new-horizons', weather: 'sunny', alwaysKK: false, enableKK: false});
  await eventually(async () => {const s=await status(); return !s.paused && s.currentTime > 0 && !s.error;}, 'Remote hourly music plays in the offscreen document');
  assert.equal(await page.locator('#version-number').textContent(), 'Version 4.3.0');
  assert.equal(await page.locator('.pitch').count(), 16);
  checks.push('Options and sixteen-note town tune editor initialize');
  await page.locator('#volume').fill('0.3');
  await page.locator('#volume').dispatchEvent('change');
  await eventually(async () => Math.abs((await status()).volume - .3) < .001, 'Options volume changes reach the offscreen audio');
  await set({paused: true});
  await eventually(async () => (await status()).paused, 'Pausing stops music');
  await set({paused: false});
  await eventually(async () => !(await status()).paused, 'Resuming restarts music');
  await set({music: 'animal-crossing', weather: 'raining'});
  await eventually(async () => {const s = await status(); return !s.transition && !s.paused && s.currentSrc.includes('/animal-crossing/snowing/') && !s.error;}, 'Original Animal Crossing rain correctly falls back to snow music');
  await set({alwaysKK: true, kkVersion: 'aircheck'});
  await eventually(async () => {const s = await status(); return !s.transition && !s.paused && s.currentSrc.includes('/kk/aircheck/') && !s.error;}, 'K.K. Slider aircheck music plays');
  await set({alwaysKK: false, music: 'new-leaf', weather: 'sunny', tabAudio: 'pause'});
  await eventually(async () => {const s=await status(); return !s.transition && !s.paused && s.currentSrc.includes('/new-leaf/sunny/');}, 'Switching out of K.K. mode restores hourly music');
  // Headless --mute-audio suppresses Chrome's audible flag. Exercise player handling
  // with synthetic audible messages; worker tab-event routing has separate mock tests.
  const configureAudible = async (audible, tabAudio) => {
   const current = await status();
   return page.evaluate(async ({audible, tabAudio, current}) => {
    const options = await chrome.storage.sync.get(null);
    const plan = JSON.parse(current.planKey)[0]; plan.key = current.planKey;
    return chrome.runtime.sendMessage({target: 'ac-player', type: 'configure',
     options: {...options, volume: .5, tabAudioReduceValue: 80, tabAudio},
     plan, audible, shouldPlay: true, hourChanged: false});
   }, {audible, tabAudio, current});
  };
  await configureAudible(true, 'pause');
  await eventually(async () => (await status()).paused, 'Synthetic audible-tab command pauses music');
  await configureAudible(true, 'reduce');
  await eventually(async () => {const s=await status(); return !s.paused && Math.abs(s.volume - .1) < .001;}, 'Synthetic tab-audio ducking resumes music at the reduced volume');
  await configureAudible(false, 'reduce');
  await eventually(async () => Math.abs((await status()).volume - .5) < .001, 'Synthetic tab-silence command restores full volume');
  // Stop and wake the service worker via CDP; the audio document must survive unchanged.
  const cdp = await context.newCDPSession(page);
  let versions = [];
  cdp.on('ServiceWorker.workerVersionUpdated', event => {versions = event.versions;});
  await cdp.send('ServiceWorker.enable');
  await wait(200);
  const targets = await cdp.send('Target.getTargets');
  const swTarget = targets.targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(origin));
  const before = await status();
  if (versions.find(v => v.scriptURL === worker.url())) {
   await cdp.send('ServiceWorker.stopWorker', {versionId: versions.find(v => v.scriptURL === worker.url()).versionId});
  } else {
   await cdp.send('Target.closeTarget', {targetId: swTarget.targetId});
  }
  await wait(500);
  await set({volume: .45});
  await eventually(async () => {const s = await status(); return !s.paused && s.currentSrc === before.currentSrc && s.currentTime > before.currentTime && Math.abs(s.volume - .45) < .001;}, 'Music survives service worker suspension and settings wake it without restarting the track');
  // Let Chrome expire an idle audio document, then recreate it on resume.
  await set({paused: true});
  await eventually(async () => (await status()).paused, 'Player pauses before lifecycle check');
  await eventually(async () => page.evaluate(async () => (await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']})).length === 0), 'Chrome closes the idle offscreen player', 45000);
  await set({paused: false});
  await eventually(async () => {const s=await status(); return !s.paused && s.currentTime > 0 && !s.error;}, 'Resuming recreates an expired offscreen player');
  await page.goto(origin + '/options.html');
  await page.locator('.menu a[href="#town-tune"]').click();
  await page.locator('.play-tune').click();
  await eventually(async () => (await page.locator('.play-tune').textContent()) === 'Playing!', 'Town tune preview starts from the editor');
  await eventually(async () => (await page.locator('.play-tune').textContent()) === 'Play!', 'Town tune preview completes and restores editor controls');
  await page.screenshot({path: path.join(workDirectory, 'options-final.png'), fullPage: true});
  assert.deepEqual(errors, []);
  checks.push('No extension JavaScript or service worker errors');
  console.log('OPTIONAL REMOTE REQUESTS', failedRequests);
  fs.writeFileSync(path.join(workDirectory, 'integration-results.json'), JSON.stringify({browser: context.browser().version(), checks, failedRequests, errors}, null, 2));
 } finally {await context.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
