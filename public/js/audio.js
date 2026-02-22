// ======================== AUDIO / SFX MODULE ========================
// Centralises all sound-effect playback.  Each clip is pre-loaded as an
// HTMLAudioElement so the first play is instant.  A small pool (clone)
// approach lets overlapping plays work without cutting off the previous one.

const SFX_PATH = '/assets/sfx/';

// ── Pre-load every clip ──
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

// Pre-load all clips
Object.values(clips).forEach(a => { a.preload = 'auto'; a.load(); });

// ── Volume defaults ──
const VOLUMES = {
    countdown:    0.7,
    ready:        0.5,
    enemySpotted: 0.6,
    damage1:      0.5,
    damage2:      0.5,
    lowHealth:    0.6,
    shout:        0.7,
    death:        0.7,
    gameOver:     0.8,
    allDone:      0.7,
    goodbye:      0.6,
    adios:        0.6,
};

/**
 * Play a named sound effect.
 * Uses cloneNode so overlapping plays don't cut each other off.
 * @param {string} name  – key in `clips`
 * @param {number} [vol] – optional 0-1 override
 */
export function playSFX(name, vol) {
    const src = clips[name];
    if (!src) return;
    const a = src.cloneNode();
    a.volume = vol ?? VOLUMES[name] ?? 0.5;
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
 */
export function playBossDeath() {
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
