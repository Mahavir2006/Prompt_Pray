// ======================== LOBBY LOGIC ========================
import { S } from './state.js';
import { ROLE_COLORS, DISCLAIMER_TEXT } from './constants.js';
import { toggleSpeaker, toggleMic, connectToPeers } from './voicechat.js';
import { showError } from './ui.js';
import { connect } from './network.js';
import { playSFX, startLobbyMusic, stopAllMusic, toggleBgMute, toggleSfxMute } from './audio.js';

const lobbyOverlay = document.getElementById('lobbyOverlay');
const connectScreen = document.getElementById('connectScreen');
const roomScreen = document.getElementById('roomScreen');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const disclaimerOverlay = document.getElementById('disclaimerOverlay');

export function initLobby() {
    document.getElementById('speakerBtn').onclick = () => {
        toggleSpeaker();
        const isMuted = !S.speakerEnabled;
        document.getElementById('speakerBtn').textContent = isMuted ? '🔇 BG MUSIC ON' : '🔊 BG MUSIC OFF';
    };
    document.getElementById('micBtn').onclick = () => toggleMic();
    document.getElementById('sfxBtn').onclick = () => {
        const muted = toggleSfxMute();
        document.getElementById('sfxBtn').textContent = muted ? '🔘 SFX ON' : '🔔 SFX OFF';
    };

    document.getElementById('createBtn').onclick = () => {
        const name = document.getElementById('nameInput').value.trim();
        if (!name) return showError('Enter a Callsign');
        connect(() => {
            S.ws.send(JSON.stringify({ type: 'createRoom', name }));
        });
    };

    document.getElementById('joinBtn').onclick = () => {
        const name = document.getElementById('nameInput').value.trim();
        if (!name) return showError('Enter a Callsign');
        const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
        if (!code) return showError('Enter a Room Code');
        connect(() => {
            S.ws.send(JSON.stringify({ type: 'joinRoom', name, roomCode: code }));
        });
    };

    document.querySelectorAll('.role-card').forEach(card => {
        card.addEventListener('click', () => {
            const role = card.dataset.role;
            if (S.ws && S.ws.readyState === 1) {
                S.ws.send(JSON.stringify({ type: 'selectRole', role }));
            }
        });
    });

    document.getElementById('readyBtn').onclick = () => {
        playSFX('ready');
        if (S.ws) S.ws.send(JSON.stringify({ type: 'ready' }));
    };



    document.getElementById('startBtn').onclick = () => {
        if (S.ws) S.ws.send(JSON.stringify({ type: 'startGame' }));
    };

    document.getElementById('backToLobbyBtn').onclick = () => {
        gameOverOverlay.style.display = 'none';
        lobbyOverlay.style.display = 'flex';
        connectScreen.style.display = 'block';
        roomScreen.style.display = 'none';
        S.screenPhase = 'lobby';
        S.gameState = null;
        stopAllMusic();
        if (S.ws) S.ws.close();
    };
}

export function showDisclaimer(callback) {
    if (!disclaimerOverlay) { callback(); return; }
    disclaimerOverlay.style.display = 'flex';
    const textEl = document.getElementById('disclaimerText');
    const guidelinesBox = document.getElementById('guidelinesBox');
    const continueBtn = document.getElementById('disclaimerContinueBtn');
    const skipBtn = document.getElementById('disclaimerSkipBtn');

    textEl.innerHTML = '<span class="cursor-blink"></span>';
    guidelinesBox.style.display = 'none';
    continueBtn.style.display = 'none';

    let charIdx = 0;
    const typeSpeed = 18;
    const typeInterval = setInterval(() => {
        if (charIdx < DISCLAIMER_TEXT.length) {
            textEl.innerHTML = DISCLAIMER_TEXT.substring(0, charIdx + 1) + '<span class="cursor-blink"></span>';
            charIdx++;
        } else {
            clearInterval(typeInterval);
            textEl.innerHTML = DISCLAIMER_TEXT;
            setTimeout(() => {
                guidelinesBox.style.display = 'block';
                setTimeout(() => {
                    continueBtn.style.display = 'inline-block';
                }, 600);
            }, 400);
        }
    }, typeSpeed);

    textEl.style.cursor = 'pointer';
    textEl.onclick = () => {
        if (charIdx < DISCLAIMER_TEXT.length) {
            charIdx = DISCLAIMER_TEXT.length;
            clearInterval(typeInterval);
            textEl.innerHTML = DISCLAIMER_TEXT;
            guidelinesBox.style.display = 'block';
            setTimeout(() => { continueBtn.style.display = 'inline-block'; }, 300);
        }
    };

    skipBtn.style.display = 'inline-block';
    skipBtn.onclick = () => {
        clearInterval(typeInterval);
        disclaimerOverlay.style.display = 'none';
        callback();
    };

    continueBtn.onclick = () => {
        disclaimerOverlay.style.display = 'none';
        callback();
    };
}

export function updateLobbyUI(data) {
    document.getElementById('roomCodeDisplay').textContent = data.roomCode;
    S.activePlayerIds = data.players.map(p => p.id);
    connectToPeers(S.activePlayerIds);

    const takenRoles = new Set();
    data.players.forEach(p => { if (p.role && p.id !== S.myId) takenRoles.add(p.role); });
    const myPlayer = data.players.find(p => p.id === S.myId);
    S.selectedRole = myPlayer?.role;

    document.querySelectorAll('.role-card').forEach(card => {
        const role = card.dataset.role;
        card.classList.toggle('selected', role === S.selectedRole);
        card.classList.toggle('taken', takenRoles.has(role));
    });

    const isHost = myPlayer?.isHost;
    const readyBtn = document.getElementById('readyBtn');
    readyBtn.style.display = isHost ? 'none' : 'inline-block';
    readyBtn.classList.toggle('active', myPlayer?.ready);
    readyBtn.textContent = myPlayer?.ready ? '✓ READY' : 'READY';

    const playerList = document.getElementById('playerList');
    playerList.innerHTML = data.players.map(p => `
      <div class="player-tag ${p.ready ? 'ready' : ''}">
        <span class="ready-dot"></span>
        <span>${p.name}</span>
        <span style="color:${ROLE_COLORS[p.role] || '#555'}">${p.role ? p.role.toUpperCase() : '—'}</span>
        ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      </div>
    `).join('');

    const startBtn = document.getElementById('startBtn');
    startBtn.style.display = isHost ? 'inline-block' : 'none';
    startBtn.disabled = !data.canStart;
}
