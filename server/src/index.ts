import http from 'node:http';
import express from 'express';
import { Server, Room, Client } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

const CITY_X = 480;
const CITY_Y = 320;

class Threat extends Schema {
  @type('string') id = '';
  @type('string') kind: 'missile' | 'drone' = 'missile';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') speed = 0;
  @type('number') damage = 0;
}

class Defender extends Schema {
  @type('string') id = '';
  @type('string') ownerSessionId = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') cooldownMs = 0;
}

class BattlefieldState extends Schema {
  @type('number') cityHp = 100;
  @type('number') connectedPlayers = 0;
  @type([Threat]) threats = new ArraySchema<Threat>();
  @type({ map: Defender }) defenders = new MapSchema<Defender>();
}

class BattlefieldRoom extends Room<BattlefieldState> {
  maxClients = 2;
  private nextThreatId = 1;

  onCreate() {
    this.setState(new BattlefieldState());

    this.spawnThreat('missile', 80, 100);
    this.spawnThreat('drone', 840, 120);

    this.onMessage('place_defender', (client, payload: { x: number; y: number }) => {
      this.upsertDefender(client, payload.x, payload.y);
    });

    this.onMessage('move_defender', (client, payload: { x: number; y: number }) => {
      this.upsertDefender(client, payload.x, payload.y);
    });

    this.setSimulationInterval((deltaTime) => this.tick(deltaTime), 50);

    this.clock.setInterval(() => {
      const side = Math.random() < 0.5 ? 'left' : 'right';
      if (side === 'left') {
        this.spawnThreat('missile', 70, this.randomInt(80, 220));
      } else {
        this.spawnThreat('drone', 860, this.randomInt(90, 230));
      }
    }, 2200);
  }

  onJoin(client: Client) {
    this.state.connectedPlayers = this.clients.length;

    if (!this.state.defenders[client.sessionId]) {
      const offset = this.clients.length === 1 ? -35 : 35;
      this.upsertDefender(client, 390 + offset, 380);
    }
  }

  onLeave(client: Client) {
    delete this.state.defenders[client.sessionId];
    this.state.connectedPlayers = this.clients.length;
  }

  private upsertDefender(client: Client, x: number, y: number) {
    const clampedX = PhaserMath.clamp(x, 120, 840);
    const clampedY = PhaserMath.clamp(y, 130, 500);

    let defender = this.state.defenders[client.sessionId];
    if (!defender) {
      defender = new Defender();
      defender.id = `defender-${client.sessionId.slice(0, 5)}`;
      defender.ownerSessionId = client.sessionId;
      defender.cooldownMs = 0;
      this.state.defenders[client.sessionId] = defender;
    }

    defender.x = clampedX;
    defender.y = clampedY;
  }

  private tick(deltaTime: number) {
    this.updateThreats(deltaTime);
    this.runDefenderInterception(deltaTime);
  }

  private updateThreats(deltaTime: number) {
    const dt = deltaTime;

    for (const threat of [...this.state.threats]) {
      const dx = CITY_X - threat.x;
      const dy = CITY_Y - threat.y;
      const distance = Math.hypot(dx, dy) || 1;

      threat.x += (dx / distance) * threat.speed * dt;
      threat.y += (dy / distance) * threat.speed * dt;

      if (Math.hypot(CITY_X - threat.x, CITY_Y - threat.y) < 48) {
        this.state.cityHp = Math.max(0, this.state.cityHp - threat.damage);
        this.broadcast('explosion', { x: threat.x, y: threat.y, color: 0xff6b6b });
        this.removeThreat(threat.id);

        if (this.state.cityHp === 0) {
          this.broadcast('city_lost', {});
          this.lock();
        }
      }
    }
  }

  private runDefenderInterception(deltaTime: number) {
    for (const defender of Object.values(this.state.defenders)) {
      defender.cooldownMs = Math.max(0, defender.cooldownMs - deltaTime);
      if (defender.cooldownMs > 0) continue;

      let nearest: Threat | undefined;
      let nearestDistance = 280;

      for (const threat of this.state.threats) {
        const d = Math.hypot(threat.x - defender.x, threat.y - defender.y);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = threat;
        }
      }

      if (!nearest) continue;

      defender.cooldownMs = 550;
      this.broadcast('explosion', { x: nearest.x, y: nearest.y, color: 0xffb347 });
      this.removeThreat(nearest.id);
    }
  }

  private removeThreat(threatId: string) {
    const index = this.state.threats.findIndex((threat) => threat.id === threatId);
    if (index >= 0) {
      this.state.threats.splice(index, 1);
    }
  }

  private spawnThreat(kind: 'missile' | 'drone', x: number, y: number) {
    const threat = new Threat();
    threat.id = `threat-${this.nextThreatId}`;
    this.nextThreatId += 1;
    threat.kind = kind;
    threat.x = x;
    threat.y = y;
    threat.speed = kind === 'missile' ? 0.07 : 0.05;
    threat.damage = kind === 'missile' ? 12 : 8;

    this.state.threats.push(threat);
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

const PhaserMath = {
  clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
};

const app = express();
app.use('/monitor', monitor());
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const gameServer = new Server({ server });

gameServer.define('battlefield', BattlefieldRoom);

const port = Number(process.env.PORT ?? 2567);
server.listen(port, () => {
  console.log(`Colyseus server listening on http://localhost:${port}`);
});
