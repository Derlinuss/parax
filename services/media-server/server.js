const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { WebSocketServer, WebSocket } = require("ws");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Map of active rooms -> Map of peerId -> client metadata & socket
// roomCode -> Map<peerId, { socket, userId, userName, streamTypes: Set<string> }>
const rooms = new Map();

// Health check endpoint
app.get("/health", (_req, res) => {
  let totalPeers = 0;
  for (const roomPeers of rooms.values()) {
    totalPeers += roomPeers.size;
  }

  res.json({
    status: "ok",
    service: "parax-media-server",
    activeRooms: rooms.size,
    connectedPeers: totalPeers,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// GET active rooms summary
app.get("/api/rooms", (_req, res) => {
  const roomSummary = [];
  for (const [roomCode, peers] of rooms.entries()) {
    const peerList = Array.from(peers.values()).map((p) => ({
      peerId: p.peerId,
      userId: p.userId,
      userName: p.userName,
      streamTypes: Array.from(p.streamTypes),
    }));

    roomSummary.push({
      roomCode,
      peerCount: peers.size,
      peers: peerList,
    });
  }

  res.json({ count: roomSummary.length, rooms: roomSummary });
});

// Broadcast helper: send message to all peers in a room except the sender
function broadcastToRoom(roomCode, messageObj, excludePeerId = null) {
  const roomPeers = rooms.get(roomCode);
  if (!roomPeers) return;

  const payload = JSON.stringify(messageObj);
  for (const [peerId, client] of roomPeers.entries()) {
    if (peerId !== excludePeerId && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  }
}

// WebSocket Signaling Handler
wss.on("connection", (ws, req) => {
  let currentRoom = null;
  let currentPeerId = null;

  ws.on("message", (rawMsg) => {
    try {
      const data = JSON.parse(rawMsg.toString());
      const { type, roomCode, peerId, userId, userName, streamType, targetPeerId, signalData } = data;

      switch (type) {
        // Peer joins a media room (camera / screen share)
        case "join-room": {
          if (!roomCode || !peerId) return;

          currentRoom = roomCode;
          currentPeerId = peerId;

          if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Map());
          }

          const roomPeers = rooms.get(roomCode);

          // Get existing peers before adding current
          const existingPeers = Array.from(roomPeers.values()).map((p) => ({
            peerId: p.peerId,
            userId: p.userId,
            userName: p.userName,
            streamTypes: Array.from(p.streamTypes),
          }));

          // Add or update peer
          const streamTypes = new Set(streamType ? [streamType] : ["camera"]);
          roomPeers.set(peerId, {
            socket: ws,
            peerId,
            userId: userId || peerId,
            userName: userName || "User",
            streamTypes,
          });

          // Confirm join to caller with list of current peers
          ws.send(
            JSON.stringify({
              type: "joined-room",
              roomCode,
              peerId,
              existingPeers,
            })
          );

          // Notify existing peers that a new peer arrived
          broadcastToRoom(
            roomCode,
            {
              type: "peer-joined",
              peerId,
              userId: userId || peerId,
              userName: userName || "User",
              streamTypes: Array.from(streamTypes),
            },
            peerId
          );

          console.log(`[Media] Peer ${peerId} (${userName}) joined room ${roomCode}`);
          break;
        }

        // WebRTC Signaling message relay (offer, answer, ICE candidates)
        case "signal": {
          if (!currentRoom || !targetPeerId || !signalData) return;

          const roomPeers = rooms.get(currentRoom);
          if (roomPeers && roomPeers.has(targetPeerId)) {
            const target = roomPeers.get(targetPeerId);
            if (target.socket.readyState === WebSocket.OPEN) {
              target.socket.send(
                JSON.stringify({
                  type: "signal",
                  fromPeerId: currentPeerId,
                  signalData,
                })
              );
            }
          }
          break;
        }

        // Update active stream types (e.g. started screen share or turned camera on/off)
        case "update-stream": {
          if (!currentRoom || !currentPeerId) return;
          const roomPeers = rooms.get(currentRoom);
          if (roomPeers && roomPeers.has(currentPeerId)) {
            const peerInfo = roomPeers.get(currentPeerId);
            if (data.action === "add") {
              peerInfo.streamTypes.add(streamType);
            } else if (data.action === "remove") {
              peerInfo.streamTypes.delete(streamType);
            }

            broadcastToRoom(
              currentRoom,
              {
                type: "peer-stream-updated",
                peerId: currentPeerId,
                streamTypes: Array.from(peerInfo.streamTypes),
              },
              currentPeerId
            );
          }
          break;
        }

        // Peer leaves gracefully
        case "leave-room": {
          handlePeerDisconnect(currentRoom, currentPeerId);
          currentRoom = null;
          currentPeerId = null;
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error("[Media WS Error]:", err.message);
    }
  });

  ws.on("close", () => {
    handlePeerDisconnect(currentRoom, currentPeerId);
  });

  ws.on("error", (err) => {
    console.error("[Media WS Socket Error]:", err.message);
    handlePeerDisconnect(currentRoom, currentPeerId);
  });
});

function handlePeerDisconnect(roomCode, peerId) {
  if (!roomCode || !peerId) return;

  const roomPeers = rooms.get(roomCode);
  if (roomPeers) {
    roomPeers.delete(peerId);
    console.log(`[Media] Peer ${peerId} left room ${roomCode}`);

    if (roomPeers.size === 0) {
      rooms.delete(roomCode);
    } else {
      broadcastToRoom(roomCode, {
        type: "peer-left",
        peerId,
      });
    }
  }
}

server.listen(PORT, () => {
  console.log(`[Fly.io Media Server] Running on port ${PORT}`);
});
