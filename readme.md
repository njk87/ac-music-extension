# Animal Crossing Music — Chrome Manifest V3 port

This is a modified version of the supplied `ac-music-extension-develop.zip`
from https://github.com/njk87/ac-music-extension. Original authorship and the
zlib license are preserved in LICENSE and readme-upstream.md.

Version 4.3.0 migrates the original Manifest V2 extension to Manifest V3.
Requires Google Chrome 116 or newer. No build or Node.js installation is
needed to use the extension.

## Install in Google Chrome

1. Extract `ac-music-chrome.zip` to a permanent folder.
2. Open `chrome://extensions` in Chrome's address bar.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the extracted **ac-music-chrome** folder containing `manifest.json`.
6. Pin Animal Crossing Music using Chrome's Extensions (puzzle-piece) menu.

Music starts automatically. Click the extension's icon to pause or resume.
Right-click its icon and choose **Options** to select a game, weather, volume,
K.K. Slider songs, or edit the town tune. Disable another installed copy first
if you hear two tracks at once. Keep the extracted folder in place while using
the extension. After changing its files, click **Reload** on its extension card.

This is an unpacked development installation; it does not install or publish
anything in the Chrome Web Store and does not receive Web Store updates.

## What changed

- Manifest V3 service worker and chrome.action replace the old background page
  and browserAction API. Server access is declared in host_permissions.
- A dedicated offscreen document plays audio and owns the Media Session and
  Web Audio APIs. Closing the options page does not stop the music.
- The worker handles settings, toolbar clicks, notifications, weather and tab
  audio events. The offscreen document uses only chrome.runtime messaging.
- Chrome alarms and session storage replace background-page polling. Hourly
  and alternating quarter-hour choices survive worker suspension. An expired
  audio document is recreated when music resumes.
- Original hourly tracks, game/weather selection, loop points, K.K. live and
  aircheck playlists, town tunes, tab-audio pause/ducking, and optional background
  playback are retained. Artwork, notification, icon and bell-sample paths use
  root-relative extension URLs.
- Disabling the background-playback checkbox now also saves its preference.

## Network and timing

Music still streams from **https://acmusicext.com/**; it is not bundled in this
ZIP. Internet access and that server are required for streamed music, live
weather and remote K.K. artwork. Live weather falls back to its last known value
or sunny music if the server is unavailable. An `x` badge indicates an audio
loading failure; check your connection, then pause and resume to retry.

Chrome can delay alarms during sleep or heavy load. The next check selects the
current local hour after the computer wakes. While paused, Chrome may discard
the audio document after 30 seconds of silence; resuming recreates it.

The optional contributor-list endpoint returned HTTP 404 during verification;
the About page shows its existing fallback message. This does not affect music
or weather. The background playback option requires Chrome's background-app
setting and its optional background permission; quitting Chrome completely
still stops the extension.

## Validation and development

See VALIDATION.md for the checks performed. Automated logic and worker-event
tests require Node.js 20 or newer:

```sh
node --test tests/playback.test.cjs tests/worker.test.cjs
```

To repeat browser integration checks in a separate, muted test profile:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

The browser tests create temporary profiles and results in `work/`. The
`AC_TEST_BROWSER` environment variable can select an existing Chrome for Testing
executable. Regular branded Chrome restricts automated extension-loading flags;
use Chrome for Testing for these automated checks. Normal installation in
Google Chrome uses the **Load unpacked** steps above.

Reference: https://developer.chrome.com/docs/extensions/reference/api/offscreen
