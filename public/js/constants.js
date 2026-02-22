// ======================== CONSTANTS ========================
export const ROLE_COLORS = {
    vanguard: '#4cc9f0',
    engineer: '#f4a261',
    scout: '#06d6a0',
    medic: '#ef476f'
};

export const MAP_SCALE = 3;

export const MAP_ZONES = [
    { id: 'cockpit', x: 420, y: 40, w: 184, h: 120 },
    { id: 'cockpit_room', x: 300, y: 160, w: 424, h: 130 },
    { id: 'corridor', x: 475, y: 160, w: 74, h: 800 },
    { id: 'left_1', x: 255, y: 290, w: 240, h: 80 },
    { id: 'left_2', x: 210, y: 370, w: 285, h: 80 },
    { id: 'left_3', x: 170, y: 450, w: 325, h: 80 },
    { id: 'left_4', x: 140, y: 530, w: 355, h: 80 },
    { id: 'left_5', x: 110, y: 610, w: 385, h: 80 },
    { id: 'left_6', x: 80, y: 690, w: 415, h: 70 },
    { id: 'right_1', x: 529, y: 290, w: 240, h: 80 },
    { id: 'right_2', x: 529, y: 370, w: 285, h: 80 },
    { id: 'right_3', x: 529, y: 450, w: 325, h: 80 },
    { id: 'right_4', x: 529, y: 530, w: 355, h: 80 },
    { id: 'right_5', x: 529, y: 610, w: 385, h: 80 },
    { id: 'right_6', x: 529, y: 690, w: 415, h: 70 },
    { id: 'engine', x: 60, y: 760, w: 904, h: 220 },
    { id: 'wing_left', x: 5, y: 430, w: 55, h: 100 },
    { id: 'wing_right', x: 964, y: 430, w: 55, h: 100 },
];
MAP_ZONES.forEach(z => { z.x *= MAP_SCALE; z.y *= MAP_SCALE; z.w *= MAP_SCALE; z.h *= MAP_SCALE; });

export const OBSTACLES = [];
export const PLANET_OBSTACLES = [];

export const WORLD_W = 1024 * MAP_SCALE;
export const WORLD_H = 1024 * MAP_SCALE;
export const PLANET_W = 1536 * MAP_SCALE;
export const PLANET_H = 1024 * MAP_SCALE;

export const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const ROLES_LIST = ['vanguard', 'engineer', 'scout', 'medic'];
export const SPRITE_SCALE = 3;

export const ORC_FRAME = 64;
export const ORC_FRAME_COUNTS = { idle: 4, walk: 6, attack: 8, death: 8, run: 8, hurt: 6 };

export const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export const DISCLAIMER_TEXT = "This is a classified field operation. All personnel are hereby briefed under Protocol Sigma-7. " +
    "Your team has been deployed to an uncharted exoplanet following a catastrophic ship failure. " +
    "Communication with Command is severed. Survival depends on cooperation, quick thinking, and decisive action. " +
    "This simulation contains combat scenarios, timed objectives, and knowledge verification terminals. " +
    "Failure to complete the mission within the allotted timeframe will result in total loss. Proceed with caution.";
