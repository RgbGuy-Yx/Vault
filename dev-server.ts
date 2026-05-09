// MUST be first — loads .env into THIS process
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const nodeEnv = process.env.NODE_ENV ?? "development";
const envFiles = [
  `.env.${nodeEnv}.local`,
  ".env.local",
  `.env.${nodeEnv}`,
  ".env",
];

for (const envFile of envFiles) {
  const envPath = path.join(process.cwd(), envFile);
  if (!existsSync(envPath)) {
    continue;
  }

  // Load with first-win semantics so higher-priority files keep precedence.
  dotenv.config({ path: envPath, override: false });
}

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createProxyServer } from "http-proxy";

const hostname = process.env.HOST ?? "0.0.0.0";
const publicPort = Number(process.env.PORT ?? 3000);
const upstreamPort = Number(process.env.NEXT_DEV_PORT ?? 3001);
const upstreamHost = "127.0.0.1";
const upstreamTarget = `http://${upstreamHost}:${upstreamPort}`;

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const proxy = createProxyServer({
  changeOrigin: true,
  ws: true,
  target: upstreamTarget,
});

let wsHubPromise: Promise<typeof import("./lib/ws")> | null = null;

function getWsHub() {
  if (!wsHubPromise) {
    wsHubPromise = import("./lib/ws");
  }

  return wsHubPromise;
}

// 🚀 Start Next.js dev server
const devServer = spawn(
  process.execPath,
  [nextBin, "dev", "-p", String(upstreamPort), "-H", upstreamHost],
  {
    env: {
      ...process.env, // IMPORTANT: now includes dotenv vars
      NODE_ENV: "development",
      PORT: String(upstreamPort),
      HOST: hostname,
    },
    stdio: "inherit",
  },
);

devServer.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

// 🌐 Proxy HTTP requests to Next.js
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url?.includes("/api/ws/internal/destroy")) {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try {
        const { roomId } = JSON.parse(body);
        if (roomId) {
          void getWsHub().then(({ roomWsHub }) => roomWsHub.notifyRoomDestroyed(roomId));
        }
      } catch (err) {
        console.error("Internal destroy hook error", err);
      }
      res.statusCode = 200;
      res.end("OK");
    });
    return;
  }

  proxy.web(req, res, { target: upstreamTarget }, (error) => {
    console.error("Proxy request failed", error);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Next.js server unavailable");
      return;
    }
    res.destroy();
  });
});

// 🔌 Handle WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  console.log("UPGRADE INCOMING:", req.url);
  if (req.url?.includes("/api/ws")) {
    console.log("ROUTING TO WS HUB");
    void getWsHub()
      .then(({ roomWsHub }) => {
        roomWsHub.handleUpgrade(req, socket, head);
      })
      .catch((error) => {
        console.error("Failed to initialize WebSocket hub", error);
        socket.destroy();
      });
    return;
  }

  proxy.ws(req, socket, head, { target: upstreamTarget }, (error) => {
    console.error("Proxy WS failed", error);
    socket.destroy();
  });
});

// 🧹 Cleanup
const shutdown = () => {
  server.close();
  devServer.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${publicPort} is already in use. Stop the running process on ${publicPort} or run PORT=3002 npm run dev.`,
    );
    shutdown();
    process.exit(1);
    return;
  }

  console.error("Server failed to start", error);
  shutdown();
  process.exit(1);
});

server.listen(publicPort, hostname, () => {
  console.log(`Proxy ready at http://${hostname}:${publicPort}`);
});