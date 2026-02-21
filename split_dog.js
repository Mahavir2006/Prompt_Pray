const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Dog.png is 1824x672 pixels
// Looking at the sprite sheet, it has distinct rows of animation frames
// Each frame appears to be roughly 96x96 pixels (1824/8 ~= 228, but frames have padding)
// Let me analyze: the sheet appears to have frames arranged in a grid
// From visual inspection: ~8 columns, 7 rows

const SHEET_W = 1824;
const SHEET_H = 672;

// The sprite sheet has 7 rows, each row has different frame counts
// Row layout from visual inspection:
// Row 0 (y=0): Idle/Walk - 8 frames (dog facing right, various poses)
// Row 1 (y=96): Energy/Attack effects - 7 frames (cyan energy projectiles)
// Row 2 (y=192): Attack with energy - 8 frames (dog with energy particles)
// Row 3 (y=288): Run cycle part 1 - 5 frames
// Row 4 (y=384): Run cycle part 2 (full running) - 12 frames
// Row 5 (y=480): Walk/Trot - 4 frames
// Row 6 (y=576): Death/Hurt - 5 frames

// Each frame is approximately 96x96 pixels based on the grid
const FRAME_W = Math.floor(SHEET_W / 8); // ~228 but let me check better
// Actually looking more carefully, the frames seem evenly spaced
// With 1824 wide and up to 12 frames in row 4, each frame would be ~152px
// But rows 0-3 have 8 frames max, suggesting ~228px per frame
// Row 4 has more frames packed tighter

// Let me use a simpler approach - extract the key animation rows
// The sprite is a single PNG - I'll just use the full image and render sub-regions
// via drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) on the client

// For the game, I need: idle, walk, attack, death
// Let me just store the sprite sheet layout as data and render from it in JS

// Actually the best approach: extract individual frames using sharp
const ROWS = [
    { name: 'idle', y: 0, h: 96, frames: 8, fw: 228 },
    { name: 'attack_fx', y: 96, h: 96, frames: 7, fw: 228 },
    { name: 'attack', y: 192, h: 96, frames: 8, fw: 228 },
    { name: 'run1', y: 288, h: 96, frames: 5, fw: 228 },
    { name: 'walk', y: 384, h: 96, frames: 12, fw: 152 },
    { name: 'trot', y: 480, h: 96, frames: 4, fw: 228 },
    { name: 'death', y: 576, h: 96, frames: 5, fw: 228 },
];

async function splitSheet() {
    const outDir = path.join(__dirname, 'public', 'assets', 'dog');

    for (const row of ROWS) {
        const rowDir = path.join(outDir, row.name);
        fs.mkdirSync(rowDir, { recursive: true });

        for (let i = 0; i < row.frames; i++) {
            const left = i * row.fw;
            // Clamp to sheet bounds
            const extractW = Math.min(row.fw, SHEET_W - left);
            const extractH = Math.min(row.h, SHEET_H - row.y);

            if (extractW <= 0 || extractH <= 0) continue;

            await sharp('Dog.png')
                .extract({ left, top: row.y, width: extractW, height: extractH })
                .toFile(path.join(rowDir, `frame_${String(i).padStart(3, '0')}.png`));

            console.log(`Extracted ${row.name}/frame_${String(i).padStart(3, '0')}.png (${left},${row.y} ${extractW}x${extractH})`);
        }
    }

    console.log('Done!');
}

splitSheet().catch(console.error);
