// Gates between regions: draws each wall (and its copy across the loop's seam), keeps the player out
// until it breaks, counts bites or rams once the Tide's Checkpoint Crab is beaten, shows cracks,
// and breaks it with a burst and a banner. Rules live in src/systems/gates.ts; numbers in balance.json "gates".
import Phaser from 'phaser';
import { BALANCE } from '../data';
import type { Fish } from '../entities/Fish';
import { canBreak, crackStage, loopDx, pushOut, type GateDef, type GatesConfig, type GateStyle } from '../systems/gates';
import { C, add, bayer, canvas, px, rng } from '../systems/worldTextures';

/** What the gates need from the game scene (kept small on purpose). */
export interface GateHost {
  scene: Phaser.Scene;
  player: () => Fish;
  /** Level of the last Checkpoint Crab beaten this run. */
  crabLevel: () => number;
  /** True while the player presses EAT (bite). */
  biting: () => boolean;
  groundAt: (x: number) => number;
  surfaceY: number;
  burst: (x: number, y: number, size: number) => void;
  popup: (text: string, x: number, y: number, big: boolean, color?: string) => void;
  banner: (title: string, line: string) => void;
  sfx: { bite: () => void; stun: () => void; levelUp: () => void; kill: () => void };
  /** Called when a gate breaks (the save is written right away). */
  opened: (id: string) => void;
}

interface GateState {
  def: GateDef;
  open: boolean;
  hits: number;
  cooldown: number;
  images: Phaser.GameObjects.Image[];
  cracks: Phaser.GameObjects.Image[];
  top: number;
  bottom: number;
}

const P = 4; // world px per art px

export class GateSystem {
  readonly cfg: GatesConfig;
  readonly gates: GateState[] = [];
  private msgTimer = 0;

  constructor(private host: GateHost, opened: string[]) {
    this.cfg = (BALANCE as unknown as { gates: GatesConfig }).gates;
    const W = BALANCE.world.width;
    for (const def of this.cfg.list) {
      const st: GateState = { def, open: opened.includes(def.id), hits: 0, cooldown: 0, images: [], cracks: [], top: 0, bottom: 0 };
      this.gates.push(st);
      if (st.open) continue;
      // From a little above the surface down into the ground.
      st.top = host.surfaceY - 60;
      st.bottom = Math.max(host.groundAt(def.x - this.cfg.thickness / 2), host.groundAt(def.x + this.cfg.thickness / 2)) + 40;
      const cols = Math.round(this.cfg.thickness / P);
      const rows = Math.ceil((st.bottom - st.top) / P);
      const key = `w_gate_${def.id}`;
      makeGate(host.scene, key, def.style, cols, rows, Math.floor((host.surfaceY - st.top) / P), 300 + def.x);
      for (let s = 1; s <= 3; s++) makeCracks(host.scene, `${key}_crack${s}`, def.style, cols, rows, s, 400 + def.x);
      // The wall, plus a copy past the far edge when it sits near the loop's seam.
      const O = BALANCE.world.loopOverlap;
      const xs = [def.x];
      if (def.x < O) xs.push(def.x + W);
      if (def.x > W - O) xs.push(def.x - W);
      for (const x of xs) {
        st.images.push(host.scene.add.image(x, st.top, key).setOrigin(0.5, 0).setScale(P).setDepth(-15));
        st.cracks.push(host.scene.add.image(x, st.top, `${key}_crack1`).setOrigin(0.5, 0).setScale(P).setDepth(-14).setVisible(false));
      }
    }
  }

  /** Ids of the gates broken so far (saved with the run). */
  openIds(): string[] {
    return this.gates.filter((g) => g.open).map((g) => g.def.id);
  }

  isOpen(id: string): boolean {
    return !!this.gates.find((g) => g.def.id === id)?.open;
  }

  /** Open every gate at once, quietly (tests and developer tools). */
  openAll(): void {
    for (const g of this.gates) {
      g.open = true;
      for (const img of [...g.images, ...g.cracks]) img.destroy();
      g.images = [];
      g.cracks = [];
    }
  }

  /** Every frame, after the player moved: keep them out of closed gates, count hits. */
  update(dt: number): void {
    this.msgTimer = Math.max(0, this.msgTimer - dt);
    const p = this.host.player();
    const W = BALANCE.world.width;
    const half = this.cfg.thickness / 2;
    for (const g of this.gates) {
      if (g.open) continue;
      g.cooldown = Math.max(0, g.cooldown - dt);
      const may = canBreak(g.def, this.host.crabLevel());
      // Bite gates: EAT with your mouth at the wall.
      if (g.def.action === 'bite') {
        const m = p.mouthPoint();
        if (Math.abs(loopDx(m.x, g.def.x, W)) < half + p.mouthRadius(true) && this.host.biting() && p.biteCooldown <= 0 && !p.stunned) {
          p.biteCooldown = BALANCE.combat.biteCooldown;
          p.playBite();
          if (may) this.hit(g, m.x, m.y);
          else this.notYet(g, p);
        }
      }
      // Walls are solid for the player until they break (fish slip through gaps).
      const out = pushOut(p.x, p.size * 0.8, g.def.x, half, W, p.arcadeBody.velocity.x);
      if (!out) continue;
      const into = -out.side * p.lastVx; // speed aimed at the wall
      p.x = out.x;
      const body = p.arcadeBody;
      if (body.velocity.x * out.side < 0) body.velocity.x = 0;
      if (g.def.action === 'ram') {
        const ram = p.dashing || into > p.cruiseSpeed * this.cfg.ramSpeedRatio;
        if (ram && g.cooldown <= 0) {
          body.velocity.x = out.side * this.cfg.bounce;
          if (may) this.hit(g, g.def.x + loopDx(p.x, g.def.x, W) - out.side * half, p.y);
          else {
            this.host.sfx.stun();
            this.notYet(g, p);
          }
          g.cooldown = this.cfg.hitCooldown;
        } else if (!may) this.notYet(g, p);
      } else if (!may) this.notYet(g, p);
    }
  }

  private notYet(g: GateState, p: Fish): void {
    if (this.msgTimer > 0) return;
    this.msgTimer = this.cfg.messageSeconds;
    const verb = g.def.action === 'bite' ? 'bite through' : 'ram';
    this.host.popup(`Beat the level ${g.def.crab} Checkpoint Crab to ${verb} the ${g.def.name}`, p.x, p.y - p.size * 2, true, '#fee761');
  }

  private hit(g: GateState, x: number, y: number): void {
    g.hits++;
    g.cooldown = this.cfg.hitCooldown;
    this.host.burst(x, y, 40);
    if (g.def.action === 'bite') this.host.sfx.bite();
    else this.host.sfx.stun();
    this.host.scene.cameras.main.shake(140, 0.005);
    if (g.hits >= g.def.hits) {
      this.breakGate(g);
      return;
    }
    const stage = crackStage(g.hits, g.def.hits);
    for (const c of g.cracks) c.setTexture(`w_gate_${g.def.id}_crack${stage}`).setVisible(true);
    this.host.popup(`${g.hits} / ${g.def.hits}`, x, y - 40, false, '#ffffff');
  }

  private breakGate(g: GateState): void {
    g.open = true;
    for (const img of [...g.images, ...g.cracks]) {
      // A burst all the way down the wall, then it is gone.
      for (let y = g.top + 80; y < g.bottom; y += 220) this.host.burst(img.x, y, 60);
      img.destroy();
    }
    g.images = [];
    g.cracks = [];
    this.host.scene.cameras.main.shake(400, 0.01);
    this.host.sfx.kill();
    this.host.sfx.levelUp();
    this.host.banner(`THE ${g.def.name.toUpperCase()} BREAKS!`, `The ${g.def.opens} is open`);
    this.host.opened(g.def.id);
  }
}

// ---------------------------------------------------------------- pixel art (Endesga 32, 1 px per art px)

/** The wall: a tangle of mangrove roots, a fall of volcanic boulders, or a slab of ice. */
function makeGate(scene: Phaser.Scene, key: string, style: GateStyle, cols: number, rows: number, aboveRows: number, seed: number): void {
  if (scene.textures.exists(key)) return; // the same every run (made once)
  const [c, g] = canvas(cols, rows);
  const r = rng(seed);
  if (style === 'roots') {
    // Thick roots twisting down, crossed by thinner ones; leaves at the top.
    for (let k = 0; k < Math.round(cols * 0.65); k++) {
      let x = r() * cols;
      const w = 2 + Math.floor(r() * 3);
      const col = [C.bark, C.brown, C.clay][k % 3];
      for (let y = 0; y < rows; y++) {
        x += Math.sin(y * 0.07 + k) * 0.5 + (r() - 0.5) * 0.6;
        for (let i = 0; i < w; i++) px(g, Math.floor(x + i) % cols, y, i === 0 ? C.bark : col);
      }
    }
    for (let y = aboveRows + 6; y < rows; y += 9 + Math.floor(r() * 8)) {
      let yy = y;
      for (let x = 0; x < cols; x++) {
        yy += (r() - 0.5) * 0.8;
        px(g, x, Math.floor(yy), C.brown);
      }
    }
    for (let i = 0; i < cols * 3; i++) px(g, Math.floor(r() * cols), Math.floor(r() * aboveRows), r() < 0.5 ? C.leaf : C.leafDark);
  } else if (style === 'rocks') {
    // Boulders piled from the seabed up past the surface, a few lava cracks glowing between them.
    for (let y = rows; y > 0; ) {
      const rad = 3 + Math.floor(r() * 5);
      const cx = rad + r() * (cols - rad * 2);
      for (let yy = -rad; yy <= rad; yy++) {
        for (let xx = -rad; xx <= rad; xx++) {
          if (xx * xx + yy * yy > rad * rad) continue;
          const edge = xx * xx + yy * yy > (rad - 1) * (rad - 1);
          px(g, Math.floor(cx + xx), Math.floor(y + yy), edge ? C.ink : yy < -rad / 3 ? C.grey : xx > rad / 3 ? C.navy : C.slate);
        }
      }
      if (r() < 0.25) px(g, Math.floor(cx), Math.floor(y), C.orange);
      y -= rad * (0.7 + r() * 0.4);
    }
    // fill the gaps so you can't see through (read the picture once, then paint the empty pixels)
    const data = g.getImageData(0, 0, cols, rows).data;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (data[(y * cols + x) * 4 + 3] === 0) px(g, x, y, y % 7 === 3 && x % 11 === 5 ? C.red : C.navy);
  } else {
    // A slab of ice: white at the top fading to blue-grey (dithered), rounded shading at the sides,
    // frosty streaks running down at an angle, a jagged top edge above the water.
    const tops = Array.from({ length: cols }, () => Math.floor(r() * 4));
    for (let x = 0; x < cols; x++) {
      for (let y = tops[x]; y < rows; y++) {
        const u = y / rows;
        const side = Math.min(x, cols - 1 - x);
        let col = bayer(x, y) < u * 1.6 ? (bayer(x, y) < (u - 0.5) * 1.6 ? C.stone : C.mist) : C.white;
        if (side < 3) col = side === 0 ? C.slate : bayer(x, y) < 0.5 ? C.stone : C.mist;
        if (y === tops[x]) col = C.slate;
        px(g, x, y, col);
      }
    }
    for (let k = 0; k < Math.round(rows / 6); k++) {
      let x = 3 + r() * (cols - 6);
      let y = r() * rows;
      const dir = r() < 0.5 ? -0.4 : 0.4;
      for (let i = 0; i < 6 + r() * 10; i++) {
        if (x < 3 || x > cols - 4) break;
        px(g, Math.floor(x), Math.floor(y), i % 4 === 0 ? C.white : C.cyan);
        y += 1;
        x += dir;
      }
    }
  }
  add(scene, key, c);
}

/** Cracks on top of a wall: more of them at each stage (1 to 3). */
function makeCracks(scene: Phaser.Scene, key: string, style: GateStyle, cols: number, rows: number, stage: number, seed: number): void {
  if (scene.textures.exists(key)) return; // the same every run (made once)
  const [c, g] = canvas(cols, rows);
  const r = rng(seed);
  const col = style === 'roots' ? C.sand : style === 'rocks' ? C.gold : C.navy;
  const lines = stage * 5;
  for (let k = 0; k < lines; k++) {
    let x = 2 + r() * (cols - 4);
    let y = r() * rows;
    const len = 10 + Math.floor(r() * 18) * stage;
    for (let i = 0; i < len; i++) {
      px(g, Math.floor(x), Math.floor(y), col);
      if (style === 'ice' && i % 3 === 0) px(g, Math.floor(x) + 1, Math.floor(y), C.cyan);
      y += 1;
      x += r() < 0.5 ? -1 : 1;
      if (x < 1 || x > cols - 2) break;
    }
  }
  add(scene, key, c);
}
