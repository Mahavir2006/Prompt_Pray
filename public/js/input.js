// ======================== INPUT HANDLERS ========================
import { S } from './state.js';

export function initInput() {
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();

        const chatInput = document.getElementById('chatInput');
        if (chatInput && document.activeElement === chatInput) {
            if (e.key === 'Enter') {
                const text = chatInput.value.trim();
                if (text.length > 0 && S.ws && S.ws.readyState === 1) {
                    S.ws.send(JSON.stringify({ type: 'chat', msg: text }));
                }
                chatInput.value = '';
                chatInput.blur();
                chatInput.style.display = 'none';
            } else if (e.key === 'Escape') {
                chatInput.value = '';
                chatInput.blur();
                chatInput.style.display = 'none';
            }
            return;
        }

        if (e.key === 'Enter' && S.screenPhase === 'game') {
            if (chatInput) {
                chatInput.style.display = 'block';
                chatInput.focus();
            }
            e.preventDefault();
            return;
        }

        if (e.target.tagName === 'INPUT') return;

        if (S.terminalOpen) return;

        if (k === 'w') S.keys.w = true;
        if (k === 'a') S.keys.a = true;
        if (k === 's') S.keys.s = true;
        if (k === 'd') S.keys.d = true;
        if (k === 'e') S.interacting = true;
        if (k === 'q') S.abilityPressed = true;
        if (k === 'tab') { S.tabDown = true; e.preventDefault(); }
        if (k === 'f3') { S.debugMode = !S.debugMode; e.preventDefault(); }
        if (k === 'k') {
            if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ type: 'devSkipPhase' }));
            e.preventDefault();
        }

    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w') S.keys.w = false;
        if (k === 'a') S.keys.a = false;
        if (k === 's') S.keys.s = false;
        if (k === 'd') S.keys.d = false;
        if (k === 'e') S.interacting = false;
        if (k === 'q') S.abilityPressed = false;
        if (k === 'tab') { S.tabDown = false; e.preventDefault(); }
    });

    S.canvas.addEventListener('mousemove', e => {
        S.mouseMoved = true;
        S.mouseX = e.clientX;
        S.mouseY = e.clientY;
    });
    S.canvas.addEventListener('mousedown', (e) => { if (e.button === 0) S.mouseDown = true; });
    S.canvas.addEventListener('mouseup', (e) => { if (e.button === 0) S.mouseDown = false; });
    S.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', () => {
        S.keys.w = S.keys.a = S.keys.s = S.keys.d = false;
        S.mouseDown = false;
        S.interacting = false;
        S.abilityPressed = false;
        S.tabDown = false;
    });

    // 20Hz input send
    setInterval(() => {
        if (!S.ws || S.ws.readyState !== 1 || S.screenPhase !== 'game' || !S.gameState) return;
        
        // Don't send input if player is dead (spectating)
        const me = S.gameState.players.find(p => p.id === S.myId);
        if (me && !me.alive) return;
        
        const worldMouseX = S.mouseX + S.camX - S.canvas.width / 2;
        const worldMouseY = S.mouseY + S.camY - S.canvas.height / 2;
        S.ws.send(JSON.stringify({
            type: 'input',
            w: S.keys.w, a: S.keys.a, s: S.keys.s, d: S.keys.d,
            mouseX: worldMouseX, mouseY: worldMouseY,
            attack: S.mouseDown, interact: S.interacting, ability: S.abilityPressed
        }));
    }, 50);
}
