// ======================== ENTRY POINT ========================
// This is the single <script type="module"> loaded by index.html.
// It wires canvas, kicks off asset loading, lobby, input & game loop.

import { S } from './state.js';
import './assets.js';          // side-effects: loads sprites, collisions, trivia data
import { initLobby } from './lobby.js';
import { initInput } from './input.js';
import { updateParticles } from './particles.js';
import { render } from './renderer.js';

// ── Canvas setup ──
S.canvas = document.getElementById('gameCanvas');
S.ctx    = S.canvas.getContext('2d');

function resizeCanvas() {
    S.canvas.width  = window.innerWidth;
    S.canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Phase display ref (for announcement timer) ──
const phaseDisplay = document.getElementById('phaseDisplay');

// ── Bootstrap lobby & input ──
initLobby();
initInput();

// ── Main game loop ──
let lastTime = performance.now();

function gameLoop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    updateParticles(dt);

    if (S.announcementTimer > 0) {
        S.announcementTimer -= dt;
        if (S.announcementTimer <= 0 && phaseDisplay.classList.contains('show')) {
            phaseDisplay.classList.remove('show');
        }
    }

    render(dt);

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
