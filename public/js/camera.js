// ======================== CAMERA ========================
import { S } from './state.js';
import { WORLD_W, WORLD_H, PLANET_W, PLANET_H } from './constants.js';

export function updateCamera(dt) {
    if (!S.gameState) return;
    const me = S.gameState.players.find(p => p.id === S.myId);
    if (!me) return;

    if (me.currentMap && me.currentMap !== S.myCurrentMap) {
        S.myCurrentMap = me.currentMap;
    }

    const targetX = me.x;
    const targetY = me.y;
    S.camX += (targetX - S.camX) * 0.1;
    S.camY += (targetY - S.camY) * 0.1;

    const halfW = S.canvas.width / 2;
    const halfH = S.canvas.height / 2;
    const worldW = S.myCurrentMap === 'planet' ? PLANET_W : WORLD_W;
    const worldH = S.myCurrentMap === 'planet' ? PLANET_H : WORLD_H;
    S.camX = Math.max(halfW, Math.min(worldW - halfW, S.camX));
    S.camY = Math.max(halfH, Math.min(worldH - halfH, S.camY));
    if (S.canvas.width >= worldW) S.camX = worldW / 2;
    if (S.canvas.height >= worldH) S.camY = worldH / 2;

    if (S.camShakeIntensity > 0) {
        S.camShakeX = (Math.random() - 0.5) * S.camShakeIntensity * 2;
        S.camShakeY = (Math.random() - 0.5) * S.camShakeIntensity * 2;
        S.camShakeIntensity *= 0.9;
        if (S.camShakeIntensity < 0.5) S.camShakeIntensity = 0;
    } else {
        S.camShakeX = 0;
        S.camShakeY = 0;
    }
}

export function addShake(amount) {
    S.camShakeIntensity = Math.min(S.camShakeIntensity + amount, 15);
}

export function worldToScreen(wx, wy) {
    return {
        x: wx - S.camX + S.canvas.width / 2 + S.camShakeX,
        y: wy - S.camY + S.canvas.height / 2 + S.camShakeY
    };
}
