// Chrome MV3 port. Pure selection logic shared by the worker and regression tests.
'use strict';

var DEFAULT_OPTIONS = {
    volume: 0.5, music: 'new-horizons', weather: 'sunny',
    enableNotifications: true, enableKK: true, alwaysKK: false, kkVersion: 'live',
    paused: false, enableTownTune: true, absoluteTownTune: false, townTuneVolume: 0.75,
    zipCode: '98052', countryCode: 'us', enableBadgeText: true,
    tabAudio: 'pause', enableBackground: false, tabAudioReduceValue: 80,
    kkSelectedSongsEnable: false, kkSelectedSongs: [],
    alternatingMusic: false, alternatingWeather: false,
    townTune: ['C3', 'E3', 'C3', 'G2', 'F2', 'G2', 'B2', 'D3', 'C3', 'zZz', '?', 'zZz', 'C3', '-', '-', 'zZz']
};

function selectPlayback(options, previous, date, liveWeather = 'Clear', random = Math.random) {
    const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    const quarterKey = `${hourKey}-${Math.floor(date.getMinutes() / 15)}`;
    const hourChanged = Boolean(previous.hourKey && previous.hourKey !== hourKey);
    const quarterChanged = Boolean(previous.quarterKey && previous.quarterKey !== quarterKey);
    const pick = (values, old, rotate) => {
        const candidates = rotate && values.length > 1 ? values.filter(value => value !== old) : values;
        return candidates[Math.floor(random() * candidates.length)];
    };
    const games = ['animal-crossing', 'wild-world', 'new-leaf', 'new-horizons'];
    let game = options.music;
    if (game === 'game-random') {
        const rotate = hourChanged || (quarterChanged && options.alternatingMusic);
        game = previous.randomGame;
        if (!game || previous.musicOption !== options.music || rotate) {
            game = pick(games, game, options.alternatingMusic);
        }
    }
    let weather = options.weather;
    if (weather === 'live') weather = liveWeather === 'Rain' ? 'raining' : liveWeather === 'Snow' ? 'snowing' : 'sunny';
    if (weather === 'weather-random') {
        const choices = game === 'animal-crossing' ? ['sunny', 'snowing'] : ['sunny', 'raining', 'snowing'];
        const rotate = hourChanged || (quarterChanged && options.alternatingWeather);
        weather = previous.randomWeather;
        if (!choices.includes(weather) || previous.weatherOption !== options.weather || rotate) {
            weather = pick(choices, weather, options.alternatingWeather);
        }
    }
    if (game === 'animal-crossing' && weather === 'raining') weather = 'snowing';
    const kk = options.alwaysKK || (options.enableKK && date.getDay() === 6 && date.getHours() >= 20);
    const plan = kk ? {mode: 'kk', version: options.kkVersion} : {mode: 'hourly', game, weather, hour: date.getHours()};
    // Include the local date so an identical hour after a full day still refreshes.
    plan.key = kk ? JSON.stringify([plan, options.kkSelectedSongsEnable, options.kkSelectedSongs]) : JSON.stringify([plan, hourKey]);
    return {
        plan, hourChanged,
        state: {hourKey, quarterKey, musicOption: options.music, weatherOption: options.weather,
            randomGame: game, randomWeather: weather}
    };
}
