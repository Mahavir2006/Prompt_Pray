// ======================== UI HELPERS ========================
import { S } from './state.js';
import { ROLE_COLORS } from './constants.js';

const phaseDisplay = document.getElementById('phaseDisplay');
const gameOverOverlay = document.getElementById('gameOverOverlay');

export function displayChatMessage(name, msg, color) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `<span class="author" style="color:${color}">${name}:</span>${msg}`;

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    setTimeout(() => {
        msgDiv.classList.add('fade-out');
        setTimeout(() => {
            if (chatMessages.contains(msgDiv)) {
                chatMessages.removeChild(msgDiv);
            }
        }, 1000);
    }, 10000);
}

export function showAnnouncement(text, duration, color) {
    S.announcement = { text, color: color || '#fff' };
    S.announcementTimer = duration;
    phaseDisplay.textContent = text;
    phaseDisplay.style.color = color || '#fff';
    phaseDisplay.classList.add('show');
    setTimeout(() => phaseDisplay.classList.remove('show'), duration * 1000);
}

export function showGameOver(msg) {
    gameOverOverlay.style.display = 'flex';
    const title = document.getElementById('gameOverTitle');
    const subtitle = document.getElementById('gameOverSubtitle');
    const scoreboard = document.getElementById('finalScoreboard');

    if (msg.victory) {
        title.textContent = 'MISSION COMPLETE';
        title.className = 'gameover-title victory';
        subtitle.textContent = `Transmission sent. Extraction incoming. Time remaining: ${Math.floor(msg.timeRemaining)}s`;
    } else {
        title.textContent = 'GAME OVER';
        title.className = 'gameover-title defeat';
        subtitle.textContent = 'All personnel lost. The signal was never sent.';
    }

    scoreboard.innerHTML = msg.scores.map((s, i) => `
      <div class="score-row">
        <span class="score-name">${i === 0 ? '★ ' : ''}${s.name}</span>
        <span class="score-role" style="color:${ROLE_COLORS[s.role]}">${s.role?.toUpperCase()}</span>
        <span class="score-stats">
          <span>⚔ ${Math.round(s.damageDealt)}</span>
          <span>♥ ${Math.round(s.healingDone)}</span>
          <span>☠ ${s.enemiesKilled}</span>
          <span style="color:#4cc9f0;font-weight:bold;">+${s.earned || 0} PTS</span>
        </span>
      </div>
    `).join('');
}

export function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
    setTimeout(() => { document.getElementById('errorMsg').textContent = ''; }, 3000);
}
