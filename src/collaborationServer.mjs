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
export function attachCollaborationServer(httpServer, wss) {
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
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname !== '/ws/collab') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    let currentProjectId = null;
    let currentUsername = null;

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
        currentUsername = String(msg.username || 'Anonymous').slice(0, 100);
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
