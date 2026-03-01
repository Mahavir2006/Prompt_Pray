// ======================== RENDERER ========================
import { S, stars } from './state.js';
import {
    ROLE_COLORS, MAP_SCALE, MAP_ZONES, OBSTACLES, PLANET_OBSTACLES,
    WORLD_W, WORLD_H, PLANET_W, PLANET_H,
    SPRITE_SCALE, ORC_FRAME, ORC_FRAME_COUNTS
} from './constants.js';
import {
    roleSprites, orcSprites, spearImg, gunImg, medboxImg, bulletImg,
    mapBgImage, planetBgImage,
    getOrcDirRow, getOrcDirection, getEnemyAnim, getAnimState, angleToDir
} from './assets.js';
import { updateCamera, worldToScreen } from './camera.js';
import { renderCinematic } from './cinematic.js';
import { updateHUD } from './hud.js';

// ======================== RENDER ENTRY ========================
export function render(dt) {
    const ctx = S.ctx;
    ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);

    if (S.screenPhase === 'cinematic') {
        renderCinematic(dt);
        return;
    }

    if (S.screenPhase !== 'game' || !S.gameState) {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);
        for (const star of stars) {
            ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
            ctx.fillRect(star.x % S.canvas.width, star.y % S.canvas.height, star.size, star.size);
        }
        return;
    }

    updateCamera(dt);

    ctx.fillStyle = '#030308';
    ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);

    // Distant stars (parallax)
    ctx.save();
    for (const star of stars) {
        const sx = ((star.x - S.camX * 0.1) % S.canvas.width + S.canvas.width) % S.canvas.width;
        const sy = ((star.y - S.camY * 0.05) % S.canvas.height + S.canvas.height) % S.canvas.height;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.3})`;
        ctx.fillRect(sx, sy, star.size * 0.7, star.size * 0.7);
    }
    ctx.restore();

    drawMap();
    drawObjective();
    drawTurrets();
    drawEnemies();
    if (S.gameState.boss) {
        drawBoss();
    } else {
        bossSpawnTime = 0; // reset for next encounter
    }
    drawProjectiles();
    drawPlayers(dt);
    drawParticles();
    drawFloatTexts();
    drawMinimap();
    if (S.tabDown) drawScoreboard();
    updateHUD();
}

// ======================== MAP ========================
function drawMap() {
    const ctx = S.ctx;
    const s = worldToScreen(0, 0);

    if (S.myCurrentMap === 'planet') {
        if (planetBgImage.complete && planetBgImage.naturalWidth > 0) {
            ctx.drawImage(planetBgImage, s.x, s.y, PLANET_W, PLANET_H);
        } else {
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(s.x, s.y, PLANET_W, PLANET_H);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '24px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText('PLANET SURFACE', s.x + PLANET_W / 2, s.y + PLANET_H / 2);
        }
    } else {
        if (mapBgImage.complete && mapBgImage.naturalWidth > 0) {
            ctx.drawImage(mapBgImage, s.x, s.y, WORLD_W, WORLD_H);
        }
    }

    // Transition zone indicators
    if (S.myCurrentMap === 'ship') {
        const exitX = 400 * MAP_SCALE, exitY = 920 * MAP_SCALE;
        const exitW = 224 * MAP_SCALE, exitH = 104 * MAP_SCALE;
        const es = worldToScreen(exitX, exitY);
        const time = performance.now() / 1000;
        const pulse = Math.sin(time * 3) * 0.3 + 0.5;

        ctx.save();
        ctx.fillStyle = `rgba(244, 162, 97, ${pulse * 0.3})`;
        ctx.fillRect(es.x, es.y, exitW, exitH);
        ctx.strokeStyle = `rgba(244, 162, 97, ${pulse * 0.8})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(es.x, es.y, exitW, exitH);
        ctx.fillStyle = `rgba(244, 162, 97, ${pulse})`;
        ctx.font = '12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('▼ PRESS E TWICE TO EXIT ▼', es.x + exitW / 2, es.y + exitH / 2 + 4);
        ctx.restore();
    } else if (S.myCurrentMap === 'planet') {
        const exitX = 650 * MAP_SCALE, exitY = 850 * MAP_SCALE;
        const exitW = 236 * MAP_SCALE, exitH = 100 * MAP_SCALE;
        const es = worldToScreen(exitX, exitY);
        const time = performance.now() / 1000;
        const pulse = Math.sin(time * 3) * 0.3 + 0.5;

        ctx.save();
        ctx.fillStyle = `rgba(76, 201, 240, ${pulse * 0.3})`;
        ctx.fillRect(es.x, es.y, exitW, exitH);
        ctx.strokeStyle = `rgba(76, 201, 240, ${pulse * 0.8})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(es.x, es.y, exitW, exitH);
        ctx.fillStyle = `rgba(76, 201, 240, ${pulse})`;
        ctx.font = '12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('▲ PRESS E TWICE TO RETURN ▲', es.x + exitW / 2, es.y + exitH / 2 + 4);
        ctx.restore();
    }

    // Debug overlay
    if (S.debugMode) {
        ctx.save();
        const activeZones = S.myCurrentMap === 'planet' ? [
            { id: 'planet_main', x: 0, y: 0, w: 1536 * MAP_SCALE, h: 1024 * MAP_SCALE }
        ] : MAP_ZONES;
        const activeObs = S.myCurrentMap === 'planet' ? PLANET_OBSTACLES : OBSTACLES;

        for (const zone of activeZones) {
            const zs = worldToScreen(zone.x, zone.y);
            ctx.fillStyle = 'rgba(0,255,0,0.08)';
            ctx.fillRect(zs.x, zs.y, zone.w, zone.h);
            ctx.strokeStyle = 'rgba(0,255,0,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(zs.x, zs.y, zone.w, zone.h);
            if (zone.id || zone.label) {
                ctx.fillStyle = 'rgba(0,255,0,0.7)';
                ctx.font = '9px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(zone.id || zone.label, zs.x + 3, zs.y + 11);
            }
        }
        for (const obs of activeObs) {
            if (obs.type === 'rect') {
                const os = worldToScreen(obs.x, obs.y);
                ctx.fillStyle = 'rgba(255,0,0,0.1)';
                ctx.fillRect(os.x, os.y, obs.w, obs.h);
                ctx.strokeStyle = 'rgba(255,60,60,0.8)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(os.x, os.y, obs.w, obs.h);
            } else if (obs.type === 'circle') {
                const os = worldToScreen(obs.x, obs.y);
                ctx.fillStyle = 'rgba(255,0,0,0.1)';
                ctx.beginPath();
                ctx.arc(os.x, os.y, obs.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,60,60,0.8)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`DEBUG MODE (F3) — Map: ${S.myCurrentMap.toUpperCase()}`, 10, S.canvas.height - 10);
        ctx.restore();
    }
}

// ======================== OBJECTIVE ========================
function drawObjective() {
    const ctx = S.ctx;
    if (!S.gameState.objective) return;
    const obj = S.gameState.objective;
    let targetX = obj.x, targetY = obj.y;
    let isDirect = obj.map === S.myCurrentMap;

    if (!isDirect) {
        if (S.myCurrentMap === 'ship' && obj.map === 'planet') {
            targetX = 400 * MAP_SCALE + 112 * MAP_SCALE;
            targetY = 920 * MAP_SCALE + 50 * MAP_SCALE;
        } else if (S.myCurrentMap === 'planet' && obj.map === 'ship') {
            targetX = 650 * MAP_SCALE + 118 * MAP_SCALE;
            targetY = 850 * MAP_SCALE + 50 * MAP_SCALE;
        }
    }

    const s = worldToScreen(targetX, targetY);
    const time = performance.now() / 1000;

    if (isDirect) {
        const pulse = Math.sin(time * 3) * 0.3 + 0.7;
        ctx.strokeStyle = `rgba(255,209,102,${pulse * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 35 + Math.sin(time * 2) * 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(255,209,102,${pulse * 0.15})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffd166';
        ctx.font = '18px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', s.x, s.y + 6);
        ctx.font = '12px Orbitron';
        ctx.fillText('TASK', s.x, s.y - 40);

        if (obj.progress > 0) {
            const barW = 60, barH = 6;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(s.x - barW / 2, s.y + 40, barW, barH);
            ctx.fillStyle = '#ffd166';
            ctx.fillRect(s.x - barW / 2, s.y + 40, barW * obj.progress, barH);
            ctx.strokeStyle = 'rgba(255,209,102,0.4)';
            ctx.strokeRect(s.x - barW / 2, s.y + 40, barW, barH);
            ctx.fillStyle = 'rgba(255,209,102,0.8)';
            ctx.font = '10px Orbitron';
            ctx.fillText(Math.floor(obj.progress * 100) + '%', s.x, s.y + 58);
        }
    }

    const me = S.gameState.players.find(p => p.id === S.myId);
    if (me) {
        const distToTarget = Math.hypot(targetX - me.x, targetY - me.y);
        if (s.x < 50 || s.x > S.canvas.width - 50 || s.y < 50 || s.y > S.canvas.height - 50 || distToTarget > 300) {
            const angle = Math.atan2(targetY - me.y, targetX - me.x);
            const radius = 90;
            const arrowX = S.canvas.width / 2 + Math.cos(angle) * radius;
            const arrowY = S.canvas.height / 2 + Math.sin(angle) * radius;

            ctx.save();
            ctx.translate(arrowX, arrowY);
            ctx.rotate(angle);

            const flash = Math.sin(time * 6) * 0.2 + 0.8;
            ctx.fillStyle = isDirect ? `rgba(255,209,102,${flash})` : `rgba(0,255,255,${flash})`;

            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(-12, -10);
            ctx.lineTo(-8, 0);
            ctx.lineTo(-12, 10);
            ctx.closePath();
            ctx.fill();

            ctx.shadowColor = isDirect ? '#ffd166' : '#00ffff';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.restore();
        }
    }
}

// ======================== PLAYERS ========================
function drawPlayers(dt) {
    const ctx = S.ctx;
    if (!S.gameState) return;

    for (const p of S.gameState.players) {
        const pMap = p.currentMap || 'ship';
        if (pMap !== S.myCurrentMap) continue;

        const s = worldToScreen(p.x, p.y);
        const color = ROLE_COLORS[p.role] || '#fff';
        const isMe = p.id === S.myId;

        if (!p.alive) {
            const anim = getAnimState(p.id);
            const dir = anim.lastDir || 'south';
            const role = p.role || 'vanguard';
            const frames = roleSprites[role]?.death?.[dir];
            if (frames && frames.length > 0) {
                if (!anim.deathDone) {
                    anim.deathTimer += 0.016;
                    if (anim.deathTimer >= 0.1) {
                        anim.deathTimer = 0;
                        if (anim.deathFrame < frames.length - 1) anim.deathFrame++;
                        else anim.deathDone = true;
                    }
                }
                const frame = frames[anim.deathFrame];
                if (frame && frame.complete && frame.naturalWidth > 0) {
                    ctx.globalAlpha = 0.7;
                    const sw = frame.naturalWidth * SPRITE_SCALE;
                    const sh = frame.naturalHeight * SPRITE_SCALE;
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(frame, s.x - sw / 2, s.y - sh / 2, sw, sh);
                    ctx.imageSmoothingEnabled = true;
                    ctx.globalAlpha = 1;
                }
            } else {
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#666';
                ctx.beginPath();
                ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            if (p.respawnTimer > 0) {
                ctx.fillStyle = '#fff';
                ctx.font = '12px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('SPECTATING', s.x, s.y + 4);
            }
            continue;
        }

        if (p.abilityActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 20;
        }

        drawVanguardSprite(p, s, isMe, dt);
        ctx.shadowBlur = 0;

        // Direction indicator
        const angle = Math.atan2(
            (S.mouseY + S.camY - S.canvas.height / 2) - p.y,
            (S.mouseX + S.camX - S.canvas.width / 2) - p.x
        );
        if (isMe) {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(s.x + Math.cos(angle) * 20, s.y + Math.sin(angle) * 20);
            ctx.lineTo(s.x + Math.cos(angle) * 30, s.y + Math.sin(angle) * 30);
            ctx.stroke();
        }

        // Name tag
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, s.x, s.y - 30);

        // HP bar
        const hpPct = p.hp / p.maxHp;
        const barW = 36, barH = 4;
        const barX = s.x - barW / 2;
        const barY = s.y - 24;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpPct > 0.6 ? '#06d6a0' : hpPct > 0.3 ? '#ffd166' : '#e63946';
        ctx.fillRect(barX, barY, barW * hpPct, barH);

        // Heal beam (medic)
        if (p.role === 'medic' && !S.mouseDown) {
            let nearestAlly = null;
            let nearestDist = 200;
            for (const op of S.gameState.players) {
                if (op.id === p.id || !op.alive || op.hp >= op.maxHp) continue;
                const d = Math.sqrt((p.x - op.x) ** 2 + (p.y - op.y) ** 2);
                if (d < nearestDist) { nearestDist = d; nearestAlly = op; }
            }
            if (nearestAlly && isMe) {
                const as = worldToScreen(nearestAlly.x, nearestAlly.y);
                ctx.strokeStyle = `rgba(239, 71, 111, ${0.3 + Math.sin(performance.now() / 200) * 0.2})`;
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(as.x, as.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
}

function drawVanguardSprite(p, s, isMe, dt) {
    const ctx = S.ctx;
    const anim = getAnimState(p.id);

    let facingAngle;
    if (isMe) {
        if (S.mouseMoved) {
            facingAngle = Math.atan2(
                (S.mouseY + S.camY - S.canvas.height / 2) - p.y,
                (S.mouseX + S.camX - S.canvas.width / 2) - p.x
            );
        } else {
            const dxDelta = p.x - (anim.prevX || p.x);
            const dyDelta = p.y - (anim.prevY || p.y);
            if (Math.abs(dxDelta) > 0.1 || Math.abs(dyDelta) > 0.1) {
                facingAngle = Math.atan2(dyDelta, dxDelta);
            } else {
                facingAngle = anim.lastAngle || 0;
            }
        }
    } else {
        const dx = p.x - (anim.prevX || p.x);
        const dy = p.y - (anim.prevY || p.y);
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            facingAngle = Math.atan2(dy, dx);
        } else {
            facingAngle = anim.lastAngle || 0;
        }
    }
    anim.lastAngle = facingAngle;
    const dir = angleToDir(facingAngle);
    anim.lastDir = dir;

    const dxDelta = p.x - (anim.prevX || p.x);
    const dyDelta = p.y - (anim.prevY || p.y);
    let isMoving;
    if (isMe) {
        isMoving = S.keys.w || S.keys.a || S.keys.s || S.keys.d;
    } else {
        if (Math.abs(dxDelta) > 0.1 || Math.abs(dyDelta) > 0.1) {
            anim.moveGrace = 0.15;
        }
        if (anim.moveGrace > 0) {
            anim.moveGrace -= dt;
            isMoving = true;
        } else {
            isMoving = false;
        }
    }
    anim.prevX = p.x;
    anim.prevY = p.y;

    anim.deathFrame = 0;
    anim.deathTimer = 0;
    anim.deathDone = false;

    const role = p.role || 'vanguard';
    const sprites = roleSprites[role] || roleSprites.vanguard;

    let sprite;
    if (isMoving && sprites.walk[dir]) {
        anim.walkTimer += dt;
        if (anim.walkTimer >= 0.1) {
            anim.walkTimer = 0;
            anim.walkFrame = (anim.walkFrame + 1) % 6;
        }
        sprite = sprites.walk[dir][anim.walkFrame];

        // Footstep dust particles while walking
        anim.dustTimer = (anim.dustTimer || 0) + dt;
        if (anim.dustTimer >= 0.18) {
            anim.dustTimer = 0;
            S.particles.push({
                x: p.x + (Math.random() - 0.5) * 8,
                y: p.y + 12,
                vx: (Math.random() - 0.5) * 20,
                vy: -Math.random() * 15,
                life: 0.35,
                color: 'rgba(200,200,200,0.25)',
                size: 2 + Math.random() * 2
            });
        }
    } else {
        anim.walkFrame = 0;
        anim.walkTimer = 0;
        anim.dustTimer = 0;
        sprite = sprites.idle[dir];
    }

    // ── Idle breathing bob (subtle vertical oscillation) ──
    const idleBob = isMoving ? 0 : Math.sin(performance.now() / 400) * 2;

    // ── Hit-flash tracking ──
    if (!anim.hitFlash) anim.hitFlash = 0;
    if (anim.prevHp !== undefined && p.hp < anim.prevHp && p.hp > 0) {
        anim.hitFlash = 0.25;   // flash for 250 ms
    }
    anim.prevHp = p.hp;
    if (anim.hitFlash > 0) anim.hitFlash -= dt;

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const sw = sprite.naturalWidth * SPRITE_SCALE;
        const sh = sprite.naturalHeight * SPRITE_SCALE;
        const drawY = s.y + idleBob;

        const facingRight = Math.cos(facingAngle) >= 0;
        const needsFlip = (p.role === 'scout' || p.role === 'medic') && facingRight;

        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.translate(s.x, drawY);
        if (needsFlip) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);

        // White flash overlay when hit
        if (anim.hitFlash > 0) {
            ctx.globalAlpha = anim.hitFlash * 3;   // quick bright flash
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = '#fff';
            ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        ctx.imageSmoothingEnabled = true;
    } else {
        ctx.fillStyle = '#4cc9f0';
        ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = isMe ? 2.5 : 1;
        drawHexagon(s.x, s.y + idleBob, 18);
    }

    // Weapon sprite
    let weaponSprite = null;
    let weaponScale = 2;
    let weaponOffsetDist = 20;
    let showSwing = false;
    if (p.role === 'vanguard') {
        weaponSprite = roleSprites.vanguard.sword[dir];
        weaponScale = 1.2;
        showSwing = true;
    } else if (p.role === 'engineer') {
        if (S.mouseDown && isMe) {
            anim.spearThrown = 1.5;
        }
        if (anim.spearThrown > 0) {
            anim.spearThrown -= dt;
            weaponSprite = null;
        } else {
            weaponSprite = spearImg;
            weaponScale = 0.1;
            weaponOffsetDist = 20;
            showSwing = true;
        }
    } else if (p.role === 'scout') {
        weaponSprite = gunImg;
        weaponScale = 0.06;
        weaponOffsetDist = 10;
    } else if (p.role === 'medic') {
        weaponSprite = medboxImg;
        weaponScale = 0.1;
        weaponOffsetDist = 16;
    }

    if (weaponSprite && weaponSprite.complete && weaponSprite.naturalWidth > 0) {
        const facingRight = Math.cos(facingAngle) >= 0;
        const wOffsetX = facingRight ? weaponOffsetDist : -weaponOffsetDist;
        const wOffsetY = 0;
        const wW = weaponSprite.naturalWidth * weaponScale;
        const wH = weaponSprite.naturalHeight * weaponScale;

        if (p.role === 'scout') {
            ctx.save();
            ctx.translate(s.x + wOffsetX, s.y + wOffsetY);
            if (!facingRight) ctx.scale(-1, 1);
            const localAngle = facingRight ? facingAngle : (Math.PI - facingAngle);
            ctx.rotate(localAngle);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(weaponSprite, 0, -wH / 2, wW, wH);
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        } else {
            const tiltAngle = facingRight ? (30 * Math.PI / 180) : (-30 * Math.PI / 180);
            if (!anim.swingTimer) anim.swingTimer = 0;
            if (S.mouseDown && isMe && showSwing) {
                anim.swingTimer = Math.min(anim.swingTimer + dt * 8, 1);
            } else {
                anim.swingTimer = Math.max(anim.swingTimer - dt * 5, 0);
            }
            const swingExtra = showSwing ? anim.swingTimer * (45 * Math.PI / 180) : 0;

            ctx.save();
            ctx.translate(s.x + wOffsetX, s.y + wOffsetY);
            if (!facingRight) ctx.scale(-1, 1);
            ctx.rotate(Math.abs(tiltAngle) + swingExtra);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(weaponSprite, -wW / 2, -wH / 2, wW, wH);
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        }

        if (S.mouseDown && isMe && showSwing) {
            const hitX = s.x + Math.cos(facingAngle) * 35;
            const hitY = s.y + Math.sin(facingAngle) * 35;
            ctx.strokeStyle = `rgba(76, 201, 240, ${0.3 + anim.swingTimer * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(hitX, hitY, 40, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.strokeStyle = `rgba(76, 201, 240, ${0.5 * anim.swingTimer})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 38, facingAngle - 0.5, facingAngle + 0.5);
            ctx.stroke();
        }
    }
}

// ── Shape helpers ──
function drawHexagon(x, y, r) {
    const ctx = S.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

// ======================== ENEMIES ========================
function drawEnemies() {
    const ctx = S.ctx;
    if (!S.gameState) return;

    const activeIds = new Set(S.gameState.enemies.map(e => e.id));
    for (const id in S.enemyAnimState) {
        if (!activeIds.has(id)) delete S.enemyAnimState[id];
    }

    for (const e of S.gameState.enemies) {
        const eMap = e.map || 'ship';
        if (eMap !== S.myCurrentMap) continue;

        const s = worldToScreen(e.x, e.y);
        const isElite = e.type === 'elite';
        const r = isElite ? 22 : 16;

        const orcKey = e.orcType || 'orc1';
        const frames = orcSprites[orcKey] || orcSprites.orc1;
        const anim = getEnemyAnim(e.id);

        const dx = e.x - (anim.prevX || e.x);
        const dy = e.y - (anim.prevY || e.y);
        const isMoving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
        anim.prevX = e.x;
        anim.prevY = e.y;

        const direction = getOrcDirection(dx, dy);

        anim.timer += 0.016;
        if (anim.timer >= 0.1) {
            anim.timer = 0;
            anim.frame++;
        }

        // ── Enemy hit-flash tracking ──
        if (!anim.hitFlash) anim.hitFlash = 0;
        if (anim.prevHp !== undefined && e.hp < anim.prevHp) {
            anim.hitFlash = 0.2;
        }
        anim.prevHp = e.hp;
        if (anim.hitFlash > 0) anim.hitFlash -= 0.016;

        // Choose animation: attack if enemy is striking, hurt if just hit, move/idle otherwise
        let action;
        if (e.attacking) {
            action = 'attack';
        } else if (anim.hitFlash > 0.12) {
            action = 'hurt';
        } else {
            action = isMoving ? (isElite && Math.abs(dx) + Math.abs(dy) > 3 ? 'run' : 'walk') : 'idle';
        }
        
        const actionFrames = frames[action] || frames[isMoving ? 'walk' : 'idle'];
        if (!actionFrames) {
            console.warn(`No frames for action ${action}`, { action, frames });
        }
        const dirFrames = actionFrames ? (actionFrames[direction] || actionFrames['south']) : null;
        if (!dirFrames || !dirFrames.length) {
            console.warn(`No frames for direction ${direction}`, { direction, actionFrames, orcKey, action });
        }
        const maxFrames = dirFrames ? dirFrames.length : 0;
        const frameIdx = anim.frame % (maxFrames || 1);
        const frameImg = dirFrames ? dirFrames[frameIdx] : null;

        if (!frameImg) {
            console.warn(`Missing frame for ${orcKey} ${action} ${direction} index ${frameIdx}`, { frameIdx, maxFrames, dirFrames });
        }

        if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
            const orcScale = isElite ? 2.2 : 1.8;
            const dW = ORC_FRAME * orcScale;
            const dH = ORC_FRAME * orcScale;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(frameImg, -dW / 2, -dH / 2, dW, dH);

            // White hit-flash overlay
            if (anim.hitFlash > 0) {
                ctx.globalAlpha = anim.hitFlash * 4;
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = '#fff';
                ctx.fillRect(-dW / 2, -dH / 2, dW, dH);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }

            ctx.imageSmoothingEnabled = true;
            if (isElite) {
                ctx.shadowColor = '#ff6b6b';
                ctx.shadowBlur = 15;
                ctx.strokeStyle = 'rgba(255,100,100,0.4)';
                ctx.lineWidth = 2;
                ctx.strokeRect(-dW / 2, -dH / 2, dW, dH);
                ctx.shadowBlur = 0;
            }
            ctx.restore();
        } else {
            ctx.fillStyle = isElite ? '#ff6b6b' : '#e63946';
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const hpPct = e.hp / e.maxHp;
        if (hpPct < 1) {
            const barW = isElite ? 32 : 24;
            const barH = 3;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(s.x - barW / 2, s.y - r - 8, barW, barH);
            ctx.fillStyle = '#e63946';
            ctx.fillRect(s.x - barW / 2, s.y - r - 8, barW * hpPct, barH);
        }
    }
}

// ======================== BOSS ========================
let bossSpawnTime = 0; // tracks when boss first appeared for entrance animation
function drawBoss() {
    const ctx = S.ctx;
    const bossMap = S.gameState.boss.map || 'planet';
    if (S.myCurrentMap !== bossMap) return;
    const boss = S.gameState.boss;
    const s = worldToScreen(boss.x, boss.y);
    const time = performance.now() / 1000;
    const sheets = orcSprites.orc3;

    // ── Boss entrance animation (first 2 seconds) ──
    if (bossSpawnTime === 0) bossSpawnTime = time;
    const spawnAge = time - bossSpawnTime;
    const entranceScale = Math.min(1, spawnAge / 1.2);                     // scale from 0→1 over 1.2s
    const entranceAlpha = Math.min(1, spawnAge / 0.8);                     // fade in over 0.8s
    const shockwaveRadius = spawnAge < 1.5 ? spawnAge * 200 : 0;          // expanding ring

    // Shockwave ring during entrance
    if (shockwaveRadius > 0 && shockwaveRadius < 300) {
        ctx.strokeStyle = `rgba(123, 44, 191, ${1 - shockwaveRadius / 300})`;
        ctx.lineWidth = 4 - (shockwaveRadius / 100);
        ctx.beginPath();
        ctx.arc(s.x, s.y, shockwaveRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    const dx = boss.x - (S.bossAnim.prevX || boss.x);
    const dy = boss.y - (S.bossAnim.prevY || boss.y);
    const isMoving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    S.bossAnim.prevX = boss.x;
    S.bossAnim.prevY = boss.y;

    const dirRow = getOrcDirRow(dx, dy);

    S.bossAnim.timer += 0.016;
    if (S.bossAnim.timer >= 0.1) {
        S.bossAnim.timer = 0;
        S.bossAnim.frame++;
    }

    const action = isMoving ? 'walk' : 'idle';
    const sheet = sheets[action];
    const maxFrames = ORC_FRAME_COUNTS[action];
    const frameIdx = S.bossAnim.frame % maxFrames;

    const auraSize = (70 + Math.sin(time * 2) * 10) * entranceScale;
    ctx.globalAlpha = entranceAlpha;
    ctx.fillStyle = boss.aggroPhase
        ? `rgba(230, 57, 70, ${0.1 + Math.sin(time * 4) * 0.05})`
        : `rgba(123, 44, 191, ${0.08 + Math.sin(time * 2) * 0.04})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, auraSize, 0, Math.PI * 2);
    ctx.fill();

    if (sheet && sheet.complete && sheet.naturalWidth > 0) {
        const sx = frameIdx * ORC_FRAME;
        const sy = dirRow * ORC_FRAME;
        const bossScale = 6.5 * entranceScale;
        const dW = ORC_FRAME * bossScale;
        const dH = ORC_FRAME * bossScale;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.imageSmoothingEnabled = false;
        if (boss.aggroPhase) {
            ctx.shadowColor = '#e63946';
            ctx.shadowBlur = 20;
        } else {
            ctx.shadowColor = '#7b2cbf';
            ctx.shadowBlur = 12;
        }
        ctx.drawImage(sheet, sx, sy, ORC_FRAME, ORC_FRAME, -dW / 2, -dH / 2, dW, dH);
        ctx.shadowBlur = 0;
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
    } else {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(time * 0.5);
        ctx.fillStyle = boss.aggroPhase ? '#9b2c3f' : '#7b2cbf';
        ctx.strokeStyle = boss.aggroPhase ? '#e63946' : '#a855f7';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = 45 * Math.cos(angle); const py = 45 * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    if (S.gameState.weakpointActive) {
        ctx.strokeStyle = `rgba(6, 214, 160, ${0.5 + Math.sin(time * 6) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Boss HP bar (top of screen)
    const barW = Math.min(400, S.canvas.width * 0.5);
    const barH = 16;
    const barX = S.canvas.width / 2 - barW / 2;
    const barY = 20;
    const hpPct = boss.hp / boss.maxHp;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = boss.aggroPhase ? '#e63946' : '#7b2cbf';
    ctx.fillRect(barX, barY, barW * hpPct, barH);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const mx = barX + barW * (i / 4);
        ctx.beginPath(); ctx.moveTo(mx, barY); ctx.lineTo(mx, barY + barH); ctx.stroke();
    }
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = '#fff';
    ctx.font = '10px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText(`ORC WARLORD — ${Math.round(boss.hp)} / ${boss.maxHp}`, S.canvas.width / 2, barY + barH + 16);

    ctx.globalAlpha = 1;   // reset after entrance fade
}

// ======================== PROJECTILES / TURRETS / PARTICLES / FLOATS ========================
function drawProjectiles() {
    const ctx = S.ctx;
    if (!S.gameState) return;
    for (const p of S.gameState.projectiles) {
        const s = worldToScreen(p.x, p.y);
        const angle = Math.atan2(p.vy || 0, p.vx || 0);

        if (p.isTurretProj) {
            // Turret bullets: grey circles
            ctx.fillStyle = '#888888';
            ctx.shadowColor = '#aaaaaa';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else if (p.penetrating) {
            // Scout penetrating shot: bright green glow
            ctx.fillStyle = '#06d6a0';
            ctx.shadowColor = '#06d6a0';
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else if (p.isPlayerProj && p.ownerRole === 'engineer' && spearImg && spearImg.complete && spearImg.naturalWidth > 0) {
            const spScale = 0.1;
            const spW = spearImg.naturalWidth * spScale;
            const spH = spearImg.naturalHeight * spScale;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(angle);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(spearImg, -spW / 2, -spH / 2, spW, spH);
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        } else if (p.isPlayerProj && bulletImg && bulletImg.complete && bulletImg.naturalWidth > 0) {
            const bScale = 0.06;
            const bW = bulletImg.naturalWidth * bScale;
            const bH = bulletImg.naturalHeight * bScale;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(angle);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bulletImg, -bW / 2, -bH / 2, bW, bH);
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        } else {
            ctx.fillStyle = '#ff4444';
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

function drawTurrets() {
    const ctx = S.ctx;
    if (!S.gameState || !S.gameState.turrets) return;
    for (const t of S.gameState.turrets) {
        const s = worldToScreen(t.x, t.y);
        ctx.fillStyle = '#f4a261';
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.fillRect(s.x - 10, s.y - 10, 20, 20);
        ctx.strokeRect(s.x - 10, s.y - 10, 20, 20);
        ctx.fillStyle = '#c47a30';
        ctx.fillRect(s.x - 2, s.y - 16, 4, 8);
        ctx.strokeStyle = 'rgba(244,162,97,0.1)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 200, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawParticles() {
    const ctx = S.ctx;
    for (const p of S.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        const s = worldToScreen(p.x, p.y);
        ctx.fillRect(s.x - p.size / 2, s.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

function drawFloatTexts() {
    const ctx = S.ctx;
    for (const t of S.floatTexts) {
        ctx.globalAlpha = t.life;
        ctx.fillStyle = t.color;
        ctx.font = 'bold 14px Rajdhani';
        ctx.textAlign = 'center';
        const s = worldToScreen(t.x, t.y);
        ctx.fillText(t.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
}

// ======================== MINIMAP ========================
function drawMinimap() {
    const ctx = S.ctx;
    const activeW = S.myCurrentMap === 'planet' ? PLANET_W : WORLD_W;
    const activeH = S.myCurrentMap === 'planet' ? PLANET_H : WORLD_H;

    const mmW = 140;
    const mmH = 140 * (activeH / activeW);
    const mmX = S.canvas.width - mmW - 16;
    const mmY = 16;

    const scaleX = mmW / activeW;
    const scaleY = mmH / activeH;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(mmX, mmY, mmW, mmH);

    let bgImage = S.myCurrentMap === 'planet' ? planetBgImage : mapBgImage;
    if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(bgImage, mmX, mmY, mmW, mmH);
        ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(76,201,240,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    const me = S.gameState.players.find(p => p.id === S.myId);
    const isScout = me?.role === 'scout';

    for (const e of S.gameState.enemies) {
        const eMap = e.map || 'ship';
        if (eMap !== S.myCurrentMap) continue;
        if (!isScout && me) {
            const d = Math.sqrt((me.x - e.x) ** 2 + (me.y - e.y) ** 2);
            if (d > 400) continue;
        }
        ctx.fillStyle = e.type === 'elite' ? '#ff6b6b' : '#e63946';
        ctx.fillRect(mmX + e.x * scaleX - 1, mmY + e.y * scaleY - 1, 2, 2);
    }

    if (S.gameState.boss) {
        const bMap = S.gameState.boss.map || 'ship';
        if (bMap === S.myCurrentMap) {
            ctx.fillStyle = '#7b2cbf';
            ctx.fillRect(mmX + S.gameState.boss.x * scaleX - 3, mmY + S.gameState.boss.y * scaleY - 3, 6, 6);
        }
    }

    if (S.gameState.objective && S.gameState.objective.map === S.myCurrentMap) {
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(mmX + S.gameState.objective.x * scaleX - 2, mmY + S.gameState.objective.y * scaleY - 2, 4, 4);
    }

    for (const p of S.gameState.players) {
        if (!p.alive) continue;
        const pMap = p.currentMap || 'ship';
        if (pMap !== S.myCurrentMap) continue;
        ctx.fillStyle = ROLE_COLORS[p.role] || '#fff';
        ctx.fillRect(mmX + p.x * scaleX - 2, mmY + p.y * scaleY - 2, 4, 4);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(
        mmX + (S.camX - S.canvas.width / 2) * scaleX,
        mmY + (S.camY - S.canvas.height / 2) * scaleY,
        S.canvas.width * scaleX,
        S.canvas.height * scaleY
    );

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px Orbitron';
    ctx.textAlign = 'right';
    ctx.fillText(S.myCurrentMap === 'planet' ? 'PLANET RADAR' : (isScout ? 'FULL SCAN' : 'LOCAL SCAN'), mmX + mmW - 4, mmY + mmH + 10);
}

// ======================== SCOREBOARD ========================
function drawScoreboard() {
    const ctx = S.ctx;
    if (!S.gameState) return;
    const w = 420;
    const h = 30 + S.gameState.players.length * 36;
    const x = S.canvas.width / 2 - w / 2;
    const y = S.canvas.height / 2 - h / 2;

    ctx.fillStyle = 'rgba(5,5,16,0.92)';
    ctx.strokeStyle = 'rgba(76,201,240,0.2)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#4cc9f0';
    ctx.font = '12px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('SQUAD STATUS', x + w / 2, y + 20);

    S.gameState.players.forEach((p, i) => {
        const py = y + 34 + i * 36;
        ctx.fillStyle = ROLE_COLORS[p.role] || '#fff';
        ctx.font = '12px Orbitron';
        ctx.textAlign = 'left';
        ctx.fillText(`${p.name} [${p.role?.toUpperCase()}]`, x + 12, py + 12);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'left';
        ctx.fillText(
            `HP: ${Math.round(p.hp)}/${p.maxHp}  ⚔${Math.round(p.score?.damageDealt || 0)}  ♥${Math.round(p.score?.healingDone || 0)}  ☠${p.score?.enemiesKilled || 0}`,
            x + 12, py + 26
        );

        const barW = 100;
        const hpPct = p.hp / p.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + w - barW - 12, py + 4, barW, 8);
        ctx.fillStyle = hpPct > 0.6 ? '#06d6a0' : hpPct > 0.3 ? '#ffd166' : '#e63946';
        ctx.fillRect(x + w - barW - 12, py + 4, barW * hpPct, 8);
    });
}
