import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const ROOM_TTL_SECONDS = 600;

export async function POST() {
  try {
    const redis = getRedis();
    const createdAt = Date.now();
    let roomId = nanoid(8);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const roomKey = `room:${roomId}`;
      const existingRoomId = await redis.exists(roomKey);

      if (!existingRoomId) {
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
      }

      roomId = nanoid(8);
    }

    return NextResponse.json(
      { error: "Failed to generate unique room code" },
      { status: 500 },
    );
  } catch (error) {
    console.error("Failed to create room", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 },
    );
  }
}
