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
app.use(express.json());

// ======================== LEADERBOARD ========================
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

function loadLeaderboard() {
    try {
        const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveLeaderboard(lb) {
    lb.sort((a, b) => b.totalScore - a.totalScore);
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(lb, null, 2));
}

/*
  SCORING SYSTEM:
  ───────────────────────────────────────────
  • Mission Completed (team wins)     = +10 pts
  • Individual Contributions:
    - Every 5 enemies killed          = +5 pts
    - Every 500 damage dealt          = +5 pts
    - Every 500 healing done          = +5 pts
    - Every 5 repairs completed       = +5 pts
    - Each trivia answered correctly  = +5 pts
  • Survival Bonus (alive at end)     = +3 pts
  ───────────────────────────────────────────
*/
function calculatePlayerScore(playerScore, victory, alive) {
    let pts = 0;
    if (victory) pts += 10;
    pts += Math.floor(playerScore.enemiesKilled / 5) * 5;
    pts += Math.floor(playerScore.damageDealt / 500) * 5;
    pts += Math.floor(playerScore.healingDone / 500) * 5;
    pts += Math.floor(playerScore.repairsDone / 5) * 5;
    pts += (playerScore.triviaCorrect || 0) * 5;
    if (alive) pts += 3;
    return pts;
}

function updateLeaderboard(gs, victory) {
    const lb = loadLeaderboard();
    for (const [, p] of gs.players) {
        const earned = calculatePlayerScore(p.score, victory, p.alive);
        const existing = lb.find(e => e.name === p.name);
        if (existing) {
            existing.totalScore += earned;
            existing.gamesPlayed += 1;
            if (victory) existing.missionsCompleted += 1;
            existing.enemiesKilled += p.score.enemiesKilled;
            existing.damageDealt += Math.round(p.score.damageDealt);
            existing.healingDone += Math.round(p.score.healingDone);
            existing.repairsDone += Math.round(p.score.repairsDone);
            existing.triviaCorrect += (p.score.triviaCorrect || 0);
            existing.role = p.role; // update to latest role
        } else {
            lb.push({
                name: p.name,
                role: p.role,
                totalScore: earned,
                missionsCompleted: victory ? 1 : 0,
                enemiesKilled: p.score.enemiesKilled,
                damageDealt: Math.round(p.score.damageDealt),
                healingDone: Math.round(p.score.healingDone),
                repairsDone: Math.round(p.score.repairsDone),
                triviaCorrect: p.score.triviaCorrect || 0,
                gamesPlayed: 1
            });
        }
    }
    saveLeaderboard(lb);
}

app.get('/api/leaderboard', (req, res) => {
    const lb = loadLeaderboard();
    res.json(lb);
});

// ======================== CONSTANTS ========================
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const DT = TICK_MS / 1000;
const MISSION_DURATION = 600;
const MIN_PLAYERS = 1;
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

// ── MAP INTEGRATION START ──
// Walkable zone rectangles for the 1024x1024 spaceship interior map
const MAP_ZONES = [
    // Cockpit tip (top center)
    { id: 'cockpit', x: 420, y: 40, w: 184, h: 120 },
    // Cockpit room (wider area with console)
    { id: 'cockpit_room', x: 300, y: 160, w: 424, h: 130 },
    // Central corridor (full vertical strip)
    { id: 'corridor', x: 475, y: 160, w: 74, h: 800 },
    // Left rooms (between hull diagonal and corridor left wall)
    { id: 'left_1', x: 255, y: 290, w: 240, h: 80 },
    { id: 'left_2', x: 210, y: 370, w: 285, h: 80 },
    { id: 'left_3', x: 170, y: 450, w: 325, h: 80 },
    { id: 'left_4', x: 140, y: 530, w: 355, h: 80 },
    { id: 'left_5', x: 110, y: 610, w: 385, h: 80 },
    { id: 'left_6', x: 80, y: 690, w: 415, h: 70 },
    // Right rooms (mirror of left)
    { id: 'right_1', x: 529, y: 290, w: 240, h: 80 },
    { id: 'right_2', x: 529, y: 370, w: 285, h: 80 },
    { id: 'right_3', x: 529, y: 450, w: 325, h: 80 },
    { id: 'right_4', x: 529, y: 530, w: 355, h: 80 },
    { id: 'right_5', x: 529, y: 610, w: 385, h: 80 },
    { id: 'right_6', x: 529, y: 690, w: 415, h: 70 },
    // Engine room (wide area at bottom)
    { id: 'engine', x: 60, y: 760, w: 904, h: 220 },
    // Wing tips (small protrusions on sides)
    { id: 'wing_left', x: 5, y: 430, w: 55, h: 100 },
    { id: 'wing_right', x: 964, y: 430, w: 55, h: 100 },
];

const fs = require('fs');
// Dynamically load precise OBSTACLES from Tiled JSON
const OBSTACLES = [];
try {
    const rawMapData = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'ship_collisions.json'));
    const mapData = JSON.parse(rawMapData);
    const collisionLayer = mapData.layers.find(layer => layer.name === 'collisions');

    if (collisionLayer && collisionLayer.objects) {
        collisionLayer.objects.forEach(obj => {
            if (obj.width === 0 && obj.height === 0) return; // Skip zero-size points

            let aabbX = obj.x;
            let aabbY = obj.y;
            let aabbW = obj.width;
            let aabbH = obj.height;

            // Handle Tiled rotated objects by computing the new Axis-Aligned Bounding Box
            if (obj.rotation) {
                const rad = obj.rotation * (Math.PI / 180);
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);

                const c1 = { x: 0, y: 0 };
                const c2 = { x: obj.width * cos, y: obj.width * sin };
                const c3 = { x: -obj.height * sin, y: obj.height * cos };
                const c4 = { x: obj.width * cos - obj.height * sin, y: obj.width * sin + obj.height * cos };

                const minX = Math.min(c1.x, c2.x, c3.x, c4.x);
                const maxX = Math.max(c1.x, c2.x, c3.x, c4.x);
                const minY = Math.min(c1.y, c2.y, c3.y, c4.y);
                const maxY = Math.max(c1.y, c2.y, c3.y, c4.y);

                aabbX = obj.x + minX;
                aabbY = obj.y + minY;
                aabbW = maxX - minX;
                aabbH = maxY - minY;
            }

            OBSTACLES.push({
                type: 'rect',
                x: aabbX,
                y: aabbY,
                w: aabbW,
                h: aabbH
            });
        });
    }
} catch (e) {
    console.error("Failed to load or parse ship_collisions.json.", e);
}

// ── PLANET MAP INTEGRATION START ──
// Walkable zone rectangles for the 1536x1024 planet exterior map
const PLANET_MAP_ZONES = [
    { id: 'planet_main', x: 0, y: 0, w: 1536, h: 1024 }
];

const PLANET_OBSTACLES = [];
try {
    const rawPlanetData = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'planet_collisions.json'));
    const planetData = JSON.parse(rawPlanetData);
    const planetCollisionLayer = planetData.layers.find(layer => layer.name === 'collisions');

    if (planetCollisionLayer && planetCollisionLayer.objects) {
        planetCollisionLayer.objects.forEach(obj => {
            // Handle rectangles (with or without rotation)
            if (obj.width > 0 && obj.height > 0) {
                let aabbX = obj.x;
                let aabbY = obj.y;
                let aabbW = obj.width;
                let aabbH = obj.height;

                if (obj.rotation) {
                    const rad = obj.rotation * (Math.PI / 180);
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    const c1 = { x: 0, y: 0 };
                    const c2 = { x: obj.width * cos, y: obj.width * sin };
                    const c3 = { x: -obj.height * sin, y: obj.height * cos };
                    const c4 = { x: obj.width * cos - obj.height * sin, y: obj.width * sin + obj.height * cos };
                    const minX = Math.min(c1.x, c2.x, c3.x, c4.x);
                    const maxX = Math.max(c1.x, c2.x, c3.x, c4.x);
                    const minY = Math.min(c1.y, c2.y, c3.y, c4.y);
                    const maxY = Math.max(c1.y, c2.y, c3.y, c4.y);
                    aabbX = obj.x + minX;
                    aabbY = obj.y + minY;
                    aabbW = maxX - minX;
                    aabbH = maxY - minY;
                }

                // Handle ellipses as bounding box rects
                if (obj.ellipse) {
                    PLANET_OBSTACLES.push({ type: 'circle', x: aabbX + aabbW / 2, y: aabbY + aabbH / 2, r: Math.max(aabbW, aabbH) / 2 });
                } else {
                    PLANET_OBSTACLES.push({ type: 'rect', x: aabbX, y: aabbY, w: aabbW, h: aabbH });
                }
            }
            // Handle polygons - compute bounding box
            if (obj.polygon && obj.polygon.length > 2) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                obj.polygon.forEach(p => {
                    const px = obj.x + p.x;
                    const py = obj.y + p.y;
                    if (px < minX) minX = px;
                    if (py < minY) minY = py;
                    if (px > maxX) maxX = px;
                    if (py > maxY) maxY = py;
                });
                const w = maxX - minX;
                const h = maxY - minY;
                if (w > 5 && h > 5) {
                    PLANET_OBSTACLES.push({ type: 'rect', x: minX, y: minY, w: w, h: h });
                }
            }
        });
    }
} catch (e) {
    console.error("Failed to load or parse planet_collisions.json.", e);
}
// ── PLANET MAP INTEGRATION END ──
// ── MAP INTEGRATION END ──

// ── MAP SCALE: multiply all coordinates for large Minecraft-like world ──
const MAP_SCALE = 3;
MAP_ZONES.forEach(z => { z.x *= MAP_SCALE; z.y *= MAP_SCALE; z.w *= MAP_SCALE; z.h *= MAP_SCALE; });
OBSTACLES.forEach(o => { o.x *= MAP_SCALE; o.y *= MAP_SCALE; if (o.w) o.w *= MAP_SCALE; if (o.h) o.h *= MAP_SCALE; if (o.r) o.r *= MAP_SCALE; });

// Scale planet map data
const PLANET_SCALE = 3;
PLANET_MAP_ZONES.forEach(z => { z.x *= PLANET_SCALE; z.y *= PLANET_SCALE; z.w *= PLANET_SCALE; z.h *= PLANET_SCALE; });
PLANET_OBSTACLES.forEach(o => { o.x *= PLANET_SCALE; o.y *= PLANET_SCALE; if (o.w) o.w *= PLANET_SCALE; if (o.h) o.h *= PLANET_SCALE; if (o.r) o.r *= PLANET_SCALE; });

const PLANET_W = 1536 * PLANET_SCALE;
const PLANET_H = 1024 * PLANET_SCALE;

// ── MAP TRANSITION ZONES ──
// Ship engine room bottom edge -> Planet entry
const SHIP_EXIT_ZONE = { x: 400 * MAP_SCALE, y: 920 * MAP_SCALE, w: 224 * MAP_SCALE, h: 104 * MAP_SCALE };
// Planet entry -> back to ship
const PLANET_EXIT_ZONE = { x: 650 * PLANET_SCALE, y: 850 * PLANET_SCALE, w: 236 * PLANET_SCALE, h: 100 * PLANET_SCALE };
// Spawn positions when entering planet
const PLANET_SPAWN = { x: 768 * PLANET_SCALE, y: 816 * PLANET_SCALE };
// Spawn positions when returning to ship
const SHIP_RETURN_SPAWN = { x: 512 * MAP_SCALE, y: 950 * MAP_SCALE };

const OBJECTIVES = [
    { phase: 'objective1', x: 512 * MAP_SCALE, y: 200 * MAP_SCALE, repairTime: 5, desc: 'Stabilize Core System (Hold E)', zone: 'cockpit_room', map: 'ship', isTrivia: false },
    { phase: 'trivia_core', x: 512 * MAP_SCALE, y: 200 * MAP_SCALE, desc: 'Confirm Core Stabilization (Press E)', map: 'ship', isTrivia: true, difficulty: 'easy', time: 15 },
    { phase: 'objective2', x: 250 * MAP_SCALE, y: 490 * MAP_SCALE, repairTime: 5, desc: 'Restore Left Grid (Hold E)', zone: 'left_3', map: 'ship', isTrivia: false },
    { phase: 'trivia_left', x: 250 * MAP_SCALE, y: 490 * MAP_SCALE, desc: 'Confirm Left Grid (Press E)', map: 'ship', isTrivia: true, difficulty: 'easy', time: 15 },
    { phase: 'objective3', x: 774 * MAP_SCALE, y: 490 * MAP_SCALE, repairTime: 5, desc: 'Restore Right Grid (Hold E)', zone: 'right_3', map: 'ship', isTrivia: false },
    { phase: 'trivia_right', x: 774 * MAP_SCALE, y: 490 * MAP_SCALE, desc: 'Confirm Right Grid (Press E)', map: 'ship', isTrivia: true, difficulty: 'easy', time: 15 },
    { phase: 'trivia1', x: 512 * MAP_SCALE, y: 870 * MAP_SCALE, desc: 'Unlock Airlock (Press E)', map: 'ship', isTrivia: true, difficulty: 'easy', time: 15 },
    { phase: 'trivia2', x: 400 * PLANET_SCALE, y: 240 * PLANET_SCALE, desc: 'Left Exoplanet Node (Press E)', map: 'planet', isTrivia: true, difficulty: 'medium', time: 10 },
    { phase: 'objective4', x: 400 * PLANET_SCALE, y: 240 * PLANET_SCALE, repairTime: 5, desc: 'Repair Left Node (Hold E)', zone: 'planet_left', map: 'planet', isTrivia: false },
    { phase: 'trivia3', x: 1350 * PLANET_SCALE, y: 280 * PLANET_SCALE, desc: 'Right Exoplanet Node (Press E)', map: 'planet', isTrivia: true, difficulty: 'hard', time: 8 },
    { phase: 'objective5', x: 1350 * PLANET_SCALE, y: 280 * PLANET_SCALE, repairTime: 5, desc: 'Repair Right Node (Hold E)', zone: 'planet_right', map: 'planet', isTrivia: false }
];

const SPAWN_POINTS = {
    cockpit_room: [{ x: 400 * MAP_SCALE, y: 210 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 210 * MAP_SCALE }, { x: 620 * MAP_SCALE, y: 210 * MAP_SCALE }, { x: 460 * MAP_SCALE, y: 240 * MAP_SCALE }],
    corridor: [{ x: 512 * MAP_SCALE, y: 400 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 500 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 600 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 700 * MAP_SCALE }],
    left_3: [{ x: 250 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 300 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 350 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 200 * MAP_SCALE, y: 480 * MAP_SCALE }],
    right_3: [{ x: 774 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 700 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 650 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 824 * MAP_SCALE, y: 480 * MAP_SCALE }],
    // Wave 3 spread: enemies pour in from engine, corridor AND both flanks
    wave3: [
        { x: 400 * MAP_SCALE, y: 810 * MAP_SCALE }, { x: 600 * MAP_SCALE, y: 810 * MAP_SCALE },  // engine bay
        { x: 512 * MAP_SCALE, y: 850 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 790 * MAP_SCALE },  // engine centre
        { x: 512 * MAP_SCALE, y: 400 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 500 * MAP_SCALE },  // corridor mid
        { x: 512 * MAP_SCALE, y: 700 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 600 * MAP_SCALE },  // corridor low
        { x: 250 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 200 * MAP_SCALE, y: 480 * MAP_SCALE },  // left flank
        { x: 774 * MAP_SCALE, y: 480 * MAP_SCALE }, { x: 824 * MAP_SCALE, y: 480 * MAP_SCALE },  // right flank
    ],
    engine: [{ x: 400 * MAP_SCALE, y: 810 * MAP_SCALE }, { x: 600 * MAP_SCALE, y: 810 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 850 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 790 * MAP_SCALE }],
    boss_adds: [{ x: 200 * MAP_SCALE, y: 800 * MAP_SCALE }, { x: 824 * MAP_SCALE, y: 800 * MAP_SCALE }, { x: 512 * MAP_SCALE, y: 780 * MAP_SCALE }, { x: 350 * MAP_SCALE, y: 850 * MAP_SCALE }],
    planet_left: [{ x: 380 * PLANET_SCALE, y: 250 * PLANET_SCALE }, { x: 380 * PLANET_SCALE, y: 400 * PLANET_SCALE }, { x: 500 * PLANET_SCALE, y: 250 * PLANET_SCALE }, { x: 500 * PLANET_SCALE, y: 400 * PLANET_SCALE }],
    planet_right: [{ x: 1250 * PLANET_SCALE, y: 280 * PLANET_SCALE }, { x: 1250 * PLANET_SCALE, y: 450 * PLANET_SCALE }, { x: 1400 * PLANET_SCALE, y: 280 * PLANET_SCALE }, { x: 1400 * PLANET_SCALE, y: 450 * PLANET_SCALE }]
};

// ── FAST A* PATHFINDING START ──
const PF_CELL = 32;
let navGrids = { ship: { grid: [], w: 0, h: 0 }, planet: { grid: [], w: 0, h: 0 } };

function buildNavGridForMap(mapName, width, height, zones, obstacles) {
    const w = Math.ceil(width / PF_CELL);
    const h = Math.ceil(height / PF_CELL);
    const grid = new Array(w * h).fill(false);
    let r = ENEMY_RADIUS;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let cx = x * PF_CELL + PF_CELL / 2;
            let cy = y * PF_CELL + PF_CELL / 2;
            let idx = y * w + x;

            let inZone = false;
            for (const zone of zones) {
                if (cx >= zone.x && cx <= zone.x + zone.w &&
                    cy >= zone.y && cy <= zone.y + zone.h) {
                    inZone = true;
                    break;
                }
            }
            if (!inZone) continue;

            let hitObs = false;
            for (const obs of obstacles) {
                if (obs.type === 'rect') {
                    const closestX = Math.max(obs.x, Math.min(obs.x + obs.w, cx));
                    const closestY = Math.max(obs.y, Math.min(obs.y + obs.h, cy));
                    if (Math.hypot(cx - closestX, cy - closestY) < r) { hitObs = true; break; }
                } else if (obs.type === 'circle') {
                    if (Math.hypot(cx - obs.x, cy - obs.y) < r + obs.r) { hitObs = true; break; }
                }
            }
            if (!hitObs) grid[idx] = true;
        }
    }
    navGrids[mapName] = { grid, w, h };
}

function buildNavGrids() {
    buildNavGridForMap('ship', 1024 * MAP_SCALE, 1024 * MAP_SCALE, MAP_ZONES, OBSTACLES);
    buildNavGridForMap('planet', PLANET_W, PLANET_H, PLANET_MAP_ZONES, PLANET_OBSTACLES);
}
buildNavGrids();

function findPath(mapName, startX, startY, endX, endY) {
    const mapData = navGrids[mapName] || navGrids['ship'];
    const PF_W = mapData.w;
    const PF_H = mapData.h;
    const navGrid = mapData.grid;

    let sx = Math.floor(startX / PF_CELL);
    let sy = Math.floor(startY / PF_CELL);
    let ex = Math.floor(endX / PF_CELL);
    let ey = Math.floor(endY / PF_CELL);

    sx = Math.max(0, Math.min(PF_W - 1, sx));
    sy = Math.max(0, Math.min(PF_H - 1, sy));
    ex = Math.max(0, Math.min(PF_W - 1, ex));
    ey = Math.max(0, Math.min(PF_H - 1, ey));

    const startIdx = sy * PF_W + sx;
    const endIdx = ey * PF_W + ex;

    if (startIdx === endIdx) return [];

    // Find closest walkable end node if unwalkable
    if (!navGrid[endIdx]) {
        let bestDist = Infinity;
        let bestE = endIdx;
        let searchRad = 3;
        for (let dy = -searchRad; dy <= searchRad; dy++) {
            for (let dx = -searchRad; dx <= searchRad; dx++) {
                let nx = ex + dx, ny = ey + dy;
                if (nx >= 0 && nx < PF_W && ny >= 0 && ny < PF_H) {
                    let ni = ny * PF_W + nx;
                    if (navGrid[ni]) {
                        let dist = dx * dx + dy * dy;
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestE = ni;
                        }
                    }
                }
            }
        }
        if (bestDist !== Infinity) {
            ex = bestE % PF_W;
            ey = Math.floor(bestE / PF_W);
        } else {
            return null; // Totally unreachable
        }
    }

    const targetIdx = ey * PF_W + ex;
    const open = [startIdx];
    const cameFrom = new Int32Array(PF_W * PF_H).fill(-1);
    const gScore = new Float32Array(PF_W * PF_H).fill(Infinity);
    const fScore = new Float32Array(PF_W * PF_H).fill(Infinity);
    const closed = new Uint8Array(PF_W * PF_H).fill(0);

    gScore[startIdx] = 0;
    fScore[startIdx] = Math.abs(sx - ex) + Math.abs(sy - ey);

    let limit = 2000;

    while (open.length > 0 && limit-- > 0) {
        let lowestIndex = 0;
        let current = open[0];
        let currF = fScore[current];
        for (let i = 1; i < open.length; i++) {
            if (fScore[open[i]] < currF) {
                currF = fScore[open[i]];
                current = open[i];
                lowestIndex = i;
            }
        }

        if (current === targetIdx) {
            const path = [];
            let curr = current;
            while (cameFrom[curr] !== -1) {
                let cx = (curr % PF_W) * PF_CELL + PF_CELL / 2;
                let cy = Math.floor(curr / PF_W) * PF_CELL + PF_CELL / 2;
                path.push({ x: cx, y: cy });
                curr = cameFrom[curr];
            }
            return path.reverse();
        }

        open.splice(lowestIndex, 1);
        closed[current] = 1;

        let cx = current % PF_W;
        let cy = Math.floor(current / PF_W);

        const neighbors = [
            { x: cx, y: cy - 1, w: 1 },
            { x: cx, y: cy + 1, w: 1 },
            { x: cx - 1, y: cy, w: 1 },
            { x: cx + 1, y: cy, w: 1 },
            { x: cx - 1, y: cy - 1, w: 1.4 },
            { x: cx + 1, y: cy - 1, w: 1.4 },
            { x: cx - 1, y: cy + 1, w: 1.4 },
            { x: cx + 1, y: cy + 1, w: 1.4 }
        ];

        for (const n of neighbors) {
            if (n.x < 0 || n.x >= PF_W || n.y < 0 || n.y >= PF_H) continue;
            let nIdx = n.y * PF_W + n.x;
            if (!navGrid[nIdx] || closed[nIdx]) continue;

            let tentativeG = gScore[current] + n.w;
            if (tentativeG < gScore[nIdx]) {
                cameFrom[nIdx] = current;
                gScore[nIdx] = tentativeG;
                fScore[nIdx] = tentativeG + Math.hypot(n.x - ex, n.y - ey);
                if (!open.includes(nIdx)) open.push(nIdx);
            }
        }
    }
    return null;
}
// ── FAST A* PATHFINDING END ──

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
        if (p.ws !== room.host && !p.ready) allReady = false;
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
        phaseEnemiesSpawned: 0,
        phaseWarningSent: false,
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
    // ── MAP INTEGRATION: spawn in central corridor (scaled) ──
    const spawnPositions = [
        { x: 500 * MAP_SCALE, y: 700 * MAP_SCALE }, { x: 524 * MAP_SCALE, y: 700 * MAP_SCALE },
        { x: 500 * MAP_SCALE, y: 730 * MAP_SCALE }, { x: 524 * MAP_SCALE, y: 730 * MAP_SCALE }
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
            score: { damageDealt: 0, healingDone: 0, enemiesKilled: 0, repairsDone: 0, triviaCorrect: 0 },
            combatTimer: 0,
            speed: role.speed,
            currentMap: 'ship' // 'ship' or 'planet'
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
    gs.phaseTimer += DT; // Accumulate time in current phase
    if (gs.timer <= 0) {
        gs.timer = 0;
        endGame(room, gs.finalCountdown ? true : false);
        return;
    }

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
    handleSpawning(gs, room);

    // Objectives
    handleObjective(gs, room);

    // Weakpoint timer
    if (gs.weakpointActive) {
        gs.weakpointTimer -= DT;
        if (gs.weakpointTimer <= 0) {
            gs.weakpointActive = false;
        }
    }

    // Check all dead – if every player is dead at the same time, game over
    let allDead = true;
    for (const [, p] of gs.players) {
        if (p.alive) { allDead = false; break; }
    }
    if (allDead) {
        endGame(room, false);
    }

    broadcastState(room);
    gs.events = [];
}

function updatePlayer(gs, player) {
    const role = ROLES[player.role];
    const inp = player.input;

    // Track E double tap for map transition
    let doubleTappedInteract = false;
    let justInteracted = inp.interact && !player.prevInteract;

    if (justInteracted) {
        let now = Date.now();
        if (now - (player.lastInteractTime || 0) < 600) {
            doubleTappedInteract = true;
            player.lastInteractTime = 0; // reset
        } else {
            player.lastInteractTime = now;
        }
    }
    player.justInteracted = justInteracted;
    player.prevInteract = inp.interact;

    // Movement
    let dx = 0, dy = 0;
    if (player.triviaLocked) {
        player.input.w = player.input.a = player.input.s = player.input.d = false;
        player.input.attack = false;
        player.input.ability = false;
    }

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
    }
    constrainToMap(gs, player);

    // ── MAP TRANSITION CHECK ──
    if (doubleTappedInteract) {
        if (player.currentMap === 'ship') {
            // Check if player entered ship exit zone (engine room bottom)
            if (player.x > SHIP_EXIT_ZONE.x && player.x < SHIP_EXIT_ZONE.x + SHIP_EXIT_ZONE.w &&
                player.y > SHIP_EXIT_ZONE.y && player.y < SHIP_EXIT_ZONE.y + SHIP_EXIT_ZONE.h) {
                player.currentMap = 'planet';
                player.x = PLANET_SPAWN.x;
                player.y = PLANET_SPAWN.y;
                gs.events.push({ type: 'announcement', text: 'ENTERING PLANET SURFACE', duration: 2, color: '#f4a261' });
                gs.events.push({ type: 'mapChange', playerId: player.id, map: 'planet' });
            }
        } else if (player.currentMap === 'planet') {
            // Check if player entered planet exit zone (bottom edge)
            if (player.x > PLANET_EXIT_ZONE.x && player.x < PLANET_EXIT_ZONE.x + PLANET_EXIT_ZONE.w &&
                player.y > PLANET_EXIT_ZONE.y && player.y < PLANET_EXIT_ZONE.y + PLANET_EXIT_ZONE.h) {
                player.currentMap = 'ship';
                player.x = SHIP_RETURN_SPAWN.x;
                player.y = SHIP_RETURN_SPAWN.y;
                gs.events.push({ type: 'announcement', text: 'RETURNING TO SHIP', duration: 2, color: '#4cc9f0' });
                gs.events.push({ type: 'mapChange', playerId: player.id, map: 'ship' });
            }
        }
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

    // Attack (not medic — medic can only heal)
    if (inp.attack && player.attackCd <= 0 && player.role !== 'medic') {
        performAttack(gs, player);
        player.attackCd = role.attackCd;
        player.combatTimer = 3;
    }

    // Medic heal beam (continuous, also when clicking)
    if (player.role === 'medic') {
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
            if ((enemy.map || 'ship') !== player.currentMap) continue;
            const dist = distance(player, enemy);
            if (dist < role.range + ENEMY_RADIUS) {
                const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
                if (angleDiff(angle, enemyAngle) < Math.PI / 3) {
                    damageEnemy(gs, enemy, dmg, player);
                }
            }
        }
        if (gs.boss && (gs.boss.map || 'planet') === player.currentMap) {
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
            isPlayerProj: true,
            ownerRole: player.role,
            map: player.currentMap || 'ship'
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
                x: tx, y: ty, hp: 100, timer: 12, attackCd: 0, owner: player.id, range: 200, damage: 20,
                map: player.currentMap || 'ship'
            });
            gs.events.push({ type: 'announcement', text: 'TURRET DEPLOYED', duration: 2, color: '#f4a261' });
            break;
        }

        case 'scout': {
            const sAngle = Math.atan2(player.input.mouseY - player.y, player.input.mouseX - player.x);
            const sId = nextProjId++;
            gs.projectiles.set(sId, {
                id: sId, x: player.x, y: player.y,
                dx: Math.cos(sAngle) * PROJ_SPEED * 1.5,
                dy: Math.sin(sAngle) * PROJ_SPEED * 1.5,
                damage: 150,
                owner: player.id,
                life: 1.5,
                isPlayerProj: true,
                ownerRole: 'scout',
                map: player.currentMap || 'ship',
                penetrating: true
            });
            gs.events.push({ type: 'announcement', text: 'PIERCING SHOT FIRED', duration: 2, color: '#06d6a0' });
            break;
        }

        case 'medic': {
            const HEAL_ABILITY_RADIUS = 768; // 8 tiles * 32px * 3 MAP_SCALE
            let totalHealed = 0;
            for (const [, p] of gs.players) {
                if (!p.alive) continue;
                const d = distance(player, p);
                if (d < HEAL_ABILITY_RADIUS) {
                    const healAmt = Math.floor(p.maxHp * 0.5);
                    p.hp = Math.min(p.maxHp, p.hp + healAmt);
                    p.abilityActive = true;
                    p.abilityTimer = 4;
                    gs.events.push({ type: 'heal', x: p.x, y: p.y - 20, value: healAmt });
                    totalHealed += healAmt;
                }
            }
            player.score.healingDone += totalHealed;
            gs.events.push({ type: 'announcement', text: 'FIELD SURGE', duration: 2, color: '#ef476f' });
            break;
        }
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
            if (!p.alive || p.currentMap !== (enemy.map || 'ship')) continue;
            const d = distance(enemy, p);
            if (d < minDist) { minDist = d; target = p; }
        }

        if (!target) continue;

        // A* Pathfinding Logic
        if (enemy.pathTimer === undefined) enemy.pathTimer = 0;
        enemy.pathTimer -= DT;

        let moveTargetX = target.x;
        let moveTargetY = target.y;

        if (enemy.pathTimer <= 0 || !enemy.path) {
            enemy.path = findPath(enemy.map || 'ship', enemy.x, enemy.y, target.x, target.y);
            enemy.pathTimer = 0.5 + Math.random() * 0.2; // Recalculate ~twice a second
        }

        if (enemy.path && enemy.path.length > 0) {
            const nextNode = enemy.path[0];
            const dNode = distance(enemy, nextNode);
            if (dNode < 32) {
                enemy.path.shift();
            }
            if (enemy.path.length > 0) {
                moveTargetX = enemy.path[0].x;
                moveTargetY = enemy.path[0].y;
            }
        }

        // Move toward moveTarget
        const angle = Math.atan2(moveTargetY - enemy.y, moveTargetX - enemy.x);
        const speed = enemy.speed * (gs.objectivesCompleted >= 2 ? 1.1 : 1);
        enemy.x += Math.cos(angle) * speed * DT;
        enemy.y += Math.sin(angle) * speed * DT;

        constrainToMap(gs, enemy, enemy.type === 'elite' ? ELITE_RADIUS : ENEMY_RADIUS);

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

// Determine orc visual type based on current game phase (wave)
function getOrcType(gs) {
    switch (gs.phase) {
        case 'objective1': case 'trivia_core':
            return 'orc1'; // Wave 1
        case 'objective2': case 'trivia_left':
            return 'orc2'; // Wave 2
        case 'objective3': case 'trivia_right': case 'trivia1':
            return Math.random() < 0.5 ? 'orc1' : 'orc2'; // Wave 3: mix of both
        default:
            return Math.random() < 0.5 ? 'orc1' : 'orc2'; // Later waves: mix
    }
}

function spawnEnemy(gs, x, y, type, mapName = 'ship') {
    const id = nextEnemyId++;
    const isElite = type === 'elite';
    gs.enemies.set(id, {
        id, x, y, type: type || 'common', map: mapName,
        orcType: getOrcType(gs),
        hp: (isElite ? 120 : 70) * gs.enemyHpScale,
        maxHp: (isElite ? 120 : 70) * gs.enemyHpScale,
        damage: isElite ? 18 : gs.enemyDmgBase,
        speed: isElite ? 80 : gs.enemySpeedBase,
        attackCd: 0
    });
}

function handleSpawning(gs, room) {
    if (gs.phase === 'cinematic' || gs.phase === 'intro') return;

    // Custom logic for first phase
    if (gs.phase === 'objective1') {
        if (gs.phaseTimer >= 10 && !gs.phaseWarningSent) {
            gs.phaseWarningSent = true;
            broadcastToRoom(room, { type: 'chat', name: 'SYSTEM', msg: 'Enemies will arrive in 5 seconds!', color: '#ff4444' });
        }
        if (gs.phaseTimer < 15) return; // Wait 15s before spawning enemies (10s settle + 5s warning)
        if (gs.phaseEnemiesSpawned >= 8) return; // Max 8 enemies for first wave
    }

    // Custom logic for second phase
    if (gs.phase === 'objective2') {
        if (gs.phaseEnemiesSpawned >= 23) return; // Max 23 enemies for second wave
    }

    // Custom logic for third phase (wave 3)
    if (gs.phase === 'objective3') {
        if (gs.phaseEnemiesSpawned >= 36) return; // Max 36 enemies for third wave
    }

    gs.spawnTimer -= DT;
    if (gs.spawnTimer > 0) return;

    let spawnZone, count, interval, includeElites = false;
    let spawnMap = 'ship';
    switch (gs.phase) {
        case 'objective1':
            // Task in Cockpit (Top), spawn at Engine (Bottom)
            spawnZone = 'engine'; count = 1 + Math.floor(Math.random() * 2); interval = 10;
            break;
        case 'objective2':
            // Task on Left side, spawn on Right side
            spawnZone = 'right_3'; count = 1 + Math.floor(Math.random() * 2); interval = 8;
            break;
        case 'objective3':
            // Task on Right side, spawn on Left side (and maybe Engine)
            spawnZone = Math.random() < 0.5 ? 'left_3' : 'engine'; count = 3 + Math.floor(Math.random() * 2); interval = 4;
            includeElites = true;
            break;
        case 'trivia1':
            // Task at Airlock/Engine (Bottom), spawn at Cockpit (Top)
            spawnZone = 'cockpit_room'; count = 2 + Math.floor(Math.random() * 2); interval = 6;
            includeElites = true;
            break;
        case 'trivia2':
        case 'objective4':
            // Task on Planet Left, spawn on Planet Right
            spawnZone = 'planet_right'; count = 3; interval = 8; includeElites = true;
            spawnMap = 'planet';
            break;
        case 'trivia3':
        case 'objective5':
            // Task on Planet Right, spawn on Planet Left
            spawnZone = 'planet_left'; count = 3; interval = 6; includeElites = true;
            spawnMap = 'planet';
            break;
        case 'boss':
            return; // Boss handles its own adds
        case 'final':
            // Task is escaping back to ship or escaping, spawn around
            spawnZone = 'wave3'; count = 1; interval = 16;
            break;
        default:
            return;
    }

    const mapEnemyCount = [...gs.enemies.values()].filter(e => (e.map || 'ship') === spawnMap).length;
    const maxOnMap = gs.phase === 'objective3' ? 18 : 10; // allow more concurrent enemies in wave 3
    if (mapEnemyCount > maxOnMap) return; // Cap enemies per map

    const points = SPAWN_POINTS[spawnZone] || SPAWN_POINTS.corridor;
    for (let i = 0; i < count; i++) {
        if (gs.phase === 'objective1' && gs.phaseEnemiesSpawned >= 8) break;
        if (gs.phase === 'objective2' && gs.phaseEnemiesSpawned >= 23) break;
        if (gs.phase === 'objective3' && gs.phaseEnemiesSpawned >= 36) break;
        const sp = points[Math.floor(Math.random() * points.length)];
        const type = includeElites && Math.random() < 0.3 ? 'elite' : 'common';
        spawnEnemy(gs, sp.x + (Math.random() - 0.5) * 40, sp.y + (Math.random() - 0.5) * 40, type, spawnMap);
        gs.phaseEnemiesSpawned++; // Track for all phases
    }
    gs.spawnTimer = interval;
}

// ======================== BOSS AI ========================
function spawnBoss(gs) {
    gs.boss = {
        x: 768 * PLANET_SCALE, y: 400 * PLANET_SCALE,
        hp: 2000, maxHp: 2000,
        phase: 0,
        attackCd: 2,
        attackType: 'idle',
        chargeTarget: null,
        chargeX: 0, chargeY: 0,
        projectiles: [],
        stunTimer: 0,
        aggroPhase: false,
        aggroTimer: 0,
        map: 'planet'
    };
    gs.bossPhaseThreshold = 3;
    gs.events.push({ type: 'announcement', text: '⚠ ALIEN GUARDIAN EMERGES ⚠', duration: 3, color: '#7b2cbf' });
}

function updateBoss(gs) {
    const boss = gs.boss;
    if (boss.hp <= 0) {
        gs.events.push({ type: 'bossDeath' });  // triggers shout → death audio on client
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
        // Spawn adds on the boss's map
        const bossMap = boss.map || 'planet';
        const points = bossMap === 'planet' ? SPAWN_POINTS.planet_left.concat(SPAWN_POINTS.planet_right) : SPAWN_POINTS.boss_adds;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 2); i++) {
            const sp = points[Math.floor(Math.random() * points.length)];
            spawnEnemy(gs, sp.x, sp.y, 'common', bossMap);
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

    // Find target (only players on the same map as the boss)
    const bossMap = boss.map || 'planet';
    let target = null, minDist = Infinity;
    for (const [, p] of gs.players) {
        if (!p.alive || p.currentMap !== bossMap) continue;
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
                    damage: 25, owner: -1, life: 1.5, isPlayerProj: false,
                    map: boss.map || 'planet'
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
            if ((p.currentMap || 'ship') !== (boss.map || 'planet')) continue;
            if (distance(boss, p) < BOSS_RADIUS + PLAYER_RADIUS) {
                let dmg = 35;
                if (p.role === 'vanguard' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                if (p.role === 'medic' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                p.hp -= dmg;
                p.combatTimer = 3;
                gs.events.push({ type: 'damage', x: p.x, y: p.y - 25, value: dmg });
                if (p.hp <= 0) { p.hp = 0; p.alive = false; p.respawnTimer = Infinity; }
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

    // Keep boss within planet boundaries
    boss.x = Math.max(100 * PLANET_SCALE, Math.min((1536 - 100) * PLANET_SCALE, boss.x));
    boss.y = Math.max(100 * PLANET_SCALE, Math.min((1024 - 100) * PLANET_SCALE, boss.y));
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

        // ── Wall/obstacle collision ──
        const projMap = proj.map || 'ship';
        const activeObstacles = projMap === 'planet' ? PLANET_OBSTACLES : OBSTACLES;
        let hitWall = false;
        for (const obs of activeObstacles) {
            if (obs.type === 'rect') {
                if (proj.x >= obs.x && proj.x <= obs.x + obs.w &&
                    proj.y >= obs.y && proj.y <= obs.y + obs.h) {
                    hitWall = true;
                    break;
                }
            } else if (obs.type === 'circle') {
                const cdx = proj.x - obs.x;
                const cdy = proj.y - obs.y;
                if (Math.sqrt(cdx * cdx + cdy * cdy) < obs.r + PROJ_RADIUS) {
                    hitWall = true;
                    break;
                }
            }
        }
        if (hitWall) { gs.projectiles.delete(id); continue; }

        if (proj.isPlayerProj) {
            // Check enemy hits
            for (const [, enemy] of gs.enemies) {
                if ((enemy.map || 'ship') !== (proj.map || 'ship')) continue;
                const r = enemy.type === 'elite' ? ELITE_RADIUS : ENEMY_RADIUS;
                if (distance(proj, enemy) < PROJ_RADIUS + r) {
                    const player = gs.players.get(proj.owner);
                    damageEnemy(gs, enemy, proj.damage, player);
                    if (!proj.penetrating) {
                        gs.projectiles.delete(id);
                        break;
                    }
                }
            }
            // Check boss hit
            if (gs.boss && (gs.boss.map || 'planet') === (proj.map || 'ship') && distance(proj, gs.boss) < PROJ_RADIUS + BOSS_RADIUS) {
                const player = gs.players.get(proj.owner);
                if (player) damageBoss(gs, proj.damage, player);
                if (!proj.penetrating) {
                    gs.projectiles.delete(id);
                }
            }
        } else {
            // Enemy/Boss projectile - check player hits
            for (const [, p] of gs.players) {
                if (!p.alive) continue;
                if ((p.currentMap || 'ship') !== (proj.map || 'ship')) continue;
                if (distance(proj, p) < PROJ_RADIUS + PLAYER_RADIUS) {
                    let dmg = proj.damage;
                    if (p.role === 'vanguard' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                    if (p.role === 'medic' && p.abilityActive) dmg = Math.floor(dmg * 0.7);
                    p.hp -= dmg;
                    p.combatTimer = 3;
                    gs.events.push({ type: 'damage', x: p.x, y: p.y - 25, value: dmg });
                    if (p.hp <= 0) { p.hp = 0; p.alive = false; p.respawnTimer = Infinity; }
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
                if ((enemy.map || 'ship') !== (turret.map || 'ship')) continue;
                const d = distance(turret, enemy);
                if (d < minDist) { minDist = d; target = enemy; }
            }
            if (!target && gs.boss && (gs.boss.map || 'planet') === (turret.map || 'ship') && distance(turret, gs.boss) < turret.range) {
                target = gs.boss;
            }
            if (target) {
                // Spawn a projectile toward the target
                const angle = Math.atan2(target.y - turret.y, target.x - turret.x);
                const tId = nextProjId++;
                gs.projectiles.set(tId, {
                    id: tId, x: turret.x, y: turret.y,
                    dx: Math.cos(angle) * PROJ_SPEED,
                    dy: Math.sin(angle) * PROJ_SPEED,
                    damage: turret.damage,
                    owner: turret.owner,
                    life: turret.range / PROJ_SPEED,
                    isPlayerProj: true,
                    isTurretProj: true,
                    ownerRole: 'engineer',
                    map: turret.map || 'ship'
                });
                gs.events.push({ type: 'turretShot', x1: turret.x, y1: turret.y, x2: target.x, y2: target.y });
                turret.attackCd = 0.5; // 2 shots per second
            }
        }
    }
}

function damageEnemy(gs, enemy, amount, player) {
    enemy.hp -= amount;
    if (player) player.score.damageDealt += amount;
    gs.events.push({ type: 'damage', x: enemy.x + (Math.random() - 0.5) * 10, y: enemy.y - 20, value: amount });
    if (enemy.hp <= 0 && !enemy.dead) {
        enemy.dead = true;
        if (player) player.score.enemiesKilled++;
        gs.events.push({ type: 'kill', x: enemy.x, y: enemy.y });
    }
}

// ======================== OBJECTIVES ========================
function handleObjective(gs, room) {
    const phaseToObj = {
        objective1: 0, trivia_core: 1,
        objective2: 2, trivia_left: 3,
        objective3: 4, trivia_right: 5,
        trivia1: 6, trivia2: 7,
        objective4: 8, trivia3: 9,
        objective5: 10,
        final: -1, boss: -1
    };
    const objIdx = phaseToObj[gs.phase];
    if (objIdx === undefined || objIdx === -1) return;
    const obj = OBJECTIVES[objIdx];

    // Check if it's a trivia objective
    if (obj.isTrivia) {
        for (const [, player] of gs.players) {
            if (!player.alive || player.currentMap !== obj.map) continue;
            const d = distance(player, obj);
            let timeNow = Date.now();
            if (d < 150) { // Trivia sensor range
                // Single E tap detection
                if (player.justInteracted && !player.triviaLocked && timeNow > (player.triviaCooldown || 0)) {
                    player.triviaLocked = true;
                    gs.events.push({ type: 'startTrivia', playerId: player.id, difficulty: obj.difficulty, timeLimit: obj.time, phase: gs.phase });
                }
            }
        }
        return; // skip repair logic
    }

    // Check if any player is interacting
    let repairSpeed = 0;
    for (const [, player] of gs.players) {
        if (!player.alive || !player.input.interact || player.triviaLocked) continue;
        const d = distance(player, obj);
        if (d > INTERACT_RANGE) continue;

        // Different timings for different objectives
        if (gs.phase === 'objective2') {
            if (player.role === 'engineer') {
                repairSpeed += 1 / 45; // 45 seconds for engineer
                player.score.repairsDone += DT;
            } else {
                repairSpeed += 1 / 75; // 1 min 15 seconds (75s) for others
                player.score.repairsDone += DT * (45 / 75);
            }
        } else {
            // Default timings (Objective 1, 3, etc.)
            if (player.role === 'engineer') {
                repairSpeed += 1 / 30; // 30 seconds for engineer
                player.score.repairsDone += DT;
            } else {
                repairSpeed += 1 / 45; // 45 seconds for others
                player.score.repairsDone += DT * (30 / 45);
            }
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
    gs.phaseTimer = 0;
    gs.phaseEnemiesSpawned = 0;
    gs.phaseWarningSent = false;

    // Provide some score to all (only for repair objectives, not trivias)
    const isTriviaPhase = gs.phase.startsWith('trivia');
    if (!isTriviaPhase) {
        for (const [, p] of gs.players) p.score.repairsDone += 50;
    }

    switch (gs.phase) {
        case 'objective1':
            gs.phase = 'trivia_core';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'CORE STABILIZED! AUTHENTICATE AT TERMINAL!', duration: 3, color: '#06d6a0' });
            break;
        case 'trivia_core':
            gs.phase = 'objective2';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'CORE AUTHENTICATED! PROCEED TO LEFT GRID!', duration: 3, color: '#06d6a0' });
            break;
        case 'objective2':
            gs.phase = 'trivia_left';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'LEFT GRID ACTIVE! AUTHENTICATE AT TERMINAL!', duration: 3, color: '#ffd166' });
            break;
        case 'trivia_left':
            gs.phase = 'objective3';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'LEFT GRID AUTHENTICATED! PROCEED TO RIGHT GRID!', duration: 3, color: '#ffd166' });
            break;
        case 'objective3':
            gs.phase = 'trivia_right';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'RIGHT GRID ACTIVE! AUTHENTICATE AT TERMINAL!', duration: 4, color: '#ffb703' });
            break;
        case 'trivia_right':
            gs.phase = 'trivia1';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'RIGHT GRID AUTHENTICATED! UNLOCK AIRLOCK!', duration: 4, color: '#ffb703' });
            break;
        case 'trivia1':
            gs.doorUnlocked = true;
            gs.phase = 'trivia2';
            gs.events.push({ type: 'announcement', text: 'AIRLOCK UNLOCKED! PROCEED TO EXOPLANET!', duration: 5, color: '#00ffff' });
            break;
        case 'trivia2':
            gs.phase = 'objective4';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'LEFT TERMINAL ACCESSED! REPAIR THE NODE!', duration: 5, color: '#00ffff' });
            break;
        case 'objective4':
            gs.phase = 'trivia3';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'LEFT NODE REPAIRED! PROCEED TO RIGHT NODE!', duration: 5, color: '#00ffff' });
            break;
        case 'trivia3':
            gs.phase = 'objective5';
            gs.phaseTimer = 0;
            gs.events.push({ type: 'announcement', text: 'RIGHT TERMINAL ACCESSED! REPAIR THE NODE!', duration: 5, color: '#00ffff' });
            break;
        case 'objective5':
            gs.phase = 'boss';
            spawnBoss(gs);
            gs.enemies.clear();
            gs.events.push({ type: 'bossSpawn' });
            gs.events.push({ type: 'announcement', text: 'ALL NODES SECURED! BOSS APPROACHING!', duration: 5, color: '#ff0000' });
            break;

        case 'boss':
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

function constrainToMap(gs, entity, r = PLAYER_RADIUS) {
    // Determine which map's zones and obstacles to use
    const entityMap = entity.currentMap || entity.map || 'ship';
    const activeZones = entityMap === 'planet' ? PLANET_MAP_ZONES : MAP_ZONES;
    const activeObstacles = entityMap === 'planet' ? PLANET_OBSTACLES : OBSTACLES;
    let valid = false;

    // ── MAP INTEGRATION START ──
    // Step 1: Must be inside at least one walkable zone
    for (const zone of activeZones) {
        if (entity.x + r > zone.x && entity.x - r < zone.x + zone.w &&
            entity.y + r > zone.y && entity.y - r < zone.y + zone.h) {
            valid = true;
            break;
        }
    }

    if (!valid) {
        // Push back into nearest valid zone
        let bestZone = null, bestDist = Infinity;
        for (const zone of activeZones) {
            const cx = Math.max(zone.x + r, Math.min(zone.x + zone.w - r, entity.x));
            const cy = Math.max(zone.y + r, Math.min(zone.y + zone.h - r, entity.y));
            const d = distance(entity, { x: cx, y: cy });
            if (d < bestDist) { bestDist = d; bestZone = zone; }
        }
        if (bestZone) {
            entity.x = Math.max(bestZone.x + r, Math.min(bestZone.x + bestZone.w - r, entity.x));
            entity.y = Math.max(bestZone.y + r, Math.min(bestZone.y + bestZone.h - r, entity.y));
        }
    }

    // Step 2: Push out of obstacles (equipment blocks + engine circles)
    for (const obs of activeObstacles) {
        if (obs.type === 'rect') {
            const closestX = Math.max(obs.x, Math.min(obs.x + obs.w, entity.x));
            const closestY = Math.max(obs.y, Math.min(obs.y + obs.h, entity.y));
            const dx = entity.x - closestX;
            const dy = entity.y - closestY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < r) {
                if (dist === 0) {
                    const pL = entity.x - obs.x;
                    const pR = (obs.x + obs.w) - entity.x;
                    const pU = entity.y - obs.y;
                    const pD = (obs.y + obs.h) - entity.y;
                    const m = Math.min(pL, pR, pU, pD);
                    if (m === pL) entity.x = obs.x - r;
                    else if (m === pR) entity.x = obs.x + obs.w + r;
                    else if (m === pU) entity.y = obs.y - r;
                    else entity.y = obs.y + obs.h + r;
                } else {
                    const overlap = r - dist;
                    entity.x += (dx / dist) * overlap;
                    entity.y += (dy / dist) * overlap;
                }
            }
        } else if (obs.type === 'circle') {
            const dx = entity.x - obs.x;
            const dy = entity.y - obs.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < r + obs.r) {
                const overlap = (r + obs.r) - dist;
                if (dist > 0) {
                    entity.x += (dx / dist) * overlap;
                    entity.y += (dy / dist) * overlap;
                } else {
                    entity.x += r + obs.r;
                }
            }
        }
    }
}

function respawnPlayer(gs, player) {
    const role = ROLES[player.role];
    player.alive = true;
    player.hp = Math.floor(role.hp * 0.5);

    // Respawn correctly based on their current map dimension scale points
    if (player.currentMap === 'planet') {
        player.x = 400 * PLANET_SCALE;
        player.y = 880 * PLANET_SCALE;
    } else {
        // Default ship respawn
        player.x = 512 * MAP_SCALE + (Math.random() - 0.5) * 40;
        player.y = 700 * MAP_SCALE + (Math.random() - 0.5) * 40;
    }

    player.attackCd = 0;
}

function endGame(room, victory) {
    const gs = room.gameState;
    if (gs.gameOver) return;
    gs.gameOver = true;

    const scores = [];
    for (const [, p] of gs.players) {
        const earned = calculatePlayerScore(p.score, victory, p.alive);
        scores.push({ id: p.id, name: p.name, role: p.role, earned, ...p.score });
    }
    scores.sort((a, b) => b.earned - a.earned);

    // Save to leaderboard
    try { updateLeaderboard(gs, victory); } catch (e) { console.error('Leaderboard save error:', e); }

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
            score: p.score,
            currentMap: p.currentMap || 'ship'
        });
    }

    const enemies = [];
    for (const [, e] of gs.enemies) {
        enemies.push({
            id: e.id, x: Math.round(e.x), y: Math.round(e.y),
            hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), type: e.type,
            orcType: e.orcType || 'orc1',
            map: e.map || 'ship',
            attacking: e.attackCd > 0.5   // true when enemy just attacked (within cooldown)
        });
    }

    const projs = [];
    for (const [, p] of gs.projectiles) {
        projs.push({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx || p.dx, vy: p.vy || p.dy, isPlayerProj: p.isPlayerProj, ownerRole: p.ownerRole, isTurretProj: p.isTurretProj || false, penetrating: p.penetrating || false });
    }

    const phaseToObj = {
        objective1: 0, trivia_core: 1,
        objective2: 2, trivia_left: 3,
        objective3: 4, trivia_right: 5,
        trivia1: 6, trivia2: 7,
        objective4: 8, trivia3: 9,
        objective5: 10,
        final: -1, boss: -1
    };
    const currentObj = phaseToObj[gs.phase] >= 0 ? phaseToObj[gs.phase] : undefined;

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
            attackType: gs.boss.attackType, aggroPhase: gs.boss.aggroPhase,
            map: gs.boss.map || 'planet'
        } : null,
        projectiles: projs,
        turrets: gs.turrets.map(t => ({ x: t.x, y: t.y, timer: Math.round(t.timer * 10) / 10 })),
        objectiveProgress: gs.objectiveProgress,
        objective: currentObj !== undefined ? {
            index: currentObj,
            x: OBJECTIVES[currentObj].x,
            y: OBJECTIVES[currentObj].y,
            desc: OBJECTIVES[currentObj].desc,
            map: OBJECTIVES[currentObj].map || 'ship',
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

            case 'triviaResult': {
                if (!currentRoom || !currentRoom.gameState) return;
                const gs = currentRoom.gameState;
                const player = currentRoom.players.get(ws);
                if (!player) return;
                const gsPlayer = gs.players.get(player.id);
                if (!gsPlayer) return;

                gsPlayer.triviaLocked = false;
                if (msg.success) {
                    gsPlayer.score.triviaCorrect += 1;
                    // Only advance phase if still on the same trivia phase (prevent multi-player skip)
                    const triviaPhases = ['trivia_core', 'trivia_left', 'trivia_right', 'trivia1', 'trivia2', 'trivia3'];
                    if (triviaPhases.includes(gs.phase)) {
                        completeObjective(gs, currentRoom);
                    }
                } else {
                    gsPlayer.triviaCooldown = Date.now() + 5000;
                    gs.events.push({ type: 'announcement', text: 'AUTHORIZATION FAILED - 5 SEC COOLDOWN', duration: 2, color: '#ff0000', playerId: player.id });
                }
                break;
            }

            case 'devSkipPhase': {
                if (!currentRoom || !currentRoom.gameState) return;
                completeObjective(currentRoom.gameState, currentRoom);
                break;
            }

            case 'chat': {
                if (!currentRoom || !currentRoom.gameState) return;
                const player = currentRoom.players.get(ws);
                if (!player) return;
                const roleColor = {
                    vanguard: '#4cc9f0',
                    engineer: '#f4a261',
                    scout: '#ffd166',
                    medic: '#ef476f'
                }[player.role] || '#ffffff';
                currentRoom.gameState.events.push({
                    type: 'chat',
                    name: player.name,
                    msg: String(msg.msg).substring(0, 100),
                    color: roleColor
                });
                break;
            }

            case 'webrtc_signal': {
                if (!currentRoom) return;
                const player = currentRoom.players.get(ws);
                if (!player) return;

                // Find target player
                for (const [targetWs, targetP] of currentRoom.players) {
                    if (targetP.id === msg.targetId) {
                        if (targetWs.readyState === 1) {
                            targetWs.send(JSON.stringify({
                                type: 'webrtc_signal',
                                senderId: player.id,
                                signalData: msg.signalData
                            }));
                        }
                        break;
                    }
                }
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
const PORT = process.env.PORT || 3000;
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
