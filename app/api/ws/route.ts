import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "WebSocket upgrade expected at /api/ws?roomId=XXXXXXXX. Use ws:// connection.",
    },
    { status: 426 },
  );
}