// Chrome MV3 port: no storage APIs are called in the offscreen player.
'use strict';
function TownTuneManager() {
    let context;
    let sampler;
    let tunePlayer;
    let timer;
    let finish;
    let generation = 0;
    this.stop = function() {
        generation++;
        clearTimeout(timer);
        if (sampler) sampler.stop();
        if (finish) {finish(); finish = null;}
    };
    this.playTune = async function(options, audible) {
        this.stop();
        const token = generation;
        if (!context) {
            context = new AudioContext();
            sampler = createSampler(context);
            tunePlayer = createTunePlayer(context);
        }
        await sampler.ready;
        if (token !== generation) return;
        await context.resume();
        if (token !== generation) return;
        const volume = Math.max(0, Math.min(1, options.townTuneVolume *
            (audible && options.tabAudio === 'reduce' ? 1 - options.tabAudioReduceValue / 100 : 1)));
        const tune = options.townTune;
        tunePlayer.playTune(tune, sampler, 66, volume);
        await new Promise(resolve => {
            finish = resolve;
            timer = setTimeout(() => {finish = null; resolve();}, (60 / 66 * tune.length + 4) * 1000);
        });
    };
}
