// ======================== AUDIO / SFX MODULE ========================
// Centralises all sound-effect playback.  Each clip is pre-loaded as an
// HTMLAudioElement so the first play is instant.  A small pool (clone)
// approach lets overlapping plays work without cutting off the previous one.
//
// Background music tracks (Lobby / Game / FinalBoss) are managed separately
// with crossfade helpers so they never overlap and stay at low volume
// relative to voice-chat.

const SFX_PATH = '/assets/sfx/';

// ── Audio mute states ──
export let bgMuted = false;        // Background music mute toggle
export let sfxMuted = false;       // Sound effects mute toggle

export function toggleBgMute() {
    bgMuted = !bgMuted;
    return bgMuted;
}

export function toggleSfxMute() {
    sfxMuted = !sfxMuted;
    return sfxMuted;
}

export function setBgMute(muted) {
    bgMuted = muted;
}

export function setSfxMute(muted) {
    sfxMuted = muted;
}

// ── Pre-load every SFX clip ──
const clips = {
    countdown:    new Audio(SFX_PATH + 'countdown.wav'),     // "3 2 1 go" – after launch mission
    ready:        new Audio(SFX_PATH + 'ready.wav'),         // player clicks Ready
    enemySpotted: new Audio(SFX_PATH + 'enemy_spotted.wav'), // wave of enemies
    damage1:      new Audio(SFX_PATH + 'damage1.wav'),       // player takes damage
    damage2:      new Audio(SFX_PATH + 'damage2.wav'),       // player takes damage (alt)
    lowHealth:    new Audio(SFX_PATH + 'low_health.wav'),    // HP < 20%
    shout:        new Audio(SFX_PATH + 'shout.wav'),         // boss death – plays first
    death:        new Audio(SFX_PATH + 'death.wav'),         // boss death – plays after shout
    gameOver:     new Audio(SFX_PATH + 'game_over.wav'),     // all players die
    allDone:      new Audio(SFX_PATH + 'all_done.wav'),      // single task/objective completes
    goodbye:      new Audio(SFX_PATH + 'goodbye.wav'),       // player death (random pick)
    adios:        new Audio(SFX_PATH + 'adios.wav'),         // player death (random pick)
};

// Pre-load all SFX clips
Object.values(clips).forEach(a => { a.preload = 'auto'; a.load(); });

// ── Volume defaults (kept LOW so voice-chat is always clearly audible) ──
const VOLUMES = {
    countdown:    0.45,
    ready:        0.30,
    enemySpotted: 0.35,
    damage1:      0.30,
    damage2:      0.30,
    lowHealth:    0.35,
    shout:        0.40,
    death:        0.40,
    gameOver:     0.45,
    allDone:      0.35,
    goodbye:      0.35,
    adios:        0.35,
};

// ===================== BACKGROUND MUSIC =====================
// Three looping tracks:
//   LobbyBG   – plays in the lobby until "Launch Mission"
//   GameBG    – plays after lobby music ends, until the final boss enters
//   FinalBoss – plays when the boss spawns, loops until boss dies

const BG_VOLUME = 0.18;           // master volume for ALL background music
const BOSS_VOLUME = 0.22;         // slightly louder for the boss track
const FADE_MS = 1500;             // crossfade duration

const bgTracks = {
    lobby:     new Audio(SFX_PATH + 'LobbyBG.mpeg'),
    game:      new Audio(SFX_PATH + 'GameBG.mpeg'),
    finalBoss: new Audio(SFX_PATH + 'FinalBoss.mpeg'),
};

// Configure all BG tracks for looping
Object.values(bgTracks).forEach(a => {
    a.preload = 'auto';
    a.loop = true;
    a.volume = 0;
    a.load();
});

let activeBgTrack = null;   // key of currently playing track ('lobby' | 'game' | 'finalBoss' | null)
let fadeInterval = null;

/**
 * Fade an audio element from its current volume to `targetVol` over `ms` milliseconds.
 * Returns a promise that resolves when done.
 */
function fadeAudio(audio, targetVol, ms = FADE_MS) {
    return new Promise(resolve => {
        const step = 30;                       // interval ms
        const steps = Math.max(1, ms / step);
        const delta = (targetVol - audio.volume) / steps;
        let remaining = steps;
        const id = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                audio.volume = Math.max(0, Math.min(1, targetVol));
                clearInterval(id);
                resolve();
            } else {
                audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
            }
        }, step);
    });
}

/**
 * Switch to a different BG music track (or stop all if trackKey is null).
 * Cross-fades out the old track and fades in the new one.
 */
async function switchBgTrack(trackKey) {
    if (trackKey === activeBgTrack) return;

    // Fade out current track
    if (activeBgTrack && bgTracks[activeBgTrack]) {
        const old = bgTracks[activeBgTrack];
        fadeAudio(old, 0, FADE_MS).then(() => { old.pause(); old.currentTime = 0; });
    }

    activeBgTrack = trackKey;
    if (!trackKey) return;

    const next = bgTracks[trackKey];
    if (!next) return;
    const targetVol = bgMuted ? 0 : (trackKey === 'finalBoss' ? BOSS_VOLUME : BG_VOLUME);
    next.volume = 0;
    next.currentTime = 0;
    next.play().catch(() => {});
    fadeAudio(next, targetVol, FADE_MS);
}

/** Start lobby background music. */
export function startLobbyMusic() {
    switchBgTrack('lobby');
}

/** Transition from lobby music to in-game background music. */
export function startGameMusic() {
    switchBgTrack('game');
}

/** Transition to the final boss music. */
export function startBossMusic() {
    switchBgTrack('finalBoss');
}

/** Stop the final boss music (boss died). */
export function stopBossMusic() {
    // After boss dies, resume game BG briefly (or just silence — the game is ending)
    switchBgTrack(null);
}

/** Stop all background music (game over / back to lobby). */
export function stopAllMusic() {
    switchBgTrack(null);
}

// ===================== SFX HELPERS =====================

/**
 * Play a named sound effect.
 * Uses cloneNode so overlapping plays don't cut each other off.
 * @param {string} name  – key in `clips`
 * @param {number} [vol] – optional 0-1 override
 */
export function playSFX(name, vol) {
    // Don't play SFX if muted
    if (sfxMuted) return;
    
    const src = clips[name];
    if (!src) return;
    const a = src.cloneNode();
    a.volume = vol ?? VOLUMES[name] ?? 0.3;
    a.play().catch(() => {});   // swallow autoplay-policy errors
}

/**
 * Play one of the two damage grunts at random.
 */
export function playDamage() {
    playSFX(Math.random() < 0.5 ? 'damage1' : 'damage2');
}

/**
 * Player death: randomly play "adios" or "goodbye".
 */
export function playPlayerDeath() {
    playSFX(Math.random() < 0.5 ? 'adios' : 'goodbye');
}

/**
 * Boss death sequence: shout first, then death audio after shout finishes.
 * Also stops boss music.
 */
export function playBossDeath() {
    stopBossMusic();
    const shoutClip = clips.shout.cloneNode();
    shoutClip.volume = VOLUMES.shout;
    shoutClip.play().catch(() => {});
    shoutClip.addEventListener('ended', () => {
        playSFX('death');
    });
}

// ── Cooldown guards (prevent spamming certain clips) ──
let lastLowHealthTime = 0;
const LOW_HEALTH_COOLDOWN = 8000; // ms

/**
 * "low on health" warning – fires when HP < 20%, cooldown-guarded.
 */
export function playLowHealth() {
    const now = Date.now();
    if (now - lastLowHealthTime < LOW_HEALTH_COOLDOWN) return;
    lastLowHealthTime = now;
    playSFX('lowHealth');
}

let lastEnemySpottedTime = 0;
const ENEMY_SPOTTED_COOLDOWN = 15000;

/**
 * "enemy spotted" – when a wave of enemies arrives, cooldown-guarded.
 */
export function playEnemySpotted() {
    const now = Date.now();
    if (now - lastEnemySpottedTime < ENEMY_SPOTTED_COOLDOWN) return;
    lastEnemySpottedTime = now;
    playSFX('enemySpotted');
}
