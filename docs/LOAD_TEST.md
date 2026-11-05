# Load test results — world zones

Script: [`tests/load/zone-load.mjs`](../tests/load/zone-load.mjs) — real `@colyseus/sdk` WebSocket clients join a zone through normal matchmaking with real world grants and database profiles. Each client walks continuously (move message every 80 ms = 12.5 Hz, like the browser), pings every second. Raw JSON: `tests/load/results/`.

```bash
pnpm db:up && pnpm db:seed
node tests/load/zone-load.mjs --clients 30 --seconds 30            # starts its own game server on :2599
node tests/load/zone-load.mjs --clients 30 --url ws://host:2567    # against a running server
```

## Measured (2026-11-05)

Environment: Windows 11, Node 24, **game server and all clients on the same machine** (development laptop), PostgreSQL in Docker. Zone: `central_plaza` (maxPlayers 30). 30 s of continuous movement.

| Clients | Instances       | Join p50 / p95 (ms) | Ping RTT p50 / p95 / max (ms) | State patches per client per s (min / avg) | Server CPU (% of one core) | Server RSS end |
| ------- | --------------- | ------------------- | ----------------------------- | ------------------------------------------ | -------------------------- | -------------- |
| 20      | 1               | 13.5 / 73.8         | 1.0 / 1.7 / 2.2               | 12.6 / 12.6                                | 3.5 %                      | 96 MB          |
| 30      | 1               | 14.3 / 43.4         | 1.2 / 2.4 / 3.3               | 13.0 / 13.0                                | 5.3 %                      | 85 MB          |
| 45      | **2** (sharded) | 16.5 / 40.4         | 1.6 / 2.9 / 4.0               | 12.2 / 12.9                                | 7.3 %                      | 85 MB          |

Readings:

- The 20–30 player target per instance is met on the **server** side with large headroom on this machine; the cap is enforced and a 31st player is placed in a new instance.
- Patch rate is ~13/s rather than the configured 20 Hz because patches are only sent when state changed during a tick window; every client received every movement update stream continuously.

## Not yet measured (known constraints)

- **Client FPS on real phones** with 20–30 visible avatars. The in-app stats overlay (Settings → Show performance stats: FPS, draw calls, heap) exists for this, but no device-lab run has been done. Headless test browsers use a software renderer and are not representative.
- **Network latency**: all numbers above are loopback. Real-world RTT will be dominated by the network, not the server.
- **Multi-process scaling**: one game-server process. Horizontal scaling needs Colyseus Redis presence/driver (Redis is already in docker-compose) and a load balancer — not implemented.
- Each avatar is ~35 meshes (procedural); at 30 avatars the scene is several hundred draw calls. Instancing or merged GLB avatars are the next optimisation if device tests show it is needed.
