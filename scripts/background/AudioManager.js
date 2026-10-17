// Chrome MV3 port: audio, fades, loop points and media sessions stay in this document.
'use strict';

function AudioManager(report) {
    const audio = document.createElement('audio');
    document.body.appendChild(audio);
    const townTune = new TownTuneManager();
    const metadata = new MediaSessionManager();
    let configuration;
    let planKey;
    let generation = 0;
    let transition = false;
    let cancelFade;
    let loopTimer;
    let error = false;

    const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
    const canPlay = () => configuration?.shouldPlay && !(configuration.audible && configuration.options.tabAudio === 'pause');
    const targetVolume = () => clamp(configuration.options.volume) *
        (configuration.audible && configuration.options.tabAudio === 'reduce' ? 1 - clamp(configuration.options.tabAudioReduceValue / 100) : 1);

    function fail(reason) {
        if (!configuration?.shouldPlay) return;
        error = true;
        clearTimeout(loopTimer);
        console.warn('Music could not be loaded:', audio.currentSrc, reason);
        report({error: true});
    }
    audio.addEventListener('error', fail);

    function fadeTo(volume, duration) {
        if (cancelFade) cancelFade();
        if (audio.paused || !duration) {audio.volume = volume; return Promise.resolve();}
        return new Promise(resolve => {
            const start = audio.volume;
            const at = Date.now();
            const timer = setInterval(() => {
                const fraction = Math.min(1, (Date.now() - at) / duration);
                audio.volume = clamp(start + (volume - start) * fraction);
                if (fraction === 1) finish();
            }, 40);
            function finish() {
                clearInterval(timer);
                if (cancelFade === finish) cancelFade = null;
                resolve();
            }
            cancelFade = finish;
        });
    }

    function scheduleLoop() {
        clearTimeout(loopTimer);
        const plan = configuration.plan;
        if (plan.mode !== 'hourly' || audio.paused || !canPlay()) return;
        const loop = loopTimes[plan.game]?.[plan.weather]?.[plan.hour];
        if (!loop) return;
        // Use the actual media time; buffering and resuming must not drift the loop.
        loopTimer = setTimeout(() => {
            if (audio.paused || !canPlay()) return;
            if (audio.currentTime >= loop.end - 0.08) audio.currentTime = loop.start;
            scheduleLoop();
        }, Math.max(100, (loop.end - audio.currentTime) * 1000));
    }
    audio.addEventListener('playing', scheduleLoop);
    audio.addEventListener('seeked', scheduleLoop);
    audio.addEventListener('pause', () => clearTimeout(loopTimer));

    async function resume(token = generation) {
        if (token !== generation || !canPlay()) return;
        audio.volume = targetVolume();
        try {
            await audio.play();
            if (token !== generation || !canPlay()) {audio.pause(); return;}
            error = false;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            report({error: false});
        } catch (reason) {
            if (token === generation && canPlay() && reason.name !== 'AbortError') fail(reason);
        }
    }

    async function loadTrack(token, hourlyChange) {
        try {
            await fadeTo(0, hourlyChange ? 1000 : 300);
            if (token !== generation) return;
            audio.pause();
            if (hourlyChange && configuration.options.enableTownTune && canPlay()) {
                await townTune.playTune(configuration.options, configuration.audible);
            }
            if (token !== generation) return;
            const plan = configuration.plan;
            if (plan.mode === 'hourly') {
                audio.loop = true;
                audio.src = `https://acmusicext.com/static/${plan.game}/${plan.weather}/${formatHour(plan.hour)}.ogg`;
                metadata.updateMetadata(plan.game, plan.hour, plan.weather);
            } else {
                audio.loop = false;
                const options = configuration.options;
                const songs = options.kkSelectedSongsEnable ? options.kkSelectedSongs.filter(song => KKSongList.includes(song)) : [];
                const pool = songs.length ? songs : KKSongList;
                const song = pool[Math.floor(Math.random() * pool.length)];
                const version = plan.version === 'both' ? Math.random() < 0.5 ? 'live' : 'aircheck' : plan.version;
                audio.src = `https://acmusicext.com/static/kk/${version}/${encodeURIComponent(song)}.ogg`;
                const title = `${song.split(' - ')[1]} (${capitalize(version)} Version)`;
                metadata.updateMetadataKK(title, song);
                report({songTitle: title});
            }
            transition = false;
            await resume(token);
        } catch (reason) {
            if (token === generation) {transition = false; fail(reason);}
        }
    }

    this.configure = function(next) {
        const previous = configuration;
        configuration = next;
        // A stopped/paused offscreen document is allowed to expire after 30s.
        // The worker recreates it on demand and supplies the full configuration.
        if (!next.shouldPlay) {
            const token = ++generation;
            if (transition) planKey = null;
            transition = false;
            clearTimeout(loopTimer);
            if (previous?.shouldPlay || next.allowTownTune === false || !next.options.enableTownTune || !next.options.absoluteTownTune) townTune.stop();
            fadeTo(0, 200).then(() => {
                if (token === generation) {
                    audio.pause();
                    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                }
            });
            if (next.playTownTune) townTune.playTune(next.options, next.audible).catch(fail);
            return;
        }
        if (planKey !== next.plan.key || (!transition && !audio.getAttribute('src')) || (error && !previous?.shouldPlay)) {
            const token = ++generation;
            clearTimeout(loopTimer);
            townTune.stop();
            planKey = next.plan.key;
            transition = true;
            error = false;
            loadTrack(token, next.hourChanged);
        } else if (!canPlay()) {
            townTune.stop();
            audio.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        } else {
            if (cancelFade && !transition) cancelFade();
            audio.volume = targetVolume();
            // Leave network errors visible until a user resumes or selects another track.
            if (audio.paused && !transition && !error) resume();
        }
    };

    this.nextTrack = function() {
        if (configuration?.plan.mode === 'kk' && configuration.shouldPlay) {
            transition = true;
            clearTimeout(loopTimer);
            loadTrack(++generation, false);
        }
    };
    audio.addEventListener('ended', () => this.nextTrack());
    this.getStatus = () => ({error, paused: audio.paused, volume: audio.volume,
        currentSrc: audio.currentSrc, currentTime: audio.currentTime, planKey, transition});
}
