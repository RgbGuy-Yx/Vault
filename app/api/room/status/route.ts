import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

type RoomState = {
  createdAt?: string;
  destroyed?: string;
};

const ROOM_TTL_MS = 10 * 60 * 1000;

function resolveRoomId(request: NextRequest): string | null {
  const roomId = request.nextUrl.searchParams.get("roomId")?.trim();
  if (!roomId || roomId.length !== 8) {
    return null;
  }

  return roomId;
}

export async function GET(request: NextRequest) {
  try {
    const roomId = resolveRoomId(request);
    if (!roomId) {
      return NextResponse.json(
        { error: "roomId must be a string of length 8" },
        { status: 400 },
      );
    }

    const redis = getRedis();
    const room = await redis.hgetall<RoomState>(`room:${roomId}`);

    if (!room || Object.keys(room).length === 0) {
      return NextResponse.json(
        {
          roomId,
          exists: false,
          destroyed: false,
          expiresAt: null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const createdAt = Number(room.createdAt);
    const expiresAt = Number.isFinite(createdAt) ? createdAt + ROOM_TTL_MS : null;
    const destroyed = String(room.destroyed) === "true";

    return NextResponse.json(
      {
        roomId,
        exists: true,
        destroyed,
        expiresAt,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch room status", error);
    return NextResponse.json(
      { error: "Failed to fetch room status" },
      { status: 500 },
    );
  }
}