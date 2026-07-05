import { WebSocketServer, WebSocket } from 'ws';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { JWT_SECRET } from "@repo/backend-common/config";
import { PrismaClient } from "@prisma/client";
import { Shape } from './types';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const wss = new WebSocketServer({ port: 8080 });

interface User {
  ws: WebSocket;
  rooms: Set<number>; 
  userId: string;
}

const users: Map<WebSocket, User> = new Map();
const roomStates: Map<number, Shape[]> = new Map();
const userNameCache: Map<string, string> = new Map();

async function getUserName(userId: string): Promise<string> {
  const cached = userNameCache.get(userId);
  if (cached) return cached;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const name = user?.name ?? "Unknown";
  userNameCache.set(userId, name);
  return name;
}


function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return typeof decoded === 'object' && decoded.userId ? decoded.userId : null;
  } catch {
    return null;
  }
}

async function getOrLoadRoomState(roomId: number): Promise<Shape[]> {
  if (roomStates.has(roomId)) {
    return roomStates.get(roomId)!;
  }
  
  console.log(`Cache miss for room ${roomId}. Loading from database...`);
  const messages = await prisma.chat.findMany({ where: { roomId }, orderBy: { id: 'asc' } });
  
  const shapes: Shape[] = messages.map(msg => {
    try { 
      const parsed = JSON.parse(msg.message);
      return parsed.shape;
    } 
    catch { return null; }
  }).filter((s): s is Shape => s !== null && s.id && s.type);

  roomStates.set(roomId, shapes);
  return shapes;
}

wss.on('connection', function connection(ws, request) {
  const url = request.url;
  if (!url) { ws.close(1008, 'URL not provided'); return; }

  const queryParams = new URLSearchParams(url.split('?')[1]);
  const token = queryParams.get('token');
  if (!token) { ws.close(1008, 'Token not provided'); return; }
  
  const userId = checkUser(token);
  if (!userId) { ws.close(1008, 'Invalid token'); return; }

  const user: User = { userId, rooms: new Set(), ws };
  users.set(ws, user);
  console.log(`User ${userId} connected. Total users: ${users.size}`);

  ws.on('message', async function message(raw) {
    let parsedData;
    try {
        parsedData = JSON.parse(raw.toString());
    } catch {
        console.error("Received invalid JSON from user:", userId);
        return;
    }

    const roomId = parseInt(parsedData.roomId, 10);
    if (isNaN(roomId)) return;

    const currentRoomState = await getOrLoadRoomState(roomId);

    switch (parsedData.type) {
      case 'join_room':
        user.rooms.add(roomId);
        console.log(`User ${user.userId} joined room ${roomId}`);
        break;

      case 'chat': { 
        const newShape = JSON.parse(parsedData.message).shape as Shape;
        if (!newShape || !newShape.id) break;

        currentRoomState.push(newShape);

        users.forEach((client, clientWs) => {
          if (client.rooms.has(roomId)) {
            clientWs.send(raw.toString());
          }
        });

        prisma.chat.create({
          data: { roomId, message: parsedData.message, userId }
        }).catch(e => console.error("DB create failed:", e));
        break;
      }

      case 'delete_shapes': {
        const idsToDelete = new Set<string>(parsedData.payload.ids);
        if (idsToDelete.size === 0) break;


        const newState = currentRoomState.filter(s => !idsToDelete.has(s.id));
        roomStates.set(roomId, newState);

        users.forEach((client, clientWs) => {
          if (client.rooms.has(roomId)) {
            clientWs.send(raw.toString());
          }
        });

        prisma.chat.findMany({ where: { roomId } })
          .then(messages => {
            const messageIdsToDelete = messages
              .filter(msg => {
                try {
                  const shapeId = JSON.parse(msg.message)?.shape?.id;
                  return shapeId && idsToDelete.has(shapeId);
                } catch { return false; }
              })
              .map(msg => msg.id);
            
            if (messageIdsToDelete.length > 0) {
              return prisma.chat.deleteMany({ where: { id: { in: messageIdsToDelete } } });
            }
          })
          .then((result) => {
            if (result) {
              console.log(`DB deleted ${result.count} shapes for room ${roomId}`)
            }
          })
          .catch(e => console.error("DB delete failed:", e));
        break;
      }
      case 'text_message': {
  const text = typeof parsedData.message === 'string' ? parsedData.message.trim() : '';
  if (!text) break;

  const senderName = await getUserName(userId);
  const outgoing = JSON.stringify({
    type: 'text_message',
    roomId,
    userId,
    senderName,
    message: text,
    createdAt: new Date().toISOString()
  });

  users.forEach((client, clientWs) => {
    if (client.rooms.has(roomId)) {
      clientWs.send(outgoing);
    }
  });

 prisma.textMessage.create({
          data: { roomId, userId, message: text }
        }).catch(e => console.error("Text message DB save failed:", e));
        break;
      }

      case 'cursor_move': {
        const x = typeof parsedData.x === 'number' ? parsedData.x : null;
        const y = typeof parsedData.y === 'number' ? parsedData.y : null;
        if (x === null || y === null) break;

        const senderName = await getUserName(userId);
        const outgoing = JSON.stringify({
          type: 'cursor_move',
          roomId,
          userId,
          senderName,
          x,
          y
        });

        users.forEach((client, clientWs) => {
          if (clientWs !== ws && client.rooms.has(roomId)) {
            clientWs.send(outgoing);
          }
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    const user = users.get(ws);
    if (user) {
        console.log(`User ${user.userId} disconnected.`);

        user.rooms.forEach(roomId => {
          const outgoing = JSON.stringify({ type: 'user_left', roomId, userId: user.userId });
          users.forEach((client, clientWs) => {
            if (clientWs !== ws && client.rooms.has(roomId)) {
              clientWs.send(outgoing);
            }
          });
        });

        users.delete(ws);
    }
  });
});

console.log('WebSocket server started on port 8080');