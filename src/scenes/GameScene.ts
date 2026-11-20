import Phaser from 'phaser';
import { BALANCE, SPECIES, getSpecies } from '../data';
import { Fish } from '../entities/Fish';
import { PlayerController } from '../entities/PlayerController';
import { WanderBrain } from '../entities/WanderBrain';
import { toggleTuningPanel } from '../ui/tuning';
import { Bubbles } from '../systems/Bubbles';
import { ATLAS } from '../assets';
import { FoodField, type FoodItem } from '../entities/Food';
import type { HudScene } from './HudScene';

interface AmbientFish {
  fish: Fish;
  brain: WanderBrain;
  band: Phaser.Geom.Rectangle;
}

/** What the player's mouth area currently overlaps (drives the mouth ring). */
type MouthState = 'idle' | 'canSwallow' | 'tooBig';

/**
 * Side-view ocean: world, seabed, rocks, kelp, bubbles, the player's swimming,
 * camera follow + zoom by size (Sprint 1), and eating + growth (Sprint 2):
 * plankton is eaten on mouth contact, smaller fish are swallowed with the
 * swallow action. Ambient fish only wander until Sprint 3 adds real AI.
 */
export class GameScene extends Phaser.Scene {
  player!: Fish;
  controller!: PlayerController;
  /** Rectangles covered by kelp. Sprint 3 uses them to block AI vision. */
  kelpZones: Phaser.Geom.Rectangle[] = [];
  seabedTop = 0;

  private rocks!: Phaser.Physics.Arcade.StaticGroup;
  private ambient: AmbientFish[] = [];
  private ambientBubbles!: Bubbles;
  private trailBubbles!: Bubbles;
  private ambientTimer = 0;
  private trailTimer = 0;
  food!: FoodField;
  private swimArea!: Phaser.Geom.Rectangle;
  private mouthGfx!: Phaser.GameObjects.Graphics;
  private swallowCooldown = 0;
  mouthState: MouthState = 'idle';
  /** Running totals for the HUD / future stats screen. */
  stats = { plankton: 0, fish: 0 };

  constructor() {
    super('Game');
  }

  create(): void {
    const W = BALANCE.world.width;
    const H = BALANCE.world.height;
    this.seabedTop = H - BALANCE.world.seabedDepth;

    // Swimmable area: from the surface down to just inside the sand.
    const swimTop = BALANCE.world.surfaceY;
    this.physics.world.setBounds(0, swimTop, W, this.seabedTop + 40 - swimTop);
    this.swimArea = new Phaser.Geom.Rectangle(40, swimTop + 30, W - 80, this.seabedTop - swimTop - 40);

    this.drawWater(W, H);
    this.drawSeabed(W, H);
    this.placeRocks(W);
    this.placeKelp(W);
    this.ambientBubbles = new Bubbles(this, 'bubble_a', -5);
    this.trailBubbles = new Bubbles(this, 'bubble_a', 9);

    // Player.
    const species = getSpecies(BALANCE.playerSpecies);
    this.player = new Fish(this, W / 2, H * 0.35, species, 1);
    this.player.setDepth(10);
    this.controller = new PlayerController(this, this.player);
    this.physics.add.collider(this.player, this.rocks);
    this.mouthGfx = this.add.graphics().setDepth(11);

    this.food = new FoodField(this, this.swimArea);
    this.spawnAmbientFish(W);

    // Camera.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, BALANCE.camera.lerp, BALANCE.camera.lerp);
    cam.setZoom(this.targetZoom());
    cam.setBackgroundColor(0x0b2a45);
    cam.preRender();
    this.food.fill(cam.worldView);

    this.bindDevKeys();
  }

  update(time: number, deltaMs: number): void {
    // Clamp dt so a background tab or hitch does not launch fish across the map.
    const dt = Math.min(deltaMs / 1000, 1 / 20);

    this.player.swim(this.controller.read(), dt);
    this.updateBubbles(dt);

    for (const a of this.ambient) a.fish.swim(a.brain.think(dt), dt);

    this.food.update(dt, this.cameras.main.worldView, time);
    this.updateEating(dt);

    // Zoom out as the player grows so it stays a readable size on screen.
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, this.targetZoom(), BALANCE.camera.zoomLerp));
  }

  targetZoom(): number {
    const c = BALANCE.camera;
    const ratio = this.player.size / this.player.species.baseSize;
    // Also fit the zoom to small screens (phones) so you see enough water.
    const screenFit = Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / 800, 0.6, 1.2);
    return Phaser.Math.Clamp(c.baseZoom * screenFit * Math.pow(1 / ratio, c.zoomExponent), c.minZoom, c.maxZoom);
  }

  // ---------------------------------------------------------------- eating

  private get hud(): HudScene {
    return this.scene.get('Hud') as HudScene;
  }

  private updateEating(dt: number): void {
    const p = this.player;
    const mouth = p.mouthPoint();
    const swallowing = this.controller.wantsSwallow();
    const reach = p.mouthRadius(swallowing);
    this.swallowCooldown -= dt;

    // Plankton: eaten automatically on mouth contact (filter feeding).
    const touchR = p.mouthRadius(false);
    for (let i = this.food.items.length - 1; i >= 0; i--) {
      const f = this.food.items[i];
      if (p.canSwallow(f.size) && Phaser.Math.Distance.Between(mouth.x, mouth.y, f.img.x, f.img.y) < touchR + f.size) {
        this.eatFood(f);
      }
    }

    // Live fish: need the swallow action, and must be small enough.
    let best: AmbientFish | null = null;
    let sawTooBig = false;
    const checkR = p.mouthRadius(true);
    for (const a of this.ambient) {
      const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, a.fish.x, a.fish.y);
      if (d > checkR + a.fish.size * 0.5) continue;
      if (!p.canSwallow(a.fish.size)) {
        sawTooBig = true;
        continue;
      }
      if (!best || a.fish.size > best.fish.size) best = a;
    }
    this.mouthState = best ? 'canSwallow' : sawTooBig ? 'tooBig' : 'idle';

    if (swallowing && best && this.swallowCooldown <= 0) {
      const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, best.fish.x, best.fish.y);
      if (d <= reach + best.fish.size * 0.5) {
        this.swallowCooldown = BALANCE.eating.swallowCooldown;
        this.eatFish(best);
      }
    }

    this.drawMouth(mouth, reach, swallowing);
  }

  private drawMouth(mouth: Phaser.Math.Vector2, r: number, swallowing: boolean): void {
    const g = this.mouthGfx;
    g.clear();
    // Green = something you can swallow is in reach; red = too big to swallow.
    const color = this.mouthState === 'canSwallow' ? 0x7cff6b : this.mouthState === 'tooBig' ? 0xff4d4d : 0xffffff;
    const alpha = this.mouthState === 'idle' ? (swallowing ? 0.5 : 0.22) : 0.95;
    const w = Math.max(2, this.player.size * 0.07);
    g.lineStyle(w + 2, 0x0a2236, alpha * 0.6);
    g.strokeCircle(mouth.x, mouth.y, r);
    g.lineStyle(w, color, alpha);
    g.strokeCircle(mouth.x, mouth.y, r);
  }

  private eatFood(f: FoodItem): void {
    const x = f.img.x;
    const y = f.img.y;
    this.food.remove(f);
    this.stats.plankton++;
    this.gainXp(f.xp, x, y, false);
  }

  private eatFish(a: AmbientFish): void {
    const xp = a.fish.species.xpValue * a.fish.level;
    const { x, y } = a.fish;
    this.stats.fish++;
    this.burst(x, y, a.fish.size);
    this.gainXp(xp, x, y, true);
    this.respawnAmbient(a);
  }

  private gainXp(xp: number, x: number, y: number, big: boolean): void {
    const p = this.player;
    p.heal(p.maxHp * BALANCE.eating.healOnEatPct);
    const levels = p.addXp(xp);
    this.hud.popup(`+${xp}`, x, y, big);
    if (levels > 0) {
      this.hud.levelUp(p.level);
      this.burst(p.x, p.y, p.size * 1.5);
    }
  }

  private burst(x: number, y: number, size: number): void {
    const n = Phaser.Math.Clamp(Math.round(size / 3), 6, 24);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Phaser.Math.FloatBetween(30, 90);
      this.trailBubbles.spawn(x + Math.cos(a) * size * 0.4, y + Math.sin(a) * size * 0.4, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: Phaser.Math.FloatBetween(0.5, 1.1),
        scale: Phaser.Math.FloatBetween(0.05, 0.12) * Math.max(1, size / 30),
        alpha: 0.85,
      });
    }
  }

  /** Put an eaten fish back somewhere off-screen in its depth band. */
  private respawnAmbient(a: AmbientFish): void {
    const view = this.cameras.main.worldView;
    let x = 0;
    for (let i = 0; i < 20; i++) {
      x = Phaser.Math.Between(a.band.left, a.band.right);
      if (x < view.left - 200 || x > view.right + 200) break;
    }
    const y = Phaser.Math.Between(a.band.top, a.band.bottom);
    a.fish.arcadeBody.reset(x, y);
    a.fish.setLevel(Phaser.Math.Between(1, 3));
    a.fish.hp = a.fish.maxHp;
  }

  // ---------------------------------------------------------------- world

  private drawWater(W: number, H: number): void {
    const surfaceY = BALANCE.world.surfaceY;
    const g = this.add.graphics().setDepth(-100);

    // Sky strip above the surface.
    g.fillStyle(0xbfe9f7, 1);
    g.fillRect(0, 0, W, surfaceY);

    // Water: light near the surface, deep blue at the bottom.
    g.fillGradientStyle(0x3fa9d6, 0x3fa9d6, 0x062038, 0x062038, 1);
    g.fillRect(0, surfaceY, W, H - surfaceY);

    // Surface highlight band.
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(0, surfaceY - 3, W, 6);

    // Soft light rays from the surface.
    const rays = this.add.graphics().setDepth(-90);
    for (let x = 200; x < W; x += Phaser.Math.Between(350, 700)) {
      const w = Phaser.Math.Between(60, 160);
      const lean = Phaser.Math.Between(150, 400);
      rays.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.035, 0.07));
      rays.fillTriangle(x, surfaceY, x + w, surfaceY, x + lean, H * 0.7);
    }
  }

  private drawSeabed(W: number, H: number): void {
    const tile = 192; // 128px art drawn at 1.5x
    const scale = tile / 128;
    const tops = ['terrain_sand_top_a', 'terrain_sand_top_b', 'terrain_sand_top_c'];

    // Distant background decor (darker, behind everything).
    for (let x = 0; x < W; x += Phaser.Math.Between(80, 220)) {
      const key = Phaser.Utils.Array.GetRandom([
        'background_seaweed_a', 'background_seaweed_b', 'background_seaweed_c',
        'background_seaweed_d', 'background_seaweed_e', 'background_rock_a', 'background_rock_b',
      ]);
      this.add
        .image(x, this.seabedTop + 30, ATLAS, key)
        .setOrigin(0.5, 1)
        .setScale(Phaser.Math.FloatBetween(1.2, 2.6))
        .setTint(0x2b6f99)
        .setAlpha(0.55)
        .setDepth(-60);
    }

    for (let x = 0; x < W; x += tile) {
      this.add
        .image(x, this.seabedTop - 20, ATLAS, Phaser.Utils.Array.GetRandom(tops))
        .setOrigin(0, 0)
        .setScale(scale)
        .setDepth(-20);
      for (let y = this.seabedTop - 20 + tile; y < H; y += tile) {
        this.add
          .image(x, y, ATLAS, Phaser.Utils.Array.GetRandom(['terrain_sand_a', 'terrain_sand_b']))
          .setOrigin(0, 0)
          .setScale(scale)
          .setDepth(-20);
      }
    }
  }

  private placeRocks(W: number): void {
    this.rocks = this.physics.add.staticGroup();
    for (let i = 0; i < BALANCE.world.rockCount; i++) {
      const x = Phaser.Math.Between(150, W - 150);
      const s = Phaser.Math.FloatBetween(1.0, 3.2);
      const baseY = this.seabedTop + 50;
      this.add
        .image(x, baseY, ATLAS, Phaser.Utils.Array.GetRandom(['rock_a', 'rock_b']))
        .setOrigin(0.5, 1)
        .setScale(s)
        .setFlipX(Math.random() < 0.5)
        .setDepth(-15);

      // Collision: an invisible circle zone. The rock art fills roughly
      // x 12..116, y 66..128 of its 128px frame, so a circle of radius 42
      // centered at (64, 108) covers it, with the bottom buried in the sand.
      const r = 42 * s;
      const cy = baseY - (128 - 108) * s;
      const zone = this.add.zone(x, cy, r * 2, r * 2);
      this.physics.add.existing(zone, true);
      (zone.body as Phaser.Physics.Arcade.StaticBody).setCircle(r);
      this.rocks.add(zone);
    }
  }

  private placeKelp(W: number): void {
    const keys = [
      'seaweed_green_a', 'seaweed_green_b', 'seaweed_green_c', 'seaweed_green_d',
      'seaweed_grass_a', 'seaweed_grass_b', 'seaweed_orange_a', 'seaweed_orange_b',
      'seaweed_pink_a', 'seaweed_pink_b', 'seaweed_pink_c', 'seaweed_pink_d',
    ];
    for (let p = 0; p < BALANCE.world.kelpPatches; p++) {
      const cx = Phaser.Math.Between(200, W - 200);
      const count = Phaser.Math.Between(4, 9);
      const spread = count * 40;
      let tallest = 0;
      for (let i = 0; i < count; i++) {
        const s = Phaser.Math.FloatBetween(1.6, 4.2);
        tallest = Math.max(tallest, 128 * s);
        const front = Math.random() < 0.45;
        const kelp = this.add
          .image(cx + Phaser.Math.Between(-spread / 2, spread / 2), this.seabedTop + 40,
            ATLAS, Phaser.Utils.Array.GetRandom(keys))
          .setOrigin(0.5, 1)
          .setScale(s)
          .setDepth(front ? 20 : -10)
          .setAlpha(front ? 0.92 : 1);
        this.tweens.add({
          targets: kelp,
          angle: { from: -4, to: 4 },
          duration: Phaser.Math.Between(1800, 3200),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: Phaser.Math.Between(0, 1500),
        });
      }
      this.kelpZones.push(
        new Phaser.Geom.Rectangle(cx - spread / 2 - 30, this.seabedTop + 40 - tallest * 0.9, spread + 60, tallest * 0.9),
      );
    }
  }

  private updateBubbles(dt: number): void {
    const view = this.cameras.main.worldView;
    const surfaceY = BALANCE.world.surfaceY;

    // Ambient bubbles: only spawned around the visible area, rising from the
    // seabed (or from just below the screen when the seabed is out of view).
    this.ambientTimer -= dt;
    while (this.ambientTimer <= 0) {
      this.ambientTimer += 0.06;
      if (this.ambientBubbles.count > 160) break;
      const x = Phaser.Math.Between(view.left - 100, view.right + 100);
      const y = Math.min(this.seabedTop + 10, view.bottom + 40);
      this.ambientBubbles.spawn(x, y, {
        vy: -Phaser.Math.Between(40, 95),
        life: Phaser.Math.FloatBetween(8, 15),
        scale: Phaser.Math.FloatBetween(0.05, 0.16),
        alpha: Phaser.Math.FloatBetween(0.35, 0.65),
      });
    }
    this.ambientBubbles.update(dt, surfaceY);

    // Sprint trail from the player's tail.
    const p = this.player;
    this.trailTimer -= dt;
    if (p.isSprinting && this.trailTimer <= 0) {
      this.trailTimer = 0.04;
      const tx = p.x - Math.cos(p.heading) * p.size;
      const ty = p.y - Math.sin(p.heading) * p.size;
      this.trailBubbles.spawn(tx + Phaser.Math.Between(-4, 4), ty + Phaser.Math.Between(-4, 4), {
        vx: -Math.cos(p.heading) * 20,
        vy: -Phaser.Math.Between(20, 60),
        life: Phaser.Math.FloatBetween(0.6, 1.2),
        scale: (0.05 + Math.random() * 0.05) * (p.size / 22),
        alpha: 0.75,
      });
    }
    this.trailBubbles.update(dt, surfaceY);
  }

  private spawnAmbientFish(W: number): void {
    const surfaceY = BALANCE.world.surfaceY;
    const waterH = this.seabedTop - surfaceY;
    for (const [id, count] of Object.entries(BALANCE.population)) {
      const sp = SPECIES[id];
      const band = new Phaser.Geom.Rectangle(
        100,
        surfaceY + waterH * sp.spawn.depthMin + 40,
        W - 200,
        Math.max(80, waterH * (sp.spawn.depthMax - sp.spawn.depthMin) - 80),
      );
      for (let i = 0; i < count; i++) {
        const fish = new Fish(this, Phaser.Math.Between(band.left, band.right),
          Phaser.Math.Between(band.top, band.bottom), sp, Phaser.Math.Between(1, 3));
        fish.setDepth(5);
        this.physics.add.collider(fish, this.rocks);
        this.ambient.push({ fish, brain: new WanderBrain(fish, band), band });
      }
    }
  }

  // ---------------------------------------------------------------- dev tools

  private bindDevKeys(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-G', () => this.player.setLevel(this.player.level + 1));
    kb.on('keydown-H', () => this.player.setLevel(this.player.level - 1));
    kb.on('keydown-BACKTICK', () => toggleTuningPanel(this.player.species));
    kb.on('keydown-P', () => this.toggleDebug());
    kb.on('keydown-F', () => this.scale.toggleFullscreen());
  }

  toggleDebug(): void {
    const world = this.physics.world;
    const turnOn = !world.drawDebug;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = turnOn;
    world.debugGraphic.setDepth(1000).setVisible(world.drawDebug);
    if (!world.drawDebug) world.debugGraphic.clear();
  }
}
