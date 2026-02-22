// ======================== CINEMATIC ========================
import { S, stars, cineDebris, cineExhaust } from './state.js';

export function renderCinematic(dt) {
    const ctx = S.ctx;
    S.cinematicTimer += dt;
    const W = S.canvas.width, H = S.canvas.height;

    // Deep space background with nebula
    const bgGrad = ctx.createRadialGradient(W * 0.3, H * 0.4, 0, W * 0.5, H * 0.5, W * 0.9);
    bgGrad.addColorStop(0, '#0a0e1a');
    bgGrad.addColorStop(0.4, '#060a14');
    bgGrad.addColorStop(1, '#020206');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Nebula glow patches
    const nebulaAlpha = 0.04 + Math.sin(S.cinematicTimer * 0.3) * 0.015;
    ctx.save();
    ctx.globalAlpha = nebulaAlpha;
    const nebGrad1 = ctx.createRadialGradient(W * 0.2, H * 0.3, 10, W * 0.2, H * 0.3, 200);
    nebGrad1.addColorStop(0, '#4a2a8a');
    nebGrad1.addColorStop(1, 'transparent');
    ctx.fillStyle = nebGrad1;
    ctx.fillRect(0, 0, W, H);
    const nebGrad2 = ctx.createRadialGradient(W * 0.75, H * 0.6, 10, W * 0.75, H * 0.6, 180);
    nebGrad2.addColorStop(0, '#1a4a6a');
    nebGrad2.addColorStop(1, 'transparent');
    ctx.fillStyle = nebGrad2;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Stars with depth layers
    for (const star of stars) {
        const progress = Math.min(S.cinematicTimer / 3, 1);
        star.x -= star.speed * dt * (1 + progress * 3);
        if (star.x < -10) { star.x = W + Math.random() * 100; star.y = Math.random() * H; }
        const twinkle = 0.4 + Math.sin(S.cinematicTimer * 2 + star.y) * 0.3;
        const streak = S.cinematicTimer < 3 ? 1 + progress * 6 : (S.cinematicTimer < 5 ? 4 : 1);
        ctx.fillStyle = `rgba(200,220,255,${twinkle * star.size * 0.3})`;
        ctx.fillRect(star.x, star.y, star.size * streak, star.size * 0.8);
    }

    if (S.cinematicTimer < 3) {
        // ── Phase 1: Ship departing Earth ──
        const progress = S.cinematicTimer / 3;

        const earthX = W * 0.12 - progress * 50;
        const earthY = H * 0.48;
        const earthR = 55 - progress * 15;

        const atmoGlow = ctx.createRadialGradient(earthX, earthY, earthR - 5, earthX, earthY, earthR + 25);
        atmoGlow.addColorStop(0, 'rgba(100, 180, 255, 0.12)');
        atmoGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = atmoGlow;
        ctx.beginPath(); ctx.arc(earthX, earthY, earthR + 25, 0, Math.PI * 2); ctx.fill();

        const earthGrad = ctx.createRadialGradient(earthX - 10, earthY - 10, 5, earthX, earthY, earthR);
        earthGrad.addColorStop(0, '#2a7fff');
        earthGrad.addColorStop(0.5, '#1a5fd0');
        earthGrad.addColorStop(1, '#0a2a60');
        ctx.fillStyle = earthGrad;
        ctx.beginPath(); ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(34, 139, 34, 0.4)';
        ctx.beginPath(); ctx.arc(earthX - 8, earthY - 10, earthR * 0.35, 0.2, 1.8); ctx.fill();
        ctx.beginPath(); ctx.arc(earthX + 12, earthY + 5, earthR * 0.25, 0.5, 2.5); ctx.fill();

        ctx.strokeStyle = 'rgba(100, 200, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(earthX, earthY, earthR + 3, 0, Math.PI * 2); ctx.stroke();

        const shipX = W * 0.25 + progress * W * 0.35;
        const shipY = H * 0.48 - progress * 20;
        drawDetailedShip(shipX, shipY, 2.0, progress, dt);

        ctx.globalAlpha = Math.min(1, S.cinematicTimer * 0.8) * (1 - Math.max(0, progress - 0.8) * 5);
        ctx.fillStyle = '#4cc9f0';
        ctx.font = 'bold 15px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('DEPARTING EARTH — MISSION EXOPLAY', W / 2, H * 0.88);
        ctx.font = '11px Rajdhani';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('DESTINATION: UNCHARTED EXOPLANET KX-7741', W / 2, H * 0.92);
        ctx.globalAlpha = 1;

    } else if (S.cinematicTimer < 5) {
        // ── Phase 2: Approaching alien planet + crash ──
        const progress = (S.cinematicTimer - 3) / 2;

        const planetX = W * 0.72;
        const planetY = H * 0.48;
        const planetR = 50 + progress * 220;

        const outerGlow = ctx.createRadialGradient(planetX, planetY, planetR * 0.8, planetX, planetY, planetR * 1.3);
        outerGlow.addColorStop(0, 'rgba(100, 50, 160, 0.1)');
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath(); ctx.arc(planetX, planetY, planetR * 1.3, 0, Math.PI * 2); ctx.fill();

        const planetGrad = ctx.createRadialGradient(planetX - planetR * 0.3, planetY - planetR * 0.3, planetR * 0.1, planetX, planetY, planetR);
        planetGrad.addColorStop(0, '#4a2a6a');
        planetGrad.addColorStop(0.6, '#2a1544');
        planetGrad.addColorStop(1, '#100a20');
        ctx.fillStyle = planetGrad;
        ctx.beginPath(); ctx.arc(planetX, planetY, planetR, 0, Math.PI * 2); ctx.fill();

        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#6a3a9a';
        ctx.beginPath(); ctx.arc(planetX - planetR * 0.2, planetY + planetR * 0.1, planetR * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a1a5a';
        ctx.beginPath(); ctx.arc(planetX + planetR * 0.3, planetY - planetR * 0.2, planetR * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = `rgba(140, 80, 200, ${0.2 + progress * 0.2})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(planetX, planetY, planetR + 4, 0, Math.PI * 2); ctx.stroke();

        const shipX = W * 0.55 - progress * W * 0.15;
        const shipY = H * 0.48 + Math.sin(S.cinematicTimer * 6) * (3 + progress * 25);

        for (const d of cineDebris) {
            d.x -= d.speed * dt * (1 + progress * 2);
            d.rot += d.rotSpd * dt;
            if (d.x < -20) { d.x = W + 20; d.y = Math.random() * H; }
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(d.rot);
            ctx.globalAlpha = 0.3 + progress * 0.4;
            ctx.fillStyle = d.color;
            ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.6);
            ctx.restore();
        }

        if (progress > 0.4) {
            const shakeAmt = (progress - 0.4) * 25;
            ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
        }

        drawDetailedShip(shipX, shipY, 1.4, progress, dt, true);

        ctx.fillStyle = '#e63946';
        ctx.font = '18px Orbitron';
        ctx.textAlign = 'center';
        const blink = Math.sin(S.cinematicTimer * 8) > 0 ? 1 : 0.3;
        ctx.globalAlpha = progress * blink;
        ctx.fillText('⚠ COLLISION  IMMINENT ⚠', W / 2, H * 0.86);
        ctx.globalAlpha = progress * 0.6;
        ctx.font = '12px Rajdhani';
        ctx.fillStyle = '#ff9999';
        ctx.fillText('HULL INTEGRITY: ' + Math.max(0, Math.round((1 - progress) * 100)) + '%', W / 2, H * 0.91);
        ctx.globalAlpha = 1;

    } else if (S.cinematicTimer < 6) {
        // ── Phase 3: Impact flash + fade to gameplay ──
        const progress = (S.cinematicTimer - 5);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (progress < 0.2) {
            const flashFade = 1 - progress / 0.2;
            ctx.fillStyle = `rgba(255, 220, 120, ${flashFade})`;
            ctx.fillRect(0, 0, W, H);
        } else if (progress < 0.4) {
            const flashFade = 1 - (progress - 0.2) / 0.2;
            ctx.fillStyle = `rgba(255, 100, 50, ${flashFade * 0.6})`;
            ctx.fillRect(0, 0, W, H);
        }

        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, progress * 1.5)})`;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#4cc9f0';
        ctx.font = '22px Orbitron';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.max(0, 1 - progress * 2);
        ctx.fillText('CRASH LANDING DETECTED', W / 2, H / 2 - 10);
        ctx.font = '13px Rajdhani';
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('ALL SYSTEMS CRITICAL — INITIATE EMERGENCY PROTOCOL', W / 2, H / 2 + 20);
        ctx.globalAlpha = 1;
    }

    if (S.cinematicTimer >= 6) {
        S.cinematicPlayed = true;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Letterbox bars
    const barHeight = H * 0.1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, barHeight);
    ctx.fillRect(0, H - barHeight, W, barHeight);

    // Time code overlay
    const seconds = Math.floor(S.cinematicTimer * 24);
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`REC ● T+${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(Math.floor((S.cinematicTimer % 1) * 24)).padStart(2, '0')}`, W - 20, barHeight + 16);
    ctx.globalAlpha = 1;
}

function drawDetailedShip(x, y, scale, progress, dt, damaged) {
    const ctx = S.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Engine exhaust trail
    for (let i = 0; i < 3; i++) {
        const exLen = 15 + Math.random() * 25 + progress * 20;
        const exY = (i - 1) * 6;
        const exGrad = ctx.createLinearGradient(-30, exY, -30 - exLen, exY);
        exGrad.addColorStop(0, 'rgba(76, 201, 240, 0.8)');
        exGrad.addColorStop(0.3, 'rgba(100, 200, 255, 0.4)');
        exGrad.addColorStop(1, 'transparent');
        ctx.strokeStyle = exGrad;
        ctx.lineWidth = 3 - Math.abs(i - 1);
        ctx.beginPath();
        ctx.moveTo(-28, exY);
        ctx.lineTo(-28 - exLen + (Math.random() - 0.5) * 5, exY + (Math.random() - 0.5) * 4);
        ctx.stroke();
    }

    // Engine core glow
    ctx.fillStyle = '#4cc9f0';
    ctx.shadowColor = '#4cc9f0';
    ctx.shadowBlur = 20 + Math.sin(progress * 10) * 5;
    ctx.beginPath();
    ctx.ellipse(-29, 0, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Hull body
    ctx.fillStyle = damaged ? '#6a7080' : '#8899aa';
    ctx.strokeStyle = damaged ? '#555' : '#aabbcc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(22, -6); ctx.lineTo(12, -10); ctx.lineTo(-8, -14);
    ctx.lineTo(-22, -16); ctx.lineTo(-28, -10); ctx.lineTo(-28, 10);
    ctx.lineTo(-22, 16); ctx.lineTo(-8, 14); ctx.lineTo(12, 10); ctx.lineTo(22, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Wing struts
    ctx.fillStyle = damaged ? '#556070' : '#778899';
    ctx.beginPath();
    ctx.moveTo(-5, -14); ctx.lineTo(-15, -26); ctx.lineTo(-22, -24); ctx.lineTo(-18, -14);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 14); ctx.lineTo(-15, 26); ctx.lineTo(-22, 24); ctx.lineTo(-18, 14);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Cockpit window
    const winGrad = ctx.createRadialGradient(18, -1, 1, 18, -1, 6);
    winGrad.addColorStop(0, '#80d4ff');
    winGrad.addColorStop(1, '#2a6090');
    ctx.fillStyle = winGrad;
    ctx.beginPath();
    ctx.ellipse(18, -1, 5, 3.5, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Hull panel lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(5, -12); ctx.lineTo(5, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -15); ctx.lineTo(-10, 15); ctx.stroke();

    // Damage FX
    if (damaged) {
        ctx.globalAlpha = 0.5 + Math.random() * 0.3;
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#ff6633' : '#ffaa33';
            const sx = (Math.random() - 0.3) * 40;
            const sy = (Math.random() - 0.5) * 20;
            ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#888';
        for (let i = 0; i < 5; i++) {
            const sr = 3 + Math.random() * 8;
            ctx.beginPath();
            ctx.arc(-30 - i * 12 + Math.random() * 6, (Math.random() - 0.5) * 15, sr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}
