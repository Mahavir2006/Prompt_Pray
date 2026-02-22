/**
 * Split orc spritesheets into individual frames.
 * Layout: 128x128 per frame, grid of (W/128) cols × 2 rows
 * Frames read left-to-right, top-to-bottom.
 */
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const FRAME_W = 128;
const FRAME_H = 128;

const ORCS = [
    { name: 'orc1', srcDir: 'vill/PNG/Orc1', prefix: 'orc1' },
    { name: 'orc2', srcDir: 'vill/PNG/Orc2', prefix: 'orc2' },
    { name: 'orc3', srcDir: 'vill/PNG/Orc3', prefix: 'orc3' },
];

const ANIMS = [
    { anim: 'idle',   folder: '{P}_idle',   file: '{p}_idle_full.png' },
    { anim: 'walk',   folder: '{P}_walk',   file: '{p}_walk_full.png' },
    { anim: 'attack', folder: '{P}_attack', file: '{p}_attack_full.png' },
    { anim: 'death',  folder: '{P}_death',  file: '{p}_death_full.png' },
    { anim: 'run',    folder: '{P}_run',    file: '{p}_run_full.png' },
    { anim: 'hurt',   folder: '{P}_hurt',   file: '{p}_hurt_full.png' },
];

async function splitSheet(imgPath, outDir, animName) {
    if (!fs.existsSync(imgPath)) {
        console.log(`  SKIP (not found): ${imgPath}`);
        return 0;
    }
    const img = await loadImage(imgPath);
    const cols = Math.floor(img.width / FRAME_W);
    const rows = Math.floor(img.height / FRAME_H);
    const totalFrames = cols * rows;

    fs.mkdirSync(outDir, { recursive: true });

    const canvas = createCanvas(FRAME_W, FRAME_H);
    const ctx = canvas.getContext('2d');

    let frameNum = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.clearRect(0, 0, FRAME_W, FRAME_H);
            ctx.drawImage(img, c * FRAME_W, r * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
            const buf = canvas.toBuffer('image/png');
            const fname = `frame_${String(frameNum).padStart(3, '0')}.png`;
            fs.writeFileSync(path.join(outDir, fname), buf);
            frameNum++;
        }
    }
    console.log(`  ${animName}: ${frameNum} frames (${cols}×${rows}) from ${path.basename(imgPath)}`);
    return frameNum;
}

(async () => {
    for (const orc of ORCS) {
        console.log(`\nProcessing ${orc.name}...`);
        const destBase = path.join('public', 'assets', orc.name);

        for (const a of ANIMS) {
            // Handle case differences: Orc1 has Orc1_walk, Orc3 has orc3_walk
            const folderName = a.folder.replace('{P}', orc.prefix.charAt(0).toUpperCase() + orc.prefix.slice(1));
            const folderNameLower = a.folder.replace('{P}', orc.prefix);
            const fileName = a.file.replace('{p}', orc.prefix);

            let srcPath = path.join(orc.srcDir, folderName, fileName);
            if (!fs.existsSync(srcPath)) {
                srcPath = path.join(orc.srcDir, folderNameLower, fileName);
            }
            const outDir = path.join(destBase, a.anim);
            await splitSheet(srcPath, outDir, a.anim);
        }
    }
    console.log('\nDone! Frames saved to public/assets/orc1/, orc2/, orc3/');
})();
