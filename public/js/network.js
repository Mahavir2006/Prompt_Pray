// ======================== NETWORK (WebSocket) ========================
import { S } from './state.js';
import { updateLobbyUI, showDisclaimer } from './lobby.js';
import { startTrivia } from './trivia.js';
import { handleWebRTCSignal } from './voicechat.js';
import { showAnnouncement, showGameOver, showError, displayChatMessage } from './ui.js';
import { addShake } from './camera.js';
import { playSFX, playDamage, playLowHealth, playEnemySpotted, playPlayerDeath, playBossDeath } from './audio.js';

// Track local player state for SFX triggers
let wasAlive = true;
let lowHealthPlayed = false;

const connectScreen = document.getElementById('connectScreen');
const roomScreen = document.getElementById('roomScreen');
const lobbyOverlay = document.getElementById('lobbyOverlay');
const hud = document.getElementById('hud');

export function connect(onOpen) {
    if (S.ws) {
        S.ws.onclose = null;
        S.ws.close();
        S.ws = null;
        Object.values(S.peerConnections).forEach(pc => pc.close());
        for (let key in S.peerConnections) delete S.peerConnections[key];
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    S.ws = new WebSocket(`${protocol}://${location.host}`);

    S.ws.onopen = () => {
        if (onOpen) onOpen();
    };

    S.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
    };

    S.ws.onclose = () => {
        if (S.screenPhase === 'game') {
            showAnnouncement('DISCONNECTED', 5, '#e63946');
        }
    };

    S.ws.onerror = () => {
        showError('Connection failed. Server might be down!');
    };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'roomCreated':
        case 'roomJoined':
            S.myId = msg.playerId;
            connectScreen.style.display = 'none';
            roomScreen.style.display = 'block';
            document.getElementById('roomCodeDisplay').textContent = msg.roomCode;
            break;

        case 'lobbyUpdate':
            updateLobbyUI(msg);
            break;

        case 'assignId':
            S.myId = msg.playerId;
            break;

        case 'gameStart':
            lobbyOverlay.style.display = 'none';
            hud.style.display = 'none';
            S.cinematicTimer = 0;
            S.triviaAnswered = 0;
            S.cinematicPlayed = false;
            wasAlive = true;
            lowHealthPlayed = false;
            S.screenPhase = 'disclaimer';
            showDisclaimer(() => {
                S.screenPhase = 'cinematic';
                S.cinematicTimer = 0;
                playSFX('countdown');   // "3 2 1 go" after launch mission
            });
            break;

        case 'gameState':
            S.prevState = S.gameState;
            S.gameState = msg;
            S.lastStateTime = performance.now();

            if (S.screenPhase === 'cinematic' && S.cinematicPlayed) {
                S.screenPhase = 'game';
                hud.style.display = 'block';
            }

            // ── Local-player SFX: death & low-health ──
            if (msg.players && S.myId) {
                const me = msg.players.find(p => p.id === S.myId);
                if (me) {
                    // Player death: random adios or goodbye
                    if (wasAlive && !me.alive) {
                        playPlayerDeath();
                    }
                    wasAlive = me.alive;

                    // Low health warning at < 20% HP
                    if (me.alive && me.hp > 0 && me.hp / me.maxHp < 0.20) {
                        playLowHealth();
                    }
                }
            }

            if (msg.events) {
                msg.events.forEach(processEvent);
            }
            break;

        case 'gameOver':
            S.screenPhase = 'gameover';
            hud.style.display = 'none';
            if (!msg.victory) playSFX('gameOver');  // game over audio on defeat
            showGameOver(msg);
            break;

        case 'error':
            showError(msg.message);
            break;

        case 'webrtc_signal':
            handleWebRTCSignal(msg);
            break;
    }
}

function processEvent(evt) {
    switch (evt.type) {
        case 'damage':
            S.floatTexts.push({
                x: evt.x, y: evt.y,
                text: '-' + evt.value,
                color: evt.color || '#e63946',
                life: 1.0, vy: -50
            });
            addShake(3);
            // Play damage grunt when the local player is hit
            if (S.gameState && S.gameState.players) {
                const me = S.gameState.players.find(p => p.id === S.myId);
                if (me && Math.abs(evt.x - me.x) < 40 && Math.abs(evt.y + 25 - me.y) < 40) {
                    playDamage();
                }
            }
            break;
        case 'heal':
            S.floatTexts.push({
                x: evt.x, y: evt.y,
                text: '+' + evt.value,
                color: '#06d6a0',
                life: 1.0, vy: -50
            });
            break;
        case 'kill':
            for (let i = 0; i < 8; i++) {
                S.particles.push({
                    x: evt.x, y: evt.y,
                    vx: (Math.random() - 0.5) * 200,
                    vy: (Math.random() - 0.5) * 200,
                    life: 0.6, color: '#e63946', size: 3
                });
            }
            break;
        case 'melee':
            for (let i = 0; i < 5; i++) {
                S.particles.push({
                    x: evt.x + (Math.random() - 0.5) * 20,
                    y: evt.y + (Math.random() - 0.5) * 20,
                    vx: Math.cos(evt.angle) * (100 + Math.random() * 50),
                    vy: Math.sin(evt.angle) * (100 + Math.random() * 50),
                    life: 0.3, color: '#4cc9f0', size: 4
                });
            }
            break;
        case 'turretShot':
            S.particles.push({
                x: evt.x1, y: evt.y1,
                vx: (evt.x2 - evt.x1) * 2, vy: (evt.y2 - evt.y1) * 2,
                life: 0.15, color: '#f4a261', size: 3
            });
            break;
        case 'announcement': {
            if (evt.playerId && evt.playerId !== S.myId) break;
            showAnnouncement(evt.text, evt.duration || 3, evt.color);
            const t = (evt.text || '').toUpperCase();
            // Task / objective completed → "all done"
            if (t.includes('STABILIZED') || t.includes('AUTHENTICATED') || t.includes('UNLOCKED') ||
                t.includes('REPAIRED') || t.includes('SECURED') || t.includes('DEFEATED')) {
                playSFX('allDone');
            }
            // Wave of enemies → "enemy spotted"
            if (t.includes('GUARDIAN') || t.includes('ENRAGED') ||
                t.includes('STABILIZE THE CORE')) {
                playEnemySpotted();
            }
            break;
        }
        case 'startTrivia':
            if (evt.playerId === S.myId) {
                startTrivia(evt.difficulty, evt.timeLimit, evt.phase);
            }
            break;
        case 'bossDeath':
            playBossDeath();   // shout first, then death audio
            break;
        case 'chat':
            displayChatMessage(evt.name, evt.msg, evt.color);
            break;
    }
}
