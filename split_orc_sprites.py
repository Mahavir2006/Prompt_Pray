from PIL import Image
import os
from pathlib import Path

# ORC_FRAME_COUNTS from constants.js
FRAME_COUNTS = {
    'idle': 4,
    'walk': 6,
    'attack': 8,
    'death': 8,
    'run': 8,
    'hurt': 6
}

FRAME_SIZE = 64  # pixels
DIRECTIONS = ['south', 'west', 'east', 'north']  #0, 1, 2, 3
ORCS = ['orc1', 'orc2', 'orc3']
ACTIONS = ['idle', 'walk', 'attack', 'death', 'run', 'hurt']

base_path = Path(__file__).parent / 'public' / 'assets'

def split_orc_sprites():
    for orc_name in ORCS:
        print(f"\nProcessing {orc_name}...")
        
        for action in ACTIONS:
            input_path = base_path / orc_name / f'{action}.png'
            
            if not input_path.exists():
                print(f"  ⚠ Missing: {input_path}")
                continue
            
            try:
                # Load the sprite sheet
                img = Image.open(input_path)
                frame_count = FRAME_COUNTS[action]
                
                print(f"  {action}: {img.width}x{img.height} (expecting {frame_count * FRAME_SIZE}x{len(DIRECTIONS) * FRAME_SIZE})")
                
                # For each direction and frame, extract and save
                for dir_idx, direction in enumerate(DIRECTIONS):
                    # Create directory
                    dir_path = base_path / orc_name / 'animations' / action / direction
                    dir_path.mkdir(parents=True, exist_ok=True)
                    
                    for frame_idx in range(frame_count):
                        # Calculate crop box
                        left = frame_idx * FRAME_SIZE
                        top = dir_idx * FRAME_SIZE
                        right = left + FRAME_SIZE
                        bottom = top + FRAME_SIZE
                        
                        # Crop the frame
                        frame_img = img.crop((left, top, right, bottom))
                        
                        # Save the frame
                        output_path = dir_path / f'frame_{frame_idx:03d}.png'
                        frame_img.save(output_path)
                        
                        print('.', end='', flush=True)
                
                print(f"\n    ✓ {action} split successfully")
            
            except Exception as e:
                print(f"\n  ✗ Error processing {action}: {e}")
    
    print('\n✓ All orc sprites split successfully!')

if __name__ == '__main__':
    split_orc_sprites()
