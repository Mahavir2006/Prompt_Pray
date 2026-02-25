const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// ORC_FRAME_COUNTS from constants.js
const FRAME_COUNTS = { idle: 4, walk: 6, attack: 8, death: 8, run: 8, hurt: 6 };
const FRAME_SIZE = 64; // pixels
const DIRECTIONS = ['south', 'west', 'east', 'north']; // Maps to rows 0, 1, 2, 3 in renderer
const ORCS = ['orc1', 'orc2', 'orc3'];
const ACTIONS = ['idle', 'walk', 'attack', 'death', 'run', 'hurt'];

async function splitOrcSprites() {
    for (const orcName of ORCS) {
        console.log(`\nProcessing ${orcName}...`);
        
        for (const action of ACTIONS) {
            const inputPath = path.join(__dirname, 'public', 'assets', orcName, `${action}.png`);
            if (!fs.existsSync(inputPath)) {
                console.warn(`  ⚠ Missing: ${inputPath}`);
                continue;
            }

            try {
                const sourceImg = await loadImage(inputPath);
                const frameCount = FRAME_COUNTS[action];
                
                // Calculate expected dimensions
                const expectedWidth = frameCount * FRAME_SIZE;
                const expectedHeight = DIRECTIONS.length * FRAME_SIZE;
                
                console.log(`  ${action}: ${sourceImg.width}x${sourceImg.height} (expecting ${expectedWidth}x${expectedHeight})`);
                
                // For each direction and frame, extract and save
                for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
                    const direction = DIRECTIONS[dirIdx];
                    
                    // Create directory if needed
                    const dirPath = path.join(__dirname, 'public', 'assets', orcName, 'animations', action, direction);
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                    
                    for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
                        const canvas = createCanvas(FRAME_SIZE, FRAME_SIZE);
                        const ctx = canvas.getContext('2d');
                        
                        const sx = frameIdx * FRAME_SIZE;
                        const sy = dirIdx * FRAME_SIZE;
                        
                        ctx.drawImage(sourceImg, sx, sy, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
                        
                        const outputPath = path.join(dirPath, `frame_${String(frameIdx).padStart(3, '0')}.png`);
                        const buffer = canvas.toBuffer('image/png');
                        fs.writeFileSync(outputPath, buffer);
                        
                        process.stdout.write('.');
                    }
                }
                console.log(`\n    ✓ ${action} split successfully`);
            } catch (err) {
                console.error(`  ✗ Error processing ${action}:`, err.message);
            }
        }
    }
    
    console.log('\n✓ All orc sprites split successfully!');
}

splitOrcSprites().catch(console.error);
