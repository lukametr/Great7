const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const SECRET = process.env.JWT_SECRET || 'great7secret';
const router = express.Router();
const rooms = require('./rooms.cjs');
const { MongoClient, ObjectId } = require('mongodb');
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://lukametr:akukelaAIO12@great7.plyjgbl.mongodb.net/?retryWrites=true&w=majority&appName=great7';
const MONGO_DB = process.env.MONGO_DB || 'great7';
const { config } = require('dotenv');
config();
let mongoClient = null;
let dbInstance = null;
let wsRooms = {};

console.log('MONGO_URL:', MONGO_URL);
console.log('MONGO_DB:', MONGO_DB);

router.use(bodyParser.json());

async function getDb() {
  if (dbInstance) return dbInstance;
  if (!mongoClient) {
    try {
      mongoClient = new MongoClient(MONGO_URL);
      await mongoClient.connect();
      dbInstance = mongoClient.db(MONGO_DB);
      return dbInstance;
    } catch (e) {
      console.error('getDb ERROR: Error: MongoDB connection failed', e);
      mongoClient = null;
      dbInstance = null;
      // არ აგდებს პროცესს, უბრალოდ აბრუნებს null-ს
      return null;
    }
  } else {
    try {
      dbInstance = mongoClient.db(MONGO_DB);
      return dbInstance;
    } catch (e) {
      console.error('getDb ERROR: Error: MongoDB connection failed', e);
      mongoClient = null;
      dbInstance = null;
      return null;
    }
  }
}

function auth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).end();
  try {
    req.user = jwt.verify(auth.split(' ')[1], SECRET);
    next();
  } catch {
    res.status(401).end();
  }
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).end();
  const db = await getDb();
  const users = db.collection('users');
  const existing = await users.findOne({ email });
  if (existing) return res.status(409).end();
  const result = await users.insertOne({ name, email, password, wins: 0, losses: 0, gamesPlayed: 0, level: 1, xp: 0 });
  res.status(201).end();
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = await getDb();
  const users = db.collection('users');
  const user = await users.findOne({ email, password });
  if (!user) return res.status(401).end();
  const token = jwt.sign({ id: user._id.toString(), email: user.email, name: user.name }, SECRET);
  res.json({ token });
});

router.get('/me', auth, async (req, res) => {
  const db = await getDb();
  const users = db.collection('users');
  const user = await users.findOne({ _id: new ObjectId(req.user.id) });
  if (!user) return res.status(404).end();
  const { _id, name, email, wins, losses, gamesPlayed, level, xp } = user;
  res.json({ id: _id, name, email, wins, losses, gamesPlayed, level, xp });
});

// Helper: Remove inactive rooms from DB and memory
async function cleanupInactiveRooms() {
  const db = await getDb();
  const roomsCol = db.collection('rooms');
  const now = Date.now();
  const THIRTY_MIN = 30 * 60 * 1000;
  // Remove from DB
  await roomsCol.deleteMany({
    $or: [
      { lastActivity: { $lt: now - THIRTY_MIN } },
      { lastActivity: { $exists: false } }
    ]
  });
  // Remove from wsRooms and rooms array
  const toDelete = [];
  for (const id in wsRooms) {
    const room = wsRooms[id];
    if (!room.lastActivity || room.lastActivity < now - THIRTY_MIN) {
      toDelete.push(id);
    }
  }
  toDelete.forEach(id => {
    delete wsRooms[id];
    const idx = rooms.findIndex(r => r.id.toString() === id.toString());
    if (idx !== -1) rooms.splice(idx, 1);
  });
}

// Call cleanup every 5 minutes
setInterval(cleanupInactiveRooms, 5 * 60 * 1000);

// Update lastActivity on room creation and activity
function updateRoomActivity(roomId) {
  const now = Date.now();
  if (wsRooms[roomId]) wsRooms[roomId].lastActivity = now;
  rooms.forEach(r => { if (r.id && r.id.toString() === roomId.toString()) r.lastActivity = now; });
  getDb().then(db => {
    db.collection('rooms').updateOne({ _id: roomId }, { $set: { lastActivity: now } });
  });
}

router.get('/rooms', auth, async (req, res) => {
  await cleanupInactiveRooms();
  const db = await getDb();
  const roomsCol = db.collection('rooms');
  const now = Date.now();
  // Find all rooms where game is not finished and lastActivity is within 30 minutes
  const activeRooms = await roomsCol.find({
    $and: [
      { $or: [ { finished: { $exists: false } }, { finished: false } ] },
      { lastActivity: { $gte: now - 30 * 60 * 1000 } }
    ]
  }).toArray();
  // Attach joined count to each room
  const roomsWithCounts = activeRooms.map(r => ({
    ...r,
    id: r._id,
    players: Number(r.players) || 2,
    joined: wsRooms[r._id] && wsRooms[r._id].clients ? wsRooms[r._id].clients.size : 0
  }));
  res.json(roomsWithCounts);
});

router.post('/rooms', auth, async (req, res) => {
  const { name, players, color } = req.body;
  if (!name) return res.status(400).end();
  const db = await getDb();
  const now = Date.now();
  const roomsCol = db.collection('rooms');
  const result = await roomsCol.insertOne({ name, players: Number(players) || 2, color: color || 'red', lastActivity: now, finished: false });
  res.status(201).json({ id: result.insertedId, name, players: Number(players) || 2, color: color || 'red' });
});

router.get('/rooms/:id', auth, async (req, res) => {
  const db = await getDb();
  const roomsCol = db.collection('rooms');
  let room;
  try {
    room = await roomsCol.findOne({ _id: isNaN(Number(req.params.id)) ? req.params.id : Number(req.params.id) });
  } catch {
    return res.status(404).end();
  }
  if (!room) return res.status(404).end();
  res.json({ ...room, id: room._id });
});

router.delete('/rooms/:id', auth, async (req, res) => {
  const db = await getDb();
  const roomsCol = db.collection('rooms');
  await roomsCol.deleteOne({ _id: isNaN(Number(req.params.id)) ? req.params.id : Number(req.params.id) });
  deleteRoomFromArray(req.params.id);
  res.status(204).end();
});

// Export a function to delete a room from the rooms array
function deleteRoomFromArray(roomId) {
  const idx = rooms.findIndex(r => r.id.toString() === roomId.toString());
  if (idx !== -1) {
    console.log('API: Removing room from rooms array', roomId);
    rooms.splice(idx, 1);
  }
  // Also delete from wsRooms if exists
  if (wsRooms[roomId]) delete wsRooms[roomId];
}
module.exports.deleteRoomFromArray = deleteRoomFromArray;

// --- Profile endpoint ---
router.get('/profile', auth, async (req, res) => {
  const db = await getDb();
  const users = db.collection('users');
  const user = await users.findOne({ _id: new ObjectId(req.user.id) });
  if (!user) return res.status(404).end();
  const { name, email, wins, losses, gamesPlayed, level, xp } = user;
  res.json({ name, email, wins, losses, gamesPlayed, level, xp });
});

// --- Game history endpoint ---
router.get('/games/:userId', auth, async (req, res) => {
  const db = await getDb();
  const games = db.collection('games');
  let userId = req.params.userId;
  if (userId === 'me') userId = req.user.id;
  // Find games where user is winner or in losers
  const query = {
    $or: [
      { 'winner.userId': userId },
      { 'losers.userId': userId }
    ]
  };
  const results = await games.find(query).sort({ timestamp: -1 }).limit(20).toArray();
  res.json(results);
});

function setWsRooms(obj) { wsRooms = obj; }
module.exports.setWsRooms = setWsRooms;

module.exports = router;
module.exports.getDb = getDb; 