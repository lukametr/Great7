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
const { getDb } = require('./api.cjs');

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

// --- Grace period map for disconnects ---

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');
  let userId = url.searchParams.get('userId');
  if (!roomId) { ws.close(); return; }
  if (!userId) {
    userId = (req.headers['sec-websocket-key'] || '') + '-' + Math.random().toString(36).slice(2);
  }
  // --- colorOrder must be defined before use ---
  const colorOrder = [
    '#e74c3c', // red
    '#2ecc40', // green
    '#3498db', // blue
    '#3a3a7a', // navy
    '#ff9800', // orange
    '#f1c40f'  // yellow
  ];

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
  ws._userId = userId;
  // Send user-id to client so it knows its userId
  ws.send(JSON.stringify({ type: 'user-id', userId }));
  // Do NOT send color-update here. Wait for join message.

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
    // --- Start timer for the first player ---
    const firstColor = wsRooms[roomId].activeColors[0];
    const firstUserId = Object.entries(wsRooms[roomId].players).find(([uid, color]) => color === firstColor)?.[0];
    if (firstUserId) startTurnTimer(roomId, firstUserId);
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
      // Assign color if not already assigned
      if (!wsRooms[roomId].players[ws._userId]) {
        const assignedColor = colorOrder[Object.keys(wsRooms[roomId].players).length];
        wsRooms[roomId].players[ws._userId] = assignedColor;
        console.log('SERVER COLOR ASSIGN (on join):', { userId: ws._userId, assignedColor, players: wsRooms[roomId].players });
      }
      console.log('[NAME SYNC] Current names mapping:', JSON.stringify(wsRooms[roomId].names));
      // Notify all clients about current color assignments and names
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names }));
        }
      });
      // --- NEW: If all players have joined, start the game (send whose-turn etc) ---
      const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
      let requiredPlayers = 2;
      if (roomMeta && roomMeta.players) requiredPlayers = parseInt(roomMeta.players, 10);
      if (Object.keys(wsRooms[roomId].players).length === requiredPlayers) {
        wsRooms[roomId].activeColors = colorOrder.slice(0, requiredPlayers);
        wsRooms[roomId].turnIndex = 0;
        wsRooms[roomId].clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'whose-turn', color: wsRooms[roomId].activeColors[0] }));
          }
        });
        // Start timer for the first player
        const firstColor = wsRooms[roomId].activeColors[0];
        const firstUserId = Object.entries(wsRooms[roomId].players).find(([uid, color]) => color === firstColor)?.[0];
        if (firstUserId) startTurnTimer(roomId, firstUserId);
      }
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
        clearAllTimers(roomId);
        // --- Update stats and save game (reuse win logic) ---
        (async () => {
          try {
            const db = await getDb();
            const users = db.collection('users');
            function xpForLevel(level) {
              return Math.floor(10 * Math.pow(level, 1.5));
            }
            // Winner
            const winnerUserIdStr = winnerUserId.split('-')[0];
            console.log('[STATS] Looking for winner user:', winnerUserIdStr);
            let winnerUser = null;
            if (require('mongodb').ObjectId.isValid(winnerUserIdStr)) {
              winnerUser = await users.findOne({ _id: new require('mongodb').ObjectId(winnerUserIdStr) });
            }
            if (!winnerUser && wsRooms[roomId].names && wsRooms[roomId].names[winnerUserId]) {
              // Try by name as fallback
              winnerUser = await users.findOne({ name: wsRooms[roomId].names[winnerUserId] });
              if (winnerUser) console.log('[STATS] Winner found by name:', winnerUser.name);
            }
            console.log('[STATS] Winner user found:', winnerUser);
            if (winnerUser) {
              let newXp = (winnerUser.xp || 0) + 10 + (winnerUser.level || 1) * 2;
              let newLevel = winnerUser.level || 1;
              while (newXp >= xpForLevel(newLevel + 1)) {
                newXp -= xpForLevel(newLevel + 1);
                newLevel += 1;
              }
              const updateRes = await users.updateOne(
                { _id: winnerUser._id },
                { $inc: { wins: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
              );
              console.log('[STATS] Winner update result:', updateRes);
            } else {
              console.log('[STATS] Winner user NOT FOUND, stats not updated');
            }
            // Losers
            const losers = [];
            for (const [userId, color] of Object.entries(wsRooms[roomId].players)) {
              if (userId === winnerUserId) continue;
              const loserUserIdStr = userId.split('-')[0];
              console.log('[STATS] Looking for loser user:', loserUserIdStr);
              let loserUser = null;
              if (require('mongodb').ObjectId.isValid(loserUserIdStr)) {
                loserUser = await users.findOne({ _id: new require('mongodb').ObjectId(loserUserIdStr) });
              }
              if (!loserUser && wsRooms[roomId].names && wsRooms[roomId].names[userId]) {
                loserUser = await users.findOne({ name: wsRooms[roomId].names[userId] });
                if (loserUser) console.log('[STATS] Loser found by name:', loserUser.name);
              }
              console.log('[STATS] Loser user found:', loserUser);
              if (loserUser) {
                losers.push({ userId: loserUser._id, name: loserUser.name });
                let newXp = loserUser.xp || 0;
                let newLevel = loserUser.level || 1;
                if (newLevel > 3) {
                  newXp -= (newLevel - 2);
                  if (newXp < 0) newXp = 0;
                }
                while (newLevel > 1 && newXp < 0) {
                  newLevel -= 1;
                  newXp += xpForLevel(newLevel + 1);
                }
                const updateRes = await users.updateOne(
                  { _id: loserUser._id },
                  { $inc: { losses: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
                );
                console.log('[STATS] Loser update result:', updateRes);
              } else {
                console.log('[STATS] Loser user NOT FOUND, stats not updated');
              }
            }
            // --- Save game history ---
            const games = db.collection('games');
            await games.insertOne({
              roomId,
              winner: { userId: winnerUserIdStr, name: winnerUser ? winnerUser.name : '' },
              losers,
              players: Object.entries(wsRooms[roomId].players).map(([userId, color]) => ({ userId, color })),
              timestamp: new Date(),
              finalState: wsRooms[roomId].state
            });
            // --- Optionally: send profile update to winner/loser if their socket is open ---
            wsRooms[roomId].clients.forEach(client => {
              if (client.readyState === 1 && client._userId) {
                // You can trigger a profile refresh on the frontend if needed
                client.send(JSON.stringify({ type: 'profile-update' }));
              }
            });
          } catch (e) { console.error('Failed to update stats or save game in MongoDB:', e); }
        })();
        // --- Notify clients ---
        wsRooms[roomId].clients.forEach(client => {
          if (client.readyState === 1) {
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
      // --- Start timer for the next player ---
      const nextColor = activeColors[wsRooms[roomId].turnIndex % activeColors.length];
      const nextUserId = Object.entries(wsRooms[roomId].players).find(([uid, color]) => color === nextColor)?.[0];
      if (nextUserId) startTurnTimer(roomId, nextUserId);
    } else if (data.type === 'finish-turn') {
      // სვლა სრულდება და გადადის შემდეგ მოთამაშეზე
      wsRooms[roomId].turnIndex = (wsRooms[roomId].turnIndex + 1) % wsRooms[roomId].activeColors.length;
      wsRooms[roomId].turnMoveUserId = null;
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'whose-turn', color: wsRooms[roomId].activeColors[wsRooms[roomId].turnIndex % wsRooms[roomId].activeColors.length] }));
        }
      });
      // --- Start timer for the next player ---
      const nextColor = wsRooms[roomId].activeColors[wsRooms[roomId].turnIndex % wsRooms[roomId].activeColors.length];
      const nextUserId = Object.entries(wsRooms[roomId].players).find(([uid, color]) => color === nextColor)?.[0];
      if (nextUserId) startTurnTimer(roomId, nextUserId);
      return;
    } else if (data.type === 'sync-request') {
      if (wsRooms[roomId].state) ws.send(JSON.stringify({ type: 'sync', state: wsRooms[roomId].state }));
    } else if (data.type === 'leave') {
      // Player explicitly left the game (clicked lobby/exit)
      if (wsRooms[roomId].players && wsRooms[roomId].players[ws._userId]) {
        delete wsRooms[roomId].players[ws._userId];
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
            client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
          }
        });
      }
      return;
    }
    // ფერის არჩევის მოთხოვნა (choose-color) იგნორირდეს
  });

  // Notify ALL clients about current color assignments and names
  wsRooms[roomId].clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
    }
  });

  ws.on('close', () => {
    wsRooms[roomId].clients.delete(ws);
    // Do NOT remove player on disconnect; only remove on timer-forfeit or leave
    if (!wsRooms[roomId].clients || wsRooms[roomId].clients.size === 0) {
      console.log('ROOM DELETED', roomId);
      delete wsRooms[roomId];
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

// --- TIMER LOGIC ---
function sendTimerUpdate(roomId) {
  const timers = wsRooms[roomId]?.timers;
  if (!timers) return;
  const msg = { type: 'timer-update', timers: {} };
  for (const [userId, t] of Object.entries(timers)) {
    msg.timers[userId] = {
      mainTimeLeft: t.mainTimeLeft,
      inMainTime: t.inMainTime,
      turnTimeLeft: t.turnTimeLeft || 0
    };
  }
  wsRooms[roomId].clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  });
}
function clearAllTimers(roomId) {
  if (!wsRooms[roomId]?.timers) return;
  for (const t of Object.values(wsRooms[roomId].timers)) {
    if (t.timeoutId) clearTimeout(t.timeoutId);
  }
  wsRooms[roomId].timers = {};
}
function clearAllMainTimersExcept(roomId, exceptUserId) {
  if (!wsRooms[roomId]?.timers) return;
  for (const [uid, t] of Object.entries(wsRooms[roomId].timers)) {
    if (uid !== exceptUserId && t.timeoutId) {
      clearTimeout(t.timeoutId);
      t.timeoutId = null;
    }
  }
}
function startTurnTimer(roomId, userId) {
  if (wsRooms[roomId].gameOver) return;
  if (!wsRooms[roomId].timers) wsRooms[roomId].timers = {};
  const timers = wsRooms[roomId].timers;
  // Clear all other timers (including main timers)
  clearAllMainTimersExcept(roomId, userId);
  // ყოველთვის დააყენე ახალი მნიშვნელობები
  timers[userId] = { mainTimeLeft: 60000, inMainTime: false };
  timers[userId].turnStart = Date.now();
  timers[userId].inMainTime = false;
  timers[userId].turnTimeLeft = 30000; // 30 seconds per turn
  if (timers[userId].timeoutId) clearTimeout(timers[userId].timeoutId);
  if (timers[userId].turnIntervalId) clearInterval(timers[userId].turnIntervalId);
  // --- Send timer-update every second during turn time ---
  timers[userId].turnIntervalId = setInterval(() => {
    if (wsRooms[roomId].gameOver) { clearInterval(timers[userId].turnIntervalId); timers[userId].turnIntervalId = null; return; }
    if (timers[userId].turnTimeLeft > 0) {
      timers[userId].turnTimeLeft -= 1000;
      if (timers[userId].turnTimeLeft < 0) timers[userId].turnTimeLeft = 0;
      sendTimerUpdate(roomId);
    } else {
      clearInterval(timers[userId].turnIntervalId);
      timers[userId].turnIntervalId = null;
    }
  }, 1000);
  timers[userId].timeoutId = setTimeout(() => {
    if (wsRooms[roomId].gameOver) return;
    clearInterval(timers[userId].turnIntervalId);
    timers[userId].turnIntervalId = null;
    timers[userId].inMainTime = true;
    timers[userId].turnTimeLeft = 0;
    sendTimerUpdate(roomId);
    startMainTimer(roomId, userId);
  }, 30000); // 30 seconds
  sendTimerUpdate(roomId);
}
function startMainTimer(roomId, userId) {
  if (wsRooms[roomId].gameOver) return;
  const timers = wsRooms[roomId].timers;
  const t = timers[userId];
  // Clear all other main timers
  clearAllMainTimersExcept(roomId, userId);
  if (t.turnIntervalId) { clearInterval(t.turnIntervalId); t.turnIntervalId = null; }
  function tick() {
    if (wsRooms[roomId].gameOver) return;
    const now = Date.now();
    const elapsed = now - (t._lastTick || now);
    t._lastTick = now;
    t.mainTimeLeft -= elapsed;
    if (t.mainTimeLeft <= 0) {
      t.mainTimeLeft = 0;
      sendTimerUpdate(roomId);
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === 1) client.send(JSON.stringify({ type: 'timer-forfeit', userId }));
      });
      // --- End game and update stats ---
      // Find winner: the next player in turn order who still has time left
      const activeColors = wsRooms[roomId].activeColors;
      const loserUserId = userId;
      let winnerUserId = null;
      for (let i = 1; i <= activeColors.length; ++i) {
        const idx = (wsRooms[roomId].turnIndex + i) % activeColors.length;
        const color = activeColors[idx];
        const uid = Object.entries(wsRooms[roomId].players).find(([uid, c]) => c === color)?.[0];
        if (uid && timers[uid] && timers[uid].mainTimeLeft > 0) {
          winnerUserId = uid;
          break;
        }
      }
      // --- Remove player who lost on time ---
      if (wsRooms[roomId].players && wsRooms[roomId].players[loserUserId]) {
        delete wsRooms[roomId].players[loserUserId];
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
            client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
          }
        });
      }
      // --- Update stats and save game (always) ---
      (async () => {
        try {
          const db = await getDb();
          const users = db.collection('users');
          function xpForLevel(level) {
            return Math.floor(10 * Math.pow(level, 1.5));
          }
          // Winner
          if (winnerUserId) {
            const winnerUserIdStr = winnerUserId.split('-')[0];
            console.log('[STATS] (timer) Looking for winner user:', winnerUserIdStr);
            let winnerUser = null;
            if (require('mongodb').ObjectId.isValid(winnerUserIdStr)) {
              winnerUser = await users.findOne({ _id: new require('mongodb').ObjectId(winnerUserIdStr) });
            }
            if (!winnerUser && wsRooms[roomId].names && wsRooms[roomId].names[winnerUserId]) {
              winnerUser = await users.findOne({ name: wsRooms[roomId].names[winnerUserId] });
              if (winnerUser) console.log('[STATS] (timer) Winner found by name:', winnerUser.name);
            }
            console.log('[STATS] (timer) Winner user found:', winnerUser);
            if (winnerUser) {
              let newXp = (winnerUser.xp || 0) + 10 + (winnerUser.level || 1) * 2;
              let newLevel = winnerUser.level || 1;
              while (newXp >= xpForLevel(newLevel + 1)) {
                newXp -= xpForLevel(newLevel + 1);
                newLevel += 1;
              }
              const updateRes = await users.updateOne(
                { _id: winnerUser._id },
                { $inc: { wins: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
              );
              console.log('[STATS] (timer) Winner update result:', updateRes);
            } else {
              console.log('[STATS] (timer) Winner user NOT FOUND, stats not updated');
            }
          }
          // Losers (including the one who lost on time)
          const losers = [];
          for (const [userId, color] of Object.entries(wsRooms[roomId].players)) {
            if (userId === winnerUserId) continue;
            const loserUserIdStr = userId.split('-')[0];
            console.log('[STATS] (timer) Looking for loser user:', loserUserIdStr);
            let loserUser = null;
            if (require('mongodb').ObjectId.isValid(loserUserIdStr)) {
              loserUser = await users.findOne({ _id: new require('mongodb').ObjectId(loserUserIdStr) });
            }
            if (!loserUser && wsRooms[roomId].names && wsRooms[roomId].names[userId]) {
              loserUser = await users.findOne({ name: wsRooms[roomId].names[userId] });
              if (loserUser) console.log('[STATS] (timer) Loser found by name:', loserUser.name);
            }
            console.log('[STATS] (timer) Loser user found:', loserUser);
            if (loserUser) {
              losers.push({ userId: loserUser._id, name: loserUser.name });
              let newXp = loserUser.xp || 0;
              let newLevel = loserUser.level || 1;
              if (newLevel > 3) {
                newXp -= (newLevel - 2);
                if (newXp < 0) newXp = 0;
              }
              while (newLevel > 1 && newXp < 0) {
                newLevel -= 1;
                newXp += xpForLevel(newLevel + 1);
              }
              const updateRes = await users.updateOne(
                { _id: loserUser._id },
                { $inc: { losses: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
              );
              console.log('[STATS] (timer) Loser update result:', updateRes);
            } else {
              console.log('[STATS] (timer) Loser user NOT FOUND, stats not updated');
            }
          }
          // Also update the loser who just lost on time
          const loserUserIdStr = loserUserId.split('-')[0];
          console.log('[STATS] (timer) Looking for forfeit loser user:', loserUserIdStr);
          let loserUser = null;
          if (require('mongodb').ObjectId.isValid(loserUserIdStr)) {
            loserUser = await users.findOne({ _id: new require('mongodb').ObjectId(loserUserIdStr) });
          }
          if (!loserUser && wsRooms[roomId].names && wsRooms[roomId].names[loserUserId]) {
            loserUser = await users.findOne({ name: wsRooms[roomId].names[loserUserId] });
            if (loserUser) console.log('[STATS] (timer) Forfeit loser found by name:', loserUser.name);
          }
          console.log('[STATS] (timer) Forfeit loser user found:', loserUser);
          if (loserUser) {
            losers.push({ userId: loserUser._id, name: loserUser.name });
            let newXp = loserUser.xp || 0;
            let newLevel = loserUser.level || 1;
            if (newLevel > 3) {
              newXp -= (newLevel - 2);
              if (newXp < 0) newXp = 0;
            }
            while (newLevel > 1 && newXp < 0) {
              newLevel -= 1;
              newXp += xpForLevel(newLevel + 1);
            }
            const updateRes = await users.updateOne(
              { _id: loserUser._id },
              { $inc: { losses: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
            );
            console.log('[STATS] (timer) Forfeit loser update result:', updateRes);
          } else {
            console.log('[STATS] (timer) Forfeit loser user NOT FOUND, stats not updated');
          }
          // --- Save game history ---
          const games = db.collection('games');
          await games.insertOne({
            roomId,
            winner: winnerUserId ? { userId: winnerUserId.split('-')[0], name: winnerUser ? winnerUser.name : '' } : null,
            losers,
            players: Object.entries(wsRooms[roomId].players).map(([userId, color]) => ({ userId, color })),
            timestamp: new Date(),
            finalState: wsRooms[roomId].state
          });
          // --- Optionally: send profile update to winner/loser if their socket is open ---
          wsRooms[roomId].clients.forEach(client => {
            if (client.readyState === 1 && client._userId) {
              // You can trigger a profile refresh on the frontend if needed
              client.send(JSON.stringify({ type: 'profile-update' }));
            }
          });
        } catch (e) { console.error('Failed to update stats or save game in MongoDB:', e); }
      })();
      // --- Notify clients ---
      wsRooms[roomId].clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'game-over', winner: winnerUserId ? { color: wsRooms[roomId].players[winnerUserId], userId: winnerUserId } : null }));
        }
      });
      return;
    }
    t.timeoutId = setTimeout(tick, 1000);
    sendTimerUpdate(roomId);
  }
  t._lastTick = Date.now();
  t.timeoutId = setTimeout(tick, 1000);
} 