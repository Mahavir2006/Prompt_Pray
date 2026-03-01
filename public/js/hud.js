// ======================== HUD ========================
import { S } from './state.js';
import { toggleBgMute, toggleSfxMute } from './audio.js';

const timerDisplay     = document.getElementById('timerDisplay');
const objectiveDisplay = document.getElementById('objectiveDisplay');
const hudHpBar         = document.getElementById('hudHpBar');
const hudHpText        = document.getElementById('hudHpText');
const hudAbility       = document.getElementById('hudAbility');
const hudAbilityCd     = document.getElementById('hudAbilityCd');

// Audio control buttons in HUD
const hudBgMuteBtn = document.getElementById('hudBgMuteBtn');
const hudSfxMuteBtn = document.getElementById('hudSfxMuteBtn');

if (hudBgMuteBtn) {
    hudBgMuteBtn.onclick = () => {
        const muted = toggleBgMute();
        hudBgMuteBtn.textContent = muted ? '🔇' : '🔊';
    };
}

if (hudSfxMuteBtn) {
    hudSfxMuteBtn.onclick = () => {
        const muted = toggleSfxMute();
        hudSfxMuteBtn.textContent = muted ? '🔘' : '🔔';
    };
}

export function updateHUD() {
    if (!S.gameState) return;
    const me = S.gameState.players.find(p => p.id === S.myId);

    const mins = Math.floor(S.gameState.timer / 60);
    const secs = Math.floor(S.gameState.timer % 60);
    timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    timerDisplay.classList.toggle('critical', S.gameState.timer < 60);

    if (S.gameState.objective) {
        const progressBar = S.gameState.objective.progress > 0
            ? ` [${Math.floor(S.gameState.objective.progress * 100)}%]`
            : '';
        objectiveDisplay.textContent = `⚡ ${S.gameState.objective.desc}${progressBar} — Press E to interact`;
    } else if (S.gameState.phase === 'intro') {
        objectiveDisplay.textContent = `☢ OXYGEN CRITICAL — Prepare for hostile contact`;
    } else if (S.gameState.phase === 'boss') {
        objectiveDisplay.textContent = `⚠ DEFEAT THE ALIEN GUARDIAN`;
    } else if (S.gameState.phase === 'cinematic') {
        objectiveDisplay.textContent = '';
    } else {
        objectiveDisplay.textContent = '';
    }

    if (me) {
        if (!me.alive) {
            // Player is spectating
            hudHpBar.style.width = '0%';
            hudHpText.textContent = 'SPECTATING';
            const cdReady = me.abilityCd <= 0;
            hudAbility.classList.toggle('ready', false);
            hudAbilityCd.style.height = '0%';
        } else {
            const hpPct = Math.max(0, me.hp / me.maxHp);
            hudHpBar.style.width = (hpPct * 100) + '%';
            hudHpBar.className = 'hud-hp-bar' + (hpPct < 0.3 ? ' low' : hpPct < 0.6 ? ' mid' : '');
            hudHpText.textContent = `${Math.round(me.hp)} / ${me.maxHp}`;

            const cdReady = me.abilityCd <= 0;
            hudAbility.classList.toggle('ready', cdReady);
            if (!cdReady) {
                const cdPct = Math.max(0, 1 - me.abilityCd / 30);
                hudAbilityCd.style.height = (cdPct * 100) + '%';
            } else {
                hudAbilityCd.style.height = '100%';
            }
        }
    }
}
