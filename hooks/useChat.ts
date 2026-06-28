"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateParticipantName } from "@/lib/name";
import { encrypt, decrypt } from "@/lib/crypto";

const MAX_RECONNECT_ATTEMPTS = 5;
const CLIENT_ID_KEY = "chat_client_id";
const PARTICIPANT_NAME_KEY = "chat_participant_name";

export type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  at: number;
  type: "TEXT" | "GIF";
  mine?: boolean;
  system?: boolean;
};

export type RoomState = "checking" | "active" | "disconnected" | "expired" | "destroyed" | "invalid";
export type ConnectionState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "DESTROYED" | "EXPIRED" | "INVALID";

type ServerMessage =
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
    }
  | {
      type: "DESTROYED";
    }
  | {
      type: "EXPIRED";
    }
  | {
      type: "ERROR";
      message: string;
    };

type RoomStatusResponse = {
  roomId?: unknown;
  exists?: unknown;
  destroyed?: unknown;
  expiresAt?: unknown;
};

function formatStatus(roomState: RoomState, connectionState: ConnectionState, attempt: number) {
  if (roomState === "destroyed") return "Room destroyed";
  if (roomState === "expired") return "Room expired";
  if (roomState === "invalid") return "Invalid room link";
  if (connectionState === "RECONNECTING") return `Reconnecting ${attempt}/${MAX_RECONNECT_ATTEMPTS}`;
  if (connectionState === "DISCONNECTED") return "Disconnected";
  if (connectionState === "CONNECTING") return "Checking room...";
  return "Private room connected";
}

function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextClientId = window.crypto.randomUUID();
  window.sessionStorage.setItem(CLIENT_ID_KEY, nextClientId);
  return nextClientId;
}

function getOrCreateParticipantName(): string {
  if (typeof window === "undefined") {
    return "guest";
  }

  const existing = window.sessionStorage.getItem(PARTICIPANT_NAME_KEY);
  if (existing) {
    return existing;
  }

  const nextParticipantName = generateParticipantName();
  window.sessionStorage.setItem(PARTICIPANT_NAME_KEY, nextParticipantName);
  return nextParticipantName;
}

export function useChat(roomId: string, encryptionKey: CryptoKey | null = null) {
  const isInvalidRoom = roomId.length !== 8;
  const clientIdRef = useRef<string>(getOrCreateClientId());
  const guestNameRef = useRef("guest");
  const encryptionKeyRef = useRef<CryptoKey | null>(encryptionKey);
  const socketRef = useRef<WebSocket | null>(null);
  const closingRef = useRef(false);
  const terminalRef = useRef(isInvalidRoom);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectRef = useRef<(mode: "initial" | "reconnect") => Promise<void>>(async () => {});
  const joinedSystemMessageRef = useRef(false);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const activeRef = useRef(false);
  const connectIdRef = useRef(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomState, setRoomState] = useState<RoomState>(isInvalidRoom ? "invalid" : "checking");
  const [connectionState, setConnectionState] = useState<ConnectionState>(isInvalidRoom ? "INVALID" : "CONNECTING");
  const [statusText, setStatusText] = useState(isInvalidRoom ? "Invalid room link" : "Checking room...");
  const [guestName, setGuestName] = useState("guest");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    encryptionKeyRef.current = encryptionKey;
  }, [encryptionKey]);

  useEffect(() => {
    const nextGuestName = getOrCreateParticipantName();
    guestNameRef.current = nextGuestName;
    setGuestName(nextGuestName);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current === null) {
      return;
    }

    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const fetchRoomStatus = useCallback(async (): Promise<RoomStatusResponse | null> => {
    const response = await fetch(`/api/room/status?roomId=${encodeURIComponent(roomId)}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RoomStatusResponse;
  }, [roomId]);

  const closeSocket = useCallback((reason?: string) => {
    closingRef.current = true;
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socketRef.current = null;
    socket.close(1000, reason);
  }, []);

  const setTerminalState = useCallback(
    (nextState: Extract<RoomState, "expired" | "destroyed" | "invalid">) => {
      terminalRef.current = true;
      clearReconnectTimer();
      closeSocket(nextState === "destroyed" ? "Room destroyed" : nextState === "expired" ? "Room expired" : "Invalid room link");
      messageIdsRef.current.clear();
      setMessages([]);
      setExpiresAt(0);
      setRemainingMs(0);
      setRoomState(nextState);
      setConnectionState(
        nextState === "destroyed"
          ? "DESTROYED"
          : nextState === "expired"
            ? "EXPIRED"
            : "INVALID",
      );
      setStatusText(formatStatus(nextState, connectionState, reconnectAttemptsRef.current));
    },
    [clearReconnectTimer, closeSocket, connectionState],
  );

  const syncActiveFlags = useCallback((nextRoomState: RoomState, nextConnectionState: ConnectionState) => {
    activeRef.current = nextRoomState === "active";
    terminalRef.current = nextRoomState === "expired" || nextRoomState === "destroyed" || nextRoomState === "invalid";
    setRoomState(nextRoomState);
    setConnectionState(nextConnectionState);
    setStatusText(formatStatus(nextRoomState, nextConnectionState, reconnectAttemptsRef.current));
  }, []);

  const connect = useCallback(async (mode: "initial" | "reconnect") => {
    if (terminalRef.current) {
      return;
    }

    const currentConnectId = ++connectIdRef.current;
    closingRef.current = false;

    const nextConnectionState = mode === "initial" ? "CONNECTING" : "RECONNECTING";
    setConnectionState(nextConnectionState);
    setStatusText(formatStatus(roomState, nextConnectionState, reconnectAttemptsRef.current));

    try {
      const status = await fetchRoomStatus();

      if (currentConnectId !== connectIdRef.current || closingRef.current || terminalRef.current) {
        return;
      }

      if (!status || status.exists !== true) {
        setTerminalState("invalid");
        return;
      }

      if (status.destroyed === true) {
        setTerminalState("destroyed");
        return;
      }

      const nextExpiresAt =
        typeof status.expiresAt === "number" && Number.isFinite(status.expiresAt)
          ? status.expiresAt
          : null;

      if (!nextExpiresAt) {
        setTerminalState("invalid");
        return;
      }

      if (nextExpiresAt <= Date.now()) {
        setTerminalState("expired");
        return;
      }

      setExpiresAt(nextExpiresAt);
      setRemainingMs(Math.max(0, nextExpiresAt - Date.now()));
      reconnectAttemptsRef.current = 0;
      syncActiveFlags("active", "CONNECTING");

      const baseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 
        (`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`);
        
      if (socketRef.current) {
        socketRef.current.close(1000, "Replaced");
      }
      
      const socket = new WebSocket(
        `${baseUrl}/api/ws?roomId=${roomId}&clientId=${clientIdRef.current}`,
      );
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttemptsRef.current = 0;
        syncActiveFlags("active", "CONNECTED");
        setStatusText("Private room connected");
        if (!joinedSystemMessageRef.current) {
          joinedSystemMessageRef.current = true;
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: "System",
              body: `You joined as ${guestNameRef.current}.`,
              at: Date.now(),
              type: "TEXT",
              system: true,
            },
          ]);
        }
      });

      socket.addEventListener("message", (event) => {
        void (async () => {
          let payload: ServerMessage;

          try {
            payload = JSON.parse(event.data) as ServerMessage;
          } catch {
            return;
          }

          if (payload.type === "DESTROYED") {
            setTerminalState("destroyed");
            return;
          }

          if (payload.type === "EXPIRED") {
            setTerminalState("expired");
            return;
          }

          if (payload.type === "ERROR") {
            setStatusText(payload.message);
            window.setTimeout(() => {
              if (activeRef.current && !terminalRef.current) {
                setStatusText(formatStatus("active", socketRef.current?.readyState === WebSocket.OPEN ? "CONNECTED" : "DISCONNECTED", 0));
              }
            }, 3000);
            return;
          }

          if (payload.type === "MESSAGE" || payload.type === "GIF") {
            let body = payload.type === "MESSAGE" ? payload.text : payload.gifUrl;

            if (payload.type === "MESSAGE" && encryptionKeyRef.current) {
              try {
                body = await decrypt(encryptionKeyRef.current, body);
              } catch {
                body = "[encrypted — decryption failed]";
              }
            }

            if (messageIdsRef.current.has(payload.id)) {
              return;
            }
            messageIdsRef.current.add(payload.id);

            const mine = payload.name === guestNameRef.current;

            setMessages((prev) =>
              [
                ...prev,
                {
                  id: payload.id,
                  sender: mine ? "You" : payload.name,
                  body,
                  at: payload.timestamp,
                  type: (payload.type === "MESSAGE" ? "TEXT" : "GIF") as "TEXT" | "GIF",
                  mine,
                },
              ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
            );
          }
        })();
      });

      socket.addEventListener("close", (event) => {
        const isCurrentSocket = socketRef.current === socket;

        if (isCurrentSocket) {
          socketRef.current = null;
        }

        if (closingRef.current) {
          closingRef.current = false;
          return;
        }

        if (event.reason === "Room destroyed") {
          setTerminalState("destroyed");
          return;
        }

        if (event.reason === "Room expired") {
          setTerminalState("expired");
          return;
        }

        if (event.reason === "Replaced") {
          return;
        }

        // Prevent stale sockets from triggering a reconnect cascade
        // This handles cases where a proxy swallows the "Replaced" close reason
        if (!isCurrentSocket) {
          return;
        }

        if (!terminalRef.current) {
          reconnectAttemptsRef.current += 1;
          if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
            syncActiveFlags("disconnected", "DISCONNECTED");
            setStatusText("Disconnected");
            return;
          }

          syncActiveFlags("disconnected", "RECONNECTING");
          setStatusText(formatStatus("disconnected", "RECONNECTING", reconnectAttemptsRef.current));
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            void reconnectRef.current("reconnect");
          }, Math.min(500 * reconnectAttemptsRef.current, 3000));
        }
      });

      socket.addEventListener("error", () => {
        if (!terminalRef.current) {
          syncActiveFlags("disconnected", "DISCONNECTED");
          setStatusText("Disconnected");
        }
      });
    } catch {
      if (!terminalRef.current) {
        syncActiveFlags("disconnected", "DISCONNECTED");
        setStatusText("Disconnected");
      }
    }
  }, [fetchRoomStatus, roomId, roomState, setTerminalState, syncActiveFlags]);

  useEffect(() => {
    reconnectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (isInvalidRoom) {
      return;
    }

    void connect("initial");

    return () => {
      clearReconnectTimer();
      closeSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInvalidRoom, roomId]);

  useEffect(() => {
    if (roomState !== "active") {
      return;
    }

    const interval = window.setInterval(() => {
      const nextRemaining = Math.max(0, expiresAt - Date.now());
      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        setTerminalState("expired");
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [expiresAt, roomState, setTerminalState]);

  const sendMessage = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      const trimmed = text.trim();
      if (!trimmed || roomState !== "active" || connectionState !== "CONNECTED" || socket?.readyState !== WebSocket.OPEN) {
        return false;
      }

      const send = async () => {
        const key = encryptionKeyRef.current;
        const payload = key ? await encrypt(key, trimmed) : trimmed;
        socket.send(JSON.stringify({ type: "MESSAGE", text: payload, name: guestNameRef.current }));
      };
      void send();
      return true;
    },
    [connectionState, roomState],
  );

  const sendGif = useCallback(
    (gifUrl: string) => {
      const socket = socketRef.current;
      if (!gifUrl || roomState !== "active" || connectionState !== "CONNECTED" || socket?.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify({ type: "GIF", gifUrl, name: guestNameRef.current }));
      return true;
    },
    [connectionState, roomState],
  );

  const destroyRoom = useCallback(async () => {
    clearReconnectTimer();
    closeSocket("Room destroyed");
    syncActiveFlags("disconnected", "DISCONNECTED");
    setStatusText("Destroying room...");

    try {
      const res = await fetch("/api/room/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) {
        throw new Error("Failed to destroy room");
      }
      setTerminalState("destroyed");
    } catch {
      if (!terminalRef.current) {
        syncActiveFlags("disconnected", "DISCONNECTED");
        setStatusText("Disconnected");
      }
    }
  }, [clearReconnectTimer, closeSocket, roomId, setTerminalState, syncActiveFlags]);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    closeSocket("Disconnected");
    if (!terminalRef.current) {
      syncActiveFlags("disconnected", "DISCONNECTED");
      setStatusText("Disconnected");
    }
  }, [clearReconnectTimer, closeSocket, syncActiveFlags]);

  return {
    messages,
    roomState,
    connectionState,
    statusText,
    guestName,
    expiresAt,
    remainingMs,
    sendMessage,
    sendGif,
    destroyRoom,
    disconnect,
    setTerminalState,
  };
}
