// ======================== VOICE CHAT (WebRTC) ========================
import { S } from './state.js';
import { RTC_CONFIG } from './constants.js';
import { showError } from './ui.js';

export async function toggleSpeaker(forceState) {
    if (forceState !== undefined) S.speakerEnabled = forceState;
    else S.speakerEnabled = !S.speakerEnabled;

    const btn = document.getElementById('speakerBtn');
    if (!btn) return;

    if (S.speakerEnabled) {
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
                        S.selectedAudioDeviceId = speakerSelect.value;
                        document.querySelectorAll('audio').forEach(el => {
                            if (typeof el.setSinkId === 'function') {
                                el.setSinkId(S.selectedAudioDeviceId).catch(e => console.warn("Sink update failed:", e));
                            }
                        });
                    };
                    S.selectedAudioDeviceId = speakerSelect.value;
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
        S.selectedAudioDeviceId = null;
    }
}

export async function toggleMic() {
    const btn = document.getElementById('micBtn');
    if (S.localStream) {
        S.localStream.getTracks().forEach(t => t.stop());
        S.localStream = null;

        Object.values(S.peerConnections).forEach(pc => {
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
        S.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        btn.textContent = 'MIC ON (LIVE)';
        btn.style.background = 'rgba(6, 214, 160, 0.2)';
        btn.style.borderColor = 'rgba(6, 214, 160, 0.5)';
        btn.style.color = '#06d6a0';

        Object.keys(S.peerConnections).forEach(pidStr => {
            const pid = parseInt(pidStr);
            const pc = S.peerConnections[pid];
            const hasTrack = pc.getSenders().some(s => s.track && s.track.kind === 'audio');
            if (!hasTrack && pc.signalingState !== 'closed') {
                S.localStream.getTracks().forEach(t => pc.addTrack(t, S.localStream));
            }
        });

        if (S.activePlayerIds.length > 0) {
            connectToPeers(S.activePlayerIds);
        }

        if (S.speakerEnabled) {
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

export function getPeerConnection(peerId) {
    if (S.peerConnections[peerId]) return S.peerConnections[peerId];
    const pc = new RTCPeerConnection(RTC_CONFIG);
    S.peerConnections[peerId] = pc;
    S.pcStates[peerId] = { makingOffer: false };

    if (S.localStream) {
        S.localStream.getTracks().forEach(t => pc.addTrack(t, S.localStream));
    }

    pc.onnegotiationneeded = async () => {
        try {
            S.pcStates[peerId].makingOffer = true;
            await pc.setLocalDescription();
            if (S.ws && S.ws.readyState === 1) {
                S.ws.send(JSON.stringify({ type: 'webrtc_signal', targetId: peerId, signalData: { offer: pc.localDescription } }));
            }
        } catch (err) {
            console.warn("Negotiation error:", err);
        } finally {
            S.pcStates[peerId].makingOffer = false;
        }
    };

    pc.onicecandidate = (e) => {
        if (e.candidate && S.ws && S.ws.readyState === 1) {
            S.ws.send(JSON.stringify({ type: 'webrtc_signal', targetId: peerId, signalData: { candidate: e.candidate } }));
        }
    };

    pc.ontrack = async (e) => {
        let audioEl = document.getElementById('audio_' + peerId);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = 'audio_' + peerId;
            audioEl.autoplay = true;
            audioEl.muted = !S.speakerEnabled;

            if (S.selectedAudioDeviceId && typeof audioEl.setSinkId === 'function') {
                try {
                    await audioEl.setSinkId(S.selectedAudioDeviceId);
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

export function connectToPeers(playerIds) {
    for (const pid of playerIds) {
        if (pid !== S.myId && !S.peerConnections[pid]) {
            const pc = getPeerConnection(pid);
            if (S.myId < pid) {
                pc.createDataChannel('gameData');
            }
        }
    }
}

export async function handleWebRTCSignal(msg) {
    const senderId = msg.senderId;
    const data = msg.signalData;
    const pc = getPeerConnection(senderId);
    const state = S.pcStates[senderId];

    const polite = S.myId > senderId;

    try {
        if (data.offer) {
            const offerCollision = (state.makingOffer || pc.signalingState !== "stable");
            if (offerCollision) {
                if (!polite) return;
                await Promise.all([
                    pc.setLocalDescription({ type: "rollback" }),
                    pc.setRemoteDescription(new RTCSessionDescription(data.offer))
                ]);
            } else {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            S.ws.send(JSON.stringify({ type: 'webrtc_signal', targetId: senderId, signalData: { answer: pc.localDescription } }));
        } else if (data.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (e) {
        console.warn("WebRTC error handling signal from", senderId, e);
    }
}
