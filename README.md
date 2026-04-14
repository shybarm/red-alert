# Red Alert Foundation

Minimal runnable foundation for a browser-based single-player/co-op defense prototype.

## Stack
- Client: React + TypeScript + Vite + Phaser
- Multiplayer server: Node.js + Colyseus (authoritative simulation)

## Install
```bash
npm install
```

## Run
Use two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

- Client URL: `http://localhost:5173`
- Server URL: `http://localhost:2567`
- Server health check: `http://localhost:2567/health`

## Co-op test flow
1. Open two browser tabs/windows to `http://localhost:5173`.
2. Verify both clients join the same room (UI shows player count up to 2).
3. Click in each client to place/move that player's defender.
4. Verify both clients see the same missiles, drones, defenders, explosions, and city HP.
5. Verify threats move toward city with fixed camera view.
6. Verify city HP decreases when threats leak through.
7. Verify the room is authoritative (both clients show the same state progression).
