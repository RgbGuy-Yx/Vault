import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { generateRoomCodeName } from "@/lib/name";

type JoinBody = {
  roomId?: unknown;
  roomCode?: unknown;
};

type RoomState = {
  createdAt?: string;
  destroyed?: string;
  roomName?: string;
};

const ROOM_TTL_MS = 10 * 60 * 1000;

function resolveJoinTarget(body: JoinBody): { roomId?: string; roomCode?: string } | null {
  if (typeof body.roomId === "string") {
    const roomId = body.roomId.trim();
    if (roomId.length === 8) {
      return { roomId };
    }
  }

  if (typeof body.roomCode === "string") {
    const roomCode = body.roomCode.trim();
    if (roomCode.length > 0) {
      return { roomCode };
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const redis = getRedis();
    let body: JoinBody;

    try {
      body = (await request.json()) as JoinBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const target = resolveJoinTarget(body);
    if (!target) {
      return NextResponse.json(
        { error: "roomCode must be provided" },
        { status: 400 },
      );
    }

    let roomId = target.roomId;
    if (!roomId && target.roomCode) {
      // Try lowercase for the pretty room name lookup (e.g. signal_1234)
      const mappedRoomId = await redis.get<string>(`room-code:${target.roomCode.toLowerCase()}`);
      if (mappedRoomId) {
        roomId = mappedRoomId;
      } else if (target.roomCode.length === 8) {
        // Fallback: the "code" provided might actually be a raw roomId (case sensitive)
        roomId = target.roomCode;
      } else {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
    }

    if (!roomId) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = await redis.hgetall<RoomState>(`room:${roomId}`);
    if (!room || Object.keys(room).length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (String(room.destroyed) === "true") {
      return NextResponse.json({ error: "Room is destroyed" }, { status: 410 });
    }

    const createdAt = Number(room.createdAt);
    const expiresAt = Number.isFinite(createdAt) ? createdAt + ROOM_TTL_MS : null;
    if (!expiresAt || expiresAt <= Date.now()) {
      return NextResponse.json({ error: "Room expired" }, { status: 404 });
    }

    const roomCode = room.roomName?.trim() || generateRoomCodeName();
    if (!room.roomName?.trim()) {
      await redis
        .multi()
        .hset(`room:${roomId}`, { roomName: roomCode })
        .set(`room-code:${roomCode}`, roomId)
        .expire(`room-code:${roomCode}`, ROOM_TTL_MS / 1000)
        .exec();
    }

    return NextResponse.json({ ok: true, expiresAt, roomId, roomCode });
  } catch (error) {
    console.error("Failed to join room", error);
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }
}
