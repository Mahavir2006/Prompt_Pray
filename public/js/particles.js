// ======================== PARTICLES ========================
import { S } from './state.js';

export function updateParticles(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
        const p = S.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) S.particles.splice(i, 1);
    }
    for (let i = S.floatTexts.length - 1; i >= 0; i--) {
        const t = S.floatTexts[i];
        t.y += t.vy * dt;
        t.life -= dt;
        if (t.life <= 0) S.floatTexts.splice(i, 1);
    }
}
