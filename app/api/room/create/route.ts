import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const ROOM_TTL_SECONDS = 600;

export async function POST() {
  try {
    const redis = getRedis();
    const roomId = nanoid(8);
    const createdAt = Date.now();
    const roomKey = `room:${roomId}`;

    await redis
      .multi()
      .hset(roomKey, {
        createdAt: String(createdAt),
        destroyed: "false",
      })
      .expire(roomKey, ROOM_TTL_SECONDS)
      .exec();

    return NextResponse.json({
      roomId,
      expiresAt: createdAt + ROOM_TTL_SECONDS * 1000,
    });
  } catch (error) {
    console.error("Failed to create room", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 },
    );
  }
}
