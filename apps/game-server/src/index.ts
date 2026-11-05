import { loadConfig } from "./config.js";
import { closeDb } from "./db.js";
import { log } from "./logger.js";
import { startGameServer } from "./server.js";

const config = loadConfig();
const { gameServer } = await startGameServer(config);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("shutting down", { signal });
  try {
    await gameServer.gracefullyShutdown(false);
  } finally {
    await closeDb();
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
