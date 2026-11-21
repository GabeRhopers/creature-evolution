import Phaser from 'phaser';
import type { SwimIntent } from '../entities/Fish';
import type { Creature } from '../ai/Brain';
import type { FoodItem } from '../entities/Food';
import type { GameScene } from '../scenes/GameScene';

/**
 * Automated playtester (dev tool). Enable with `?bot=1` in the URL.
 * Plays like a careful human: flees threats (toward kelp when possible),
 * rests to digest when it is safe, swallows the best fish it can reach,
 * bites wounded or slightly bigger fish when strong, and grazes otherwise.
 * GameScene records metrics in `window.__playtest` for balance tuning.
 */
export class PlayerBot {
  private target: Creature | null = null;
  private food: FoodItem | null = null;
  private wantEat = false;
  private wanderX = 0;
  private wanderY = 0;
  private rethink = 0;

  constructor(private g: GameScene) {}

  wantsSwallow(): boolean {
    return this.wantEat;
  }

  read(dt: number): SwimIntent {
    const g = this.g;
    const p = g.player;
    this.wantEat = false;
    this.rethink -= dt;

    // 1. Threats: anything that can swallow us, or big aggressive biters.
    let threat: Creature | null = null;
    let threatD = Infinity;
    for (const c of g.creatures) {
      if (c.isPlayer) continue;
      const f = c.fish;
      const d = Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y);
      const danger = f.canSwallow(p.size) || (f.species.behavior.aggression >= 0.5 && f.rank >= p.rank * 1.25);
      if (danger && d < 520 && d < threatD) {
        threat = c;
        threatD = d;
      }
    }
    if (threat) {
      if (g.playerHidden && threatD > p.size * 4) return { dirX: 0, dirY: 0, strength: 0, sprint: false };
      const kelp = this.nearestKelp(700);
      let dx = p.x - threat.fish.x;
      let dy = p.y - threat.fish.y;
      if (kelp) {
        dx = kelp.centerX - p.x + dx * 0.3;
        dy = kelp.centerY - p.y + dy * 0.3;
      }
      // Fight back with a bite if cornered and it is close and not much bigger.
      if (threatD < p.size * 2.2 && !threat.fish.canSwallow(p.size)) this.wantEat = true;
      return { dirX: dx, dirY: dy, strength: 1, sprint: threatD < 320 };
    }

    // 2. Digest when ready and nothing scary nearby.
    if (g.stomach.readyToDigest) return { dirX: 0, dirY: 0, strength: 0, sprint: false };

    // 3. Pick prey or food.
    if (this.rethink <= 0) {
      this.rethink = 0.4;
      this.pickTarget();
    }
    if (this.target && this.target.fish.active) {
      const t = this.target.fish;
      const m = p.mouthPoint();
      const d = Phaser.Math.Distance.Between(m.x, m.y, t.x, t.y);
      if (d < p.mouthRadius(true) + t.size) this.wantEat = true;
      const v = t.arcadeBody.velocity;
      return { dirX: t.x + v.x * 0.25 - p.x, dirY: t.y + v.y * 0.25 - p.y, strength: 1, sprint: d < 260 && p.stamina > 40 };
    }
    if (this.food && this.food.alive) {
      return { dirX: this.food.img.x - p.x, dirY: this.food.img.y - p.y, strength: 0.8, sprint: false };
    }

    // 4. Wander.
    if (Phaser.Math.Distance.Between(p.x, p.y, this.wanderX, this.wanderY) < 80 || this.wanderX === 0) {
      const a = g.swimArea;
      this.wanderX = Phaser.Math.Between(a.left + 300, a.right - 300);
      // Stay in the shallows while small; go deeper as we grow (like a careful player).
      const depthLimit = Phaser.Math.Clamp(0.25 + (g.player.level - 1) * 0.04, 0.25, 1);
      this.wanderY = Phaser.Math.Between(a.top + 100, a.top + (a.height - 200) * depthLimit);
    }
    return { dirX: this.wanderX - p.x, dirY: this.wanderY - p.y, strength: 0.7, sprint: false };
  }

  private pickTarget(): void {
    const g = this.g;
    const p = g.player;
    this.target = null;
    this.food = null;
    if (g.stomach.full) return;
    let best = -Infinity;
    for (const c of g.creatures) {
      if (c.isPlayer) continue;
      const f = c.fish;
      const d = Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y);
      if (d > 650) continue;
      const swallow = p.canSwallow(f.size);
      const bite = !swallow && (f.wounded || f.rank <= p.rank * 1.1) && p.hp > p.maxHp * 0.5;
      if (!swallow && !bite) continue;
      const value = f.species.xpValue * f.level * (swallow ? 1 : 0.5);
      const score = value - d * 0.08;
      if (score > best) {
        best = score;
        this.target = c;
      }
    }
    if (this.target) return;
    let bd = 900;
    for (const f of g.food.items) {
      if (!p.canSwallow(f.size)) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, f.img.x, f.img.y);
      if (d < bd) {
        bd = d;
        this.food = f;
      }
    }
  }

  private nearestKelp(range: number): Phaser.Geom.Rectangle | null {
    const p = this.g.player;
    let best: Phaser.Geom.Rectangle | null = null;
    let bd = range;
    for (const z of this.g.kelpZones) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, z.centerX, z.centerY);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }
}
