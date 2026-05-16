/**
 * attachCollaborationServer — WebSocket collaboration room manager.
 *
 * Extracted to a standalone module so it can be unit-tested independently
 * of the Express server (server.mjs) which requires npm packages.
 *
 * Protocol (all messages are JSON):
 *   Client → Server:
 *     { type:'join',    projectId, username }
 *     { type:'leave',   projectId, username }
 *     { type:'patch',   projectId, username, patch }   // JSON Merge Patch
 *     { type:'ping' }
 *
 *   Server → Client(s):
 *     { type:'presence', projectId, users:[...] }
 *     { type:'patch',    projectId, username, patch }  // broadcast to others
 *     { type:'pong' }
 *     { type:'error',    message }
 *     { type:'sync',     seq }                         // sent to joining client
 *     { type:'ack',      seq }                         // sent to patch sender
 *
 * @param {import('http').Server} httpServer
 * @param {object} wss - WebSocketServer instance
 * @param {{
 *   sessionStore?: { get(token: string): Promise<object|null> },
 *   maxMessageBytes?: number
 * }} [options]
 */
export function attachCollaborationServer(httpServer, wss, options = {}) {
  const sessionStore = options.sessionStore;
  const maxMessageBytes = Number(options.maxMessageBytes) > 0 ? Number(options.maxMessageBytes) : 64 * 1024;
  // projectId → Set of { ws, username }
  const rooms = new Map();
  // projectId → monotonically increasing sequence counter
  const seqCounters = new Map();

  function broadcastPresence(projectId) {
    const room = rooms.get(projectId);
    if (!room) return;
    const users = [...room].map(c => c.username).filter(Boolean);
    const msg = JSON.stringify({ type: 'presence', projectId, users });
    for (const client of room) {
      if (client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(msg);
      }
    }
  }

  function broadcast(projectId, senderWs, message) {
    const room = rooms.get(projectId);
    if (!room) return;
    const msg = JSON.stringify(message);
    for (const client of room) {
      if (client.ws !== senderWs && client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(msg);
      }
    }
  }

  httpServer.on('upgrade', (request, socket, head) => {
    const upgradeUrl = new URL(request.url, 'http://localhost');
    const { pathname } = upgradeUrl;
    if (pathname !== '/ws/collab') {
      socket.destroy();
      return;
    }
    const completeUpgrade = (authSession = null) => {
      request.authSession = authSession;
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
      });
    };
    if (!sessionStore) {
      completeUpgrade();
      return;
    }
    const headers = request.headers || {};
    const originHeader = headers.origin;
    const hostHeader = headers.host;
    if (typeof originHeader !== 'string' || typeof hostHeader !== 'string') return socket.destroy();
    let originHost;
    try { originHost = new URL(originHeader).host; } catch { return socket.destroy(); }
    if (originHost !== hostHeader) return socket.destroy();
    const authHeader = headers.authorization;
    const [scheme, headerToken = ''] = String(authHeader || '').split(' ');
    const queryToken = upgradeUrl.searchParams.get('token') || '';
    const token = (scheme === 'Bearer' && headerToken) ? headerToken : queryToken;
    const csrfToken = headers['x-csrf-token'] || upgradeUrl.searchParams.get('csrfToken');
    if (!token || typeof csrfToken !== 'string') return socket.destroy();
    Promise.resolve(sessionStore.get(token)).then(session => {
      if (!session || csrfToken !== session.csrfToken) return socket.destroy();
      completeUpgrade(session);
    }).catch(() => socket.destroy());
  });

  wss.on('connection', (ws, request) => {
    const userFromSession = request?.authSession?.username;
    let currentProjectId = null;
    let currentUsername = String(userFromSession || 'Anonymous').slice(0, 100);

    function removeFromRoom() {
      if (!currentProjectId) return;
      const room = rooms.get(currentProjectId);
      if (room) {
        room.forEach(c => { if (c.ws === ws) room.delete(c); });
        if (room.size === 0) rooms.delete(currentProjectId);
        else broadcastPresence(currentProjectId);
      }
    }

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'join') {
        removeFromRoom();
        currentProjectId = String(msg.projectId || '');
        if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'projectId is required' }));
          return;
        }
        currentUsername = String(userFromSession || msg.username || 'Anonymous').slice(0, 100);
        if (!rooms.has(currentProjectId)) rooms.set(currentProjectId, new Set());
        if (!seqCounters.has(currentProjectId)) seqCounters.set(currentProjectId, 0);
        rooms.get(currentProjectId).add({ ws, username: currentUsername });
        // Send the current sequence to the joining client so it starts in sync
        ws.send(JSON.stringify({ type: 'sync', seq: seqCounters.get(currentProjectId) }));
        broadcastPresence(currentProjectId);
        return;
      }

      if (msg.type === 'leave') {
        removeFromRoom();
        currentProjectId = null;
        currentUsername = null;
        return;
      }

      if (msg.type === 'patch') {
        if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Join a project first' }));
          return;
        }
        if (Buffer.byteLength(JSON.stringify(msg.patch ?? null), 'utf8') > maxMessageBytes) {
          ws.send(JSON.stringify({ type: 'error', message: 'Patch too large' }));
          return;
        }
        // Assign the next sequence number to this patch
        const seq = (seqCounters.get(currentProjectId) || 0) + 1;
        seqCounters.set(currentProjectId, seq);
        // Relay the patch with its sequence number to all other clients in the room
        broadcast(currentProjectId, ws, {
          type: 'patch',
          projectId: currentProjectId,
          username: currentUsername,
          patch: msg.patch,
          seq,
        });
        // Acknowledge the sequence back to the sender
        ws.send(JSON.stringify({ type: 'ack', seq }));
        return;
      }
    });

    ws.on('close', removeFromRoom);
    ws.on('error', removeFromRoom);
  });
}
