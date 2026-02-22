// ======================== ASSET LOADING ========================
import { S } from './state.js';
import { DIRS, ROLES_LIST, MAP_SCALE, OBSTACLES, PLANET_OBSTACLES } from './constants.js';

let spritesLoaded = 0;
let totalSprites = 0;

export function loadImg(src) {
    totalSprites++;
    const img = new Image();
    img.src = src;
    img.onload = () => spritesLoaded++;
    img.onerror = () => { console.warn('Missing sprite:', src); spritesLoaded++; };
    return img;
}

// ── Character role sprites ──
export const roleSprites = {};
ROLES_LIST.forEach(role => {
    roleSprites[role] = { idle: {}, walk: {}, death: {}, sword: {} };

    DIRS.forEach(dir => {
        roleSprites[role].idle[dir] = loadImg(`/assets/${role}/rotations/${dir}.png`);
    });

    DIRS.forEach(dir => {
        roleSprites[role].walk[dir] = [];
        for (let i = 0; i < 6; i++) {
            roleSprites[role].walk[dir].push(loadImg(`/assets/${role}/animations/walk/${dir}/frame_${String(i).padStart(3, '0')}.png`));
        }
    });

    DIRS.forEach(dir => {
        roleSprites[role].death[dir] = [];
        for (let i = 0; i < 7; i++) {
            roleSprites[role].death[dir].push(loadImg(`/assets/${role}/animations/falling-back-death/${dir}/frame_${String(i).padStart(3, '0')}.png`));
        }
    });
});

// Sword (Vanguard only)
DIRS.forEach(dir => {
    roleSprites.vanguard.sword[dir] = loadImg(`/assets/sword-vanguard/rotations/${dir}.png`);
});

// ── Weapon sprites ──
export const spearImg = loadImg('/assets/spear.png');
export const gunImg = loadImg('/assets/gun.png');
export const medboxImg = loadImg('/assets/medbox.png');
export const bulletImg = loadImg('/assets/bullets.png');

// ── Map backgrounds ──
export const mapBgImage = loadImg('/assets/map.png');
export const planetBgImage = loadImg('/assets/Planet_Map.png');

// ── Dog enemy sprites (legacy fallback) ──
export const dogSprites = { idle: [], walk: [], attack: [], death: [] };
for (let i = 0; i < 8; i++) dogSprites.idle.push(loadImg(`/assets/dog/idle/frame_${String(i).padStart(3, '0')}.png`));
for (let i = 0; i < 12; i++) dogSprites.walk.push(loadImg(`/assets/dog/walk/frame_${String(i).padStart(3, '0')}.png`));
for (let i = 0; i < 8; i++) dogSprites.attack.push(loadImg(`/assets/dog/attack/frame_${String(i).padStart(3, '0')}.png`));
for (let i = 0; i < 5; i++) dogSprites.death.push(loadImg(`/assets/dog/death/frame_${String(i).padStart(3, '0')}.png`));

// ── Orc enemy spritesheets (64×64 cells, 4 direction rows) ──
function loadOrcSheet(name) {
    const sheets = {};
    for (const action of ['idle', 'walk', 'attack', 'death', 'run', 'hurt']) {
        sheets[action] = loadImg(`/assets/${name}/${action}.png`);
    }
    return sheets;
}

export const orcSprites = {
    orc1: loadOrcSheet('orc1'),
    orc2: loadOrcSheet('orc2'),
    orc3: loadOrcSheet('orc3'),
};

// ── Sprite helpers ──
export function getOrcDirRow(dx, dy) {
    if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return 0;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 2;
    return dy < 0 ? 3 : 0;
}

export function getEnemyAnim(id) {
    if (!S.enemyAnimState[id]) {
        S.enemyAnimState[id] = { frame: 0, timer: 0, prevX: 0, prevY: 0 };
    }
    return S.enemyAnimState[id];
}

export function getAnimState(id) {
    if (!S.playerAnimState[id]) {
        S.playerAnimState[id] = { walkFrame: 0, walkTimer: 0, deathFrame: 0, deathTimer: 0, deathDone: false, prevX: 0, prevY: 0, spearThrown: 0 };
    }
    return S.playerAnimState[id];
}

export function angleToDir(angle) {
    const deg = ((angle * 180 / Math.PI) + 360) % 360;
    if (deg >= 337.5 || deg < 22.5) return 'east';
    if (deg >= 22.5 && deg < 67.5) return 'south-east';
    if (deg >= 67.5 && deg < 112.5) return 'south';
    if (deg >= 112.5 && deg < 157.5) return 'south-west';
    if (deg >= 157.5 && deg < 202.5) return 'west';
    if (deg >= 202.5 && deg < 247.5) return 'north-west';
    if (deg >= 247.5 && deg < 292.5) return 'north';
    return 'north-east';
}

// ── Load collision data ──
fetch('/assets/ship_collisions.json').then(r => r.json()).then(mapData => {
    const collisionLayer = mapData.layers.find(layer => layer.name === 'collisions');
    if (collisionLayer && collisionLayer.objects) {
        collisionLayer.objects.forEach(obj => {
            if (obj.width === 0 && obj.height === 0) return;
            let aabbX = obj.x, aabbY = obj.y, aabbW = obj.width, aabbH = obj.height;
            if (obj.rotation) {
                const rad = obj.rotation * (Math.PI / 180);
                const cos = Math.cos(rad), sin = Math.sin(rad);
                const c1 = { x: 0, y: 0 };
                const c2 = { x: obj.width * cos, y: obj.width * sin };
                const c3 = { x: -obj.height * sin, y: obj.height * cos };
                const c4 = { x: obj.width * cos - obj.height * sin, y: obj.width * sin + obj.height * cos };
                const minX = Math.min(c1.x, c2.x, c3.x, c4.x);
                const maxX = Math.max(c1.x, c2.x, c3.x, c4.x);
                const minY = Math.min(c1.y, c2.y, c3.y, c4.y);
                const maxY = Math.max(c1.y, c2.y, c3.y, c4.y);
                aabbX = obj.x + minX; aabbY = obj.y + minY;
                aabbW = maxX - minX; aabbH = maxY - minY;
            }
            OBSTACLES.push({ type: 'rect', x: aabbX * MAP_SCALE, y: aabbY * MAP_SCALE, w: aabbW * MAP_SCALE, h: aabbH * MAP_SCALE });
        });
    }
}).catch(e => console.error('Failed to load ship_collisions.json', e));

fetch('/assets/planet_collisions.json').then(r => r.json()).then(mapData => {
    const collisionLayer = mapData.layers.find(layer => layer.name === 'collisions');
    if (collisionLayer && collisionLayer.objects) {
        collisionLayer.objects.forEach(obj => {
            if (obj.width > 0 && obj.height > 0) {
                let aabbX = obj.x, aabbY = obj.y, aabbW = obj.width, aabbH = obj.height;
                if (obj.rotation) {
                    const rad = obj.rotation * (Math.PI / 180);
                    const cos = Math.cos(rad), sin = Math.sin(rad);
                    const c1 = { x: 0, y: 0 };
                    const c2 = { x: obj.width * cos, y: obj.width * sin };
                    const c3 = { x: -obj.height * sin, y: obj.height * cos };
                    const c4 = { x: obj.width * cos - obj.height * sin, y: obj.width * sin + obj.height * cos };
                    aabbX = obj.x + Math.min(c1.x, c2.x, c3.x, c4.x);
                    aabbY = obj.y + Math.min(c1.y, c2.y, c3.y, c4.y);
                    aabbW = Math.max(c1.x, c2.x, c3.x, c4.x) - Math.min(c1.x, c2.x, c3.x, c4.x);
                    aabbH = Math.max(c1.y, c2.y, c3.y, c4.y) - Math.min(c1.y, c2.y, c3.y, c4.y);
                }
                if (obj.ellipse) {
                    PLANET_OBSTACLES.push({ type: 'circle', x: (aabbX + aabbW / 2) * MAP_SCALE, y: (aabbY + aabbH / 2) * MAP_SCALE, r: Math.max(aabbW, aabbH) / 2 * MAP_SCALE });
                } else {
                    PLANET_OBSTACLES.push({ type: 'rect', x: aabbX * MAP_SCALE, y: aabbY * MAP_SCALE, w: aabbW * MAP_SCALE, h: aabbH * MAP_SCALE });
                }
            }
            if (obj.polygon && obj.polygon.length > 2) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                obj.polygon.forEach(p => {
                    const px = obj.x + p.x, py = obj.y + p.y;
                    if (px < minX) minX = px; if (py < minY) minY = py;
                    if (px > maxX) maxX = px; if (py > maxY) maxY = py;
                });
                const w = maxX - minX, h = maxY - minY;
                if (w > 5 && h > 5) {
                    PLANET_OBSTACLES.push({ type: 'rect', x: minX * MAP_SCALE, y: minY * MAP_SCALE, w: w * MAP_SCALE, h: h * MAP_SCALE });
                }
            }
        });
    }
}).catch(e => console.error('Failed to load planet_collisions.json', e));

// ── Load trivia data ──
fetch('/assets/mockData.json')
    .then(res => res.json())
    .then(data => S.triviaData = data)
    .catch(err => console.error("Failed to load trivia data", err));
