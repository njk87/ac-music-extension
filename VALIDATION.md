# Validation — October 17, 2026

Source: the supplied `ac-music-extension-develop.zip` (original version 4.2.1).
Port: 4.3.0, Manifest V3, minimum declared Chrome version 116.

## Automated tests

**14 tests passed** using Node.js 24.19.0. Worker tests use mocked Chrome APIs;
selection tests exercise the shared production selection logic.

- Local hour/date changes, including an identical hour on a later date.
- Saturday K.K. scheduling and Sunday reset; always-K.K. mode.
- Live-weather mapping and original-game rain fallback.
- Random-choice persistence, hourly changes, and quarter-hour alternation.
- Playlist/version changes, MV3 manifest and packaged script syntax/references.
- Worker alarm creation and initial playback.
- Toolbar pause/resume and persisted settings.
- Audible/muted tab events, closing all tabs, and background playback selection.
- Absolute hourly town tunes while music is paused.
- Live-weather fetching and caching.

## Browser integration

**18 checkpoints passed** in headless Chrome for Testing **151.0.7922.34**,
using an isolated temporary profile with sound output muted. Actual remote Ogg
files were decoded and their media playback time advanced.

- Options and the sixteen-note editor initialized; volume changes reached audio.
- Hourly streaming, pause/resume, original-game rain fallback and K.K. aircheck
  playback worked. Returning from K.K. mode restored hourly music.
- Synthetic audible-tab messages exercised player pause, volume reduction and
  volume restoration. Chrome's muted headless mode suppresses its real audible
  flag, so native tab-event routing was checked with worker mocks instead.
- Explicit service-worker suspension did not interrupt or restart the track;
  a settings update woke the worker and changed volume.
- Chrome discarded the player after it was paused and idle. Resuming created
  a new offscreen document and playback resumed successfully.
- Town-tune editor preview started, completed and restored its controls.
- No uncaught extension JavaScript or worker errors occurred. The rendered
  town-tune page was also visually inspected.

## Server checks and limits

- The hourly music endpoint returned HTTP 200 and audio/ogg.
- The live-weather endpoint returned HTTP 200 and valid weather data.
- The optional contributor-list endpoint returned HTTP 404; the existing About
  fallback handles this. This request does not affect playback.
- Tests do not publish to the Web Store, install into your normal browser
  profile, or verify OS notification display or playback after all Chrome
  windows close. Normal installation is described in readme.md.

Reproduction commands and the browser test source are included in this package.
