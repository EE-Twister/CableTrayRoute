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
 * Authorization: when `validateUpgrade` returns an object instead of `true`
 * it is the connection's context, { username, owner, project?, canWrite }.
 * The room is then `owner/project` taken from the context (or from the join
 * message's projectId for ordinary sessions, always under the authenticated
 * owner), the display name is the context's username, and patches are refused
 * unless `canWrite` is true. A client can therefore never name another
 * owner's room. Without a validator the room is the client-supplied
 * projectId, which only unit tests and unauthenticated setups use.
 *
 * @param {import('http').Server} httpServer
 * @param {object} wss - WebSocketServer instance
 */
export function attachCollaborationServer(httpServer, wss, options = {}) {
  const validateUpgrade = typeof options.validateUpgrade === 'function' ? options.validateUpgrade : null;
  // Cap incoming frame size so an authenticated client cannot exhaust memory
  // (or amplify a broadcast) with an oversized patch payload.
  const maxMessageBytes = Number(options.maxMessageBytes) > 0 ? Number(options.maxMessageBytes) : 64 * 1024;
  // Per-connection message budget; a client that exceeds it is disconnected.
  const maxMessagesPerSecond = Number(options.maxMessagesPerSecond) > 0 ? Number(options.maxMessagesPerSecond) : 50;
  // roomKey → Set of { ws, username, displayId, canWrite }
  const rooms = new Map();
  // roomKey → monotonically increasing sequence counter
  const seqCounters = new Map();

  function broadcastPresence(roomKey) {
    const room = rooms.get(roomKey);
    if (!room) return;
    const users = [...room].map(c => c.username).filter(Boolean);
    const displayId = room.values().next().value?.displayId;
    const msg = JSON.stringify({ type: 'presence', projectId: displayId, users });
    for (const client of room) {
      if (client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(msg);
      }
    }
  }

  function broadcast(roomKey, senderWs, message) {
    const room = rooms.get(roomKey);
    if (!room) return;
    const msg = JSON.stringify(message);
    for (const client of room) {
      if (client.ws !== senderWs && client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(msg);
      }
    }
  }

  httpServer.on('upgrade', async (request, socket, head) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname !== '/ws/collab') {
      socket.destroy();
      return;
    }
    let context = null;
    if (validateUpgrade) {
      let result = false;
      try {
        result = await validateUpgrade(request);
      } catch {
        result = false;
      }
      if (!result) {
        socket.destroy();
        return;
      }
      if (typeof result === 'object') context = result;
    }
    request.collabContext = context;
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const context = request?.collabContext ?? null;
    let currentRoomKey = null;
    let currentDisplayId = null;
    let currentUsername = null;
    let windowStart = Date.now();
    let windowCount = 0;

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

    ws.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      if (windowCount > maxMessagesPerSecond) {
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
        if (typeof ws.close === 'function') ws.close(1008, 'Rate limit exceeded');
        return;
      }

      const size = typeof data === 'string' ? Buffer.byteLength(data) : (data?.length ?? 0);
      if (size > maxMessageBytes) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
        return;
      }
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
        const requestedProjectId = String(msg.projectId || '');
        if (requestedProjectId.length > 200) {
          currentRoomKey = null;
          currentDisplayId = null;
          currentUsername = null;
          ws.send(JSON.stringify({ type: 'error', message: 'Project ID too long' }));
          return;
        }
        currentDisplayId = context?.project ?? requestedProjectId;
        currentRoomKey = context ? `${context.owner}/${currentDisplayId}` : currentDisplayId;
        currentUsername = context
          ? String(context.username || 'Anonymous').slice(0, 100)
          : String(msg.username || 'Anonymous').slice(0, 100);
        if (!rooms.has(currentRoomKey)) rooms.set(currentRoomKey, new Set());
        if (!seqCounters.has(currentRoomKey)) seqCounters.set(currentRoomKey, 0);
        rooms.get(currentRoomKey).add({
          ws,
          username: currentUsername,
          displayId: currentDisplayId,
          canWrite: context ? context.canWrite === true : true,
        });
        // Send the current sequence to the joining client so it starts in sync
        ws.send(JSON.stringify({ type: 'sync', seq: seqCounters.get(currentRoomKey) }));
        broadcastPresence(currentRoomKey);
        return;
      }

      if (msg.type === 'leave') {
        removeFromRoom();
        currentRoomKey = null;
        currentDisplayId = null;
        currentUsername = null;
        return;
      }

      if (msg.type === 'patch') {
        if (!currentRoomKey) {
          ws.send(JSON.stringify({ type: 'error', message: 'Join a project first' }));
          return;
        }
        if (context && context.canWrite !== true) {
          ws.send(JSON.stringify({ type: 'error', message: 'Read-only access' }));
          return;
        }
        // Assign the next sequence number to this patch
        const seq = (seqCounters.get(currentRoomKey) || 0) + 1;
        seqCounters.set(currentRoomKey, seq);
        // Relay the patch with its sequence number to all other clients in the room
        broadcast(currentRoomKey, ws, {
          type: 'patch',
          projectId: currentDisplayId,
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
