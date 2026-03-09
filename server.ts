import { createServer } from "http";
import next from "next";
import { startTimerCompletionWorker } from "./src/lib/timer-completion-worker";
import { attachWebSocketServer } from "./src/lib/ws-hub";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const handleUpgrade = app.getUpgradeHandler();

    const server = createServer((req, res) => {
      handle(req, res);
    });

    attachWebSocketServer(server, { forwardUpgrade: handleUpgrade });

    server.listen(port, hostname, () => {
      console.log(`Magic Mirror app draait op http://${hostname}:${port}`);
      startTimerCompletionWorker();
    });
  })
  .catch((error) => {
    console.error("Kon server niet starten", error);
    process.exit(1);
  });
