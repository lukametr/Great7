const express = require('express');
const path = require('path');
const api = require('./api.cjs');
const { deleteRoomFromArray } = require('./api.cjs');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 8000;
const rooms = require('./rooms.cjs');
const wsRooms = {};

app.use('/api', api);
app.use(express.static(path.join(__dirname, '../../public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Add a callback for room deletion
let onRoomDeleted = (roomId) => {};
function setOnRoomDeleted(cb) { onRoomDeleted = cb; }

setOnRoomDeleted(deleteRoomFromArray);

// Utility: get userId from query or token (for demo, use random or IP)
function getUserId(req) {
  // For demo: use remoteAddress + random (in real app, use JWT or session)
  return (req.headers['sec-websocket-key'] || '') + '-' + Math.random().toString(36).slice(2);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');
  if (!roomId) { ws.close(); return; }

  // If no clients are left in the room, always re-initialize the room state
  if (!wsRooms[roomId] || !wsRooms[roomId].clients || wsRooms[roomId].clients.size === 0) {
    let playerCount = 2;
    const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
    if (roomMeta && roomMeta.players) playerCount = parseInt(roomMeta.players, 10);
    console.log('ROOM INIT:', { roomId, playerCount, roomMeta, rooms });
    // Color constants
    const STONE_COLORS = {
      green:   '#2ecc40',
      orange:  '#ff9800',
      navy:    '#3a3a7a',
      blue:    '#3498db',
      yellow:  '#f1c40f',
      red:     '#e74c3c',
    };
    // All stones
    const stones = [
      ...[3,5,6,9,14,15,16].map((pos,i)=>({id:`g${i+1}`, color:STONE_COLORS.green, pos})),
      ...[11,12,24,35,45,33,44].map((pos,i)=>({id:`o${i+1}`, color:STONE_COLORS.orange, pos})),
      ...[18,19,29,41,52,43,53].map((pos,i)=>({id:`n${i+1}`, color:STONE_COLORS.navy, pos})),
      ...[63,64,73,75,87,97,98].map((pos,i)=>({id:`b${i+1}`, color:STONE_COLORS.blue, pos})),
      ...[71,72,81,83,92,104,105].map((pos,i)=>({id:`y${i+1}`, color:STONE_COLORS.yellow, pos})),
      ...[100,101,102,107,110,111,113].map((pos,i)=>({id:`r${i+1}`, color:STONE_COLORS.red, pos})),
    ];
    // Colors to hide by player count (same as frontend)
    const colorHideMap = {
      6: [],
      5: [STONE_COLORS.yellow],
      4: [STONE_COLORS.yellow, STONE_COLORS.orange],
      3: [STONE_COLORS.yellow, STONE_COLORS.orange, STONE_COLORS.blue],
      2: [STONE_COLORS.yellow, STONE_COLORS.orange, STONE_COLORS.blue, STONE_COLORS.navy],
    };
    const hiddenColors = colorHideMap[playerCount] || [];
    const filteredStones = stones.filter(stone => !hiddenColors.includes(stone.color));
    // Build initial holeState
    const holeState = {};
    for (let i = 1; i <= 115; ++i) holeState[i] = null;
    filteredStones.forEach(stone => { holeState[stone.pos] = stone.id; });
    wsRooms[roomId] = {
      state: {
        stonesState: filteredStones,
        holeState: holeState
      },
      clients: new Set(),
      players: {},
      turnIndex: 0,
      activeColors: []
    };
    // --- ოთახი დაამატე rooms მასივში, თუ ჯერ არ არსებობს ---
    if (!rooms.find(r => r.id.toString() === roomId.toString())) {
      rooms.push({ id: roomId, name: `Room ${roomId}`, players: playerCount });
    }
    console.log('ROOM CREATED', roomId, 'players:', playerCount, 'stones:', filteredStones.length);
  }
  wsRooms[roomId].clients.add(ws);
  // Identify user
  const userId = getUserId(req);
  ws._userId = userId;
  ws.send(JSON.stringify({ type: 'user-id', userId }));

  // --- ავტომატური ფერის მინიჭება ---
  const colorOrder = [
    '#e74c3c', // red
    '#2ecc40', // green
    '#3498db', // blue
    '#3a3a7a', // navy
    '#ff9800', // orange
    '#f1c40f'  // yellow
  ];
  if (!wsRooms[roomId].players[userId]) {
    // Assign color strictly by join order and colorOrder
    const assignedColor = colorOrder[Object.keys(wsRooms[roomId].players).length];
    wsRooms[roomId].players[userId] = assignedColor;
    console.log('SERVER COLOR ASSIGN:', { userId, assignedColor, players: wsRooms[roomId].players });
  }
  // Notify ALL clients about current color assignments
  wsRooms[roomId].clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players }));
    }
  });
  // თუ ყველა მოთამაშე შემოვიდა, გაუგზავნე ყველას whose-turn (პირველი სვლა წითელია)
  const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
  let requiredPlayers = 2;
  if (roomMeta && roomMeta.players) requiredPlayers = parseInt(roomMeta.players, 10);
  if (Object.keys(wsRooms[roomId].players).length === requiredPlayers) {
    // Use the same colorOrder for activeColors
    wsRooms[roomId].activeColors = colorOrder.slice(0, requiredPlayers);
    wsRooms[roomId].turnIndex = 0;
    wsRooms[roomId].clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'whose-turn', color: wsRooms[roomId].activeColors[0] }));
      }
    });
  }

  if (wsRooms[roomId].state) ws.send(JSON.stringify({ type: 'sync', state: wsRooms[roomId].state }));

  // --- Add player name support ---
  // Store userId->name mapping in wsRooms[roomId].names
  // On color-update, send {players, names} where names is userId->name
  if (!wsRooms[roomId].names) wsRooms[roomId].names = {};

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    if (data.type === 'join' && typeof data.name === 'string') {
      console.log('[NAME SYNC] Player joined:', { userId: ws._userId, name: data.name });
      wsRooms[roomId].names[ws._userId] = data.name;
      console.log('[NAME SYNC] Current names mapping:', JSON.stringify(wsRooms[roomId].names));
      // Notify all clients about current color assignments and names
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          console.log('[NAME SYNC] Sending color-update with names:', JSON.stringify(wsRooms[roomId].names));
          client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names }));
        }
      });
      return;
    }
    if (data.type === 'move') {
      // --- ახალი ლოგიკა: სვლა მხოლოდ მაშინ, როცა ყველა მოთამაშე ოთახშია ---
      const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
      let requiredPlayers = 2;
      if (roomMeta && roomMeta.players) requiredPlayers = parseInt(roomMeta.players, 10);
      const currentPlayers = Object.keys(wsRooms[roomId].players).length;
      if (currentPlayers < requiredPlayers) {
        ws.send(JSON.stringify({ type: 'move-error', message: 'Not all players have joined the room yet.' }));
        return;
      }
      // --- სვლის რიგის შემოწმება ---
      const activeColors = wsRooms[roomId].activeColors && wsRooms[roomId].activeColors.length ? wsRooms[roomId].activeColors : colorOrder.slice(0, requiredPlayers);
      const turnColor = activeColors[wsRooms[roomId].turnIndex % activeColors.length];
      // მოძებნე ამ ws-ის assignedColor
      const userId = ws._userId;
      const userColor = wsRooms[roomId].players[userId];
      if (userColor !== turnColor) {
        ws.send(JSON.stringify({ type: 'move-error', message: 'Not your turn.' }));
        return;
      }
      // --- ახალი წესი: მხოლოდ ერთი ქვით შეიძლება სვლა ---
      if (wsRooms[roomId].turnMoveUserId && wsRooms[roomId].turnMoveUserId !== userId) {
        ws.send(JSON.stringify({ type: 'move-error', message: 'You already moved this turn.' }));
        return;
      }
      if (!wsRooms[roomId].turnMoveUserId) {
        wsRooms[roomId].turnMoveUserId = userId;
      }
      // --- ახალი ლოგიკა: გადახტომის შემთხვევაში თუ კიდევ არის შესაძლებელი გადახტომა იგივე ქვით, სვლა არ სრულდება სანამ finish-turn არ მოვა ---
      // data.moveType: 'jump' ან 'normal' უნდა იყოს ფრონტენდიდან
      if (data.moveType === 'jump' && data.canJumpAgain) {
        wsRooms[roomId].state = data.state;
        ws.send(JSON.stringify({ type: 'move', state: data.state }));
        return;
      }
      // სხვა შემთხვევაში (ჩვეულებრივი სვლა ან finish-turn ან აღარ არის გადახტომა შესაძლებელი) გადადის რიგი
      wsRooms[roomId].state = data.state;
      // --- WIN CHECK LOGIC ---
      // Define color to target ring mapping (opposite corners)
      const colorToTargetRing = {
        '#e74c3c': [1,2,3,4,5,7,8], // red -> green ring
        '#2ecc40': [108,109,111,112,113,114,115], // green -> red ring
        '#3498db': [10,11,21,22,23,33,34], // blue -> orange ring
        '#3a3a7a': [82,83,93,94,95,105,106], // navy -> yellow ring
        '#ff9800': [73,74,84,85,86,96,97], // orange -> blue ring
        '#f1c40f': [19,20,30,31,32,42,43], // yellow -> navy ring
      };
      // For each player/color, check if all their stones are in their target ring
      const allStones = wsRooms[roomId].state.stonesState;
      let winnerColor = null;
      let winnerUserId = null;
      for (const [userId, color] of Object.entries(wsRooms[roomId].players)) {
        const targetRing = colorToTargetRing[color];
        if (!targetRing) continue;
        const playerStones = allStones.filter(s => s.color === color);
        const allInTarget = playerStones.length > 0 && playerStones.every(s => targetRing.includes(s.pos));
        if (allInTarget) {
          winnerColor = color;
          winnerUserId = userId;
          break;
        }
      }
      if (winnerColor && winnerUserId) {
        wsRooms[roomId].gameOver = true;
        wsRooms[roomId].winner = { color: winnerColor, userId: winnerUserId };
        wsRooms[roomId].clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'game-over', winner: wsRooms[roomId].winner }));
          }
        });
        return;
      }
      // --- END WIN CHECK ---
      wsRooms[roomId].turnIndex = (wsRooms[roomId].turnIndex + 1) % activeColors.length;
      wsRooms[roomId].turnMoveUserId = null;
      wsRooms[roomId].clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'move', state: data.state }));
        }
      });
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'whose-turn', color: activeColors[wsRooms[roomId].turnIndex % activeColors.length] }));
        }
      });
    } else if (data.type === 'finish-turn') {
      // სვლა სრულდება და გადადის შემდეგ მოთამაშეზე
      wsRooms[roomId].turnIndex = (wsRooms[roomId].turnIndex + 1) % wsRooms[roomId].activeColors.length;
      wsRooms[roomId].turnMoveUserId = null;
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'whose-turn', color: wsRooms[roomId].activeColors[wsRooms[roomId].turnIndex % wsRooms[roomId].activeColors.length] }));
        }
      });
      return;
    } else if (data.type === 'sync-request') {
      if (wsRooms[roomId].state) ws.send(JSON.stringify({ type: 'sync', state: wsRooms[roomId].state }));
    }
    // ფერის არჩევის მოთხოვნა (choose-color) იგნორირდეს
  });

  // Notify ALL clients about current color assignments and names
  wsRooms[roomId].clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      console.log('[NAME SYNC] Sending color-update with names:', JSON.stringify(wsRooms[roomId].names));
      client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names }));
    }
  });

  ws.on('close', () => {
    wsRooms[roomId].clients.delete(ws);
    // Remove player color
    if (wsRooms[roomId].players && wsRooms[roomId].players[userId]) {
      delete wsRooms[roomId].players[userId];
      // განაახლე activeColors
      const colorOrder = [
        '#e74c3c', // red
        '#2ecc40', // green
        '#3498db', // blue
        '#3a3a7a', // navy
        '#ff9800', // orange
        '#f1c40f'  // yellow
      ];
      const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
      let requiredPlayers = 2;
      if (roomMeta && roomMeta.players) requiredPlayers = parseInt(roomMeta.players, 10);
      wsRooms[roomId].activeColors = colorOrder.filter(c => Object.values(wsRooms[roomId].players).includes(c)).slice(0, requiredPlayers);
      // Notify others
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players }));
        }
      });
    }
    if (!wsRooms[roomId].clients || wsRooms[roomId].clients.size === 0) {
      console.log('ROOM DELETED', roomId);
      delete wsRooms[roomId];
      // --- ოთახი წაშალე rooms მასივიდანაც ---
      const idx = rooms.findIndex(r => r.id.toString() === roomId.toString());
      if (idx !== -1) rooms.splice(idx, 1);
      if (typeof onRoomDeleted === 'function') onRoomDeleted(roomId);
    }
  });
});

server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});

module.exports = { wsRooms, setOnRoomDeleted, rooms }; 