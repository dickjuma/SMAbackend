const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserSession = require('../models/UserSession');

let ioInstance = null;
const userSockets = new Map(); // userId -> Set(socketId)
const socketSessions = new Map(); // socketId -> { userId, sessionId }

const getTokenFromHandshake = (socket) => {
  const authToken = socket?.handshake?.auth?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, '').trim();

  const header = socket?.handshake?.headers?.authorization || '';
  if (String(header).startsWith('Bearer ')) return String(header).slice(7).trim();

  const queryToken = socket?.handshake?.query?.token;
  if (queryToken) return String(queryToken).replace(/^Bearer\s+/i, '').trim();
  return '';
};

const setUserOnlineStatus = async (userId, status) => {
  if (!userId) return;
  await User.findByIdAndUpdate(userId, {
    $set: { onlineStatus: status, lastSeen: new Date() }
  });
};

const attachSocketForUser = (userId, socketId) => {
  const key = String(userId);
  const existing = userSockets.get(key) || new Set();
  existing.add(socketId);
  userSockets.set(key, existing);
};

const detachSocketForUser = (userId, socketId) => {
  const key = String(userId);
  const existing = userSockets.get(key);
  if (!existing) return 0;
  existing.delete(socketId);
  if (existing.size === 0) userSockets.delete(key);
  return existing.size;
};

const emitPresence = (payload) => {
  if (!ioInstance) return;
  ioInstance.emit('presence:update', payload);
};

const emitActivity = (payload) => {
  if (!ioInstance) return;
  ioInstance.emit('activity:new', payload);
};

const closeSession = async (socketId, reason = 'disconnect') => {
  const sessionMeta = socketSessions.get(socketId);
  if (!sessionMeta) return;

  const { userId, sessionId } = sessionMeta;
  socketSessions.delete(socketId);
  const activeCount = detachSocketForUser(userId, socketId);

  const disconnectedAt = new Date();
  const activeSession = await UserSession.findById(sessionId);
  if (activeSession) {
    const durationSeconds = Math.max(
      0,
      Math.round((disconnectedAt.getTime() - new Date(activeSession.connectedAt).getTime()) / 1000)
    );
    activeSession.disconnectedAt = disconnectedAt;
    activeSession.durationSeconds = durationSeconds;
    activeSession.status = 'ended';
    await activeSession.save();
  }

  if (activeCount === 0) {
    await setUserOnlineStatus(userId, 'offline');
    emitPresence({ userId: String(userId), onlineStatus: 'offline', lastSeen: disconnectedAt });
  } else {
    await setUserOnlineStatus(userId, 'online');
    emitPresence({ userId: String(userId), onlineStatus: 'online', lastSeen: disconnectedAt });
  }

};

const initializeRealtime = ({ server, corsOrigins = [] }) => {
  if (ioInstance) return ioInstance;

  ioInstance = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by socket CORS'));
      },
      credentials: true
    }
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token = getTokenFromHandshake(socket);
      if (!token) return next(new Error('Missing auth token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id name active role');
      if (!user || !user.active) return next(new Error('Invalid user'));
      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error('Unauthorized socket'));
    }
  });

  ioInstance.on('connection', async (socket) => {
    const user = socket.user;
    const userId = String(user._id);

    attachSocketForUser(userId, socket.id);
    await setUserOnlineStatus(userId, 'online');

    const session = await UserSession.create({
      user: user._id,
      socketId: socket.id,
      connectedAt: new Date(),
      status: 'active',
      source: 'websocket',
      ip: socket.handshake.address || '',
      userAgent: socket.handshake.headers?.['user-agent'] || ''
    });
    socketSessions.set(socket.id, { userId, sessionId: session._id });

    emitPresence({ userId, onlineStatus: 'online', lastSeen: new Date(), socketId: socket.id });
    socket.on('presence:ping', async () => {
      await setUserOnlineStatus(user._id, 'online');
      emitPresence({ userId, onlineStatus: 'online', lastSeen: new Date(), socketId: socket.id });
    });

    socket.on('disconnect', async (reason) => {
      await closeSession(socket.id, reason || 'disconnect');
    });
  });

  return ioInstance;
};

const getIO = () => ioInstance;

module.exports = {
  initializeRealtime,
  getIO,
  emitPresence,
  emitActivity
};
