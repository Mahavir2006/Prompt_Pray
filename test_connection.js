// Simple test to verify WebSocket connection works
const WebSocket = require('ws');

console.log('Testing WebSocket connection to ws://localhost:3000...');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    
    // Send create room message
    const msg = { type: 'createRoom', name: 'TestPlayer' };
    console.log('Sending:', msg);
    ws.send(JSON.stringify(msg));
});

ws.on('message', (data) => {
    console.log('Server response:', data.toString());
    ws.close();
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.code, err.message, err.errno);
    process.exit(1);
});

ws.on('close', () => {
    console.log('Connection closed');
});

setTimeout(() => {
    console.error('❌ Timeout - no response from server');
    process.exit(1);
}, 3000);
