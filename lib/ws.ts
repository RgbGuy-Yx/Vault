import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getRedis } from "./redis";

type BroadcastMessage =
  | {
      type: "MESSAGE";
      id: string;
      text: string;
      name: string;
      timestamp: number;
    }
  | {
      type: "GIF";
      id: string;
      gifUrl: string;
      name: string;
      timestamp: number;
    };

type ClientMessage =
  | {
      type: "MESSAGE";
      text: unknown;
      name: unknown;
    }
  | {
      type: "GIF";
      gifUrl: unknown;
      name: unknown;
    };

type DestroyedMessage = {
  type: "DESTROYED";
};

type ExpiredMessage = {
  type: "EXPIRED";
};

type ErrorMessage = {
  type: "ERROR";
  message: string;
};

type RoomState = {
  createdAt?: string;
  destroyed?: string;
  roomName?: string;
};

type RoomStatus = "active" | "destroyed" | "expired" | "missing";

type SocketEntry = {
  roomId: string;
  clientId: string;
};

class RoomWebSocketHub {
  private readonly roomClients = new Map<string, Map<string, WebSocket>>();
  private readonly socketRoom = new WeakMap<WebSocket, SocketEntry>();
  private readonly closedRooms = new Map<string, "destroyed" | "expired">();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private readonly messageSequences = new Map<string, number>();

  constructor(private readonly wss: WebSocketServer) {
    this.wss.on("connection", (socket, req) => {
      void this.handleConnection(socket, req);
    });
  }

  public handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
  }

  public notifyRoomDestroyed(roomId: string): void {
    this.closeRoom(roomId, "destroyed");
  }

  private notifyRoomExpired(roomId: string): void {
    this.closeRoom(roomId, "expired");
  }

  private async resolveRoomStatus(roomId: string): Promise<RoomStatus> {
    const closedReason = this.closedRooms.get(roomId);
    if (closedReason) {
      return closedReason;
    }

    const room = await this.getRoomState(roomId);
    if (!room) {
      return "missing";
    }

    if (String(room.destroyed) === "true") {
      return "destroyed";
    }

    const createdAt = Number(room.createdAt);
    if (!Number.isFinite(createdAt)) {
      return "missing";
    }

    const expiresAt = createdAt + 10 * 60 * 1000;
    if (expiresAt <= Date.now()) {
      return "expired";
    }

    return "active";
  }

  private closeRoom(roomId: string, reason: "destroyed" | "expired"): void {
    this.closedRooms.set(roomId, reason);
    this.clearExpiryTimer(roomId);
    this.messageSequences.delete(roomId);

    const clients = this.roomClients.get(roomId);
    if (!clients || clients.size === 0) {
      this.roomClients.delete(roomId);
      return;
    }

    const payload: DestroyedMessage | ExpiredMessage =
      reason === "destroyed" ? { type: "DESTROYED" } : { type: "EXPIRED" };
    for (const client of clients.values()) {
      this.safeSend(client, payload);
      this.socketRoom.delete(client);
      client.close(1000, reason === "destroyed" ? "Room destroyed" : "Room expired");
    }

    this.roomClients.delete(roomId);
  }

  private async handleConnection(socket: WebSocket, req: IncomingMessage) {
    console.log("WS CONNECTION ATTEMPT:", req.url);
    try {
      const connection = this.extractConnection(req.url ?? "");
      if (!connection) {
        this.safeSend(socket, { type: "ERROR", message: "Invalid roomId" });
        socket.close(1008, "Invalid roomId");
        return;
      }

      const { roomId, clientId } = connection;

      const messageQueue: string[] = [];
      let isReady = false;

      socket.on("message", (raw) => {
        if (!isReady) {
          messageQueue.push(raw.toString());
        } else {
          void this.handleClientMessage(socket, roomId, raw.toString());
        }
      });

      const closedReason = this.closedRooms.get(roomId);
      if (closedReason === "destroyed") {
        this.notifyRoomDestroyed(roomId);
        this.safeSend(socket, { type: "DESTROYED" });
        socket.close(1008, "Room destroyed");
        return;
      }

      if (closedReason === "expired") {
        this.notifyRoomExpired(roomId);
        this.safeSend(socket, { type: "EXPIRED" });
        socket.close(1008, "Room expired");
        return;
      }

      console.log("Fetching room state for", roomId);
      const room = await this.getRoomState(roomId);
      console.log("Got room state:", room);
      if (!room) {
        this.notifyRoomExpired(roomId);
        this.safeSend(socket, { type: "EXPIRED" });
        socket.close(1008, "Room expired");
        return;
      }

      this.scheduleRoomExpiry(roomId, room);
      this.addClient(roomId, clientId, socket);
      console.log("Added client", clientId, "to room", roomId);

      const postJoinStatus = await this.resolveRoomStatus(roomId);
      if (postJoinStatus === "destroyed") {
        this.notifyRoomDestroyed(roomId);
        this.safeSend(socket, { type: "DESTROYED" });
        this.removeClient(socket);
        socket.close(1008, "Room destroyed");
        return;
      }

      if (postJoinStatus === "expired" || postJoinStatus === "missing") {
        this.notifyRoomExpired(roomId);
        this.safeSend(socket, { type: "EXPIRED" });
        this.removeClient(socket);
        socket.close(1008, "Room expired");
        return;
      }

      isReady = true;
      for (const msg of messageQueue) {
        void this.handleClientMessage(socket, roomId, msg);
      }

      socket.on("close", () => {
        this.removeClient(socket);
      });

      socket.on("error", () => {
        this.removeClient(socket);
      });
    } catch (error) {
      console.error("Failed to establish WebSocket connection", error);
      this.safeSend(socket, {
        type: "ERROR",
        message: "Failed to establish WebSocket connection",
      });
      socket.close(1011, "WebSocket setup failed");
    }
  }

  private async handleClientMessage(
    socket: WebSocket,
    roomId: string,
    raw: string,
  ) {
    const entry = this.socketRoom.get(socket);
    if (!entry) return;

    const { clientId } = entry;
    console.log(`[BACKEND RECEIVE] Room: ${roomId}, Client: ${clientId}, Raw: ${raw}`);

    const redis = getRedis();

    // 1. Rate Limiting (max 5 msgs per 2 seconds)
    const rateKey = `ratelimit:${roomId}:${clientId}`;
    const count = await redis.incr(rateKey);
    if (count === 1) {
      await redis.expire(rateKey, 2);
    }

    if (count > 5) {
      this.safeSend(socket, {
        type: "ERROR",
        message: "You are sending messages too fast. Slow down!"
      });
      return;
    }

    // 2. Room Status Check
    const roomStatus = await this.resolveRoomStatus(roomId);
    if (roomStatus === "destroyed") {
      this.safeSend(socket, { type: "DESTROYED" });
      this.notifyRoomDestroyed(roomId);
      this.removeClient(socket);
      socket.close(1008, "Room destroyed");
      return;
    }

    if (roomStatus === "expired" || roomStatus === "missing") {
      this.safeSend(socket, { type: "EXPIRED" });
      this.notifyRoomExpired(roomId);
      this.removeClient(socket);
      socket.close(1008, "Room expired");
      return;
    }

    // 3. Message Validation
    const payload = this.parseClientMessage(raw);
    if (typeof payload === "string") {
      this.safeSend(socket, { type: "ERROR", message: `Parse Error: ${payload}` });
      return;
    }

    // Re-check Redis immediately before broadcasting
    const latestRoomStatus = await this.resolveRoomStatus(roomId);
    if (latestRoomStatus === "destroyed") {
      this.safeSend(socket, { type: "DESTROYED" });
      this.notifyRoomDestroyed(roomId);
      this.removeClient(socket);
      socket.close(1008, "Room destroyed");
      return;
    }

    if (latestRoomStatus === "expired" || latestRoomStatus === "missing") {
      this.safeSend(socket, { type: "EXPIRED" });
      this.notifyRoomExpired(roomId);
      this.removeClient(socket);
      socket.close(1008, "Room expired");
      return;
    }

    let outgoing: BroadcastMessage;
    
    if (payload.type === "MESSAGE") {
      outgoing = {
        type: "MESSAGE",
        id: this.nextMessageId(roomId),
        text: payload.text,
        name: payload.name,
        timestamp: Date.now(),
      };
    } else {
      outgoing = {
        type: "GIF",
        id: this.nextMessageId(roomId),
        gifUrl: payload.gifUrl,
        name: payload.name,
        timestamp: Date.now(),
      };
    }

    this.broadcast(roomId, outgoing);
  }

  private broadcast(roomId: string, payload: BroadcastMessage) {
    const clients = this.roomClients.get(roomId);
    if (!clients || clients.size === 0) {
      this.roomClients.delete(roomId);
      return;
    }

    console.log(`[BACKEND BROADCAST] Room: ${roomId}, Message ID: ${payload.id}, To ${clients.size} clients`);

    for (const client of clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        this.safeSend(client, payload);
      } else {
        this.removeClient(client);
      }
    }
  }

  private addClient(roomId: string, clientId: string, socket: WebSocket) {
    const clients = this.roomClients.get(roomId) ?? new Map<string, WebSocket>();
    const existingSocket = clients.get(clientId);
    if (existingSocket && existingSocket !== socket) {
      this.socketRoom.delete(existingSocket);
      existingSocket.close(1000, "Replaced");
    }

    clients.set(clientId, socket);
    this.roomClients.set(roomId, clients);
    this.socketRoom.set(socket, { roomId, clientId });
  }

  private removeClient(socket: WebSocket) {
    const entry = this.socketRoom.get(socket);
    if (!entry) {
      return;
    }

    const clients = this.roomClients.get(entry.roomId);
    if (!clients) {
      this.socketRoom.delete(socket);
      return;
    }

    const currentSocket = clients.get(entry.clientId);
    if (currentSocket === socket) {
      clients.delete(entry.clientId);
    }
    this.socketRoom.delete(socket);

    if (clients.size === 0) {
      this.roomClients.delete(entry.roomId);
    }
  }

  private scheduleRoomExpiry(roomId: string, room: RoomState) {
    if (this.expiryTimers.has(roomId)) {
      return;
    }

    const createdAt = Number(room.createdAt);
    if (!Number.isFinite(createdAt)) {
      return;
    }

    const expiresAt = createdAt + 10 * 60 * 1000;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      this.notifyRoomExpired(roomId);
      return;
    }

    const timer = setTimeout(() => {
      this.notifyRoomExpired(roomId);
    }, delay);

    this.expiryTimers.set(roomId, timer);
  }

  private clearExpiryTimer(roomId: string) {
    const timer = this.expiryTimers.get(roomId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.expiryTimers.delete(roomId);
  }

  private extractRoomId(requestUrl: string): string | null {
    const url = new URL(requestUrl, "http://localhost");
    const roomId = url.searchParams.get("roomId")?.trim();

    if (!roomId || roomId.length !== 8) {
      return null;
    }

    return roomId;
  }

  private extractConnection(requestUrl: string): { roomId: string; clientId: string } | null {
    const url = new URL(requestUrl, "http://localhost");
    const roomId = url.searchParams.get("roomId")?.trim();
    const clientId = url.searchParams.get("clientId")?.trim();

    if (!roomId || roomId.length !== 8) {
      return null;
    }

    if (!clientId || clientId.length === 0) {
      return null;
    }

    return { roomId, clientId };
  }

  private parseClientMessage(raw: string): { type: "MESSAGE"; text: string; name: string } | { type: "GIF"; gifUrl: string; name: string } | string {
    try {
      const parsed = JSON.parse(raw) as ClientMessage;

      if (parsed.type === "MESSAGE") {
        if (typeof parsed.text !== "string" || typeof parsed.name !== "string") {
          return "Invalid MESSAGE fields";
        }
        const text = parsed.text.trim();
        const name = parsed.name.trim();

        if (text.length === 0 || text.length > 1000 || name.length === 0 || name.length > 64) {
          return "MESSAGE length limits exceeded";
        }

        return { type: "MESSAGE", text, name };
      } else if (parsed.type === "GIF") {
        if (typeof parsed.gifUrl !== "string") {
          return "GIF URL must be a string";
        }
        if (typeof parsed.name !== "string") {
          return "Name must be a string";
        }
        const gifUrl = parsed.gifUrl.trim();
        const name = parsed.name.trim();
        
        if (!gifUrl.startsWith("http")) {
            return "GIF URL must start with http";
        }
        if (gifUrl.length > 2000) {
            return "GIF URL exceeds 2000 chars";
        }
        if (name.length === 0 || name.length > 64) {
            return "Invalid name length";
        }

        return { type: "GIF", gifUrl, name };
      }

      return "Unknown payload type";
    } catch {
      return "JSON Parse error";
    }
  }

  private async getRoomState(roomId: string): Promise<RoomState | null> {
    const redis = getRedis();
    const room = await redis.hgetall<RoomState>(`room:${roomId}`);
    if (!room || Object.keys(room).length === 0) {
      return null;
    }

    return room;
  }

  private nextMessageId(roomId: string): string {
    const nextSequence = (this.messageSequences.get(roomId) ?? 0) + 1;
    this.messageSequences.set(roomId, nextSequence);
    return `${roomId}:${Date.now()}:${nextSequence}`;
  }

  private safeSend(
    client: WebSocket,
    payload: BroadcastMessage | DestroyedMessage | ExpiredMessage | ErrorMessage,
  ) {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify(payload));
  }
}

declare global {
  var __roomWsHub__: RoomWebSocketHub | undefined;
}

function getHubInstance(): RoomWebSocketHub {
  if (globalThis.__roomWsHub__) {
    return globalThis.__roomWsHub__;
  }

  const wss = new WebSocketServer({ noServer: true });
  const hub = new RoomWebSocketHub(wss);

  globalThis.__roomWsHub__ = hub;

  return hub;
}

export const roomWsHub = getHubInstance();

export function notifyRoomDestroyed(roomId: string) {
  roomWsHub.notifyRoomDestroyed(roomId);
}
