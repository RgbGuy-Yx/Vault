import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { notifyRoomDestroyed } from "@/lib/ws";

type DestroyBody = {
  roomId?: unknown;
};

type RoomState = {
  createdAt?: string;
  destroyed?: string;
};

const DESTROY_TOMBSTONE_SECONDS = 600;

function validateDestroyBody(body: DestroyBody): string | null {
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
    let body: DestroyBody;

    try {
      body = (await request.json()) as DestroyBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const roomId = validateDestroyBody(body);
    if (!roomId) {
      return NextResponse.json(
        { error: "roomId must be a string of length 8" },
        { status: 400 },
      );
    }

    const room = await redis.hgetall<RoomState>(`room:${roomId}`);
    if (!room || Object.keys(room).length === 0) {
      notifyRoomDestroyed(roomId);
      return NextResponse.json({ ok: true });
    }

    if (room.destroyed === "true") {
      notifyRoomDestroyed(roomId);
      return NextResponse.json({ ok: true });
    }

    const roomKey = `room:${roomId}`;
    const messagesKey = `room:${roomId}:messages`;
    const usersKey = `room:${roomId}:users`;

    notifyRoomDestroyed(roomId);

    await redis
      .multi()
      .hset(roomKey, { destroyed: "true" })
      .expire(roomKey, DESTROY_TOMBSTONE_SECONDS)
      .del(messagesKey, usersKey)
      .exec();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to destroy room", error);
    return NextResponse.json(
      { error: "Failed to destroy room" },
      { status: 500 },
    );
  }
}
