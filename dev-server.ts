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

import { roomWsHub } from "./lib/ws";

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
  if (req.url?.startsWith("/api/ws")) {
    roomWsHub.handleUpgrade(req, socket, head);
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