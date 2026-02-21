const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve landing page at root, game at /play
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ======================== CONSTANTS ========================
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const DT = TICK_MS / 1000;
const MISSION_DURATION = 600;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const PLAYER_RADIUS = 18;
const ENEMY_RADIUS = 16;
const ELITE_RADIUS = 22;
const BOSS_RADIUS = 45;
const PROJ_RADIUS = 6;
const PROJ_SPEED = 500;
const INTERACT_RANGE = 80;
const HEAL_RANGE = 200;
const RESPAWN_TIME = 5;

const ROLES = {
    vanguard: { hp: 220, damage: 28, range: 55, speed: 200, attackCd: 0.6, projSpeed: 0, description: 'Frontline tank' },
    engineer: { hp: 170, damage: 18, range: 250, speed: 200, attackCd: 0.8, projSpeed: PROJ_SPEED, description: 'Repair specialist' },
    scout: { hp: 140, damage: 22, range: 200, speed: 230, attackCd: 0.4, projSpeed: PROJ_SPEED * 1.2, description: 'Fast attacker' },
    medic: { hp: 160, damage: 10, range: 200, speed: 200, attackCd: 0.7, projSpeed: PROJ_SPEED * 0.8, description: 'Team healer' }
};

const MAP_ZONES = [
    { id: 'ship', x: 50, y: 50, w: 700, h: 400 },
    { id: 'doorway', x: 750, y: 175, w: 100, h: 150, locked: true },
    { id: 'exterior', x: 850, y: 50, w: 550, h: 400 },
    { id: 'corridor1', x: 1400, y: 150, w: 550, h: 200 },
    { id: 'beacon', x: 1950, y: 50, w: 550, h: 400 },
    { id: 'corridor2', x: 2500, y: 150, w: 550, h: 200 },
    { id: 'satellite', x: 3050, y: 50, w: 550, h: 400 }
];

const OBJECTIVES = [
    { phase: 'objective1', x: 400, y: 250, repairTime: 12, desc: 'Stabilize Core System', zone: 'ship' },
    { phase: 'objective2', x: 2225, y: 250, repairTime: 10, desc: 'Activate Signal Beacon', zone: 'beacon' },
    { phase: 'objective3', x: 3325, y: 250, repairTime: 15, desc: 'Restore Satellite Uplink', zone: 'satellite' },
    { phase: 'final', x: 400, y: 250, repairTime: 8, desc: 'Send Transmission', zone: 'ship' }
];

const SPAWN_POINTS = {
    ship: [{ x: 700, y: 100 }, { x: 700, y: 400 }, { x: 100, y: 100 }, { x: 100, y: 400 }],
    exterior: [{ x: 1350, y: 100 }, { x: 1350, y: 400 }, { x: 900, y: 100 }, { x: 900, y: 400 }],
    beacon: [{ x: 2450, y: 100 }, { x: 2450, y: 400 }, { x: 2000, y: 100 }, { x: 2000, y: 400 }],
    satellite: [{ x: 3550, y: 100 }, { x: 3550, y: 400 }, { x: 3100, y: 100 }, { x: 3100, y: 400 }],
    boss_adds: [{ x: 1350, y: 100 }, { x: 1350, y: 400 }, { x: 900, y: 450 }, { x: 1200, y: 80 }]
};

// ======================== ROOM MANAGEMENT ========================
const rooms = new Map();
let nextPlayerId = 1;
let nextEnemyId = 1;
let nextProjId = 1;

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createRoom(ws) {
    const code = generateRoomCode();
    const room = {
        code,
        players: new Map(),
        gameState: null,
        tickInterval: null,
        host: null
    };
    rooms.set(code, room);
    return room;
}

function addPlayerToRoom(room, ws, name) {
    const id = nextPlayerId++;
    const player = { id, ws, name: name || `Player ${id}`, role: null, ready: false };
    room.players.set(ws, player);
    if (!room.host) room.host = ws;
    return player;
}

function removePlayerFromRoom(room, ws) {
    room.players.delete(ws);
    if (room.host === ws) {
        room.host = room.players.size > 0 ? room.players.keys().next().value : null;
    }
    if (room.players.size === 0) {
        if (room.tickInterval) clearInterval(room.tickInterval);
        rooms.delete(room.code);
    }
}

function broadcastToRoom(room, msg) {
    const data = JSON.stringify(msg);
    for (const [ws] of room.players) {
        if (ws.readyState === 1) ws.send(data);
    }
}

function sendLobbyUpdate(room) {
    const players = [];
    for (const [, p] of room.players) {
        players.push({ id: p.id, name: p.name, role: p.role, ready: p.ready, isHost: p.ws === room.host });
    }
    broadcastToRoom(room, { type: 'lobbyUpdate', roomCode: room.code, players, canStart: canStartGame(room) });
}

function canStartGame(room) {
    if (room.players.size < MIN_PLAYERS) return false;
    let allReady = true;
    const usedRoles = new Set();
    for (const [, p] of room.players) {
        if (!p.role) allReady = false;
        if (!p.isHost && !p.ready) allReady = false;
        if (p.role) {
            if (usedRoles.has(p.role)) return false;
            usedRoles.add(p.role);
        }
    }
    return allReady;
}

// ======================== GAME STATE ========================
function createGameState(room) {
    const gs = {
        phase: 'cinematic',
        timer: MISSION_DURATION,
        phaseTimer: 0,
        objectiveIndex: 0,
        objectiveProgress: 0,
        doorUnlocked: false,
        players: new Map(),
        enemies: new Map(),
        boss: null,
        projectiles: new Map(),
        turrets: [],
        events: [],
        spawnTimer: 0,
        bossPhaseThreshold: 3,
        weakpointActive: false,
        weakpointTimer: 0,
        objectivesCompleted: 0,
        enemyHpScale: 1.0,
        enemyDmgBase: 12,
        enemySpeedBase: 100,
        finalCountdown: false
    };

    let i = 0;
    const spawnPositions = [
        { x: 300, y: 200 }, { x: 500, y: 200 }, { x: 300, y: 300 }, { x: 500, y: 300 }
    ];
    for (const [, p] of room.players) {
        const role = ROLES[p.role];
        const sp = spawnPositions[i % spawnPositions.length];
        gs.players.set(p.id, {
            id: p.id, name: p.name, role: p.role,
            x: sp.x, y: sp.y,
            hp: role.hp, maxHp: role.hp,
            alive: true, respawnTimer: 0,
            attackCd: 0, abilityCd: 0,
            abilityActive: false, abilityTimer: 0,
            input: { w: false, a: false, s: false, d: false, mouseX: 0, mouseY: 0, attack: false, interact: false, ability: false },
            score: { damageDealt: 0, healingDone: 0, enemiesKilled: 0, repairsDone: 0 },
            combatTimer: 0,
            speed: role.speed
        });
        i++;
    }
    return gs;
}

// ======================== GAME LOGIC ========================
function gameTick(room) {
    const gs = room.gameState;
    if (!gs) return;

    // Cinematic phase
    if (gs.phase === 'cinematic') {
        gs.phaseTimer += DT;
        if (gs.phaseTimer >= 6) {
            gs.phase = 'intro';
            gs.phaseTimer = 0;
        }
        broadcastState(room);
        return;
    }

    // Timer countdown (not during cinematic)
    gs.timer -= DT;
    if (gs.timer <= 0) {
        gs.timer = 0;
        endGame(room, false);
        return;
    }

    gs.phaseTimer += DT;

    // Intro phase - 15 seconds grace period
    if (gs.phase === 'intro' && gs.phaseTimer >= 15) {
        gs.phase = 'objective1';
        gs.phaseTimer = 0;
        gs.events.push({ type: 'announcement', text: 'STABILIZE THE CORE SYSTEM', duration: 3 });
    }

    // Process all players
    for (const [, player] of gs.players) {
        if (!player.alive) {
            player.respawnTimer -= DT;
            if (player.respawnTimer <= 0) {
                respawnPlayer(gs, player);
            }
            continue;
        }
        updatePlayer(gs, player);
    }

    // Enemy AI
    updateEnemies(gs);

    // Boss AI
    if (gs.boss) updateBoss(gs);

    // Projectiles
    updateProjectiles(gs);

    // Turrets
    updateTurrets(gs);

    // Spawning
    handleSpawning(gs);

    // Objectives
    handleObjective(gs, room);

    // Weakpoint timer
    if (gs.weakpointActive) {
        gs.weakpointTimer -= DT;
        if (gs.weakpointTimer <= 0) {
            gs.weakpointActive = false;
        }
    }

    // Check all dead
    let allDead = true;
    for (const [, p] of gs.players) {
        if (p.alive) { allDead = false; break; }
    }
    if (allDead) {
        let anyRespawning = false;
        for (const [, p] of gs.players) {
            if (p.respawnTimer > 0) { anyRespawning = true; break; }
        }
        if (!anyRespawning) endGame(room, false);
    }

    broadcastState(room);
    gs.events = [];
}

function updatePlayer(gs, player) {
    const role = ROLES[player.role];
    const inp = player.input;

    // Movement
    let dx = 0, dy = 0;
    if (inp.w) dy -= 1;
    if (inp.s) dy += 1;
    if (inp.a) dx -= 1;
    if (inp.d) dx += 1;
    if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len; dy /= len;
        let speed = player.speed;
        if (player.role === 'scout') speed *= 1.15;
        player.x += dx * speed * DT;
        player.y += dy * speed * DT;
        constrainToMap(gs, player);
    }

    // Combat timer
    if (player.combatTimer > 0) player.combatTimer -= DT;

    // Vanguard passive: 5 HP regen/s in combat
    if (player.role === 'vanguard' && player.combatTimer > 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 5 * DT);
    }

    // Attack cooldown
    if (player.attackCd > 0) player.attackCd -= DT;

    // Ability cooldown
    if (player.abilityCd > 0) player.abilityCd -= DT;

    // Ability active timer
    if (player.abilityActive) {
        player.abilityTimer -= DT;
        if (player.abilityTimer <= 0) {
            player.abilityActive = false;
        }
    }

    // Attack
    if (inp.attack && player.attackCd <= 0) {
        performAttack(gs, player);
        player.attackCd = role.attackCd;
        player.combatTimer = 3;
    }

    // Medic heal beam (continuous when not attacking)
    if (player.role === 'medic' && !inp.attack) {
        healNearestAlly(gs, player);
    }

    // Ability
    if (inp.ability && player.abilityCd <= 0 && !player.abilityActive) {
        activateAbility(gs, player);
    }
}

function performAttack(gs, player) {
    const role = ROLES[player.role];
    const angle = Math.atan2(player.input.mouseY - player.y, player.input.mouseX - player.x);

    if (player.role === 'vanguard') {
        // Melee attack - hit all enemies in cone
        let dmg = role.damage;
        if (player.abilityActive) dmg = 40;
        for (const [, enemy] of gs.enemies) {
            const dist = distance(player, enemy);
            if (dist < role.range + ENEMY_RADIUS) {
                const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
                if (angleDiff(angle, enemyAngle) < Math.PI / 3) {
                    damageEnemy(gs, enemy, dmg, player);
                }
            }
        }
        if (gs.boss) {
            const dist = distance(player, gs.boss);
            if (dist < role.range + BOSS_RADIUS) {
                damageBoss(gs, dmg, player);
            }
        }
        gs.events.push({ type: 'melee', x: player.x + Math.cos(angle) * 40, y: player.y + Math.sin(angle) * 40, angle });
    } else {
        // Ranged attack - spawn projectile
        const id = nextProjId++;
        gs.projectiles.set(id, {
            id, x: player.x, y: player.y,
            dx: Math.cos(angle) * (role.projSpeed || PROJ_SPEED),
            dy: Math.sin(angle) * (role.projSpeed || PROJ_SPEED),
            damage: role.damage,
            owner: player.id,
            life: role.range / (role.projSpeed || PROJ_SPEED),
            isPlayerProj: true
        });
    }
}

function healNearestAlly(gs, player) {
    let nearest = null, nearestDist = HEAL_RANGE;
    for (const [, p] of gs.players) {
        if (p.id === player.id || !p.alive || p.hp >= p.maxHp) continue;
        const d = distance(player, p);
        if (d < nearestDist) {
            nearest = p;
            nearestDist = d;
        }
    }
    if (nearest) {
        const healAmount = 20 * DT;
        nearest.hp = Math.min(nearest.maxHp, nearest.hp + healAmount);
        player.score.healingDone += healAmount;
        if (Math.random() < 0.1) {
            gs.events.push({ type: 'heal', x: nearest.x, y: nearest.y - 20, value: 20 });
        }
    }
}

function activateAbility(gs, player) {
    player.abilityCd = 30;

    switch (player.role) {
        case 'vanguard':
            player.abilityActive = true;
            player.abilityTimer = 6;
            gs.events.push({ type: 'announcement', text: 'OVERDRIVE ACTIVATED', duration: 2, color: '#4cc9f0' });
            break;

        case 'engineer': {
            const angle = Math.atan2(player.input.mouseY - player.y, player.input.mouseX - player.x);
            const tx = player.x + Math.cos(angle) * 60;
            const ty = player.y + Math.sin(angle) * 60;
            gs.turrets.push({
                x: tx, y: ty, hp: 100, timer: 10, attackCd: 0, owner: player.id, range: 200, damage: 12
            });
            gs.events.push({ type: 'announcement', text: 'TURRET DEPLOYED', duration: 2, color: '#f4a261' });
            break;
        }

        case 'scout':
            gs.weakpointActive = true;
            gs.weakpointTimer = 8;
            gs.events.push({ type: 'announcement', text: 'WEAKPOINT SCAN ACTIVE', duration: 2, color: '#06d6a0' });
            break;

        case 'medic':
            for (const [, p] of gs.players) {
                if (!p.alive) continue;
                const d = distance(player, p);
                if (d < 300) {
                    p.hp = Math.min(p.maxHp, p.hp + 60);
                    p.abilityActive = true;
                    p.abilityTimer = 4;
                    gs.events.push({ type: 'heal', x: p.x, y: p.y - 20, value: 60 });
                }
            }
            player.score.healingDone += 60 * gs.players.size;
            gs.events.push({ type: 'announcement', text: 'FIELD SURGE', duration: 2, color: '#ef476f' });
            break;
    }
}

// ======================== ENEMY AI ========================
function updateEnemies(gs) {
    for (const [id, enemy] of gs.enemies) {
        if (enemy.hp <= 0) {
            gs.enemies.delete(id);
            continue;
        }

        // Find nearest alive player
        let target = null, minDist = Infinity;
        for (const [, p] of gs.players) {
            if (!p.alive) continue;
            const d = distance(enemy, p);
            if (d < minDist) { minDist = d; target = p; }
        }

        if (!target) continue;

        // Move toward target
        const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
        const speed = enemy.speed * (gs.objectivesCompleted >= 2 ? 1.1 : 1);
        enemy.x += Math.cos(angle) * speed * DT;
        enemy.y += Math.sin(angle) * speed * DT;

        // Attack
        if (minDist < PLAYER_RADIUS + (enemy.type === 'elite' ? ELITE_RADIUS : ENEMY_RADIUS) + 5) {
            enemy.attackCd -= DT;
            if (enemy.attackCd <= 0) {
                const dmg = enemy.damage;
                let actualDmg = dmg;
                if (target.role === 'vanguard' && target.abilityActive) actualDmg = Math.floor(dmg * 0.7);
                if (target.role === 'medic' && target.abilityActive) actualDmg = Math.floor(dmg * 0.7);
                target.hp -= actualDmg;
                target.combatTimer = 3;
                gs.events.push({ type: 'damage', x: target.x, y: target.y - 25, value: actualDmg });
                if (target.hp <= 0) {
                    target.hp = 0;
                    target.alive = false;
                    target.respawnTimer = RESPAWN_TIME;
                }
                enemy.attackCd = 1.0;
            }
        }
    }
}

function spawnEnemy(gs, x, y, type) {
    const id = nextEnemyId++;
    const isElite = type === 'elite';
    gs.enemies.set(id, {
        id, x, y, type: type || 'common',
        hp: (isElite ? 120 : 70) * gs.enemyHpScale,
        maxHp: (isElite ? 120 : 70) * gs.enemyHpScale,
        damage: isElite ? 18 : gs.enemyDmgBase,
        speed: isElite ? 80 : gs.enemySpeedBase,
        attackCd: 0
    });
}

function handleSpawning(gs) {
    if (gs.phase === 'cinematic' || gs.phase === 'intro') return;

    gs.spawnTimer -= DT;
    if (gs.spawnTimer > 0) return;

    let spawnZone, count, interval, includeElites = false;
    switch (gs.phase) {
        case 'objective1':
            spawnZone = 'ship'; count = 2 + Math.floor(Math.random() * 2); interval = 5;
            break;
        case 'objective2':
            spawnZone = 'beacon'; count = 3 + Math.floor(Math.random() * 2); interval = 4;
            break;
        case 'objective3':
            spawnZone = 'satellite'; count = 4 + Math.floor(Math.random() * 2); interval = 3;
            includeElites = true;
            break;
        case 'boss':
            return; // Boss handles its own adds
        case 'final':
            spawnZone = 'ship'; count = 1 + Math.floor(Math.random() * 2); interval = 8;
            break;
        default:
            return;
    }

    if (gs.enemies.size > 20) return; // Cap enemies

    const points = SPAWN_POINTS[spawnZone] || SPAWN_POINTS.ship;
    for (let i = 0; i < count; i++) {
        const sp = points[Math.floor(Math.random() * points.length)];
        const type = includeElites && Math.random() < 0.3 ? 'elite' : 'common';
        spawnEnemy(gs, sp.x + (Math.random() - 0.5) * 40, sp.y + (Math.random() - 0.5) * 40, type);
    }
    gs.spawnTimer = interval;
}

// ======================== BOSS AI ========================
function spawnBoss(gs) {
    gs.boss = {
        x: 1100, y: 250,
        hp: 2000, maxHp: 2000,
        phase: 0,
        attackCd: 2,
        attackType: 'idle',
        chargeTarget: null,
        chargeX: 0, chargeY: 0,
        projectiles: [],
        stunTimer: 0,
        aggroPhase: false,
        aggroTimer: 0
    };
    gs.bossPhaseThreshold = 3;
    gs.events.push({ type: 'announcement', text: '⚠ ALIEN GUARDIAN EMERGES ⚠', duration: 3, color: '#7b2cbf' });
}

function updateBoss(gs) {
    const boss = gs.boss;
    if (boss.hp <= 0) {
        gs.boss = null;
        gs.phase = 'final';
        gs.phaseTimer = 0;
        gs.objectiveProgress = 0;
        gs.events.push({ type: 'announcement', text: 'BOSS DEFEATED! GET TO THE SHIP!', duration: 3, color: '#06d6a0' });
        gs.finalCountdown = true;
        gs.timer = Math.min(gs.timer, 60);
        return;
    }

    // Phase transitions at 25% HP intervals
    const hpPercent = boss.hp / boss.maxHp;
    const currentPhase = Math.floor((1 - hpPercent) * 4);
    if (currentPhase > boss.phase) {
        boss.phase = currentPhase;
        boss.aggroPhase = true;
        boss.aggroTimer = 5;
        // Spawn adds
        const points = SPAWN_POINTS.boss_adds;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 2); i++) {
            const sp = points[Math.floor(Math.random() * points.length)];
            spawnEnemy(gs, sp.x, sp.y, 'common');
        }
        gs.events.push({ type: 'announcement', text: 'BOSS ENRAGED!', duration: 2, color: '#e63946' });
    }

    if (boss.aggroPhase) {
        boss.aggroTimer -= DT;
        if (boss.aggroTimer <= 0) boss.aggroPhase = false;
    }

    if (boss.stunTimer > 0) {
        boss.stunTimer -= DT;
        return;
    }

    // Find target
    let target = null, minDist = Infinity;
    for (const [, p] of gs.players) {
        if (!p.alive) continue;
        const d = distance(boss, p);
        if (d < minDist) { minDist = d; target = p; }
    }
    if (!target) return;

    boss.attackCd -= DT * (boss.aggroPhase ? 1.5 : 1);

    if (boss.attackCd <= 0) {
        if (Math.random() < 0.5) {
            // Charge attack
            boss.attackType = 'charge';
            boss.chargeTarget = target.id;
            boss.chargeX = target.x;
            boss.chargeY = target.y;
        } else {
            // Projectile burst
            boss.attackType = 'projectile';
            const angle = Math.atan2(target.y - boss.y, target.x - boss.x);
            for (let i = -1; i <= 1; i++) {
                const a = angle + i * 0.3;
                const projId = nextProjId++;
                gs.projectiles.set(projId, {
                    id: projId, x: boss.x, y: boss.y,
                    dx: Math.cos(a) * 300, dy: Math.sin(a) * 300,
                    damage: 25, owner: -1, life: 1.5, isPlayerProj: false
                });
            }
        }
        boss.attackCd = boss.aggroPhase ? 1.5 : 2.5;
    }

    // Execute charge
    if (boss.attackType === 'charge') {
        const angle = Math.atan2(boss.chargeY - boss.y, boss.chargeX - boss.x);
        const speed = 350;
        boss.x += Math.cos(angle) * speed * DT;
        boss.y += Math.sin(angle) * speed * DT;

        // Check collision with players
        for (const [, p] of gs.players) {
            if (!p.alive) continue;
            if (distance(boss, p) < BOSS_RADIUS + PLAYER_RADIUS) {
                let dmg = 35;
                if (p.role === 'vanguard' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                if (p.role === 'medic' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                p.hp -= dmg;
                p.combatTimer = 3;
                gs.events.push({ type: 'damage', x: p.x, y: p.y - 25, value: dmg });
                if (p.hp <= 0) { p.hp = 0; p.alive = false; p.respawnTimer = RESPAWN_TIME; }
                boss.attackType = 'idle';
                boss.stunTimer = 0.5;
            }
        }

        if (distance(boss, { x: boss.chargeX, y: boss.chargeY }) < 20) {
            boss.attackType = 'idle';
        }
    } else if (boss.attackType !== 'idle') {
        // Move toward target slowly
        const angle = Math.atan2(target.y - boss.y, target.x - boss.x);
        boss.x += Math.cos(angle) * 60 * DT;
        boss.y += Math.sin(angle) * 60 * DT;
        boss.attackType = 'idle';
    } else {
        // Slow patrol toward target
        const angle = Math.atan2(target.y - boss.y, target.x - boss.x);
        boss.x += Math.cos(angle) * 40 * DT;
        boss.y += Math.sin(angle) * 40 * DT;
    }

    // Keep boss in exterior zone
    boss.x = Math.max(870, Math.min(1380, boss.x));
    boss.y = Math.max(70, Math.min(430, boss.y));
}

function damageBoss(gs, amount, player) {
    if (!gs.boss) return;
    let dmg = amount;
    if (gs.weakpointActive) dmg = Math.floor(dmg * 1.35);
    gs.boss.hp -= dmg;
    player.score.damageDealt += dmg;
    gs.events.push({ type: 'damage', x: gs.boss.x + (Math.random() - 0.5) * 30, y: gs.boss.y - 30, value: dmg, color: gs.weakpointActive ? '#ffd166' : '#e63946' });
}

// ======================== PROJECTILES & TURRETS ========================
function updateProjectiles(gs) {
    for (const [id, proj] of gs.projectiles) {
        proj.x += proj.dx * DT;
        proj.y += proj.dy * DT;
        proj.life -= DT;
        if (proj.life <= 0) { gs.projectiles.delete(id); continue; }

        if (proj.isPlayerProj) {
            // Check enemy hits
            for (const [, enemy] of gs.enemies) {
                const r = enemy.type === 'elite' ? ELITE_RADIUS : ENEMY_RADIUS;
                if (distance(proj, enemy) < PROJ_RADIUS + r) {
                    const player = gs.players.get(proj.owner);
                    damageEnemy(gs, enemy, proj.damage, player);
                    gs.projectiles.delete(id);
                    break;
                }
            }
            // Check boss hit
            if (gs.boss && distance(proj, gs.boss) < PROJ_RADIUS + BOSS_RADIUS) {
                const player = gs.players.get(proj.owner);
                if (player) damageBoss(gs, proj.damage, player);
                gs.projectiles.delete(id);
            }
        } else {
            // Enemy/Boss projectile - check player hits
            for (const [, p] of gs.players) {
                if (!p.alive) continue;
                if (distance(proj, p) < PROJ_RADIUS + PLAYER_RADIUS) {
                    let dmg = proj.damage;
                    if (p.role === 'vanguard' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                    if (p.role === 'medic' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                    p.hp -= dmg;
                    p.combatTimer = 3;
                    gs.events.push({ type: 'damage', x: p.x, y: p.y - 25, value: dmg });
                    if (p.hp <= 0) { p.hp = 0; p.alive = false; p.respawnTimer = RESPAWN_TIME; }
                    gs.projectiles.delete(id);
                    break;
                }
            }
        }
    }
}

function updateTurrets(gs) {
    for (let i = gs.turrets.length - 1; i >= 0; i--) {
        const turret = gs.turrets[i];
        turret.timer -= DT;
        if (turret.timer <= 0) { gs.turrets.splice(i, 1); continue; }

        turret.attackCd -= DT;
        if (turret.attackCd <= 0) {
            // Find nearest enemy
            let target = null, minDist = turret.range;
            for (const [, enemy] of gs.enemies) {
                const d = distance(turret, enemy);
                if (d < minDist) { minDist = d; target = enemy; }
            }
            if (!target && gs.boss && distance(turret, gs.boss) < turret.range) {
                target = gs.boss;
            }
            if (target) {
                if (target === gs.boss) {
                    const player = gs.players.get(turret.owner);
                    if (player) damageBoss(gs, turret.damage, player);
                } else {
                    const player = gs.players.get(turret.owner);
                    damageEnemy(gs, target, turret.damage, player);
                }
                gs.events.push({ type: 'turretShot', x1: turret.x, y1: turret.y, x2: target.x, y2: target.y });
                turret.attackCd = 0.5;
            }
        }
    }
}

function damageEnemy(gs, enemy, amount, player) {
    enemy.hp -= amount;
    if (player) player.score.damageDealt += amount;
    gs.events.push({ type: 'damage', x: enemy.x + (Math.random() - 0.5) * 10, y: enemy.y - 20, value: amount });
    if (enemy.hp <= 0) {
        if (player) player.score.enemiesKilled++;
        gs.events.push({ type: 'kill', x: enemy.x, y: enemy.y });
    }
}

// ======================== OBJECTIVES ========================
function handleObjective(gs, room) {
    const phaseToObj = { objective1: 0, objective2: 1, objective3: 2, final: 3 };
    const objIdx = phaseToObj[gs.phase];
    if (objIdx === undefined) return;
    const obj = OBJECTIVES[objIdx];

    // Check if any player is interacting
    let repairSpeed = 0;
    for (const [, player] of gs.players) {
        if (!player.alive || !player.input.interact) continue;
        const d = distance(player, obj);
        if (d > INTERACT_RANGE) continue;
        if (player.role === 'engineer') {
            repairSpeed += 1.4 / obj.repairTime;
            player.score.repairsDone += DT;
        } else {
            repairSpeed += 0.6 / obj.repairTime;
            player.score.repairsDone += DT * 0.6;
        }
    }

    if (repairSpeed > 0) {
        gs.objectiveProgress += repairSpeed * DT;
        if (gs.objectiveProgress >= 1) {
            completeObjective(gs, room);
        }
    }
}

function completeObjective(gs, room) {
    gs.objectiveProgress = 0;
    gs.objectivesCompleted++;
    gs.enemyHpScale += 0.1;

    switch (gs.phase) {
        case 'objective1':
            gs.doorUnlocked = true;
            gs.phase = 'objective2';
            gs.phaseTimer = 0;
            gs.enemyDmgBase = 12;
            gs.events.push({ type: 'announcement', text: 'CORE STABILIZED! HATCH UNLOCKED!', duration: 3, color: '#06d6a0' });
            break;

        case 'objective2':
            gs.phase = 'objective3';
            gs.phaseTimer = 0;
            gs.enemyDmgBase = 15;
            gs.enemySpeedBase = 110;
            gs.events.push({ type: 'announcement', text: 'BEACON ACTIVE! ENEMIES ALERTED!', duration: 3, color: '#ffd166' });
            break;

        case 'objective3':
            gs.phase = 'boss';
            gs.phaseTimer = 0;
            spawnBoss(gs);
            // Clear remaining enemies
            gs.enemies.clear();
            break;

        case 'final':
            endGame(room, true);
            break;
    }
}

// ======================== HELPERS ========================
function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function angleDiff(a, b) {
    let d = Math.abs(a - b);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
}

function constrainToMap(gs, player) {
    const r = PLAYER_RADIUS;
    let valid = false;

    for (const zone of MAP_ZONES) {
        if (zone.id === 'doorway' && !gs.doorUnlocked) continue;
        if (player.x + r > zone.x && player.x - r < zone.x + zone.w &&
            player.y + r > zone.y && player.y - r < zone.y + zone.h) {
            valid = true;
            break;
        }
    }

    if (!valid) {
        // Push back into nearest valid zone
        let bestZone = null, bestDist = Infinity;
        for (const zone of MAP_ZONES) {
            if (zone.id === 'doorway' && !gs.doorUnlocked) continue;
            const cx = Math.max(zone.x + r, Math.min(zone.x + zone.w - r, player.x));
            const cy = Math.max(zone.y + r, Math.min(zone.y + zone.h - r, player.y));
            const d = distance(player, { x: cx, y: cy });
            if (d < bestDist) { bestDist = d; bestZone = zone; }
        }
        if (bestZone) {
            player.x = Math.max(bestZone.x + r, Math.min(bestZone.x + bestZone.w - r, player.x));
            player.y = Math.max(bestZone.y + r, Math.min(bestZone.y + bestZone.h - r, player.y));
        }
    }
}

function respawnPlayer(gs, player) {
    const role = ROLES[player.role];
    player.alive = true;
    player.hp = Math.floor(role.hp * 0.5);
    // Respawn at ship start
    player.x = 300 + Math.random() * 200;
    player.y = 200 + Math.random() * 100;
    player.attackCd = 0;
}

function endGame(room, victory) {
    const gs = room.gameState;
    if (gs.gameOver) return;
    gs.gameOver = true;

    const scores = [];
    for (const [, p] of gs.players) {
        scores.push({ id: p.id, name: p.name, role: p.role, ...p.score });
    }
    scores.sort((a, b) => (b.damageDealt + b.healingDone + b.enemiesKilled * 50 + b.repairsDone * 100) -
        (a.damageDealt + a.healingDone + a.enemiesKilled * 50 + a.repairsDone * 100));

    broadcastToRoom(room, { type: 'gameOver', victory, scores, timeRemaining: gs.timer });

    if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
    }
    room.gameState = null;
}

// ======================== STATE BROADCAST ========================
function broadcastState(room) {
    const gs = room.gameState;
    if (!gs) return;

    const players = [];
    for (const [, p] of gs.players) {
        players.push({
            id: p.id, name: p.name, role: p.role,
            x: Math.round(p.x * 100) / 100,
            y: Math.round(p.y * 100) / 100,
            hp: Math.round(p.hp), maxHp: p.maxHp,
            alive: p.alive, respawnTimer: Math.round(p.respawnTimer * 10) / 10,
            abilityActive: p.abilityActive,
            abilityCd: Math.round(p.abilityCd * 10) / 10,
            score: p.score
        });
    }

    const enemies = [];
    for (const [, e] of gs.enemies) {
        enemies.push({
            id: e.id, x: Math.round(e.x), y: Math.round(e.y),
            hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), type: e.type
        });
    }

    const projs = [];
    for (const [, p] of gs.projectiles) {
        projs.push({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), isPlayerProj: p.isPlayerProj });
    }

    const currentObj = { objective1: 0, objective2: 1, objective3: 2, final: 3 }[gs.phase];

    const state = {
        type: 'gameState',
        phase: gs.phase,
        timer: Math.round(gs.timer * 10) / 10,
        phaseTimer: Math.round(gs.phaseTimer * 10) / 10,
        players,
        enemies,
        boss: gs.boss ? {
            x: Math.round(gs.boss.x), y: Math.round(gs.boss.y),
            hp: Math.round(gs.boss.hp), maxHp: gs.boss.maxHp,
            attackType: gs.boss.attackType, aggroPhase: gs.boss.aggroPhase
        } : null,
        projectiles: projs,
        turrets: gs.turrets.map(t => ({ x: t.x, y: t.y, timer: Math.round(t.timer * 10) / 10 })),
        objectiveProgress: gs.objectiveProgress,
        objective: currentObj !== undefined ? {
            index: currentObj,
            x: OBJECTIVES[currentObj].x,
            y: OBJECTIVES[currentObj].y,
            desc: OBJECTIVES[currentObj].desc,
            progress: gs.objectiveProgress
        } : null,
        doorUnlocked: gs.doorUnlocked,
        weakpointActive: gs.weakpointActive,
        events: gs.events
    };

    broadcastToRoom(room, state);
}

// ======================== WEBSOCKET HANDLING ========================
wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerId = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
            case 'createRoom': {
                const room = createRoom(ws);
                currentRoom = room;
                const player = addPlayerToRoom(room, ws, msg.name);
                playerId = player.id;
                ws.send(JSON.stringify({ type: 'roomCreated', roomCode: room.code, playerId }));
                sendLobbyUpdate(room);
                break;
            }

            case 'joinRoom': {
                const room = rooms.get(msg.roomCode?.toUpperCase());
                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                    return;
                }
                if (room.players.size >= MAX_PLAYERS) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                    return;
                }
                if (room.gameState) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress' }));
                    return;
                }
                currentRoom = room;
                const player = addPlayerToRoom(room, ws, msg.name);
                playerId = player.id;
                ws.send(JSON.stringify({ type: 'roomJoined', roomCode: room.code, playerId }));
                sendLobbyUpdate(room);
                break;
            }

            case 'selectRole': {
                if (!currentRoom) return;
                const player = currentRoom.players.get(ws);
                if (!player || currentRoom.gameState) return;
                // Check if role is taken
                for (const [, p] of currentRoom.players) {
                    if (p !== player && p.role === msg.role) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Role already taken' }));
                        return;
                    }
                }
                player.role = msg.role;
                player.ready = false;
                sendLobbyUpdate(currentRoom);
                break;
            }

            case 'ready': {
                if (!currentRoom) return;
                const player = currentRoom.players.get(ws);
                if (!player || !player.role || currentRoom.gameState) return;
                player.ready = !player.ready;
                sendLobbyUpdate(currentRoom);
                break;
            }

            case 'startGame': {
                if (!currentRoom || currentRoom.host !== ws) return;
                if (!canStartGame(currentRoom)) return;
                currentRoom.gameState = createGameState(currentRoom);
                broadcastToRoom(currentRoom, { type: 'gameStart' });

                // Assign player IDs
                for (const [clientWs, p] of currentRoom.players) {
                    clientWs.send(JSON.stringify({ type: 'assignId', playerId: p.id }));
                }

                currentRoom.tickInterval = setInterval(() => gameTick(currentRoom), TICK_MS);
                break;
            }

            case 'input': {
                if (!currentRoom || !currentRoom.gameState) return;
                const player = currentRoom.players.get(ws);
                if (!player) return;
                const gsPlayer = currentRoom.gameState.players.get(player.id);
                if (!gsPlayer) return;
                gsPlayer.input = {
                    w: !!msg.w, a: !!msg.a, s: !!msg.s, d: !!msg.d,
                    mouseX: msg.mouseX || 0, mouseY: msg.mouseY || 0,
                    attack: !!msg.attack, interact: !!msg.interact, ability: !!msg.ability
                };
                break;
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom) {
            removePlayerFromRoom(currentRoom, ws);
            if (currentRoom.players.size > 0 && !currentRoom.gameState) {
                sendLobbyUpdate(currentRoom);
            }
        }
    });
});

// ======================== START SERVER ========================
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    let lanIp = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                lanIp = net.address;
                break;
            }
        }
    }
    console.log(`\n🚀 Space Survival Server running!`);
    console.log(`   Local:  http://localhost:${PORT}`);
    console.log(`   LAN:    http://${lanIp}:${PORT}\n`);
});
