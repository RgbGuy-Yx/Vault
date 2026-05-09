import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { generateRoomCodeName } from "@/lib/name";

const ROOM_TTL_SECONDS = 600;

export async function POST() {
  try {
    const redis = getRedis();
    const createdAt = Date.now();
    let roomId = nanoid(8);
    let roomCode = generateRoomCodeName();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const roomCodeKey = `room-code:${roomCode}`;
      const existingRoomId = await redis.get<string>(roomCodeKey);
      if (!existingRoomId) {
        const roomKey = `room:${roomId}`;

        await redis
          .multi()
          .hset(roomKey, {
            createdAt: String(createdAt),
            destroyed: "false",
            roomName: roomCode,
          })
          .set(roomCodeKey, roomId)
          .expire(roomKey, ROOM_TTL_SECONDS)
          .expire(roomCodeKey, ROOM_TTL_SECONDS)
          .exec();

        return NextResponse.json({
          roomId,
          roomCode,
          expiresAt: createdAt + ROOM_TTL_SECONDS * 1000,
        });
      }

      roomId = nanoid(8);
      roomCode = generateRoomCodeName();
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
