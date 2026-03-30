import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { Room } from 'colyseus.js';

type SharedState = {
  cityHp: number;
  connectedPlayers: number;
  threats: Array<{ id: string; kind: 'missile' | 'drone'; x: number; y: number }>;
  defenders: Record<string, { id: string; ownerSessionId: string; x: number; y: number }>;
};

class BattlefieldScene extends Phaser.Scene {
  private readonly cityPos = new Phaser.Math.Vector2(480, 320);
  private room: Room | null;

  private cityHpText!: Phaser.GameObjects.Text;
  private playersText!: Phaser.GameObjects.Text;
  private myPlayerText!: Phaser.GameObjects.Text;

  private threatViews = new Map<string, Phaser.GameObjects.Shape>();
  private defenderViews = new Map<string, Phaser.GameObjects.Rectangle>();

  constructor(room: Room | null) {
    super('BattlefieldScene');
    this.room = room;
  }

  create() {
    this.cameras.main.setBackgroundColor('#1c2420');
    this.cameras.main.setZoom(1);

    this.drawIsometricGround();
    this.drawStaticBattlefield();
    this.bindInput();
    this.bindRoomMessages();
  }

  update() {
    if (!this.room || !this.room.state) return;
    this.syncFromState(this.room.state as SharedState);
  }

  private drawStaticBattlefield() {
    const city = this.add.rectangle(this.cityPos.x, this.cityPos.y, 180, 120, 0x46565b).setStrokeStyle(2, 0xa4b7bc);
    this.add.text(city.x - 50, city.y - 8, 'CITY', { color: '#dce8ea' });

    this.cityHpText = this.add.text(16, 16, 'City HP: --', { color: '#e9f5ea', fontSize: '20px' }).setDepth(20);
    this.playersText = this.add.text(16, 44, 'Players: --/2', { color: '#d9f0df', fontSize: '16px' }).setDepth(20);
    this.myPlayerText = this.add.text(16, 66, 'Click to place/move your defender', {
      color: '#c7d6cb',
      fontSize: '14px'
    });
  }

  private bindInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.room) return;

      const action = this.hasMyDefender() ? 'move_defender' : 'place_defender';
      this.room.send(action, {
        x: pointer.worldX,
        y: pointer.worldY
      });
    });
  }

  private bindRoomMessages() {
    if (!this.room) return;

    this.room.onMessage('explosion', (payload: { x: number; y: number; color: number }) => {
      this.createExplosion(payload.x, payload.y, payload.color);
    });

    this.room.onMessage('city_lost', () => {
      this.add
        .text(this.cityPos.x - 90, this.cityPos.y - 110, 'CITY LOST', { color: '#ff8787', fontSize: '32px' })
        .setDepth(30);
    });
  }

  private syncFromState(state: SharedState) {
    this.cityHpText.setText(`City HP: ${state.cityHp}`);
    this.playersText.setText(`Players: ${state.connectedPlayers}/2`);

    const incomingThreatIds = new Set(state.threats.map((threat) => threat.id));
    for (const threat of state.threats) {
      let view = this.threatViews.get(threat.id);
      if (!view) {
        view =
          threat.kind === 'missile'
            ? this.add.rectangle(threat.x, threat.y, 10, 26, 0xff6b6b).setAngle(45)
            : this.add.ellipse(threat.x, threat.y, 28, 18, 0x74c0fc);
        this.threatViews.set(threat.id, view);
      }
      view.x = threat.x;
      view.y = threat.y;
    }

    for (const [id, view] of this.threatViews) {
      if (!incomingThreatIds.has(id)) {
        view.destroy();
        this.threatViews.delete(id);
      }
    }

    const defenders = Object.values(state.defenders || {});
    const incomingDefenderIds = new Set(defenders.map((def) => def.id));

    for (const def of defenders) {
      let view = this.defenderViews.get(def.id);
      if (!view) {
        const isMine = this.room?.sessionId === def.ownerSessionId;
        view = this.add
          .rectangle(def.x, def.y, 24, 24, isMine ? 0x6ecb63 : 0x99e9f2)
          .setStrokeStyle(2, isMine ? 0x2b8a3e : 0x1c7ed6);
        this.defenderViews.set(def.id, view);
      }

      view.x = def.x;
      view.y = def.y;
    }

    for (const [id, view] of this.defenderViews) {
      if (!incomingDefenderIds.has(id)) {
        view.destroy();
        this.defenderViews.delete(id);
      }
    }
  }

  private hasMyDefender() {
    const defenders = (this.room?.state as SharedState | undefined)?.defenders ?? {};
    return Object.values(defenders).some((def) => def.ownerSessionId === this.room?.sessionId);
  }

  private createExplosion(x: number, y: number, color: number) {
    const burst = this.add.circle(x, y, 8, color, 0.9).setDepth(25);
    this.tweens.add({
      targets: burst,
      radius: 34,
      alpha: 0,
      duration: 280,
      onComplete: () => burst.destroy()
    });
  }

  private drawIsometricGround() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x3f5248, 0.8);

    const tileW = 80;
    const tileH = 40;
    const originX = 480;
    const originY = 140;

    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const x = originX + (c - r) * (tileW / 2);
        const y = originY + (c + r) * (tileH / 2);
        const fill = (r + c) % 2 === 0 ? 0x2f3c36 : 0x34443d;

        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + tileW / 2, y + tileH / 2);
        g.lineTo(x, y + tileH);
        g.lineTo(x - tileW / 2, y + tileH / 2);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
  }
}

type BattlefieldGameProps = {
  room: Room | null;
};

export function BattlefieldGame({ room }: BattlefieldGameProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 960,
      height: 540,
      scene: [new BattlefieldScene(room)],
      render: {
        pixelArt: false,
        antialias: true
      }
    });

    return () => {
      game.destroy(true);
    };
  }, [room]);

  return <div className="game-root" ref={hostRef} />;
}
