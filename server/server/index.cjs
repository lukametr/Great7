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
const { getDb, setWsRooms } = require('./api.cjs');
const boardSetup = require('./boardSetup.js');

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

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');
  let userId = url.searchParams.get('userId');
  if (!roomId) { ws.close(); return; }
  if (!userId) {
    userId = (req.headers['sec-websocket-key'] || '') + '-' + Math.random().toString(36).slice(2);
  }

  // --- ოთახის ინიციალიზაცია ---
  if (!wsRooms[roomId] || !wsRooms[roomId].clients || wsRooms[roomId].clients.size === 0) {
    let playerCount = 2;
    let roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
    // --- Fetch from MongoDB if not found in memory ---
    if (!roomMeta) {
      try {
        const db = await require('./api.cjs').getDb();
        if (db) {
          const roomsCol = db.collection('rooms');
          const dbRoom = await roomsCol.findOne({ _id: isNaN(Number(roomId)) ? roomId : Number(roomId) });
          if (dbRoom && dbRoom.players) {
            playerCount = parseInt(dbRoom.players, 10);
            roomMeta = { id: roomId, name: dbRoom.name || `Room ${roomId}`, players: playerCount };
            rooms.push(roomMeta);
          }
        }
      } catch (e) { console.warn('Could not fetch room meta from DB:', e); }
    }
    if (roomMeta && roomMeta.players) playerCount = parseInt(roomMeta.players, 10);
    console.log('ROOM INIT:', { roomId, playerCount, roomMeta, rooms });
    // --- გამოიყენე ახალი მოდული ქვებისა და ფერების გენერაციისთვის ---
    const activeColors = boardSetup.getActiveColors(playerCount);
    const boardState = boardSetup.getInitialBoardState(playerCount);
    wsRooms[roomId] = {
      state: boardState,
      clients: new Set(),
      players: {},
      turnIndex: 0,
      activeColors: activeColors
    };
    if (!rooms.find(r => r.id.toString() === roomId.toString())) {
      rooms.push({ id: roomId, name: `Room ${roomId}`, players: playerCount });
    }
    console.log('ROOM CREATED', roomId, 'players:', playerCount, 'stones:', boardState.stonesState.length, 'colors:', activeColors, 'stonesState:', boardState.stonesState);
  }
  wsRooms[roomId].clients.add(ws);
  ws._userId = userId;
  // --- ფერის მინიჭება ---
  if (!wsRooms[roomId].players[userId]) {
    const filteredColors = wsRooms[roomId].activeColors || [];
    // პირველი მოთამაშე ყოველთვის იღებს წითელ ფერს
    let assignedColor;
    if (Object.keys(wsRooms[roomId].players).length === 0) {
      assignedColor = '#e74c3c'; // წითელი
    } else {
      assignedColor = filteredColors[Object.keys(wsRooms[roomId].players).length];
    }
    wsRooms[roomId].players[userId] = assignedColor;
    if (wsRooms[roomId].names && !wsRooms[roomId].names[userId]) wsRooms[roomId].names[userId] = userId;
    console.log('[AUTO PLAYER ADD] userId:', userId, 'assignedColor:', assignedColor, 'players:', wsRooms[roomId].players);
  }
  ws.send(JSON.stringify({ type: 'user-id', userId }));
  // Do NOT send color-update here. Wait for join message.

  // თუ ყველა მოთამაშე შემოვიდა, გაუგზავნე ყველას whose-turn (პირველი სვლა უნიკალური ფერებიდან)
  const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
  let requiredPlayers = 2;
  if (roomMeta && roomMeta.players) requiredPlayers = parseInt(roomMeta.players, 10);
  if (Object.keys(wsRooms[roomId].players).length === requiredPlayers) {
    wsRooms[roomId].activeColors = (wsRooms[roomId].activeColors || []).slice(0, requiredPlayers);
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

  if (wsRooms[roomId].state) {
    console.log('SYNC SEND', roomId, 'playerCount:', playerCount, 'stonesState:', wsRooms[roomId].state.stonesState);
    ws.send(JSON.stringify({ type: 'sync', state: wsRooms[roomId].state }));
  }

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
      // Notify all clients about current color assignments and names
      if (Object.keys(wsRooms[roomId].players).length > 0) {
        wsRooms[roomId].clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client._userId && wsRooms[roomId].players[client._userId]) {
            client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
          } else if (client._userId && !wsRooms[roomId].players[client._userId]) {
            // If client is no longer in players, close their socket
            try { client.close(); } catch {}
          }
        });
      } else {
        console.warn('[BUG] Tried to send color-update with empty players:', wsRooms[roomId].players);
      }
      // --- NEW: If all players have joined, start the game (send whose-turn etc) ---
      const roomMeta = rooms.find(r => r.id.toString() === roomId.toString());
      let requiredPlayers = 2;
      if (roomMeta && roomMeta.players) requiredPlayers = parseInt(roomMeta.players, 10);
      if (Object.keys(wsRooms[roomId].players).length === requiredPlayers) {
        wsRooms[roomId].activeColors = (wsRooms[roomId].activeColors || []).slice(0, requiredPlayers);
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
      const activeColors = wsRooms[roomId].activeColors && wsRooms[roomId].activeColors.length ? wsRooms[roomId].activeColors : boardSetup.getActiveColors(requiredPlayers);
      const turnColor = activeColors[wsRooms[roomId].turnIndex % activeColors.length];
      // მოძებნე ამ ws-ის assignedColor
      const userId = ws._userId;
      const userColor = wsRooms[roomId].players[userId];
      if (userColor !== turnColor) {
        ws.send(JSON.stringify({ type: 'move-error', message: 'Not your turn.' }));
        return;
      }
      // --- ახალი წესი: მხოლოდ ერთი ქვით შეიძლება სვლა ---
      if (wsRooms[roomId].turnMoveUserId === null || typeof wsRooms[roomId].turnMoveUserId === 'undefined') {
        wsRooms[roomId].turnMoveUserId = userId;
      } else if (wsRooms[roomId].turnMoveUserId !== userId) {
        ws.send(JSON.stringify({ type: 'move-error', message: 'You already moved this turn.' }));
        return;
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
            function xpForLevel(level) { return Math.floor(10 * Math.pow(level, 1.5)); }
            async function findUserByIdOrNameOrEmail(userId, name, email) {
              let user = null;
              if (require('mongodb').ObjectId.isValid(userId)) {
                user = await users.findOne({ _id: new require('mongodb').ObjectId(userId) });
                if (user) return user;
              }
              if (email) {
                user = await users.findOne({ email });
                if (user) return user;
              }
              if (name) {
                const found = await users.find({ name }).toArray();
                if (found.length === 1) return found[0];
                if (found.length > 1) {
                  console.error('[STATS] Ambiguous user name, multiple users found for name:', name, found.map(u=>u._id), 'unicode:', Array.from(name).map(c=>c.charCodeAt(0).toString(16)).join(' '));
                  return null;
                }
                if (found.length === 0) {
                  console.error('[STATS] User not found by name:', name, ' (unicode:', Array.from(name).map(c=>c.charCodeAt(0).toString(16)).join(' '), ')');
                  return null;
                }
              }
              return null;
            }
            // Winner
            let winnerUser = null;
            if (winnerUserId) {
              const winnerUserIdStr = winnerUserId.split('-')[0];
              const winnerName = wsRooms[roomId]?.names && wsRooms[roomId].names[winnerUserId];
              winnerUser = await findUserByIdOrNameOrEmail(winnerUserIdStr, winnerName, null);
              if (!winnerUser) console.error('[STATS] Winner user NOT FOUND:', { winnerUserIdStr, winnerName });
            }
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
              const loserName = wsRooms[roomId]?.names && wsRooms[roomId].names[userId];
              let loserUser = await findUserByIdOrNameOrEmail(loserUserIdStr, loserName, null);
              if (!loserUser) console.error('[STATS] Loser user NOT FOUND:', { loserUserIdStr, loserName });
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
            // Forfeit loser
            const loserUserIdStr = loserUserId.split('-')[0];
            const forfeitName = wsRooms[roomId]?.names && wsRooms[roomId].names[loserUserId];
            let forfeitUser = await findUserByIdOrNameOrEmail(loserUserIdStr, forfeitName, null);
            if (!forfeitUser) console.error('[STATS] Forfeit loser user NOT FOUND:', { loserUserIdStr, forfeitName });
            if (forfeitUser) {
              losers.push({ userId: forfeitUser._id, name: forfeitUser.name });
              let newXp = forfeitUser.xp || 0;
              let newLevel = forfeitUser.level || 1;
              if (newLevel > 3) {
                newXp -= (newLevel - 2);
                if (newXp < 0) newXp = 0;
              }
              while (newLevel > 1 && newXp < 0) {
                newLevel -= 1;
                newXp += xpForLevel(newLevel + 1);
              }
              const updateRes = await users.updateOne(
                { _id: forfeitUser._id },
                { $inc: { losses: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
              );
              console.log('[STATS] Forfeit loser update result:', updateRes);
            } else {
              console.log('[STATS] Forfeit loser user NOT FOUND, stats not updated');
            }
            // Save game history
            const games = db.collection('games');
            await games.insertOne({
              roomId,
              winner: winnerUserId && winnerUser ? { userId: winnerUser._id.toString(), name: winnerUser.name } : null,
              losers,
              players: Object.entries(wsRooms[roomId]?.players || {}).map(([userId, color]) => ({ userId, color })),
              timestamp: new Date(),
              finalState: wsRooms[roomId]?.state
            });
            if (wsRooms[roomId] && wsRooms[roomId].clients) {
              wsRooms[roomId].clients.forEach(client => {
                if (client.readyState === 1 && client._userId) {
                  client.send(JSON.stringify({ type: 'profile-update' }));
                }
              });
            }
          } catch (e) { console.error('Failed to update stats or save game in MongoDB:', e); }
        })();
        // --- Notify clients ---
        if (winnerUserId && typeof winnerUser !== 'undefined' && winnerUser) {
          wsRooms[roomId].clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: 'game-over', winner: wsRooms[roomId].winner }));
            }
          });
        } else if (winnerUserId && (typeof winnerUser === 'undefined' || !winnerUser)) {
          console.error('[BUG] Winner userId არსებობს, მაგრამ ვერ მოიძებნა ბაზაში, თამაში არ დასრულდა:', winnerUserId);
          return;
        }
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
      // თუ თამაშის დასრულების შემდეგ finish-turn მოვიდა, ყველა ტაიმერი შეწყდეს
      if (wsRooms[roomId].gameOver) clearAllTimers(roomId);
      return;
    } else if (data.type === 'sync-request') {
      if (wsRooms[roomId].state) ws.send(JSON.stringify({ type: 'sync', state: wsRooms[roomId].state }));
    } else if (data.type === 'leave') {
      // Player explicitly left the game (clicked lobby/exit)
      if (wsRooms[roomId].players && wsRooms[roomId].players[ws._userId]) {
        console.log('[PLAYER REMOVE] Reason: leave, userId:', ws._userId);
        delete wsRooms[roomId].players[ws._userId];
        if (wsRooms[roomId].names) delete wsRooms[roomId].names[ws._userId];
        if (wsRooms[roomId].timers) delete wsRooms[roomId].timers[ws._userId];
        if (wsRooms[roomId].disconnectedUsers) delete wsRooms[roomId].disconnectedUsers[ws._userId];
        // განაახლე activeColors
        const activeColors = boardSetup.getActiveColors(requiredPlayers);
        wsRooms[roomId].activeColors = activeColors;
        // Notify others ONLY if players is not empty
        if (Object.keys(wsRooms[roomId].players).length > 0) {
          wsRooms[roomId].clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client._userId && wsRooms[roomId].players[client._userId]) {
              client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
            } else if (client._userId && !wsRooms[roomId].players[client._userId]) {
              try { client.close(); } catch {}
            }
          });
        }
        // თუ დარჩა მხოლოდ ერთი მოთამაშე, თამაში დასრულდეს და ტაიმერები შეწყდეს
        if (Object.keys(wsRooms[roomId].players).length === 1) {
          wsRooms[roomId].gameOver = true;
          clearAllTimers(roomId);
          console.log('[GAME OVER] Only one player left, game ended:', Object.keys(wsRooms[roomId].players));
        } else if (Object.keys(wsRooms[roomId].players).length === 0) {
          clearAllTimers(roomId);
          delete wsRooms[roomId];
          const idx = rooms.findIndex(r => r.id.toString() === roomId.toString());
          if (idx !== -1) rooms.splice(idx, 1);
          if (typeof onRoomDeleted === 'function') onRoomDeleted(roomId);
          console.log('[ROOM DELETED] No players left, room deleted:', roomId);
        }
      }
      return;
    }
    // ფერის არჩევის მოთხოვნა (choose-color) იგნორირდეს
  });

  // Notify ALL clients about current color assignments and names
  if (Object.keys(wsRooms[roomId].players).length > 0) {
    wsRooms[roomId].clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client._userId && wsRooms[roomId].players[client._userId]) {
        client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
      } else if (client._userId && !wsRooms[roomId].players[client._userId]) {
        try { client.close(); } catch {}
      }
    });
  } else {
    console.warn('[BUG] Tried to send color-update with empty players:', wsRooms[roomId].players);
  }

  // --- Grace period: disconnectedUsers ---
  if (!wsRooms[roomId].disconnectedUsers) wsRooms[roomId].disconnectedUsers = {};
  // თუ დაბრუნდა გათიშული user, წაშალე disconnectTime
  if (userId && wsRooms[roomId].disconnectedUsers[userId]) {
    delete wsRooms[roomId].disconnectedUsers[userId];
  }

  ws.on('close', () => {
    wsRooms[roomId].clients.delete(ws);
    // Grace period: მოთამაშე არ იშლება players-დან, არამედ აღინიშნება როგორც გათიშული
    if (ws._userId) {
      wsRooms[roomId].disconnectedUsers[ws._userId] = Date.now();
    }
    // Do NOT remove player on disconnect; only remove on timer-forfeit or leave
    if (!wsRooms[roomId].clients || wsRooms[roomId].clients.size === 0) {
      console.log('ROOM DELETED', roomId);
      clearAllTimers(roomId); // ოთახის წაშლისასაც შეწყდეს ყველა ტაიმერი
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

process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', function (reason, promise) {
  console.error('UNHANDLED REJECTION:', reason);
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
  if (!wsRooms[roomId] || wsRooms[roomId].gameOver) return;
  if (!wsRooms[roomId].timers) wsRooms[roomId].timers = {};
  const timers = wsRooms[roomId].timers;
  clearAllMainTimersExcept(roomId, userId);
  if (!timers[userId]) timers[userId] = { mainTimeLeft: 60000, inMainTime: false };
  else timers[userId].inMainTime = false;
  timers[userId].turnStart = Date.now();
  timers[userId].inMainTime = false;
  timers[userId].turnTimeLeft = 30000;
  console.log(`[TIMER] Start turn timer for userId=${userId}, mainTimeLeft=${timers[userId].mainTimeLeft}, turnTimeLeft=30000, at=${new Date().toISOString()}`);
  if (timers[userId].timeoutId) clearTimeout(timers[userId].timeoutId);
  if (timers[userId].turnIntervalId) clearInterval(timers[userId].turnIntervalId);
  timers[userId].turnIntervalId = setInterval(() => {
    if (!wsRooms[roomId] || wsRooms[roomId].gameOver) { if (timers[userId]) { clearInterval(timers[userId].turnIntervalId); timers[userId].turnIntervalId = null; } return; }
    if (timers[userId] && timers[userId].turnTimeLeft > 0) {
      timers[userId].turnTimeLeft -= 1000;
      if (timers[userId].turnTimeLeft < 0) timers[userId].turnTimeLeft = 0;
      sendTimerUpdate(roomId);
    } else if (timers[userId]) {
      clearInterval(timers[userId].turnIntervalId);
      timers[userId].turnIntervalId = null;
    }
  }, 1000);
  timers[userId].timeoutId = setTimeout(() => {
    if (!wsRooms[roomId] || wsRooms[roomId].gameOver) return;
    if (timers[userId]) {
      clearInterval(timers[userId].turnIntervalId);
      timers[userId].turnIntervalId = null;
      timers[userId].inMainTime = true;
      timers[userId].turnTimeLeft = 0;
      sendTimerUpdate(roomId);
      console.log(`[TIMER] Turn timer expired for userId=${userId}, switching to main timer at ${new Date().toISOString()}`);
      startMainTimer(roomId, userId);
    }
  }, 30000);
  sendTimerUpdate(roomId);
}
function startMainTimer(roomId, userId) {
  if (!wsRooms[roomId] || wsRooms[roomId].gameOver) return;
  const timers = wsRooms[roomId].timers;
  const t = timers[userId];
  if (!t) return;
  clearAllMainTimersExcept(roomId, userId);
  if (t.turnIntervalId) { clearInterval(t.turnIntervalId); t.turnIntervalId = null; }
  function tick() {
    if (!wsRooms[roomId] || wsRooms[roomId].gameOver) return;
    const now = Date.now();
    const elapsed = now - (t._lastTick || now);
    t._lastTick = now;
    t.mainTimeLeft -= elapsed;
    console.log(`[TIMER] Main timer tick for userId=${userId}, mainTimeLeft=${t.mainTimeLeft}, elapsed=${elapsed}, at=${new Date().toISOString()}`);
    // --- Grace period check ---
    const disconnectTime = wsRooms[roomId].disconnectedUsers && wsRooms[roomId].disconnectedUsers[userId];
    if (disconnectTime) {
      const totalLeft = (t.mainTimeLeft || 0) + (t.turnTimeLeft || 0);
      const waited = now - disconnectTime;
      console.log(`[TIMER] User disconnected: userId=${userId}, waited=${waited}, totalLeft=${totalLeft}`);
      if (waited < totalLeft) {
        t.timeoutId = setTimeout(tick, 1000);
        return;
      }
    }
    t.mainTimeLeft = Math.max(0, t.mainTimeLeft);
    if (t.mainTimeLeft <= 0) {
      t.mainTimeLeft = 0;
      sendTimerUpdate(roomId);
      console.log(`[TIMER] Main timer expired for userId=${userId} at ${new Date().toISOString()}`);
      // --- End game and update stats ---
      const activeColors = wsRooms[roomId]?.activeColors || [];
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
      if (wsRooms[roomId] && wsRooms[roomId].players && wsRooms[roomId].players[loserUserId]) {
        console.log('[PLAYER REMOVE] Reason: timer-forfeit, userId:', loserUserId);
        removePlayerEverywhere(roomId, loserUserId);
        const activeColors = boardSetup.getActiveColors(requiredPlayers);
        wsRooms[roomId].activeColors = activeColors;
        // Notify others ONLY if players is not empty
        if (Object.keys(wsRooms[roomId].players).length > 0) {
          if (wsRooms[roomId].clients) {
            wsRooms[roomId].clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN && client._userId && wsRooms[roomId].players[client._userId]) {
                client.send(JSON.stringify({ type: 'color-update', players: wsRooms[roomId].players, names: wsRooms[roomId].names || {} }));
              } else if (client._userId && !wsRooms[roomId].players[client._userId]) {
                try { client.close(); } catch {}
              }
            });
          }
        }
        // თუ დარჩა მხოლოდ ერთი მოთამაშე, თამაში დასრულდეს და ტაიმერები შეწყდეს
        if (Object.keys(wsRooms[roomId].players).length === 1) {
          wsRooms[roomId].gameOver = true;
          clearAllTimers(roomId);
          console.log('[GAME OVER] Only one player left, game ended:', Object.keys(wsRooms[roomId].players));
        } else if (Object.keys(wsRooms[roomId].players).length === 0) {
          clearAllTimers(roomId);
          delete wsRooms[roomId];
          const idx = rooms.findIndex(r => r.id.toString() === roomId.toString());
          if (idx !== -1) rooms.splice(idx, 1);
          if (typeof onRoomDeleted === 'function') onRoomDeleted(roomId);
          console.log('[ROOM DELETED] No players left, room deleted:', roomId);
        }
      } else {
        // მოთამაშე მოულოდნელად გაქრა players-დან, არ გამოაცხადო გამარჯვებული, ჩაწერე ლოგი
        console.error('[BUG] Tried to remove player (timer-forfeit), but userId არ არის players-ში:', loserUserId, wsRooms[roomId]?.players);
        return; // არ გამოაცხადო გამარჯვებული
      }
      (async () => {
        try {
          const db = await getDb();
          const users = db.collection('users');
          function xpForLevel(level) { return Math.floor(10 * Math.pow(level, 1.5)); }
          async function findUserByIdOrNameOrEmail(userId, name, email) {
            let user = null;
            if (require('mongodb').ObjectId.isValid(userId)) {
              user = await users.findOne({ _id: new require('mongodb').ObjectId(userId) });
              if (user) return user;
            }
            if (email) {
              user = await users.findOne({ email });
              if (user) return user;
            }
            if (name) {
              const found = await users.find({ name }).toArray();
              if (found.length === 1) return found[0];
              if (found.length > 1) {
                console.error('[STATS] Ambiguous user name, multiple users found for name:', name, found.map(u=>u._id), 'unicode:', Array.from(name).map(c=>c.charCodeAt(0).toString(16)).join(' '));
                return null;
              }
              if (found.length === 0) {
                console.error('[STATS] User not found by name:', name, ' (unicode:', Array.from(name).map(c=>c.charCodeAt(0).toString(16)).join(' '), ')');
                return null;
              }
            }
            return null;
          }
          // Winner
          let winnerUser = null;
          if (winnerUserId) {
            const winnerUserIdStr = winnerUserId.split('-')[0];
            const winnerName = wsRooms[roomId]?.names && wsRooms[roomId].names[winnerUserId];
            winnerUser = await findUserByIdOrNameOrEmail(winnerUserIdStr, winnerName, null);
            if (!winnerUser) console.error('[STATS] Winner user NOT FOUND:', { winnerUserIdStr, winnerName });
          }
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
          for (const [userId, color] of Object.entries(wsRooms[roomId]?.players || {})) {
            if (userId === winnerUserId) continue;
            const loserUserIdStr = userId.split('-')[0];
            const loserName = wsRooms[roomId]?.names && wsRooms[roomId].names[userId];
            let loserUser = await findUserByIdOrNameOrEmail(loserUserIdStr, loserName, null);
            if (!loserUser) console.error('[STATS] Loser user NOT FOUND:', { loserUserIdStr, loserName });
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
          // Forfeit loser
          const loserUserIdStr = loserUserId.split('-')[0];
          const forfeitName = wsRooms[roomId]?.names && wsRooms[roomId].names[loserUserId];
          let forfeitUser = await findUserByIdOrNameOrEmail(loserUserIdStr, forfeitName, null);
          if (!forfeitUser) console.error('[STATS] Forfeit loser user NOT FOUND:', { loserUserIdStr, forfeitName });
          if (forfeitUser) {
            losers.push({ userId: forfeitUser._id, name: forfeitUser.name });
            let newXp = forfeitUser.xp || 0;
            let newLevel = forfeitUser.level || 1;
            if (newLevel > 3) {
              newXp -= (newLevel - 2);
              if (newXp < 0) newXp = 0;
            }
            while (newLevel > 1 && newXp < 0) {
              newLevel -= 1;
              newXp += xpForLevel(newLevel + 1);
            }
            const updateRes = await users.updateOne(
              { _id: forfeitUser._id },
              { $inc: { losses: 1, gamesPlayed: 1 }, $set: { xp: newXp, level: newLevel } }
            );
            console.log('[STATS] Forfeit loser update result:', updateRes);
          } else {
            console.log('[STATS] Forfeit loser user NOT FOUND, stats not updated');
          }
          // Save game history
          const games = db.collection('games');
          await games.insertOne({
            roomId,
            winner: winnerUserId && winnerUser ? { userId: winnerUser._id.toString(), name: winnerUser.name } : null,
            losers,
            players: Object.entries(wsRooms[roomId]?.players || {}).map(([userId, color]) => ({ userId, color })),
            timestamp: new Date(),
            finalState: wsRooms[roomId]?.state
          });
          if (wsRooms[roomId] && wsRooms[roomId].clients) {
            wsRooms[roomId].clients.forEach(client => {
              if (client.readyState === 1 && client._userId) {
                client.send(JSON.stringify({ type: 'profile-update' }));
              }
            });
          }
        } catch (e) { console.error('Failed to update stats or save game in MongoDB:', e); }
      })();
      if (winnerUserId && typeof winnerUser !== 'undefined' && winnerUser) {
        if (wsRooms[roomId] && wsRooms[roomId].clients) {
          wsRooms[roomId].clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: 'game-over', winner: { color: wsRooms[roomId].players[winnerUserId], userId: winnerUserId } }));
            }
          });
        }
      } else if (winnerUserId && (typeof winnerUser === 'undefined' || !winnerUser)) {
        console.error('[BUG] timer-forfeit: Winner userId არსებობს, მაგრამ ვერ მოიძებნა ბაზაში, თამაში არ დასრულდა:', winnerUserId);
        return;
      }
      return;
    }
    t.timeoutId = setTimeout(tick, 1000);
    sendTimerUpdate(roomId);
  }
  t._lastTick = Date.now();
  t.timeoutId = setTimeout(tick, 1000);
}
function removePlayerEverywhere(roomId, userId) {
  if (!wsRooms[roomId]) return;
  if (wsRooms[roomId].players) delete wsRooms[roomId].players[userId];
  if (wsRooms[roomId].names) delete wsRooms[roomId].names[userId];
  if (wsRooms[roomId].timers) delete wsRooms[roomId].timers[userId];
  if (wsRooms[roomId].disconnectedUsers) delete wsRooms[roomId].disconnectedUsers[userId];
} 