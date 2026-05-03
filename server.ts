import { createServer } from "node:http";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
let wsHubPromise: Promise<typeof import("./lib/ws")> | null = null;

function getWsHub() {
  if (!wsHubPromise) {
    wsHubPromise = import("./lib/ws");
  }

  return wsHubPromise;
}

void app.prepare().then(() => {
  const handleUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/ws")) {
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

    handleUpgrade(req, socket, head);
  });

  server.listen(port, hostname, () => {
    console.log(`Server ready at http://${hostname}:${port}`);
  });
});
