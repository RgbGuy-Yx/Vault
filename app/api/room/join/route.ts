import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

type JoinBody = {
  roomId?: unknown;
};

type RoomState = {
  createdAt?: string;
  destroyed?: string;
};

const ROOM_TTL_MS = 10 * 60 * 1000;

function validateJoinBody(body: JoinBody): string | null {
  if (typeof body.roomId !== "string") {
    return null;
  }

  const roomId = body.roomId.trim();
  if (roomId.length !== 8) {
    return null;
  }

  return roomId;
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

    const roomId = validateJoinBody(body);
    if (!roomId) {
      return NextResponse.json(
        { error: "roomId must be a string of length 8" },
        { status: 400 },
      );
    }

    const room = await redis.hgetall<RoomState>(`room:${roomId}`);
    if (!room || Object.keys(room).length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.destroyed === "true") {
      return NextResponse.json({ error: "Room is destroyed" }, { status: 410 });
    }

    const createdAt = Number(room.createdAt);
    const expiresAt = Number.isFinite(createdAt) ? createdAt + ROOM_TTL_MS : null;
    if (!expiresAt || expiresAt <= Date.now()) {
      return NextResponse.json({ error: "Room expired" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, expiresAt });
  } catch (error) {
    console.error("Failed to join room", error);
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }
}
