import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getRedis } from "./redis";

type BroadcastMessage = {
  type: "MESSAGE";
  id: string;
  text: string;
  name: string;
  timestamp: number;
};

type ClientMessage = {
  type: "MESSAGE";
  text: unknown;
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
};

class RoomWebSocketHub {
  private readonly roomClients = new Map<string, Set<WebSocket>>();
  private readonly socketRoom = new WeakMap<WebSocket, string>();
  private readonly closedRooms = new Map<string, "destroyed" | "expired">();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private messageSequence = 0;

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

  private closeRoom(roomId: string, reason: "destroyed" | "expired"): void {
    this.closedRooms.set(roomId, reason);
    this.clearExpiryTimer(roomId);

    const clients = this.roomClients.get(roomId);
    if (!clients || clients.size === 0) {
      this.roomClients.delete(roomId);
      return;
    }

    const payload: DestroyedMessage | ExpiredMessage =
      reason === "destroyed" ? { type: "DESTROYED" } : { type: "EXPIRED" };
    for (const client of clients) {
      this.safeSend(client, payload);
      this.socketRoom.delete(client);
      client.close(1000, reason === "destroyed" ? "Room destroyed" : "Room expired");
    }

    this.roomClients.delete(roomId);
  }

  private async handleConnection(socket: WebSocket, req: IncomingMessage) {
    try {
      const roomId = this.extractRoomId(req.url ?? "");
      if (!roomId) {
        this.safeSend(socket, { type: "ERROR", message: "Invalid roomId" });
        socket.close(1008, "Invalid roomId");
        return;
      }

      const closedReason = this.closedRooms.get(roomId);
      if (closedReason) {
        this.safeSend(
          socket,
          closedReason === "destroyed" ? { type: "DESTROYED" } : { type: "EXPIRED" },
        );
        socket.close(1008, "Room unavailable");
        return;
      }

      const room = await this.getRoomState(roomId);
      if (!room) {
        this.notifyRoomExpired(roomId);
        this.safeSend(socket, { type: "EXPIRED" });
        socket.close(1008, "Room expired");
        return;
      }

      if (room.destroyed === "true") {
        this.notifyRoomDestroyed(roomId);
        this.safeSend(socket, { type: "DESTROYED" });
        socket.close(1008, "Room unavailable");
        return;
      }

      this.scheduleRoomExpiry(roomId, room);
      this.addClient(roomId, socket);

      socket.on("message", (raw) => {
        void this.handleClientMessage(socket, roomId, raw.toString());
      });

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
    const payload = this.parseClientMessage(raw);
    if (!payload) {
      this.safeSend(socket, {
        type: "ERROR",
        message: "Invalid message payload",
      });
      return;
    }

    const closedReason = this.closedRooms.get(roomId);
    if (closedReason) {
      this.safeSend(socket, closedReason === "destroyed" ? { type: "DESTROYED" } : { type: "EXPIRED" });
      socket.close(1008, "Room closed");
      return;
    }

    // One Redis call per user message to detect TTL expiry or room destruction.
    const room = await this.getRoomState(roomId);
    if (!room) {
      this.notifyRoomExpired(roomId);
      return;
    }

    if (room.destroyed === "true") {
      this.safeSend(socket, { type: "DESTROYED" });
      this.notifyRoomDestroyed(roomId);
      return;
    }

    if (this.closedRooms.has(roomId)) {
      return;
    }

    const outgoing: BroadcastMessage = {
      type: "MESSAGE",
      id: this.nextMessageId(roomId),
      text: payload.text,
      name: payload.name,
      timestamp: Date.now(),
    };

    this.broadcast(roomId, outgoing);
  }

  private broadcast(roomId: string, payload: BroadcastMessage) {
    const clients = this.roomClients.get(roomId);
    if (!clients || clients.size === 0) {
      this.roomClients.delete(roomId);
      return;
    }

    for (const client of clients) {
      this.safeSend(client, payload);
    }
  }

  private addClient(roomId: string, socket: WebSocket) {
    const clients = this.roomClients.get(roomId) ?? new Set<WebSocket>();
    clients.add(socket);
    this.roomClients.set(roomId, clients);
    this.socketRoom.set(socket, roomId);
  }

  private removeClient(socket: WebSocket) {
    const roomId = this.socketRoom.get(socket);
    if (!roomId) {
      return;
    }

    const clients = this.roomClients.get(roomId);
    if (!clients) {
      this.socketRoom.delete(socket);
      return;
    }

    clients.delete(socket);
    this.socketRoom.delete(socket);

    if (clients.size === 0) {
      this.roomClients.delete(roomId);
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

  private parseClientMessage(raw: string): { text: string; name: string } | null {
    try {
      const parsed = JSON.parse(raw) as ClientMessage;

      if (parsed.type !== "MESSAGE") {
        return null;
      }

      if (typeof parsed.text !== "string" || typeof parsed.name !== "string") {
        return null;
      }

      const text = parsed.text.trim();
      const name = parsed.name.trim();

      if (text.length === 0 || name.length === 0) {
        return null;
      }

      return { text, name };
    } catch {
      return null;
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
    this.messageSequence += 1;
    return `${roomId}:${Date.now()}:${this.messageSequence}`;
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
