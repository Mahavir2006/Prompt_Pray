const { createCanvas, loadImage } = require('canvas');

async function check() {
    // Check the full idle spritesheet
    const img = await loadImage('vill/PNG/Orc1/Orc1_idle/orc1_idle_full.png');
    console.log('Full idle sheet:', img.width, 'x', img.height);

    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;

    // Find bounding boxes in each 128x128 quadrant
    console.log('\n--- Quadrant analysis (128x128 cells) ---');
    for (let qr = 0; qr < 2; qr++) {
        for (let qc = 0; qc < 2; qc++) {
            let minX = 128, minY = 128, maxX = 0, maxY = 0;
            let hasPixels = false;
            for (let y = 0; y < 128; y++) {
                for (let x = 0; x < 128; x++) {
                    const px = qc * 128 + x;
                    const py = qr * 128 + y;
                    const alpha = data[(py * img.width + px) * 4 + 3];
                    if (alpha > 10) {
                        hasPixels = true;
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            console.log(`Quadrant [${qr},${qc}]: ${hasPixels ? `content at ${minX},${minY} to ${maxX},${maxY} size=${maxX - minX + 1}x${maxY - minY + 1}` : 'EMPTY'}`);
        }
    }

    // Also try treating it as 4x4 grid of 64x64 cells
    console.log('\n--- 64x64 cell analysis ---');
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            let hasPixels = false;
            let minX = 64, minY = 64, maxX = 0, maxY = 0;
            for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) {
                    const px = col * 64 + x;
                    const py = row * 64 + y;
                    const alpha = data[(py * img.width + px) * 4 + 3];
                    if (alpha > 10) {
                        hasPixels = true;
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (hasPixels) {
                console.log(`Cell [${row},${col}]: content at ${minX},${minY} to ${maxX},${maxY} size=${maxX - minX + 1}x${maxY - minY + 1}`);
            } else {
                console.log(`Cell [${row},${col}]: EMPTY`);
            }
        }
    }

    // Also check walk spritesheet
    console.log('\n\n=== WALK SPRITESHEET ===');
    const walkImg = await loadImage('vill/PNG/Orc1/Orc1_walk/orc1_walk_full.png');
    console.log('Full walk sheet:', walkImg.width, 'x', walkImg.height);
    const wc = createCanvas(walkImg.width, walkImg.height);
    const wctx = wc.getContext('2d');
    wctx.drawImage(walkImg, 0, 0);
    const wdata = wctx.getImageData(0, 0, walkImg.width, walkImg.height).data;

    // 64x64 cell analysis for walk
    const walkCols = walkImg.width / 64;
    const walkRows = walkImg.height / 64;
    console.log(`Grid at 64x64: ${walkCols} cols x ${walkRows} rows`);
    for (let row = 0; row < walkRows; row++) {
        for (let col = 0; col < walkCols; col++) {
            let hasPixels = false;
            for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) {
                    const px = col * 64 + x;
                    const py = row * 64 + y;
                    const alpha = wdata[(py * walkImg.width + px) * 4 + 3];
                    if (alpha > 10) { hasPixels = true; break; }
                }
                if (hasPixels) break;
            }
            process.stdout.write(`[${row},${col}]:${hasPixels ? 'Y' : '_'} `);
        }
        console.log();
    }
}

check();
