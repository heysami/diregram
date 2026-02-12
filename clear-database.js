// Script to clear the Yjs database
// Run this with: node clear-database.js

const WebSocket = require('ws');

const WS_URL = process.env.NEXT_PUBLIC_COLLAB_SERVER_URL || 'ws://localhost:1234';
const ROOM_NAME = 'nexus-demo';

// Connect to the collaboration server and clear the document
const ws = new WebSocket(`${WS_URL}/document/${ROOM_NAME}`);

ws.on('open', () => {
  console.log('Connected to collaboration server');
  
  // Send a message to clear the document
  // This depends on the Hocuspocus server API
  // For now, we'll send a delete message
  ws.send(JSON.stringify({
    type: 'delete',
    document: ROOM_NAME
  }));
  
  console.log('Sent clear request');
  
  setTimeout(() => {
    ws.close();
    console.log('Connection closed');
    process.exit(0);
  }, 1000);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
  process.exit(1);
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});
