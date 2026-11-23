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
 */
export function attachCollaborationServer(httpServer, wss, options = {}) {
  const validateUpgrade = typeof options.validateUpgrade === 'function' ? options.validateUpgrade : null;
  // Cap incoming frame size so an authenticated client cannot exhaust memory
  // (or amplify a broadcast) with an oversized patch payload.
  const maxMessageBytes = Number(options.maxMessageBytes) > 0 ? Number(options.maxMessageBytes) : 64 * 1024;
  // Authenticated rooms are scoped to the storage owner's account namespace.
  // The public protocol continues to use the unqualified projectId.
  const rooms = new Map();
  // projectId → monotonically increasing sequence counter
  const seqCounters = new Map();

  function closeClient(ws, code = 1011, reason = 'Message handling failed') {
    try { ws.close(code, reason); }
    catch { try { ws.terminate(); } catch { /* Transport is already unavailable. */ } }
  }

  function sendToClient(client, message) {
    if (!client.identity) {
      if (client.ws.readyState === 1) client.ws.send(message);
      return;
    }
    client.delivery = client.delivery.then(async () => {
      if (client.ws.readyState !== 1) return;
      if (!await client.identity.authorize()) {
        closeClient(client.ws, 1008, 'Session expired');
        return;
      }
      if (client.ws.readyState === 1) client.ws.send(message);
    }).catch(() => { closeClient(client.ws); });
  }

  function broadcastPresence(roomKey) {
    const room = rooms.get(roomKey);
    if (!room) return;
    const users = [...room].map(c => c.username).filter(Boolean);
    const projectId = room.values().next().value.projectId;
    const msg = JSON.stringify({ type: 'presence', projectId, users });
    for (const client of room) {
      sendToClient(client, msg);
    }
  }

  function broadcast(roomKey, senderWs, message) {
    const room = rooms.get(roomKey);
    if (!room) return;
    const msg = JSON.stringify(message);
    for (const client of room) {
      if (client.ws !== senderWs && client.ws.readyState === 1 /* OPEN */) {
        sendToClient(client, msg);
      }
    }
  }

  httpServer.on('upgrade', async (request, socket, head) => {
    let pathname;
    try { ({ pathname } = new URL(request.url, 'http://localhost')); }
    catch { socket.destroy(); return; }
    if (pathname !== '/ws/collab') {
      socket.destroy();
      return;
    }
    if (validateUpgrade) {
      let valid = false;
      try {
        valid = await validateUpgrade(request);
      } catch {
        valid = false;
      }
      if (!valid || typeof request.collaborationIdentity?.username !== 'string'
        || !request.collaborationIdentity.username
        || typeof request.collaborationIdentity.authorize !== 'function') {
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const identity = validateUpgrade ? request?.collaborationIdentity : null;
    if (validateUpgrade && !identity) {
      closeClient(ws, 1008, 'Authentication required');
      return;
    }
    let currentProjectId = null;
    let currentUsername = null;
    let currentRoomKey = null;
    let authorization = null;
    let incoming = Promise.resolve();
    let pendingMessages = 0;
    let closed = false;
    const client = { ws, identity, delivery: Promise.resolve(), username: null, projectId: null };
    const sendMessage = message => sendToClient(client, JSON.stringify(message));

    function removeFromRoom() {
      if (!currentRoomKey) return;
      const room = rooms.get(currentRoomKey);
      if (room) {
        room.forEach(c => { if (c.ws === ws) room.delete(c); });
        if (room.size === 0) {
          rooms.delete(currentRoomKey);
          seqCounters.delete(currentRoomKey);
        } else broadcastPresence(currentRoomKey);
      }
    }

    function handleMessage(data) {
      const size = typeof data === 'string' ? Buffer.byteLength(data) : (data?.length ?? 0);
      if (size > maxMessageBytes) {
        sendMessage({ type: 'error', message: 'Message too large' });
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendMessage({ type: 'error', message: 'Invalid JSON' });
        return;
      }

      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
        sendMessage({ type: 'error', message: 'Invalid message' });
        return;
      }

      if (msg.type === 'ping') {
        sendMessage({ type: 'pong' });
        return;
      }

      if (msg.type === 'join') {
        if (typeof msg.projectId !== 'string' || (msg.username !== undefined && typeof msg.username !== 'string')) {
          sendMessage({ type: 'error', message: 'Invalid join fields' });
          return;
        }
        const requestedProjectId = msg.projectId;
        if (requestedProjectId.length > 200) {
          sendMessage({ type: 'error', message: 'Project ID too long' });
          return;
        }
        const requestedUsername = identity ? identity.username : (msg.username || 'Anonymous').slice(0, 100);
        removeFromRoom();
        currentProjectId = requestedProjectId;
        currentUsername = requestedUsername;
        currentRoomKey = JSON.stringify([identity?.username || null, currentProjectId]);
        if (!rooms.has(currentRoomKey)) rooms.set(currentRoomKey, new Set());
        if (!seqCounters.has(currentRoomKey)) seqCounters.set(currentRoomKey, 0);
        client.username = currentUsername;
        client.projectId = currentProjectId;
        rooms.get(currentRoomKey).add(client);
        // Send the current sequence to the joining client so it starts in sync
        sendMessage({ type: 'sync', seq: seqCounters.get(currentRoomKey) });
        broadcastPresence(currentRoomKey);
        return;
      }

      if (msg.type === 'leave') {
        removeFromRoom();
        currentProjectId = null;
        currentUsername = null;
        currentRoomKey = null;
        return;
      }

      if (msg.type === 'patch') {
        if (identity && !authorization?.canWrite) {
          sendMessage({ type: 'error', message: 'Insufficient permissions' });
          return;
        }
        if (!currentProjectId) {
          sendMessage({ type: 'error', message: 'Join a project first' });
          return;
        }
        // Assign the next sequence number to this patch
        const seq = (seqCounters.get(currentRoomKey) || 0) + 1;
        seqCounters.set(currentRoomKey, seq);
        // Relay the patch with its sequence number to all other clients in the room
        broadcast(currentRoomKey, ws, {
          type: 'patch',
          projectId: currentProjectId,
          username: currentUsername,
          patch: msg.patch,
          seq,
        });
        // Acknowledge the sequence back to the sender
        sendMessage({ type: 'ack', seq });
        return;
      }
    }

    function failConnection() {
      // EventEmitter does not contain listener exceptions. Fail only this
      // connection if a protocol or transport operation unexpectedly throws.
      closeClient(ws);
    }

    ws.on('message', (data) => {
      if (!identity) {
        try { handleMessage(data); } catch { failConnection(); }
        return;
      }
      const size = typeof data === 'string' ? Buffer.byteLength(data) : (data?.length ?? 0);
      if (closed || size > maxMessageBytes || pendingMessages >= 32) {
        closeClient(ws, 1008, 'Message limit exceeded');
        return;
      }
      pendingMessages += 1;
      incoming = incoming.then(async () => {
        if (closed) return;
        authorization = await identity.authorize();
        if (closed) return;
        if (!authorization) {
          closeClient(ws, 1008, 'Session expired');
          return;
        }
        handleMessage(data);
      }).catch(failConnection).finally(() => { pendingMessages -= 1; });
    });

    ws.on('close', () => { closed = true; removeFromRoom(); });
    ws.on('error', () => { closed = true; removeFromRoom(); });
  });
}
