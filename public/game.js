// ======================== GAME CLIENT ========================
(function () {
    'use strict';

    // ======================== CONSTANTS ========================
    const ROLE_COLORS = {
        vanguard: '#4cc9f0',
        engineer: '#f4a261',
        scout: '#06d6a0',
        medic: '#ef476f'
    };

    // ── MAP INTEGRATION START ──
    const MAP_SCALE = 3;
    const MAP_ZONES = [
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

    const OBSTACLES = [];

    // Fetch precise collisions from Tiled JSON
    fetch('/assets/ship_collisions.json').then(r => r.json()).then(mapData => {
        const collisionLayer = mapData.layers.find(layer => layer.name === 'collisions');
        if (collisionLayer && collisionLayer.objects) {
            collisionLayer.objects.forEach(obj => {
                if (obj.width === 0 && obj.height === 0) return;

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

                OBSTACLES.push({
                    type: 'rect',
                    x: aabbX * MAP_SCALE,
                    y: aabbY * MAP_SCALE,
                    w: aabbW * MAP_SCALE,
                    h: aabbH * MAP_SCALE
                });
            });
        }
    }).catch(e => console.error('Failed to load ship_collisions.json', e));

    const WORLD_W = 1024 * MAP_SCALE;
    const WORLD_H = 1024 * MAP_SCALE;
    const PLANET_W = 1024 * MAP_SCALE;
    const PLANET_H = 1024 * MAP_SCALE;
    // ── MAP INTEGRATION END ──

    // ======================== STATE ========================
    let ws = null;
    let myId = null;
    let gameState = null;
    let prevState = null;
    let lastStateTime = 0;
    let screenPhase = 'lobby'; // lobby, cinematic, game, gameover

    // Input
    const keys = { w: false, a: false, s: false, d: false };
    let mouseX = 0, mouseY = 0;
    let mouseMoved = false;
    let mouseDown = false;
    let interacting = false;
    let abilityPressed = false;
    let tabDown = false;

    // Camera
    let camX = 0, camY = 0;
    let camShakeX = 0, camShakeY = 0;
    let camShakeIntensity = 0;

    // Particles
    const particles = [];
    const floatTexts = [];

    // Announcements
    let announcement = null;
    let announcementTimer = 0;

    // Cinematic
    let cinematicTimer = 0;
    const stars = [];
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * 1200,
            y: Math.random() * 700,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 100 + 50
        });
    }

    // ======================== CHARACTER SPRITES ========================
    const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const ROLES_LIST = ['vanguard', 'engineer', 'scout', 'medic'];
    const SPRITE_SCALE = 3; // scale up pixel art
    const roleSprites = {};
    let spritesLoaded = 0;
    let totalSprites = 0;

    // ── MAP INTEGRATION: load map backgrounds ──
    const mapBgImage = loadImg('/assets/map.png');
    const planetBgImage = loadImg('/assets/Planet_Map.png');
    let debugMode = false;
    let myCurrentMap = 'ship'; // Track which map the local player is on

    // Planet obstacles (loaded for debug drawing)
    const PLANET_OBSTACLES = [];
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

    function loadImg(src) {
        totalSprites++;
        const img = new Image();
        img.src = src;
        img.onload = () => spritesLoaded++;
        img.onerror = () => { console.warn('Missing sprite:', src); spritesLoaded++; }; // gracefully handle missing frames
        return img;
    }

    ROLES_LIST.forEach(role => {
        roleSprites[role] = { idle: {}, walk: {}, death: {}, sword: {} };

        // Idle rotations
        DIRS.forEach(dir => {
            roleSprites[role].idle[dir] = loadImg(`/assets/${role}/rotations/${dir}.png`);
        });

        // Walk animation (6 frames per direction)
        DIRS.forEach(dir => {
            roleSprites[role].walk[dir] = [];
            for (let i = 0; i < 6; i++) {
                roleSprites[role].walk[dir].push(loadImg(`/assets/${role}/animations/walk/${dir}/frame_${String(i).padStart(3, '0')}.png`));
            }
        });

        // Death animation (7 frames)
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

    // Weapon sprites for other roles
    const spearImg = loadImg('/assets/spear.png');
    const gunImg = loadImg('/assets/gun.png');
    const medboxImg = loadImg('/assets/medbox.png');
    const bulletImg = loadImg('/assets/bullets.png');

    // Dog enemy sprite frames
    const dogSprites = { idle: [], walk: [], attack: [], death: [] };
    for (let i = 0; i < 8; i++) dogSprites.idle.push(loadImg(`/assets/dog/idle/frame_${String(i).padStart(3, '0')}.png`));
    for (let i = 0; i < 12; i++) dogSprites.walk.push(loadImg(`/assets/dog/walk/frame_${String(i).padStart(3, '0')}.png`));
    for (let i = 0; i < 8; i++) dogSprites.attack.push(loadImg(`/assets/dog/attack/frame_${String(i).padStart(3, '0')}.png`));
    for (let i = 0; i < 5; i++) dogSprites.death.push(loadImg(`/assets/dog/death/frame_${String(i).padStart(3, '0')}.png`));

    // Enemy animation state tracking
    const enemyAnimState = {};
    function getEnemyAnim(id) {
        if (!enemyAnimState[id]) {
            enemyAnimState[id] = { frame: 0, timer: 0, prevX: 0, prevY: 0 };
        }
        return enemyAnimState[id];
    }

    // Per-player animation tracking
    const playerAnimState = {};
    function getAnimState(id) {
        if (!playerAnimState[id]) {
            playerAnimState[id] = { walkFrame: 0, walkTimer: 0, deathFrame: 0, deathTimer: 0, deathDone: false, prevX: 0, prevY: 0, spearThrown: 0 };
        }
        return playerAnimState[id];
    }

    // convert angle to 8-direction name
    function angleToDir(angle) {
        // angle is in radians, 0 = east
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

    // ======================== VOICE CHAT (WEBRTC) ========================
    let localStream = null;
    let selectedAudioDeviceId = null;
    let speakerEnabled = false;
    const peerConnections = {};
    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    // State per peer for Perfect Negotiation
    const pcStates = {}; // peerId -> { makingOffer: false }

    async function toggleSpeaker(forceState) {
        if (forceState !== undefined) speakerEnabled = forceState;
        else speakerEnabled = !speakerEnabled;

        const btn = document.getElementById('speakerBtn');
        if (!btn) return;

        if (speakerEnabled) {
            btn.textContent = 'SPEAKER ON';
            btn.style.background = 'rgba(6, 214, 160, 0.2)';
            btn.style.borderColor = 'rgba(6, 214, 160, 0.5)';
            btn.style.color = '#06d6a0';

            document.querySelectorAll('audio').forEach(el => el.muted = false);

            const speakerSelect = document.getElementById('speakerSelect');
            if (speakerSelect && navigator.mediaDevices.enumerateDevices) {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                    if (audioOutputs.length > 0) {
                        speakerSelect.innerHTML = audioOutputs.map((d, i) =>
                            `<option value="${d.deviceId}">${d.label || 'Speaker ' + (i + 1)}</option>`
                        ).join('');
                        speakerSelect.style.display = 'inline-block';
                        speakerSelect.onchange = () => {
                            selectedAudioDeviceId = speakerSelect.value;
                            document.querySelectorAll('audio').forEach(el => {
                                if (typeof el.setSinkId === 'function') {
                                    el.setSinkId(selectedAudioDeviceId).catch(e => console.warn("Sink update failed:", e));
                                }
                            });
                        };
                        selectedAudioDeviceId = speakerSelect.value;
                    }
                } catch (e) {
                    console.warn(e);
                }
            }
        } else {
            btn.textContent = 'SPEAKER OFF';
            btn.style.background = 'rgba(230, 57, 70, 0.2)';
            btn.style.borderColor = 'rgba(230, 57, 70, 0.5)';
            btn.style.color = '#e63946';

            document.querySelectorAll('audio').forEach(el => el.muted = true);

            const speakerSelect = document.getElementById('speakerSelect');
            if (speakerSelect) speakerSelect.style.display = 'none';
            selectedAudioDeviceId = null;
        }
    }

    async function toggleMic() {
        const btn = document.getElementById('micBtn');
        if (localStream) {
            // Disable Mic
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;

            // Remove tracks instead of closing the connection so Speaker can keep listening!
            Object.values(peerConnections).forEach(pc => {
                const senders = pc.getSenders();
                senders.forEach(s => {
                    if (s.track && s.track.kind === 'audio') {
                        pc.removeTrack(s);
                    }
                });
            });

            btn.textContent = 'MIC OFF';
            btn.style.background = 'rgba(230, 57, 70, 0.2)';
            btn.style.borderColor = 'rgba(230, 57, 70, 0.5)';
            btn.style.color = '#e63946';
            return;
        }

        try {
            // Get Mic Access
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            btn.textContent = 'MIC ON (LIVE)';
            btn.style.background = 'rgba(6, 214, 160, 0.2)';
            btn.style.borderColor = 'rgba(6, 214, 160, 0.5)';
            btn.style.color = '#06d6a0';

            // Add local track to any existing peer connections right away (this triggers onnegotiationneeded automatically!)
            Object.keys(peerConnections).forEach(pidStr => {
                const pid = parseInt(pidStr);
                const pc = peerConnections[pid];
                const hasTrack = pc.getSenders().some(s => s.track && s.track.kind === 'audio');
                if (!hasTrack && pc.signalingState !== 'closed') {
                    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                }
            });

            if (activePlayerIds.length > 0) {
                connectToPeers(activePlayerIds);
            }

            // Refresh speaker dropdown labels if speaker is enabled without recursively flipping state
            if (speakerEnabled) {
                await toggleSpeaker(true);
            }

        } catch (e) {
            console.warn("Mic access denied or error:", e);
            if (!navigator.mediaDevices) {
                showError("HTTPS or localhost required for microphone.");
            } else if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
                showError("Microphone permission blocked by browser.");
            } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
                showError("No microphone found.");
            } else {
                showError("Mic error: " + e.message);
            }
        }
    }

    function getPeerConnection(peerId) {
        if (peerConnections[peerId]) return peerConnections[peerId];
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[peerId] = pc;
        pcStates[peerId] = { makingOffer: false };

        if (localStream) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        }

        pc.onnegotiationneeded = async () => {
            try {
                pcStates[peerId].makingOffer = true;
                await pc.setLocalDescription();
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'webrtc_signal', targetId: peerId, signalData: { offer: pc.localDescription } }));
                }
            } catch (err) {
                console.warn("Negotiation error:", err);
            } finally {
                pcStates[peerId].makingOffer = false;
            }
        };

        pc.onicecandidate = (e) => {
            if (e.candidate && ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'webrtc_signal', targetId: peerId, signalData: { candidate: e.candidate } }));
            }
        };
        pc.ontrack = async (e) => {
            let audioEl = document.getElementById('audio_' + peerId);
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = 'audio_' + peerId;
                audioEl.autoplay = true;
                audioEl.muted = !speakerEnabled; // ONLY audibly play if speaker is enabled

                // Set the selected speaker device if chosen
                if (selectedAudioDeviceId && typeof audioEl.setSinkId === 'function') {
                    try {
                        await audioEl.setSinkId(selectedAudioDeviceId);
                    } catch (err) {
                        console.warn("Failed to set speaker output", err);
                    }
                }

                document.body.appendChild(audioEl);
            }
            audioEl.srcObject = e.streams[0];
        };
        return pc;
    }

    function connectToPeers(playerIds) {
        for (const pid of playerIds) {
            if (pid !== myId && !peerConnections[pid]) {
                const pc = getPeerConnection(pid);
                // Only the "smaller" ID establishes the initial polite mesh connection line to prevent simultaneous cross-firing glare
                if (myId < pid) {
                    pc.createDataChannel('gameData');
                }
            }
        }
    }

    async function handleWebRTCSignal(msg) {
        const senderId = msg.senderId;
        const data = msg.signalData;
        const pc = getPeerConnection(senderId);
        const state = pcStates[senderId];

        // Perfect Negotiation Pattern
        const polite = myId > senderId; // Lower ID (Host usually) is impolite, Higher ID is polite

        try {
            if (data.offer) {
                const offerCollision = (state.makingOffer || pc.signalingState !== "stable");
                if (offerCollision) {
                    if (!polite) return; // Impolite peer ignores the incoming offer and sticks to its own
                    await Promise.all([
                        pc.setLocalDescription({ type: "rollback" }),
                        pc.setRemoteDescription(new RTCSessionDescription(data.offer))
                    ]);
                } else {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                }
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: 'webrtc_signal', targetId: senderId, signalData: { answer: pc.localDescription } }));
            } else if (data.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } else if (data.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {
            console.warn("WebRTC error handling signal from", senderId, e);
        }
    }

    // ======================== CANVAS SETUP ========================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // ======================== DOM ELEMENTS ========================
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const connectScreen = document.getElementById('connectScreen');
    const roomScreen = document.getElementById('roomScreen');
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    const hud = document.getElementById('hud');
    const timerDisplay = document.getElementById('timerDisplay');
    const objectiveDisplay = document.getElementById('objectiveDisplay');
    const phaseDisplay = document.getElementById('phaseDisplay');
    const hudHpBar = document.getElementById('hudHpBar');
    const hudHpText = document.getElementById('hudHpText');
    const hudAbility = document.getElementById('hudAbility');
    const hudAbilityCd = document.getElementById('hudAbilityCd');

    let activePlayerIds = [];

    // ======================== LOBBY LOGIC ========================
    document.getElementById('speakerBtn').onclick = () => toggleSpeaker();
    document.getElementById('micBtn').onclick = () => toggleMic();
    document.getElementById('createBtn').onclick = () => {
        const name = document.getElementById('nameInput').value.trim();
        if (!name) return showError('Enter a Callsign');
        connect(() => {
            ws.send(JSON.stringify({ type: 'createRoom', name }));
        });
    };

    document.getElementById('joinBtn').onclick = () => {
        const name = document.getElementById('nameInput').value.trim();
        if (!name) return showError('Enter a Callsign');
        const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
        if (!code) return showError('Enter a Room Code');
        connect(() => {
            ws.send(JSON.stringify({ type: 'joinRoom', name, roomCode: code }));
        });
    };

    document.querySelectorAll('.role-card').forEach(card => {
        card.addEventListener('click', () => {
            const role = card.dataset.role;
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'selectRole', role }));
            }
        });
    });

    document.getElementById('readyBtn').onclick = () => {
        if (ws) ws.send(JSON.stringify({ type: 'ready' }));
    };

    document.getElementById('copyCodeBtn').onclick = () => {
        const code = document.getElementById('roomCodeDisplay').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copyCodeBtn');
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = '📋'; }, 1500);
        });
    };

    document.getElementById('startBtn').onclick = () => {
        if (ws) ws.send(JSON.stringify({ type: 'startGame' }));
    };

    document.getElementById('backToLobbyBtn').onclick = () => {
        gameOverOverlay.style.display = 'none';
        lobbyOverlay.style.display = 'flex';
        connectScreen.style.display = 'block';
        roomScreen.style.display = 'none';
        screenPhase = 'lobby';
        gameState = null;
        if (ws) ws.close();
    };

    function showError(msg) {
        document.getElementById('errorMsg').textContent = msg;
        setTimeout(() => { document.getElementById('errorMsg').textContent = ''; }, 3000);
    }

    let selectedRole = null;

    function updateLobbyUI(data) {
        document.getElementById('roomCodeDisplay').textContent = data.roomCode;
        activePlayerIds = data.players.map(p => p.id);
        connectToPeers(activePlayerIds);

        const takenRoles = new Set();
        data.players.forEach(p => { if (p.role && p.id !== myId) takenRoles.add(p.role); });
        const myPlayer = data.players.find(p => p.id === myId);
        selectedRole = myPlayer?.role;

        document.querySelectorAll('.role-card').forEach(card => {
            const role = card.dataset.role;
            card.classList.toggle('selected', role === selectedRole);
            card.classList.toggle('taken', takenRoles.has(role));
        });

        const isHost = myPlayer?.isHost;
        const readyBtn = document.getElementById('readyBtn');
        readyBtn.style.display = isHost ? 'none' : 'inline-block';
        readyBtn.classList.toggle('active', myPlayer?.ready);
        readyBtn.textContent = myPlayer?.ready ? '✓ READY' : 'READY';

        const playerList = document.getElementById('playerList');
        playerList.innerHTML = data.players.map(p => `
      <div class="player-tag ${p.ready ? 'ready' : ''}">
        <span class="ready-dot"></span>
        <span>${p.name}</span>
        <span style="color:${ROLE_COLORS[p.role] || '#555'}">${p.role ? p.role.toUpperCase() : '—'}</span>
        ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      </div>
    `).join('');

        const startBtn = document.getElementById('startBtn');
        startBtn.style.display = isHost ? 'inline-block' : 'none';
        startBtn.disabled = !data.canStart;
    }

    // ======================== WEBSOCKET ========================
    function connect(onOpen) {
        if (ws) {
            ws.onclose = null;
            ws.close();
            ws = null;
            Object.values(peerConnections).forEach(pc => pc.close());
            for (let key in peerConnections) delete peerConnections[key];
        }

        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${location.host}`);

        ws.onopen = () => {
            if (onOpen) onOpen();
        };

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            handleMessage(msg);
        };

        ws.onclose = () => {
            if (screenPhase === 'game') {
                showAnnouncement('DISCONNECTED', 5, '#e63946');
            }
        };

        ws.onerror = () => {
            showError('Connection failed. Server might be down!');
        };
    }

    function handleMessage(msg) {
        switch (msg.type) {
            case 'roomCreated':
            case 'roomJoined':
                myId = msg.playerId;
                connectScreen.style.display = 'none';
                roomScreen.style.display = 'block';
                document.getElementById('roomCodeDisplay').textContent = msg.roomCode;
                break;

            case 'lobbyUpdate':
                updateLobbyUI(msg);
                break;

            case 'assignId':
                myId = msg.playerId;
                break;

            case 'gameStart':
                screenPhase = 'cinematic';
                lobbyOverlay.style.display = 'none';
                hud.style.display = 'none';
                cinematicTimer = 0;
                break;

            case 'gameState':
                prevState = gameState;
                gameState = msg;
                lastStateTime = performance.now();

                // Transition from cinematic to game
                if (screenPhase === 'cinematic' && msg.phase !== 'cinematic') {
                    screenPhase = 'game';
                    hud.style.display = 'block';
                }

                // Process events
                if (msg.events) {
                    msg.events.forEach(processEvent);
                }
                break;

            case 'gameOver':
                screenPhase = 'gameover';
                hud.style.display = 'none';
                showGameOver(msg);
                break;

            case 'error':
                showError(msg.message);
                break;

            case 'webrtc_signal':
                handleWebRTCSignal(msg);
                break;
        }
    }

    function processEvent(evt) {
        switch (evt.type) {
            case 'damage':
                floatTexts.push({
                    x: evt.x, y: evt.y,
                    text: '-' + evt.value,
                    color: evt.color || '#e63946',
                    life: 1.0,
                    vy: -50
                });
                addShake(3);
                break;
            case 'heal':
                floatTexts.push({
                    x: evt.x, y: evt.y,
                    text: '+' + evt.value,
                    color: '#06d6a0',
                    life: 1.0,
                    vy: -50
                });
                break;
            case 'kill':
                for (let i = 0; i < 8; i++) {
                    particles.push({
                        x: evt.x, y: evt.y,
                        vx: (Math.random() - 0.5) * 200,
                        vy: (Math.random() - 0.5) * 200,
                        life: 0.6,
                        color: '#e63946',
                        size: 3
                    });
                }
                break;
            case 'melee':
                for (let i = 0; i < 5; i++) {
                    particles.push({
                        x: evt.x + (Math.random() - 0.5) * 20,
                        y: evt.y + (Math.random() - 0.5) * 20,
                        vx: Math.cos(evt.angle) * (100 + Math.random() * 50),
                        vy: Math.sin(evt.angle) * (100 + Math.random() * 50),
                        life: 0.3,
                        color: '#4cc9f0',
                        size: 4
                    });
                }
                break;
            case 'turretShot':
                particles.push({
                    x: evt.x1, y: evt.y1,
                    vx: (evt.x2 - evt.x1) * 2, vy: (evt.y2 - evt.y1) * 2,
                    life: 0.15, color: '#f4a261', size: 3
                });
                break;
            case 'announcement':
                showAnnouncement(evt.text, evt.duration || 3, evt.color);
                break;
            case 'chat':
                displayChatMessage(evt.name, evt.msg, evt.color);
                break;
        }
    }

    function displayChatMessage(name, msg, color) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        // Style name with color
        msgDiv.innerHTML = `<span class="author" style="color:${color}">${name}:</span>${msg}`;

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll

        // Fade out after 10s
        setTimeout(() => {
            msgDiv.classList.add('fade-out');
            setTimeout(() => {
                if (chatMessages.contains(msgDiv)) {
                    chatMessages.removeChild(msgDiv);
                }
            }, 1000); // Wait for CSS transition
        }, 10000);
    }

    function showAnnouncement(text, duration, color) {
        announcement = { text, color: color || '#fff' };
        announcementTimer = duration;
        phaseDisplay.textContent = text;
        phaseDisplay.style.color = color || '#fff';
        phaseDisplay.classList.add('show');
        setTimeout(() => phaseDisplay.classList.remove('show'), duration * 1000);
    }

    function showGameOver(msg) {
        gameOverOverlay.style.display = 'flex';
        const title = document.getElementById('gameOverTitle');
        const subtitle = document.getElementById('gameOverSubtitle');
        const scoreboard = document.getElementById('finalScoreboard');

        if (msg.victory) {
            title.textContent = 'MISSION COMPLETE';
            title.className = 'gameover-title victory';
            subtitle.textContent = `Transmission sent. Extraction incoming. Time remaining: ${Math.floor(msg.timeRemaining)}s`;
        } else {
            title.textContent = 'GAME OVER';
            title.className = 'gameover-title defeat';
            subtitle.textContent = 'All personnel lost. The signal was never sent.';
        }

        scoreboard.innerHTML = msg.scores.map((s, i) => `
      <div class="score-row">
        <span class="score-name">${i === 0 ? '★ ' : ''}${s.name}</span>
        <span class="score-role" style="color:${ROLE_COLORS[s.role]}">${s.role?.toUpperCase()}</span>
        <span class="score-stats">
          <span>⚔ ${Math.round(s.damageDealt)}</span>
          <span>♥ ${Math.round(s.healingDone)}</span>
          <span>☠ ${s.enemiesKilled}</span>
        </span>
      </div>
    `).join('');
    }

    // ======================== INPUT ========================
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();

        // Chat toggle
        const chatInput = document.getElementById('chatInput');
        if (chatInput && document.activeElement === chatInput) {
            if (e.key === 'Enter') {
                const text = chatInput.value.trim();
                if (text.length > 0 && ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'chat', msg: text }));
                }
                chatInput.value = '';
                chatInput.blur();
                chatInput.style.display = 'none';
            } else if (e.key === 'Escape') {
                chatInput.value = '';
                chatInput.blur();
                chatInput.style.display = 'none';
            }
            return; // Block movement keys while typing
        }

        // Open chat if not typing elsewhere
        if (e.key === 'Enter' && screenPhase === 'game') {
            if (chatInput) {
                chatInput.style.display = 'block';
                chatInput.focus();
            }
            e.preventDefault();
            return;
        }

        if (e.target.tagName === 'INPUT') return;

        if (k === 'w') keys.w = true;
        if (k === 'a') keys.a = true;
        if (k === 's') keys.s = true;
        if (k === 'd') keys.d = true;
        if (k === 'e') interacting = true;
        if (k === 'q') abilityPressed = true;
        if (k === 'tab') { tabDown = true; e.preventDefault(); }
        // ── MAP INTEGRATION: debug toggle ──
        if (k === 'f3') { debugMode = !debugMode; e.preventDefault(); }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w') keys.w = false;
        if (k === 'a') keys.a = false;
        if (k === 's') keys.s = false;
        if (k === 'd') keys.d = false;
        if (k === 'e') interacting = false;
        if (k === 'q') abilityPressed = false;
        if (k === 'tab') { tabDown = false; e.preventDefault(); }
    });

    canvas.addEventListener('mousemove', e => {
        mouseMoved = true;
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouseDown = true; });
    canvas.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Send input to server at 20Hz
    setInterval(() => {
        if (!ws || ws.readyState !== 1 || screenPhase !== 'game' || !gameState) return;
        const worldMouseX = mouseX + camX - canvas.width / 2;
        const worldMouseY = mouseY + camY - canvas.height / 2;
        ws.send(JSON.stringify({
            type: 'input',
            w: keys.w, a: keys.a, s: keys.s, d: keys.d,
            mouseX: worldMouseX, mouseY: worldMouseY,
            attack: mouseDown, interact: interacting, ability: abilityPressed
        }));
    }, 50);

    // ======================== CAMERA ========================
    function updateCamera(dt) {
        if (!gameState) return;
        const me = gameState.players.find(p => p.id === myId);
        if (!me) return;

        // Track local player's current map
        if (me.currentMap && me.currentMap !== myCurrentMap) {
            myCurrentMap = me.currentMap;
        }

        const targetX = me.x;
        const targetY = me.y;
        camX += (targetX - camX) * 0.1;
        camY += (targetY - camY) * 0.1;

        // ── MAP INTEGRATION: clamp camera to world bounds (per map) ──
        const halfW = canvas.width / 2;
        const halfH = canvas.height / 2;
        const worldW = myCurrentMap === 'planet' ? PLANET_W : WORLD_W;
        const worldH = myCurrentMap === 'planet' ? PLANET_H : WORLD_H;
        camX = Math.max(halfW, Math.min(worldW - halfW, camX));
        camY = Math.max(halfH, Math.min(worldH - halfH, camY));
        // If canvas is larger than world, center it
        if (canvas.width >= worldW) camX = worldW / 2;
        if (canvas.height >= worldH) camY = worldH / 2;

        // Camera shake
        if (camShakeIntensity > 0) {
            camShakeX = (Math.random() - 0.5) * camShakeIntensity * 2;
            camShakeY = (Math.random() - 0.5) * camShakeIntensity * 2;
            camShakeIntensity *= 0.9;
            if (camShakeIntensity < 0.5) camShakeIntensity = 0;
        } else {
            camShakeX = 0;
            camShakeY = 0;
        }
    }

    function addShake(amount) {
        camShakeIntensity = Math.min(camShakeIntensity + amount, 15);
    }

    function worldToScreen(wx, wy) {
        return {
            x: wx - camX + canvas.width / 2 + camShakeX,
            y: wy - camY + canvas.height / 2 + camShakeY
        };
    }

    // ======================== PARTICLES ========================
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = floatTexts.length - 1; i >= 0; i--) {
            const t = floatTexts[i];
            t.y += t.vy * dt;
            t.life -= dt;
            if (t.life <= 0) floatTexts.splice(i, 1);
        }
    }

    // ======================== RENDERER ========================
    function render(dt) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (screenPhase === 'cinematic') {
            renderCinematic(dt);
            return;
        }

        if (screenPhase !== 'game' || !gameState) {
            // Draw star background for lobby
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            for (const star of stars) {
                ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
                ctx.fillRect(star.x % canvas.width, star.y % canvas.height, star.size, star.size);
            }
            return;
        }

        updateCamera(dt);

        // Background
        ctx.fillStyle = '#030308';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw distant stars
        ctx.save();
        for (const star of stars) {
            const sx = ((star.x - camX * 0.1) % canvas.width + canvas.width) % canvas.width;
            const sy = ((star.y - camY * 0.05) % canvas.height + canvas.height) % canvas.height;
            ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.3})`;
            ctx.fillRect(sx, sy, star.size * 0.7, star.size * 0.7);
        }
        ctx.restore();

        // Draw map zones
        drawMap();

        // Draw objective marker
        drawObjective();

        // Draw turrets
        drawTurrets();

        // Draw enemies
        drawEnemies();

        // Draw boss
        if (gameState.boss) drawBoss();

        // Draw projectiles
        drawProjectiles();

        // Draw players
        drawPlayers(dt);

        // Draw particles
        drawParticles();

        // Draw floating texts
        drawFloatTexts();

        // Draw minimap
        drawMinimap();

        // Draw scoreboard (Tab)
        if (tabDown) drawScoreboard();

        // Update HUD
        updateHUD();
    }

    // ── MAP INTEGRATION START ──
    function drawMap() {
        // Draw the correct map image based on the local player's current map
        const s = worldToScreen(0, 0);

        if (myCurrentMap === 'planet') {
            // Draw planet map
            if (planetBgImage.complete && planetBgImage.naturalWidth > 0) {
                ctx.drawImage(planetBgImage, s.x, s.y, PLANET_W, PLANET_H);
            } else {
                // Fallback: draw a colored background for the planet
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(s.x, s.y, PLANET_W, PLANET_H);
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '24px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('PLANET SURFACE', s.x + PLANET_W / 2, s.y + PLANET_H / 2);
            }
        } else {
            // Draw spaceship map
            if (mapBgImage.complete && mapBgImage.naturalWidth > 0) {
                ctx.drawImage(mapBgImage, s.x, s.y, WORLD_W, WORLD_H);
            }
        }

        // Draw transition zone indicator (glowing portal effect)
        if (myCurrentMap === 'ship') {
            // Ship exit zone indicator at engine room bottom
            const exitX = 400 * MAP_SCALE;
            const exitY = 920 * MAP_SCALE;
            const exitW = 224 * MAP_SCALE;
            const exitH = 104 * MAP_SCALE;
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
        } else if (myCurrentMap === 'planet') {
            // Planet exit zone indicator at top edge
            const exitX = 400 * MAP_SCALE;
            const exitY = 900 * MAP_SCALE;
            const exitW = 224 * MAP_SCALE;
            const exitH = 124 * MAP_SCALE;
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

        // Debug overlay (toggled with F3 key)
        if (debugMode) {
            ctx.save();
            const activeZones = myCurrentMap === 'planet' ? [
                { id: 'planet_main', x: 0, y: 0, w: 1024 * MAP_SCALE, h: 1024 * MAP_SCALE }
            ] : MAP_ZONES;
            const activeObs = myCurrentMap === 'planet' ? PLANET_OBSTACLES : OBSTACLES;

            // Draw walkable zones (green outlines)
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
            // Draw obstacles (red outlines)
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
            // Debug label
            ctx.fillStyle = '#00ff00';
            ctx.font = '12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`DEBUG MODE (F3) — Map: ${myCurrentMap.toUpperCase()}`, 10, canvas.height - 10);
            ctx.restore();
        }
    }
    // ── MAP INTEGRATION END ──

    function drawObjective() {
        if (!gameState.objective || myCurrentMap !== 'ship') return;
        const obj = gameState.objective;
        const s = worldToScreen(obj.x, obj.y);
        const time = performance.now() / 1000;

        // Pulsing ring
        const pulse = Math.sin(time * 3) * 0.3 + 0.7;
        ctx.strokeStyle = `rgba(255,209,102,${pulse * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 35 + Math.sin(time * 2) * 5, 0, Math.PI * 2);
        ctx.stroke();

        // Inner marker
        ctx.fillStyle = `rgba(255,209,102,${pulse * 0.15})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 30, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        ctx.fillStyle = '#ffd166';
        ctx.font = '18px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', s.x, s.y + 6);

        // Progress bar
        if (obj.progress > 0) {
            const barW = 60;
            const barH = 6;
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

        // Direction arrow if off-screen
        if (s.x < 50 || s.x > canvas.width - 50 || s.y < 50 || s.y > canvas.height - 50) {
            const me = gameState.players.find(p => p.id === myId);
            if (me) {
                const angle = Math.atan2(obj.y - me.y, obj.x - me.x);
                const arrowX = canvas.width / 2 + Math.cos(angle) * Math.min(canvas.width, canvas.height) * 0.35;
                const arrowY = canvas.height / 2 + Math.sin(angle) * Math.min(canvas.width, canvas.height) * 0.35;
                ctx.save();
                ctx.translate(arrowX, arrowY);
                ctx.rotate(angle);
                ctx.fillStyle = '#ffd166';
                ctx.beginPath();
                ctx.moveTo(15, 0);
                ctx.lineTo(-8, -8);
                ctx.lineTo(-8, 8);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
    }

    function drawPlayers(dt) {
        if (!gameState) return;

        for (const p of gameState.players) {
            const pMap = p.currentMap || 'ship';
            if (pMap !== myCurrentMap) continue;

            const s = worldToScreen(p.x, p.y);
            const color = ROLE_COLORS[p.role] || '#fff';
            const isMe = p.id === myId;

            if (!p.alive) {
                // Play death animation for any role
                const anim = getAnimState(p.id);
                const dir = anim.lastDir || 'south';
                const role = p.role || 'vanguard';
                const frames = roleSprites[role]?.death?.[dir];
                if (frames && frames.length > 0) {
                    if (!anim.deathDone) {
                        anim.deathTimer += 0.016; // ~60fps
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
                    // Fallback ghost circle
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = '#666';
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }

                // Respawn timer
                if (p.respawnTimer > 0) {
                    ctx.fillStyle = '#fff';
                    ctx.font = '12px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.respawnTimer.toFixed(1) + 's', s.x, s.y + 4);
                }
                continue;
            }

            // Ability active glow
            if (p.abilityActive) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 20;
            }

            // Draw character sprite for all roles
            drawVanguardSprite(p, s, isMe, dt);

            ctx.shadowBlur = 0;

            // Direction indicator
            const angle = Math.atan2(
                (mouseY + camY - canvas.height / 2) - p.y,
                (mouseX + camX - canvas.width / 2) - p.x
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
            const barW = 36;
            const barH = 4;
            const barX = s.x - barW / 2;
            const barY = s.y - 24;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = hpPct > 0.6 ? '#06d6a0' : hpPct > 0.3 ? '#ffd166' : '#e63946';
            ctx.fillRect(barX, barY, barW * hpPct, barH);

            // Heal beam (medic)
            if (p.role === 'medic' && !mouseDown) {
                // Find nearest wounded ally
                let nearestAlly = null;
                let nearestDist = 200;
                for (const op of gameState.players) {
                    if (op.id === p.id || !op.alive || op.hp >= op.maxHp) continue;
                    const d = Math.sqrt((p.x - op.x) ** 2 + (p.y - op.y) ** 2);
                    if (d < nearestDist) { nearestDist = d; nearestAlly = op; }
                }
                if (nearestAlly && isMe) {
                    const as = worldToScreen(nearestAlly.x, nearestAlly.y);
                    ctx.strokeStyle = `rgba(239,71,111,${0.3 + Math.sin(performance.now() / 200) * 0.2})`;
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
        const anim = getAnimState(p.id);

        // Determine facing direction from mouse (if local) or movement
        let facingAngle;
        if (isMe) {
            if (mouseMoved) {
                facingAngle = Math.atan2(
                    (mouseY + camY - canvas.height / 2) - p.y,
                    (mouseX + camX - canvas.width / 2) - p.x
                );
            } else {
                const dxDelta = p.x - (anim.prevX || p.x);
                const dyDelta = p.y - (anim.prevY || p.y);
                if (Math.abs(dxDelta) > 0.1 || Math.abs(dyDelta) > 0.1) {
                    facingAngle = Math.atan2(dyDelta, dxDelta);
                } else {
                    facingAngle = anim.lastAngle || 0; // Default right if completely idle initially
                }
            }
        } else {
            // Remote player: detect from position changes with grace period
            const dx = p.x - (anim.prevX || p.x);
            const dy = p.y - (anim.prevY || p.y);
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                facingAngle = Math.atan2(dy, dx);
            } else {
                // If standing still, we don't have mouse pos for remote players
                // But we can keep their last known angle
                facingAngle = anim.lastAngle || 0;
            }
        }
        anim.lastAngle = facingAngle;
        const dir = angleToDir(facingAngle);
        anim.lastDir = dir;

        // Check if moving — use input keys for local, position delta for remote
        const dxDelta = p.x - (anim.prevX || p.x);
        const dyDelta = p.y - (anim.prevY || p.y);
        let isMoving;
        if (isMe) {
            // Local player: check if any movement key is held
            isMoving = keys.w || keys.a || keys.s || keys.d;
        } else {
            if (Math.abs(dxDelta) > 0.1 || Math.abs(dyDelta) > 0.1) {
                anim.moveGrace = 0.15; // keep walking for 150ms after last move
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

        // Reset death anim if alive
        anim.deathFrame = 0;
        anim.deathTimer = 0;
        anim.deathDone = false;

        const role = p.role || 'vanguard';
        const sprites = roleSprites[role] || roleSprites.vanguard;

        let sprite;
        if (isMoving && sprites.walk[dir]) {
            // Animate walk at 10fps
            anim.walkTimer += dt;
            if (anim.walkTimer >= 0.1) {
                anim.walkTimer = 0;
                anim.walkFrame = (anim.walkFrame + 1) % 6;
            }
            sprite = sprites.walk[dir][anim.walkFrame];
        } else {
            // Idle
            anim.walkFrame = 0;
            anim.walkTimer = 0;
            sprite = sprites.idle[dir];
        }

        // Draw the character sprite
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
            const sw = sprite.naturalWidth * SPRITE_SCALE;
            const sh = sprite.naturalHeight * SPRITE_SCALE;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, s.x - sw / 2, s.y - sh / 2, sw, sh);
            ctx.imageSmoothingEnabled = true;
        } else {
            // Fallback hexagon while loading
            ctx.fillStyle = '#4cc9f0';
            ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = isMe ? 2.5 : 1;
            drawHexagon(s.x, s.y, 18);
        }

        // Draw weapon sprite based on role
        let weaponSprite = null;
        let weaponScale = 2;
        let weaponOffsetDist = 20;
        let showSwing = false;
        if (p.role === 'vanguard') {
            weaponSprite = roleSprites.vanguard.sword[dir];
            weaponScale = 1.2;
            showSwing = true;
        } else if (p.role === 'engineer') {
            // Track spear throw: hide held spear for 1.5s after attacking
            if (mouseDown && isMe) {
                anim.spearThrown = 1.5; // seconds until spear reappears
            }
            if (anim.spearThrown > 0) {
                anim.spearThrown -= dt;
                weaponSprite = null; // hide held spear while thrown
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
            // Determine facing side
            const facingRight = Math.cos(facingAngle) >= 0;

            // All weapons stay at right hand: horizontal offset only
            const wOffsetX = facingRight ? weaponOffsetDist : -weaponOffsetDist;
            const wOffsetY = 0;

            const wW = weaponSprite.naturalWidth * weaponScale;
            const wH = weaponSprite.naturalHeight * weaponScale;

            if (p.role === 'scout') {
                // Gun rotates around its grip (bottom) following the cursor
                ctx.save();
                ctx.translate(s.x + wOffsetX, s.y + wOffsetY);
                if (!facingRight) ctx.scale(-1, 1);
                // Rotate by the angle relative to horizontal
                const localAngle = facingRight ? facingAngle : (Math.PI - facingAngle);
                ctx.rotate(localAngle);
                ctx.imageSmoothingEnabled = false;
                // Draw with pivot at bottom-center (grip): offset so bottom is at origin
                ctx.drawImage(weaponSprite, 0, -wH / 2, wW, wH);
                ctx.imageSmoothingEnabled = true;
                ctx.restore();
            } else {
                // Tilt angle
                const tiltAngle = facingRight ? (30 * Math.PI / 180) : (-30 * Math.PI / 180);

                // Swing animation on click (melee weapons only)
                if (!anim.swingTimer) anim.swingTimer = 0;
                if (mouseDown && isMe && showSwing) {
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

            // On click, show damage radius indicator for melee
            if (mouseDown && isMe && showSwing) {
                const hitX = s.x + Math.cos(facingAngle) * 35;
                const hitY = s.y + Math.sin(facingAngle) * 35;
                ctx.strokeStyle = `rgba(76,201,240,${0.3 + anim.swingTimer * 0.3})`;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(hitX, hitY, 40, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);

                // Slash arc effect
                ctx.strokeStyle = `rgba(76,201,240,${0.5 * anim.swingTimer})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(s.x, s.y, 38, facingAngle - 0.5, facingAngle + 0.5);
                ctx.stroke();
            }
        }
    }

    function drawHexagon(x, y, r) {
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

    function drawSquare(x, y, r) {
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        // Gear icon
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚙', x, y + 5);
    }

    function drawDiamond(x, y, r) {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.7, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.7, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function drawCross(x, y, r) {
        const w = r * 0.4;
        ctx.beginPath();
        ctx.moveTo(x - w, y - r);
        ctx.lineTo(x + w, y - r);
        ctx.lineTo(x + w, y - w);
        ctx.lineTo(x + r, y - w);
        ctx.lineTo(x + r, y + w);
        ctx.lineTo(x + w, y + w);
        ctx.lineTo(x + w, y + r);
        ctx.lineTo(x - w, y + r);
        ctx.lineTo(x - w, y + w);
        ctx.lineTo(x - r, y + w);
        ctx.lineTo(x - r, y - w);
        ctx.lineTo(x - w, y - w);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function drawEnemies() {
        if (!gameState || myCurrentMap !== 'ship') return;
        for (const e of gameState.enemies) {
            const s = worldToScreen(e.x, e.y);
            const isElite = e.type === 'elite';
            const r = isElite ? 22 : 16;

            // Get animation state for this enemy
            const anim = getEnemyAnim(e.id);

            // Determine if moving
            const dx = e.x - (anim.prevX || e.x);
            const dy = e.y - (anim.prevY || e.y);
            const isMoving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
            anim.prevX = e.x;
            anim.prevY = e.y;

            // Flip based on movement direction
            const flipX = dx < -0.1;

            // Advance animation timer
            anim.timer += 0.016; // ~60fps
            if (anim.timer >= 0.1) {
                anim.timer = 0;
                anim.frame++;
            }

            // Select frames
            let frames, frameIdx;
            if (isMoving) {
                frames = dogSprites.walk;
                frameIdx = anim.frame % frames.length;
            } else {
                frames = dogSprites.idle;
                frameIdx = anim.frame % frames.length;
            }

            const sprite = frames[frameIdx];
            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                const dogScale = isElite ? 1.0 : 0.7;
                const dW = sprite.naturalWidth * dogScale;
                const dH = sprite.naturalHeight * dogScale;
                ctx.save();
                ctx.translate(s.x, s.y);
                if (flipX) ctx.scale(-1, 1);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite, -dW / 2, -dH / 2, dW, dH);
                ctx.imageSmoothingEnabled = true;
                if (isElite) {
                    // Red glow for elites
                    ctx.shadowColor = '#ff6b6b';
                    ctx.shadowBlur = 15;
                    ctx.strokeStyle = 'rgba(255,100,100,0.4)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-dW / 2, -dH / 2, dW, dH);
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
            } else {
                // Fallback triangle
                ctx.fillStyle = isElite ? '#ff6b6b' : '#e63946';
                ctx.beginPath();
                ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // HP bar
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

    function drawBoss() {
        if (myCurrentMap !== 'ship') return;
        const boss = gameState.boss;
        const s = worldToScreen(boss.x, boss.y);
        const time = performance.now() / 1000;

        // Aura
        const auraSize = 55 + Math.sin(time * 2) * 8;
        ctx.fillStyle = boss.aggroPhase
            ? `rgba(230,57,70,${0.08 + Math.sin(time * 4) * 0.04})`
            : `rgba(123,44,191,${0.06 + Math.sin(time * 2) * 0.03})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, auraSize, 0, Math.PI * 2);
        ctx.fill();

        // Body - rotating hexagon
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(time * 0.5);

        ctx.fillStyle = boss.aggroPhase ? '#9b2c3f' : '#7b2cbf';
        ctx.strokeStyle = boss.aggroPhase ? '#e63946' : '#a855f7';
        ctx.lineWidth = 3;
        ctx.shadowColor = boss.aggroPhase ? '#e63946' : '#7b2cbf';
        ctx.shadowBlur = 15;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = 45 * Math.cos(angle);
            const py = 45 * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(40 * Math.cos(angle), 40 * Math.sin(angle));
            ctx.stroke();
        }

        ctx.restore();
        ctx.shadowBlur = 0;

        // Weakpoint indicator
        if (gameState.weakpointActive) {
            ctx.strokeStyle = `rgba(6,214,160,${0.5 + Math.sin(time * 6) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(s.x, s.y, 55, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Boss HP bar (top of screen)
        const barW = Math.min(400, canvas.width * 0.5);
        const barH = 16;
        const barX = canvas.width / 2 - barW / 2;
        const barY = 20;
        const hpPct = boss.hp / boss.maxHp;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = boss.aggroPhase ? '#e63946' : '#7b2cbf';
        ctx.fillRect(barX, barY, barW * hpPct, barH);

        // Phase markers at 25%
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const mx = barX + barW * (i / 4);
            ctx.beginPath();
            ctx.moveTo(mx, barY);
            ctx.lineTo(mx, barY + barH);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#fff';
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`ALIEN GUARDIAN — ${Math.round(boss.hp)} / ${boss.maxHp}`, canvas.width / 2, barY + barH + 16);
    }

    function drawProjectiles() {
        if (!gameState || myCurrentMap !== 'ship') return;
        for (const p of gameState.projectiles) {
            const s = worldToScreen(p.x, p.y);
            const angle = Math.atan2(p.vy || 0, p.vx || 0);

            if (p.isPlayerProj && p.ownerRole === 'engineer' && spearImg && spearImg.complete && spearImg.naturalWidth > 0) {
                // Engineer: thrown spear projectile
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
                // Other player projectiles: bullet sprite
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
                // Enemy projectiles — red glow circle
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
        if (!gameState || !gameState.turrets || myCurrentMap !== 'ship') return;
        for (const t of gameState.turrets) {
            const s = worldToScreen(t.x, t.y);
            ctx.fillStyle = '#f4a261';
            ctx.strokeStyle = '#ffd166';
            ctx.lineWidth = 2;
            // Base
            ctx.fillRect(s.x - 10, s.y - 10, 20, 20);
            ctx.strokeRect(s.x - 10, s.y - 10, 20, 20);
            // Barrel
            ctx.fillStyle = '#c47a30';
            ctx.fillRect(s.x - 2, s.y - 16, 4, 8);
            // Range indicator
            ctx.strokeStyle = 'rgba(244,162,97,0.1)';
            ctx.beginPath();
            ctx.arc(s.x, s.y, 200, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            const s = worldToScreen(p.x, p.y);
            ctx.fillRect(s.x - p.size / 2, s.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }

    function drawFloatTexts() {
        for (const t of floatTexts) {
            ctx.globalAlpha = t.life;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 14px Rajdhani';
            ctx.textAlign = 'center';
            const s = worldToScreen(t.x, t.y);
            ctx.fillText(t.text, s.x, s.y);
        }
        ctx.globalAlpha = 1;
    }

    // ── MAP INTEGRATION: square minimap for 1024x1024 world ──
    function drawMinimap() {
        const mmW = 140;
        const mmH = 140;
        const mmX = canvas.width - mmW - 16;
        const mmY = 16;
        const scale = mmW / WORLD_W;

        // Background — draw scaled map image or fallback
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(mmX, mmY, mmW, mmH);
        if (mapBgImage.complete && mapBgImage.naturalWidth > 0) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(mapBgImage, mmX, mmY, mmW, mmH);
            ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = 'rgba(76,201,240,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX, mmY, mmW, mmH);

        const me = gameState.players.find(p => p.id === myId);
        const isScout = me?.role === 'scout';

        // Enemies (Scout sees all, others see nearby)
        if (myCurrentMap === 'ship') {
            for (const e of gameState.enemies) {
                if (!isScout && me) {
                    const d = Math.sqrt((me.x - e.x) ** 2 + (me.y - e.y) ** 2);
                    if (d > 400) continue;
                }
                ctx.fillStyle = e.type === 'elite' ? '#ff6b6b' : '#e63946';
                ctx.fillRect(mmX + e.x * scale - 1, mmY + e.y * scale - 1, 2, 2);
            }

            // Boss
            if (gameState.boss) {
                ctx.fillStyle = '#7b2cbf';
                ctx.fillRect(mmX + gameState.boss.x * scale - 3, mmY + gameState.boss.y * scale - 3, 6, 6);
            }

            // Objective
            if (gameState.objective) {
                ctx.fillStyle = '#ffd166';
                ctx.fillRect(mmX + gameState.objective.x * scale - 2, mmY + gameState.objective.y * scale - 2, 4, 4);
            }
        }

        // Players (only show on current map)
        for (const p of gameState.players) {
            if (!p.alive) continue;
            const pMap = p.currentMap || 'ship';
            if (pMap !== myCurrentMap) continue;

            ctx.fillStyle = ROLE_COLORS[p.role] || '#fff';
            ctx.fillRect(mmX + p.x * scale - 2, mmY + p.y * scale - 2, 4, 4);
        }

        // Camera viewport
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.strokeRect(
            mmX + (camX - canvas.width / 2) * scale,
            mmY + (camY - canvas.height / 2) * scale,
            canvas.width * scale,
            canvas.height * scale
        );

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '8px Orbitron';
        ctx.textAlign = 'right';
        ctx.fillText(isScout ? 'FULL SCAN' : 'LOCAL SCAN', mmX + mmW - 4, mmY + mmH + 10);
    }

    function drawScoreboard() {
        if (!gameState) return;
        const w = 420;
        const h = 30 + gameState.players.length * 36;
        const x = canvas.width / 2 - w / 2;
        const y = canvas.height / 2 - h / 2;

        ctx.fillStyle = 'rgba(5,5,16,0.92)';
        ctx.strokeStyle = 'rgba(76,201,240,0.2)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#4cc9f0';
        ctx.font = '12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('SQUAD STATUS', x + w / 2, y + 20);

        gameState.players.forEach((p, i) => {
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

            // HP bar
            const barW = 100;
            const hpPct = p.hp / p.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(x + w - barW - 12, py + 4, barW, 8);
            ctx.fillStyle = hpPct > 0.6 ? '#06d6a0' : hpPct > 0.3 ? '#ffd166' : '#e63946';
            ctx.fillRect(x + w - barW - 12, py + 4, barW * hpPct, 8);
        });
    }

    function updateHUD() {
        if (!gameState) return;
        const me = gameState.players.find(p => p.id === myId);

        // Timer
        const mins = Math.floor(gameState.timer / 60);
        const secs = Math.floor(gameState.timer % 60);
        timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        timerDisplay.classList.toggle('critical', gameState.timer < 60);

        // Objective
        if (gameState.objective) {
            const progressBar = gameState.objective.progress > 0
                ? ` [${Math.floor(gameState.objective.progress * 100)}%]`
                : '';
            objectiveDisplay.textContent = `⚡ ${gameState.objective.desc}${progressBar} — Press E to interact`;
        } else if (gameState.phase === 'intro') {
            objectiveDisplay.textContent = `☢ OXYGEN CRITICAL — Prepare for hostile contact`;
        } else if (gameState.phase === 'boss') {
            objectiveDisplay.textContent = `⚠ DEFEAT THE ALIEN GUARDIAN`;
        } else if (gameState.phase === 'cinematic') {
            objectiveDisplay.textContent = '';
        } else {
            objectiveDisplay.textContent = '';
        }

        // Player HUD
        if (me) {
            const hpPct = Math.max(0, me.hp / me.maxHp);
            hudHpBar.style.width = (hpPct * 100) + '%';
            hudHpBar.className = 'hud-hp-bar' + (hpPct < 0.3 ? ' low' : hpPct < 0.6 ? ' mid' : '');
            hudHpText.textContent = `${Math.round(me.hp)} / ${me.maxHp}`;

            // Ability
            const cdReady = me.abilityCd <= 0;
            hudAbility.classList.toggle('ready', cdReady);
            if (!cdReady) {
                const cdPct = Math.max(0, 1 - me.abilityCd / 30);
                hudAbilityCd.style.height = (cdPct * 100) + '%';
            } else {
                hudAbilityCd.style.height = '100%';
            }
        }
    }

    // ======================== CINEMATIC ========================
    function renderCinematic(dt) {
        cinematicTimer += dt;
        ctx.fillStyle = '#020208';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (cinematicTimer < 3) {
            // Phase 1: Starfield + ship departing
            const progress = cinematicTimer / 3;
            const starSpeed = 200 + progress * 300;

            for (const star of stars) {
                star.x -= star.speed * dt * (1 + progress * 2);
                if (star.x < 0) { star.x = canvas.width + Math.random() * 100; star.y = Math.random() * canvas.height; }
                ctx.fillStyle = `rgba(255,255,255,${0.3 + star.size * 0.2})`;
                ctx.fillRect(star.x, star.y, star.size + progress * 3, star.size);
            }

            // Ship
            const shipX = canvas.width * 0.3 + progress * canvas.width * 0.3;
            const shipY = canvas.height * 0.5;
            drawShipIcon(shipX, shipY, 1.5);

            // Earth (fading away)
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = '#1a7aff';
            ctx.beginPath();
            ctx.arc(canvas.width * 0.15, canvas.height * 0.5, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2dcc6f';
            ctx.beginPath();
            ctx.arc(canvas.width * 0.15 - 10, canvas.height * 0.5 - 5, 20, 0.3, 1.5);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Text
            ctx.fillStyle = '#4cc9f0';
            ctx.font = 'bold 14px Rajdhani';
            ctx.textAlign = 'center';
            ctx.globalAlpha = Math.min(1, cinematicTimer);
            ctx.fillText('DEPARTING EARTH — MISSION PROMPT&PLAY', canvas.width / 2, canvas.height * 0.85);
            ctx.globalAlpha = 1;

        } else if (cinematicTimer < 5) {
            // Phase 2: Approaching planet + crash
            const progress = (cinematicTimer - 3) / 2;

            for (const star of stars) {
                star.x -= star.speed * dt * 3;
                if (star.x < 0) { star.x = canvas.width; star.y = Math.random() * canvas.height; }
                ctx.fillStyle = `rgba(255,255,255,${star.size * 0.3})`;
                ctx.fillRect(star.x, star.y, star.size * 3, star.size);
            }

            // Alien planet
            const planetSize = 60 + progress * 200;
            ctx.fillStyle = '#2a1a4a';
            ctx.beginPath();
            ctx.arc(canvas.width * 0.7, canvas.height * 0.5, planetSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#4a2a8a';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Ship approaching
            const shipX = canvas.width * 0.6 - progress * canvas.width * 0.15;
            const shipY = canvas.height * 0.5 + Math.sin(cinematicTimer * 5) * (5 + progress * 20);
            drawShipIcon(shipX, shipY, 1.2);

            // Screen shake ramp up
            if (progress > 0.5) {
                const shakeAmt = (progress - 0.5) * 20;
                ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
            }

            ctx.fillStyle = '#e63946';
            ctx.font = '16px Orbitron';
            ctx.textAlign = 'center';
            ctx.globalAlpha = progress;
            ctx.fillText('⚠ COLLISION IMMINENT', canvas.width / 2, canvas.height * 0.85);
            ctx.globalAlpha = 1;

        } else if (cinematicTimer < 6) {
            // Phase 3: Crash impact + fade
            const progress = (cinematicTimer - 5);
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Flash
            if (progress < 0.3) {
                ctx.fillStyle = `rgba(255,200,100,${1 - progress / 0.3})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Fade to game
            ctx.fillStyle = `rgba(0,0,0,${progress})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#4cc9f0';
            ctx.font = '20px Orbitron';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 1 - progress;
            ctx.fillText('CRASH LANDING DETECTED', canvas.width / 2, canvas.height / 2);
            ctx.globalAlpha = 1;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Cinematic bars
        const barHeight = canvas.height * 0.12;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, barHeight);
        ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
    }

    function drawShipIcon(x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // Ship body
        ctx.fillStyle = '#8899aa';
        ctx.strokeStyle = '#aabbcc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 0);           // nose
        ctx.lineTo(10, -12);
        ctx.lineTo(-20, -15);
        ctx.lineTo(-25, -8);
        ctx.lineTo(-25, 8);
        ctx.lineTo(-20, 15);
        ctx.lineTo(10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Engine glow
        ctx.fillStyle = '#4cc9f0';
        ctx.shadowColor = '#4cc9f0';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.ellipse(-28, 0, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Window
        ctx.fillStyle = '#4cc9f0';
        ctx.beginPath();
        ctx.arc(15, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ======================== MAIN LOOP ========================
    let lastTime = performance.now();

    function gameLoop(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        updateParticles(dt);

        if (announcementTimer > 0) {
            announcementTimer -= dt;
        }

        render(dt);

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
})();