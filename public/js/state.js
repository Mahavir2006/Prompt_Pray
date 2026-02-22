// ======================== SHARED MUTABLE STATE ========================
// Every module imports S and reads/writes its properties at runtime.
export const S = {
    // WebSocket
    ws: null,
    myId: null,

    // Game state
    gameState: null,
    prevState: null,
    lastStateTime: 0,
    screenPhase: 'lobby', // lobby | disclaimer | cinematic | game | gameover

    // Input
    keys: { w: false, a: false, s: false, d: false },
    mouseX: 0,
    mouseY: 0,
    mouseMoved: false,
    mouseDown: false,
    interacting: false,
    abilityPressed: false,
    tabDown: false,

    // Camera
    camX: 0,
    camY: 0,
    camShakeX: 0,
    camShakeY: 0,
    camShakeIntensity: 0,

    // Particles & float texts
    particles: [],
    floatTexts: [],

    // Announcements
    announcement: null,
    announcementTimer: 0,

    // Cinematic
    cinematicTimer: 0,
    cinematicPlayed: false,

    // Map
    debugMode: false,
    myCurrentMap: 'ship',

    // Trivia
    triviaData: null,
    terminalOpen: false,
    terminalPhase: '',
    terminalDifficulty: '',
    terminalTime: 0,
    terminalQuestion: null,
    terminalTimerEvent: null,
    triviaAnswered: 0,

    // Voice chat
    localStream: null,
    selectedAudioDeviceId: null,
    speakerEnabled: false,
    peerConnections: {},
    pcStates: {},
    activePlayerIds: [],

    // Lobby
    selectedRole: null,

    // Animation tracking
    enemyAnimState: {},
    playerAnimState: {},
    bossAnim: { frame: 0, timer: 0, prevX: 0, prevY: 0 },

    // Canvas (set by main.js)
    canvas: null,
    ctx: null,
};

// ── Pre-generated star field (used in lobby bg + cinematic) ──
export const stars = [];
for (let i = 0; i < 200; i++) {
    stars.push({
        x: Math.random() * 1200,
        y: Math.random() * 700,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 100 + 50
    });
}

// ── Pre-generated cinematic debris ──
export const cineDebris = [];
for (let i = 0; i < 30; i++) {
    cineDebris.push({
        x: Math.random() * 1400, y: Math.random() * 800,
        size: 1 + Math.random() * 4, rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 3, speed: 60 + Math.random() * 120,
        color: ['#8899aa', '#667788', '#aabbcc', '#556677'][Math.floor(Math.random() * 4)]
    });
}
export const cineExhaust = [];
