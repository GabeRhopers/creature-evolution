import Phaser from 'phaser';
import { BALANCE, DIFFICULTY, SPECIES, areaAt, getSpecies, type Difficulty, type DifficultyName } from '../data';
import { Fish } from '../entities/Fish';
import { PlayerController } from '../entities/PlayerController';
import { toggleTuningPanel } from '../ui/tuning';
import { Bubbles } from '../systems/Bubbles';
import { C, makeKelp, makeRay, makeRock, makeSand, makeSilhouette, makeWater } from '../systems/worldTextures';

/** World px per art px for the seabed, water and plants. */
const WORLD_PX = 4;
import { ATLAS } from '../assets';
import { FoodField } from '../entities/Food';
import { Brain, type AIWorld, type Creature } from '../ai/Brain';
import type { HudScene } from './HudScene';
import { Stomach } from '../systems/Stomach';
import { Sfx } from '../audio/Sfx';
import { PlayerBot } from '../dev/PlayerBot';
import { saves, type Checkpoint, type DeathCause } from '../save';
import { buildSkinTexture, getActiveSkin, getStageLook, validateProject, type SkinArt, type SkinFrames, type StudioProject } from '../skins';
import { stageIndex } from '../systems/growth';
import { offerPerks, perkById, perkMods, perksOwed } from '../systems/perks';

/** `?bot=1`: an automated playtester drives the player and metrics are recorded. */
export const BOT_MODE = new URLSearchParams(window.location.search).has('bot');

interface PlaytestLog {
  samples: Array<{ run: number; t: number; level: number; difficulty: string }>;
  deaths: Array<{ run: number; t: number; level: number; cause: string; by: string; difficulty: string }>;
  run: number;
}
function playtestLog(): PlaytestLog {
  const w = window as unknown as { __playtest?: PlaytestLog };
  w.__playtest ??= { samples: [], deaths: [], run: 0 };
  return w.__playtest;
}

/** What the player's mouth area currently overlaps (drives the mouth ring). */
type MouthState = 'idle' | 'canSwallow' | 'canBite' | 'full';

/** Difficulty survives scene restarts (chosen on the home screen). */
let currentDifficulty: DifficultyName = readDifficultyFromUrl();
/** Whether the next (re)start shows the home screen's attract mode instead of a run. */
let nextMenuMode = true;
/** A saved run to continue on the next start (set by Continue on the home screen). */
let pendingResume: Checkpoint | null = null;
/** Test swim from Sprite Studio: nothing is saved or recorded. */
let nextTestMode = false;
/** Level a fresh run starts at (after a death: the start of the stage you reached). */
let nextStartLevel = 1;
/** Perks carried into the next run (a stage restart keeps them). */
let nextPerks: string[] = [];

/** Seconds of play between automatic checkpoints. */
const AUTOSAVE_SECONDS = 20;
/** Seconds of protection after continuing a saved run. */
const RESUME_SHIELD_SECONDS = 2;

function readDifficultyFromUrl(): DifficultyName {
  const d = new URLSearchParams(window.location.search).get('difficulty');
  return d === 'easy' || d === 'hard' ? d : 'normal';
}

/**
 * Side-view ocean.
 *  Sprint 1: world, seabed, rocks, kelp, bubbles, swimming, camera zoom by size.
 *  Sprint 2: plankton (eaten on mouth contact), swallowing smaller fish, XP.
 *  Sprint 3: every AI fish runs a Brain (wander/school, flee, hunt, forage,
 *            rest, hunger); kelp hides fish from AI; the player can be eaten.
 *  Sprint 4: bites (damage + meat chunks) on anything too big to swallow,
 *            kills leave skeletons, ram stuns, rock impacts, wounded state,
 *            Dash; the player can also be bitten to death.
 *  Sprint 5: stomach + digestion (rest to digest, starvation), procedural SFX,
 *            music, heartbeat when hunted.
 */
export class GameScene extends Phaser.Scene implements AIWorld {
  player!: Fish;
  playerCreature!: Creature;
  controller!: PlayerController;
  /** All swimmers (player first). Brains scan this list. */
  creatures: Creature[] = [];
  /** Rectangles covered by kelp: fish inside are hidden from AI. */
  kelpZones: Phaser.Geom.Rectangle[] = [];
  seabedTop = 0;
  food!: FoodField;
  swimArea!: Phaser.Geom.Rectangle;
  difficulty!: Difficulty;
  difficultyName: DifficultyName = 'normal';
  mouthState: MouthState = 'idle';
  /** True while at least one AI fish is hunting the player (HUD warning). */
  playerHunted = false;
  playerHidden = false;
  dead = false;
  /** Attract mode behind the home screen: no player, camera drifts over the reef. */
  menuMode = false;
  /** Test swim with a studio drawing: no checkpoints, no records. */
  testMode = false;
  /** Fish eaten by AI predators this run (debug/balance). */
  aiMeals = 0;
  /** Running totals for the HUD / future stats screen. */
  stats = { plankton: 0, fish: 0, kills: 0, maxLevel: 1 };

  private rocks!: Phaser.Physics.Arcade.StaticGroup;
  private ambientBubbles!: Bubbles;
  private trailBubbles!: Bubbles;
  private ambientTimer = 0;
  private trailTimer = 0;
  private mouthGfx!: Phaser.GameObjects.Graphics;
  private swallowCooldown = 0;
  stomach = new Stomach();
  sfx!: Sfx;
  /** Last frame's player intent (to detect resting). */
  private lastIntentStrength = 0;
  private bot: PlayerBot | null = null;
  /** Game-time seconds since this run started (pauses excluded). */
  runTime = 0;
  private sampleTimer = 0;
  private heartbeatTimer = 0;
  private autosaveTimer = AUTOSAVE_SECONDS;
  /** Stage ability state (player only). */
  abilityCooldown = 0;
  private shellTimer = 0;
  private rollTimer = 0;
  private rollBase = 0;
  /** Perks picked this run, and whether a choice is on screen. */
  perks: string[] = [];
  private perkPending = false;
  /** True while the current pushes the player back up (too deep for the stage). */
  depthBlocked = false;
  private seenAreas = new Set<string>();
  private currentTimer = 0;
  /** Controls locked for a moment while evolving. */
  private evolveLock = 0;
  private abilityGfx!: Phaser.GameObjects.Graphics;
  /** When the last checkpoint of this run was written (ms since epoch, 0 = never). */
  lastCheckpointAt = 0;

  constructor() {
    super('Game');
  }

  /** Reset per-run state (Phaser reuses the scene instance on restart). */
  init(): void {
    this.creatures = [];
    this.kelpZones = [];
    this.stats = { plankton: 0, fish: 0, kills: 0, maxLevel: 1 };
    this.dead = false;
    this.aiMeals = 0;
    this.playerHunted = false;
    this.playerHidden = false;
    this.mouthState = 'idle';
    this.swallowCooldown = 0;
    this.runReported = false;
    this.menuMode = nextMenuMode && !BOT_MODE;
    this.testMode = nextTestMode && !this.menuMode;
    this.runTime = 0;
    this.sampleTimer = 0;
    this.autosaveTimer = AUTOSAVE_SECONDS;
    this.lastCheckpointAt = 0;
    this.abilityCooldown = 0;
    this.shellTimer = 0;
    this.rollTimer = 0;
    this.evolveLock = 0;
    this.perks = nextPerks;
    nextPerks = [];
    this.perkPending = false;
    this.depthBlocked = false;
    this.seenAreas = new Set();
    this.speciesLooks = new Map();
    if (pendingResume) currentDifficulty = pendingResume.difficulty;
    this.difficultyName = currentDifficulty;
    this.difficulty = DIFFICULTY[currentDifficulty];
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
    this.ambientBubbles = new Bubbles(this, 'bubble6', -5);
    this.trailBubbles = new Bubbles(this, 'bubble', 9);

    // Player.
    const species = getSpecies(BALANCE.playerSpecies);
    const startY = swimTop + (this.seabedTop - swimTop) * BALANCE.playerStartDepth;
    this.player = new Fish(this, W / 2, startY, species, 1);
    this.player.enableStages();
    this.player.setDepth(10);
    this.playerCreature = { fish: this.player, isPlayer: true };
    this.creatures.push(this.playerCreature);
    this.controller = new PlayerController(this, this.player);
    // Hitting a rock at speed stuns you.
    this.physics.add.collider(this.player, this.rocks, () => {
      const p = this.player;
      if (!p.stunned && p.lastSpeed > p.cruiseSpeed * BALANCE.combat.ramSpeedRatio) {
        p.stun(BALANCE.combat.rockStunSeconds);
        this.sfx.stun();
        this.cameras.main.shake(120, 0.004);
        this.burst(p.x, p.y, p.size * 0.6);
      }
    });
    this.mouthGfx = this.add.graphics().setDepth(11);
    this.abilityGfx = this.add.graphics().setDepth(12);
    if (!this.menuMode && !pendingResume && nextStartLevel > 1) {
      // Back at the start of the stage you reached, with full health.
      this.player.setLevel(nextStartLevel);
      this.player.hp = this.player.maxHp;
      this.stats.maxLevel = nextStartLevel;
    }
    nextStartLevel = 1;
    this.stomach.reset(this.player.level);
    if (!this.menuMode && pendingResume) this.applyCheckpoint(pendingResume);
    pendingResume = null;
    this.applyPerks();
    this.applyLook();
    // A pick earned before the game was closed is offered again.
    if (!this.menuMode) this.time.delayedCall(700, () => this.checkPerks());
    this.sfx = new Sfx(this.sound);
    if (BOT_MODE) {
      this.bot = new PlayerBot(this);
      playtestLog().run++;
    }

    this.food = new FoodField(this, this.swimArea);
    this.spawnAmbientFish(W);

    // Camera.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, BALANCE.camera.lerp, BALANCE.camera.lerp);
    cam.setZoom(this.targetZoom());
    cam.setBackgroundColor(0x0b2a45);
    if (this.menuMode) {
      // No player in attract mode: hide it and let the camera wander the reef.
      this.player.setVisible(false);
      this.player.arcadeBody.enable = false;
      cam.stopFollow();
      cam.setZoom(0.8);
      cam.centerOn(W * 0.35, this.seabedTop - 520);
    }
    cam.preRender();
    this.food.fill(cam.worldView);

    this.bindDevKeys();
  }

  update(time: number, deltaMs: number): void {
    // Clamp dt so a background tab or hitch does not launch fish across the map.
    const dt = Math.min(deltaMs / 1000, 1 / 20);

    if (this.menuMode) {
      this.updateAttract(dt, time);
      return;
    }

    if (!this.dead) {
      const intent = this.bot ? this.bot.read(dt) : this.controller.read();
      // Tucked in the shell, or mid-evolution: hold still.
      if (this.shellTimer > 0 || this.evolveLock > 0) {
        intent.strength = 0;
        intent.sprint = false;
      }
      this.lastIntentStrength = intent.strength;
      this.player.swim(intent, dt);
      this.updateAbility(dt);
      this.updateAreas(dt);
    }
    this.updateBubbles(dt);

    let hunted = false;
    for (const c of this.creatures) {
      if (!c.brain) continue;
      c.fish.swim(c.brain.think(dt), dt);
      if (c.brain.state === 'hunt' && c.brain.target === this.playerCreature) hunted = true;
    }
    this.playerHunted = hunted && !this.dead;
    this.playerHidden = this.inKelp(this.player);

    this.food.update(dt, this.cameras.main.worldView, time);
    if (!this.dead) {
      if (this.controller.consumeDash()) this.useAbility();
      this.updateStomach(dt);
      this.updatePlayerEating(dt);
      this.updateRams();
    }
    this.updateAiEating();

    if (!this.dead) {
      this.runTime += dt;
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        // Only at a safe moment; otherwise try again shortly.
        this.autosaveTimer = this.checkpoint(false) ? AUTOSAVE_SECONDS : 2;
      }
    }
    if (BOT_MODE && !this.dead) {
      this.sampleTimer -= dt;
      if (this.sampleTimer <= 0) {
        this.sampleTimer = 1;
        const log = playtestLog();
        log.samples.push({ run: log.run, t: Math.round(this.runTime), level: this.player.level, difficulty: this.difficultyName });
      }
    }

    // Heartbeat while hunted in the open.
    this.heartbeatTimer -= dt;
    if (this.playerHunted && !this.playerHidden && this.heartbeatTimer <= 0) {
      this.heartbeatTimer = BALANCE.audio.heartbeatSeconds * (this.player.wounded ? 0.7 : 1);
      this.sfx.heartbeat();
    }

    // Zoom out as the player grows so it stays a readable size on screen.
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, this.targetZoom(), BALANCE.camera.zoomLerp));
  }

  targetZoom(): number {
    const c = BALANCE.camera;
    // One zoom per stage (from its first level), so pixels stay steady while you grow
    // inside a stage; the camera only glides to a new zoom when you evolve.
    const st = this.player.stage;
    const ratio = (st ? st.body[0] : this.player.size) / this.player.species.baseSize;
    // Also fit the zoom to small screens (phones) so you see enough water.
    const screenFit = Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / 800, 0.6, 1.2);
    return Phaser.Math.Clamp(c.baseZoom * screenFit * Math.pow(1 / ratio, c.zoomExponent), c.minZoom, c.maxZoom);
  }

  // ---------------------------------------------------------------- AIWorld

  /** Kelp hides a fish unless the observer is very close. */
  isHidden(target: Fish, observer: Fish): boolean {
    if (!this.inKelp(target)) return false;
    const d = Phaser.Math.Distance.Between(target.x, target.y, observer.x, observer.y);
    return d > target.size * BALANCE.ai.kelpSeeThroughDistance;
  }

  inKelp(f: Fish): boolean {
    return this.kelpZones.some((z) => z.contains(f.x, f.y));
  }

  // ---------------------------------------------------------------- difficulty / restart

  setDifficulty(name: DifficultyName): void {
    currentDifficulty = name;
    this.restartRun();
  }

  /** Start over from level 1: the current run ends and its checkpoint is dropped. */
  restartRun(): void {
    nextPerks = [];
    this.reportRun(true);
    if (!BOT_MODE && !this.testMode) saves.clearCheckpoint();
    pendingResume = null;
    nextMenuMode = false;
    nextTestMode = this.testMode;
    this.scene.restart();
  }

  /** After a death: swim again from the start of the stage you had reached. */
  restartFromStage(): void {
    const from = this.player?.stage?.from ?? 1;
    nextPerks = this.perks.slice();
    this.reportRun(true);
    pendingResume = null;
    nextMenuMode = false;
    nextTestMode = this.testMode;
    nextStartLevel = from;
    this.scene.restart();
  }

  /** Level SWIM AGAIN starts from after a death. */
  get stageRestartLevel(): number {
    return this.player?.stage?.from ?? 1;
  }

  /** Start a run from the home screen (a fresh one, or a saved one to continue). */
  startPlay(difficulty: DifficultyName, resume: Checkpoint | null = null, test = false): void {
    currentDifficulty = difficulty;
    pendingResume = test ? null : resume;
    nextTestMode = test;
    if (!resume && !test && !BOT_MODE) saves.clearCheckpoint();
    nextMenuMode = false;
    this.scene.restart();
  }

  /** Back to the home screen. A live run is checkpointed so it can be continued. */
  goHome(): void {
    if (!this.dead) this.checkpoint(true);
    this.reportRun(false);
    nextMenuMode = true;
    nextTestMode = false;
    pendingResume = null;
    this.scene.restart();
    window.dispatchEvent(new CustomEvent('ce:home'));
  }

  /** Tell the home screen how this run went (best record, lifetime stats). */
  private reportRun(ended: boolean, cause?: DeathCause): void {
    if (this.menuMode || BOT_MODE || this.testMode || this.runReported) return;
    if (ended) this.runReported = true;
    const level = Math.max(this.stats.maxLevel, this.player?.level ?? 1);
    window.dispatchEvent(
      new CustomEvent('ce:run', { detail: { level, kills: this.stats.kills, fish: this.stats.fish, ended, cause } }),
    );
  }

  // ---------------------------------------------------------------- save / continue

  /** After a death: keep a checkpoint at the start of the stage reached (or none for the first stage). */
  private saveStageCheckpoint(): void {
    const st = this.player.stage;
    if (!st || st.from <= 1) {
      saves.clearCheckpoint();
      return;
    }
    const a = this.swimArea;
    saves.saveCheckpoint({
      species: this.player.species.id,
      difficulty: this.difficultyName,
      level: st.from,
      xp: 0,
      hpRatio: 1,
      stamina: BALANCE.stamina.max,
      stomachRatio: BALANCE.stomach.startFill,
      stomachBank: 0,
      x: a.centerX,
      y: a.top + (this.seabedTop - a.top) * BALANCE.playerStartDepth,
      runTime: 0,
      stats: { plankton: 0, fish: 0, kills: 0, maxLevel: st.from },
      perks: this.perks.slice(),
    });
  }

  // ---------------------------------------------------------------- stages: look, evolution, abilities

  /** Dress the player for its stage (or the drawing chosen in Options / a test swim). */
  private applyLook(): void {
    if (this.menuMode) return;
    const p = this.player;
    const custom = getActiveSkin();
    try {
      if (custom) {
        const key = 'skin_' + custom.id;
        const built = buildSkinTexture(this, key, custom.project);
        p.applySkin(key, built);
        p.setArt(built.art);
        return;
      }
      const st = p.stage;
      const look = st ? getStageLook(st.id) : null;
      if (st && look) {
        const key = 'stage_' + st.id;
        const built = buildSkinTexture(this, key, look);
        p.applySkin(key, built);
        p.setArt(built.art ?? st.art);
        return;
      }
    } catch (err) {
      console.warn('look not applied', err);
      window.dispatchEvent(new CustomEvent('ce:skinfailed'));
    }
    p.clearSkin();
    p.setArt(null);
  }

  /** Grew into the next stage: new look, full heal, a short safe moment, a new ability. */
  private evolve(): void {
    const p = this.player;
    const st = p.stage!;
    const ab = BALANCE.abilities;
    this.applyLook();
    p.hp = p.maxHp;
    this.stomach.setLevel(p.level);
    p.invulnTimer = Math.max(p.invulnTimer, ab.evolveShieldSeconds);
    this.evolveLock = ab.evolveLockSeconds;
    this.abilityCooldown = 0;
    p.arcadeBody.setVelocity(0, 0);
    this.cameras.main.flash(450, 255, 250, 220);
    this.burst(p.x, p.y, p.size * 2.5);
    this.burst(p.x, p.y, p.size * 1.5);
    this.sfx.levelUp();
    this.sfx.digest();
    this.tweens.add({ targets: p, scaleX: p.scaleX * 1.25, scaleY: p.scaleY * 1.25, duration: 180, yoyo: true, repeat: 1 });
    const ability = ab[st.ability];
    this.hud.evolved(st.name, `New ability: ${ability.name}${st.maxDepth >= 1 ? '\nThe Deep is open' : '\nDeeper water is open'}`);
    window.dispatchEvent(new CustomEvent('ce:evolved', { detail: { stage: st.id } }));
    this.checkpoint(true);
  }

  /** Label and readiness of the current stage ability (for the HUD). */
  get ability(): { label: string; ratio: number; usable: boolean } {
    const st = this.player?.stage;
    const ab = BALANCE.abilities;
    if (!st) return { label: '', ratio: 0, usable: false };
    if (st.ability === 'lunge') {
      const d = BALANCE.combat.dash;
      return { label: ab.lunge.label, ratio: this.player.dashCooldown / (d.cooldownSeconds * this.player.mods.cooldown), usable: this.player.stamina >= d.staminaCost };
    }
    const cfg = st.ability === 'shell' ? ab.shell : ab.roll;
    return { label: cfg.label, ratio: this.abilityCooldown / (cfg.cooldownSeconds * this.player.mods.cooldown), usable: this.abilityCooldown <= 0 };
  }

  get shellActive(): boolean {
    return this.shellTimer > 0;
  }

  private useAbility(): void {
    const p = this.player;
    const st = p.stage;
    if (!st || this.dead || this.evolveLock > 0) return;
    const ab = BALANCE.abilities;
    if (st.ability === 'lunge') {
      if (p.tryDash()) {
        this.burst(p.x, p.y, p.size * 0.5);
        this.sfx.dash();
      }
      return;
    }
    if (this.abilityCooldown > 0 || p.stunned) return;
    if (st.ability === 'shell') {
      this.shellTimer = ab.shell.durationSeconds;
      this.abilityCooldown = ab.shell.cooldownSeconds * p.mods.cooldown;
      p.arcadeBody.setVelocity(0, 0);
      this.sfx.stun();
      this.hud.popup('Shell Guard!', p.x, p.y - p.size * 1.6, false, '#fff3c4');
      return;
    }
    // Death Roll: grab the nearest fish in reach and spin.
    const mouth = p.mouthPoint();
    const reach = p.mouthRadius(true) * ab.roll.reachMul;
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of this.creatures) {
      if (!c.brain || !c.fish.active) continue;
      const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, c.fish.x, c.fish.y) - c.fish.size;
      if (d < reach && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) {
      this.hud.popup('Get closer to roll', p.x, p.y - p.size * 1.4, false, '#cfe8ff');
      return;
    }
    this.abilityCooldown = ab.roll.cooldownSeconds * p.mods.cooldown;
    this.rollTimer = ab.roll.spinSeconds;
    this.rollBase = p.rotation;
    const t = best.fish;
    const dmg = t.armored(p.biteDamage * ab.roll.damageMul);
    const killed = t.takeDamage(dmg);
    t.stun(ab.roll.stunSeconds);
    p.playBite();
    this.spawnChunks(t.x, t.y, p, dmg * BALANCE.combat.meatXpPerDamage, 3);
    this.hud.popup(`DEATH ROLL -${Math.round(dmg)}`, t.x, t.y - t.size, true, '#ffb36b');
    this.sfx.bite();
    this.cameras.main.shake(260, 0.01);
    best.brain?.onHurt(this.playerCreature);
    if (killed) this.kill(best, this.playerCreature);
  }

  private updateAbility(dt: number): void {
    const p = this.player;
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    this.evolveLock = Math.max(0, this.evolveLock - dt);
    this.shellTimer = Math.max(0, this.shellTimer - dt);
    const g = this.abilityGfx;
    g.clear();
    if (this.shellTimer > 0) {
      // A cream shell bubble around the hatchling.
      const a = Math.min(1, this.shellTimer * 2);
      g.fillStyle(0xf3ecd6, 0.25 * a);
      g.fillCircle(p.x, p.y, p.size * 1.5);
      g.lineStyle(3, 0xf3ecd6, 0.9 * a);
      g.strokeCircle(p.x, p.y, p.size * 1.5);
    }
    if (this.rollTimer > 0) {
      this.rollTimer = Math.max(0, this.rollTimer - dt);
      const k = 1 - this.rollTimer / BALANCE.abilities.roll.spinSeconds;
      p.rotation = this.rollBase + k * Math.PI * 4;
    }
  }

  // ---------------------------------------------------------------- areas

  /** Depth as a share of the water: 0 at the surface, 1 at the seabed. */
  depthOf(y: number): number {
    const top = BALANCE.world.surfaceY;
    return Phaser.Math.Clamp((y - top) / (this.seabedTop - top), 0, 1);
  }

  /** The deepest point the current stage may swim to (world y), or null for no limit. */
  get depthLimitY(): number | null {
    const st = this.player?.stage;
    if (!st || st.maxDepth >= 1) return null;
    const top = BALANCE.world.surfaceY;
    return top + (this.seabedTop - top) * st.maxDepth;
  }

  /** Deeper water opens as you evolve: below your stage's depth a current pushes you back up. */
  private updateAreas(dt: number): void {
    const p = this.player;
    const limit = this.depthLimitY;
    this.depthBlocked = false;
    if (limit !== null) {
      const over = p.y - limit;
      if (over > 0) {
        const cfg = BALANCE.areas;
        const push = -Math.min(cfg.maxPushSpeed, 40 + over * cfg.currentStrength);
        p.arcadeBody.setVelocityY(Math.min(p.arcadeBody.velocity.y, push));
        this.depthBlocked = true;
      }
      // Rising bubbles mark the current when you get close to it.
      if (over > -300) {
        this.currentTimer -= dt;
        while (this.currentTimer <= 0) {
          this.currentTimer += 0.1;
          this.trailBubbles.spawn(p.x + Phaser.Math.Between(-260, 260), limit + Phaser.Math.Between(0, 40), {
            vx: Phaser.Math.FloatBetween(-10, 10),
            vy: -Phaser.Math.FloatBetween(50, 90),
            life: Phaser.Math.FloatBetween(0.8, 1.4),
            scale: Phaser.Math.FloatBetween(0.08, 0.14),
            alpha: 0.85,
          });
        }
      }
    }
    // A banner the first time each run you reach an area.
    const area = areaAt(this.depthOf(p.y));
    if (!this.depthBlocked && !this.seenAreas.has(area.id)) {
      const first = this.seenAreas.size === 0;
      this.seenAreas.add(area.id);
      if (!first) this.hud.areaBanner(area.name);
    }
  }

  // ---------------------------------------------------------------- perks

  private applyPerks(): void {
    const m = perkMods(this.perks);
    this.player.mods = m;
    this.stomach.capacityMul = m.stomach;
    this.stomach.hungerMul = m.hunger;
  }

  /** Offer a perk choice if one is earned (not in test swims; the bot picks at random). */
  checkPerks(): void {
    if (this.menuMode || this.dead || this.testMode || this.perkPending) return;
    if (perksOwed(this.player.level, this.perks.length) <= 0) return;
    const options = offerPerks();
    if (BOT_MODE) return this.choosePerk(options[0].id);
    this.perkPending = true;
    window.dispatchEvent(new CustomEvent('ce:perk', { detail: { options, level: this.player.level } }));
  }

  /** The player picked a perk. */
  choosePerk(id: string): void {
    const perk = perkById(id);
    this.perkPending = false;
    if (!perk || this.dead) return;
    this.perks.push(id);
    this.applyPerks();
    const p = this.player;
    this.hud.popup(`${perk.icon} ${perk.name}!`, p.x, p.y - p.size * 1.6, true, '#ffd166');
    this.sfx.levelUp();
    this.checkpoint(true);
    // Several levels at once can earn more than one pick.
    this.time.delayedCall(400, () => this.checkPerks());
  }

  /** A moment where continuing later would not drop you into danger. */
  isSafeToSave(): boolean {
    const p = this.player;
    return !this.dead && !p.stunned && !(this.playerHunted && !this.playerHidden);
  }

  /**
   * Write a checkpoint of the run. `force` saves even at a risky moment (pause,
   * app switch, closing the page): the resume shield covers that case.
   */
  checkpoint(force: boolean): boolean {
    if (this.menuMode || BOT_MODE || this.testMode || this.dead || !this.player) return false;
    if (!force && !this.isSafeToSave()) return false;
    const p = this.player;
    const ok = saves.saveCheckpoint({
      species: p.species.id,
      difficulty: this.difficultyName,
      level: p.level,
      xp: p.xp,
      hpRatio: p.maxHp > 0 ? p.hp / p.maxHp : 1,
      stamina: p.stamina,
      stomachRatio: this.stomach.ratio,
      stomachBank: this.stomach.bank,
      x: p.x,
      y: p.y,
      runTime: this.runTime,
      stats: { ...this.stats, maxLevel: Math.max(this.stats.maxLevel, p.level) },
      perks: this.perks.slice(),
    });
    if (ok) {
      this.lastCheckpointAt = saves.lastSavedAt;
      window.dispatchEvent(new CustomEvent('ce:saved', { detail: { at: this.lastCheckpointAt, persistent: saves.persistent } }));
    } else {
      window.dispatchEvent(new CustomEvent('ce:savefailed'));
    }
    return ok;
  }

  private applyCheckpoint(c: Checkpoint): void {
    const p = this.player;
    p.setLevel(c.level);
    p.hp = Math.max(1, Math.round(p.maxHp * c.hpRatio));
    p.xp = Math.min(c.xp, p.xpNeeded - 0.001);
    p.stamina = c.stamina;
    const a = this.swimArea;
    p.setPosition(Phaser.Math.Clamp(c.x, a.left, a.right), Phaser.Math.Clamp(c.y, a.top, a.bottom));
    this.stomach.reset(c.level);
    this.stomach.fill = this.stomach.capacity * c.stomachRatio;
    this.stomach.bank = c.stomachBank;
    this.runTime = c.runTime;
    this.stats = { ...c.stats };
    this.perks = (c.perks ?? []).filter((id) => !!perkById(id));
    p.invulnTimer = RESUME_SHIELD_SECONDS;
    this.lastCheckpointAt = Date.now();
  }
  private runReported = false;

  /** Attract mode: AI, food and bubbles run; the camera drifts back and forth. */
  private attractDir = 1;
  private updateAttract(dt: number, time: number): void {
    this.updateBubbles(dt);
    for (const c of this.creatures) if (c.brain) c.fish.swim(c.brain.think(dt), dt);
    this.food.update(dt, this.cameras.main.worldView, time);
    this.updateAiEating();
    const cam = this.cameras.main;
    cam.scrollX += 28 * this.attractDir * dt;
    const maxX = BALANCE.world.width - cam.width / cam.zoom;
    if (cam.scrollX > maxX - 50 || cam.scrollX < 50) this.attractDir *= -1;
  }

  // ---------------------------------------------------------------- eating

  private get hud(): HudScene {
    return this.scene.get('Hud') as HudScene;
  }

  private updatePlayerEating(dt: number): void {
    const p = this.player;
    const mouth = p.mouthPoint();
    const acting = this.bot ? this.bot.wantsSwallow() : this.controller.wantsSwallow();
    const reach = p.mouthRadius(acting);
    this.swallowCooldown -= dt;

    const full = this.stomach.full;

    // Plankton and meat chunks: eaten automatically on mouth contact.
    const touchR = p.mouthRadius(false);
    for (let i = full ? -1 : this.food.items.length - 1; i >= 0; i--) {
      const f = this.food.items[i];
      if (p.canSwallow(f.size) && Phaser.Math.Distance.Between(mouth.x, mouth.y, f.img.x, f.img.y) < touchR + f.size) {
        this.food.remove(f);
        this.stats.plankton++;
        this.sfx.nibble();
        this.gainXp(Math.max(1, Math.round(f.xp)), f.img.x, f.img.y, false);
      }
    }

    // Fish in reach: swallow if small enough, otherwise bite.
    let swallowTarget: Creature | null = null;
    let biteTarget: Creature | null = null;
    const checkR = p.mouthRadius(true);
    for (const c of this.creatures) {
      if (c.isPlayer) continue;
      const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, c.fish.x, c.fish.y);
      if (p.canSwallow(c.fish.size)) {
        if (d <= checkR + c.fish.size * 0.5 && (!swallowTarget || c.fish.size > swallowTarget.fish.size)) swallowTarget = c;
      } else if (d <= checkR + c.fish.size * BALANCE.combat.biteReachMul) {
        if (!biteTarget || d < Phaser.Math.Distance.Between(mouth.x, mouth.y, biteTarget.fish.x, biteTarget.fish.y)) biteTarget = c;
      }
    }
    this.mouthState = swallowTarget ? (full ? 'full' : 'canSwallow') : biteTarget ? 'canBite' : full ? 'full' : 'idle';

    if (acting && !p.stunned) {
      if (swallowTarget && full && !biteTarget) {
        this.sfx.full();
      } else if (swallowTarget && !full && this.swallowCooldown <= 0) {
        const t = swallowTarget.fish;
        const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, t.x, t.y);
        if (d <= reach + t.size * 0.5) {
          this.swallowCooldown = BALANCE.eating.swallowCooldown;
          const xp = t.species.xpValue * t.level;
          this.stats.fish++;
          this.burst(t.x, t.y, t.size);
          this.sfx.gulp(t.size);
          p.playBite();
          this.gainXp(xp, t.x, t.y, true);
          this.respawnAmbient(swallowTarget);
        }
      } else if (biteTarget && p.biteCooldown <= 0) {
        this.bite(this.playerCreature, biteTarget);
      }
    }

    this.drawMouth(mouth, reach, acting);
  }

  // ---------------------------------------------------------------- combat

  /** `attacker` bites `target`: damage, meat chunks, reactions, maybe a kill. */
  private bite(attacker: Creature, target: Creature, damageMul = 1): void {
    const cb = BALANCE.combat;
    const a = attacker.fish;
    const t = target.fish;
    a.biteCooldown = attacker.isPlayer ? cb.biteCooldown : cb.aiBiteCooldown;
    a.playBite();
    if (target.isPlayer) {
      this.attackPlayer(attacker, damageMul);
      return;
    }
    const dmg = t.armored(a.biteDamage * damageMul);
    const killed = t.takeDamage(dmg);

    // Meat chunks torn off at the wound, sized so the attacker can swallow them.
    const wx = Phaser.Math.Linear(t.x, a.x, 0.35);
    const wy = Phaser.Math.Linear(t.y, a.y, 0.35);
    this.spawnChunks(wx, wy, a, dmg * cb.meatXpPerDamage, Phaser.Math.Between(1, 2));
    if (attacker.isPlayer) {
      this.hud.popup(`-${Math.round(dmg)}`, t.x, t.y - t.size, false, '#ff9a8a');
      this.sfx.bite();
    }
    target.brain?.onHurt(attacker);
    if (killed) this.kill(target, attacker);
  }

  /**
   * A predator attacks the player. The player is never swallowed in one go:
   *  - a predator big enough to swallow you "chomps" (extra damage),
   *  - one hit can take at most `maxHitFraction` of your max HP (>= 3 hits from full),
   *  - armor (crocodile hide) reduces damage,
   *  - after a hit you are knocked back and invulnerable for a moment, so you can flee.
   * The killing blow from a swallow-capable predator counts as "swallowed".
   */
  private attackPlayer(attacker: Creature, damageMul = 1): void {
    const p = this.player;
    if (this.dead || p.invulnerable) return;
    const def = BALANCE.playerDefense;
    const a = attacker.fish;
    if (this.shellTimer > 0) {
      // Shell Guard: the hit bounces off, and the attacker is dazed.
      this.shellTimer = 0;
      a.stun(BALANCE.abilities.shell.attackerStunSeconds);
      const d0 = Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) || 1;
      a.arcadeBody.setVelocity(((a.x - p.x) / d0) * 300, ((a.y - p.y) / d0) * 300);
      p.invulnTimer = 0.6;
      this.hud.popup('Blocked!', p.x, p.y - p.size * 1.5, true, '#fff3c4');
      this.sfx.stun();
      return;
    }
    const chomp = a.canSwallow(p.size);
    const raw = a.biteDamage * damageMul * (chomp ? def.chompMultiplier : 1);
    const dmg = Math.min(p.armored(raw), p.maxHp * def.maxHitFraction);
    const killed = p.takeDamage(dmg, false);

    p.invulnTimer = def.invulnerableSeconds;
    p.stun(def.stunOnHitSeconds);
    const d = Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) || 1;
    p.arcadeBody.setVelocity(((p.x - a.x) / d) * def.knockback, ((p.y - a.y) / d) * def.knockback);

    const wx = Phaser.Math.Linear(p.x, a.x, 0.35);
    const wy = Phaser.Math.Linear(p.y, a.y, 0.35);
    this.spawnChunks(wx, wy, a, dmg * BALANCE.combat.meatXpPerDamage, 1);
    this.hud.popup(`-${Math.round(dmg)}`, p.x, p.y - p.size, true, '#ff5c5c');
    this.hud.hurt();
    this.sfx.hurt();
    this.cameras.main.shake(140, chomp ? 0.008 : 0.005);
    if (killed) this.playerDied(attacker, chomp ? 'swallowed' : 'bitten');
  }

  private spawnChunks(x: number, y: number, eater: Fish, totalXp: number, count: number): void {
    const size = Phaser.Math.Clamp(eater.devourSize * 0.6, 3, 40);
    for (let i = 0; i < count; i++) {
      const f = this.food.spawnMeat(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), size, totalXp / count);
      f.driftX = Phaser.Math.FloatBetween(-60, 60); // spray outward, then slow down and sink
    }
  }

  /** A fish died from damage: skeleton, a pile of meat, respawn (or game over). */
  private kill(victim: Creature, by: Creature): void {
    const t = victim.fish;
    if (victim.isPlayer) {
      this.playerDied(by, 'bitten');
      return;
    }
    this.spawnSkeleton(t);
    this.burst(t.x, t.y, t.size);
    // The carcass is worth most of what swallowing it would have been.
    const total = t.species.xpValue * t.level * 0.6;
    this.spawnChunks(t.x, t.y, by.fish, total, Phaser.Math.Clamp(Math.round(t.size / 10), 3, 10));
    if (by.isPlayer) {
      this.stats.kills++;
      this.sfx.kill();
    }
    this.respawnAmbient(victim);
  }

  /** A species' pixel look, built into a texture once per scene (null = keep the atlas art). */
  private speciesLooks = new Map<string, { key: string; frames: SkinFrames; art: SkinArt | null } | null>();
  private speciesLook(look?: string): { key: string; frames: SkinFrames; art: SkinArt | null } | null {
    if (!look) return null;
    if (this.speciesLooks.has(look)) return this.speciesLooks.get(look)!;
    let built: { key: string; frames: SkinFrames; art: SkinArt | null } | null = null;
    const project = this.cache.json.get('look:' + look) as StudioProject | undefined;
    if (project && !validateProject(project).length) {
      try {
        const key = 'look_' + look;
        const b = buildSkinTexture(this, key, project);
        built = { key, frames: b, art: b.art };
      } catch (err) {
        console.warn('look not built', look, err);
      }
    }
    this.speciesLooks.set(look, built);
    return built;
  }

  private spawnSkeleton(t: Fish): void {
    // A fish with a pixel look leaves its pixel skeleton.
    if (t.deadFrame) {
      const bone = this.add.image(t.x, t.y, t.texture.key, t.deadFrame).setScale(t.scaleX).setRotation(t.rotation).setFlipY(t.flipY).setDepth(3);
      this.tweens.add({ targets: bone, y: Math.min(t.y + 400, this.seabedTop + 10), angle: bone.angle + 160, alpha: 0, duration: 6000, ease: 'Sine.easeIn', onComplete: () => bone.destroy() });
      return;
    }
    // The player (and other animated species) sink belly-up, greyed out, in their current look.
    const rest = t.species.art?.frames?.rest;
    if (rest || t === this.player) {
      const body = this.add.image(t.x, t.y, t.texture.key, t.frame.name).setScale(t.scaleX).setFlipY(!t.flipY).setRotation(t.rotation).setTint(0x7a8a7a).setDepth(3);
      this.tweens.add({ targets: body, y: Math.min(t.y + 400, this.seabedTop + 10), alpha: 0, duration: 6000, ease: 'Sine.easeIn', onComplete: () => body.destroy() });
      return;
    }
    const frames = ['fish_blue', 'fish_green', 'fish_orange', 'fish_pink', 'fish_red'];
    const frame = frames.includes(t.species.sprite) ? `${t.species.sprite}_skeleton` : 'fish_orange_skeleton';
    const bone = this.add
      .image(t.x, t.y, ATLAS, frame)
      .setScale(t.scaleX)
      .setRotation(t.rotation)
      .setFlipY(t.flipY)
      .setDepth(3);
    this.tweens.add({
      targets: bone,
      y: Math.min(t.y + 400, this.seabedTop + 10),
      angle: bone.angle + 160,
      alpha: 0,
      duration: 6000,
      ease: 'Sine.easeIn',
      onComplete: () => bone.destroy(),
    });
  }

  /**
   * Ramming: a fast collision stuns fish up to 10% bigger than the rammer.
   * A Dash also deals damage and knocks back; ramming something much
   * heavier during a Dash bounces you off and stuns you instead.
   */
  private updateRams(): void {
    const cb = BALANCE.combat;
    const p = this.player;
    for (const c of this.creatures) {
      if (c.isPlayer) continue;
      const t = c.fish;
      const d = Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y);
      if (d > (p.size + t.size) * 0.9) continue;

      // The player ramming an AI fish.
      const fast = p.dashing || p.lastSpeed > p.cruiseSpeed * cb.ramSpeedRatio;
      if (fast && !t.stunned) {
        const nx = (t.x - p.x) / (d || 1);
        const ny = (t.y - p.y) / (d || 1);
        if (p.dashing && t.rank > p.rank * cb.dash.reboundSizeRatio) {
          p.arcadeBody.setVelocity(-nx * p.lastSpeed * 0.5, -ny * p.lastSpeed * 0.5);
          p.dashTimer = 0;
          p.stun(0.5);
          this.sfx.stun();
          this.cameras.main.shake(120, 0.005);
        } else if (t.rank <= p.rank * cb.ramSizeRatio || p.dashing) {
          t.stun(cb.ramStunSeconds);
          t.arcadeBody.setVelocity(nx * cb.dash.knockback, ny * cb.dash.knockback);
          p.arcadeBody.velocity.scale(0.5);
          this.burst(t.x, t.y, t.size * 0.5);
          if (p.dashing) {
            p.dashTimer = 0;
            this.bite(this.playerCreature, c, cb.dash.damageMul);
          } else {
            c.brain?.onHurt(this.playerCreature);
          }
        }
      }

      // An AI hunter ramming the player opens them up for a bite.
      const hunter = c.brain?.state === 'hunt' && c.brain.target === this.playerCreature;
      if (hunter && !p.stunned && !p.invulnerable && this.shellTimer <= 0 && t.lastSpeed > t.cruiseSpeed * cb.ramSpeedRatio && p.rank <= t.rank * cb.ramSizeRatio) {
        p.stun(cb.ramStunSeconds * 0.7);
        this.sfx.stun();
        const nx = (p.x - t.x) / (d || 1);
        const ny = (p.y - t.y) / (d || 1);
        p.arcadeBody.setVelocity(nx * 250, ny * 250);
        this.cameras.main.shake(150, 0.006);
        this.hud.hurt();
      }
    }
  }

  /** AI fish swallow their current target (fish or plankton) on mouth contact. */
  private updateAiEating(): void {
    for (const c of this.creatures) {
      const b = c.brain;
      if (!b) continue;
      const me = c.fish;
      const mouth = me.mouthPoint();
      const r = me.mouthRadius(true);

      if (me.stunned) continue;
      if (b.state === 'hunt' && b.target) {
        const t = b.target;
        if (t.isPlayer && this.dead) continue;
        const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, t.fish.x, t.fish.y);
        if (t.isPlayer) {
          // The player is attacked (chomp or bite), never swallowed whole.
          if (me.biteCooldown <= 0 && d < r + t.fish.size * BALANCE.combat.biteReachMul) this.bite(c, t);
        } else if (me.canSwallow(t.fish.size)) {
          if (d < r + t.fish.size * 0.5) {
            b.ate('fish');
            this.aiMeals++;
            this.burst(t.fish.x, t.fish.y, t.fish.size);
            if (this.cameras.main.worldView.contains(me.x, me.y)) this.sfx.gulp(t.fish.size);
            this.respawnAmbient(t);
          }
        } else if (me.biteCooldown <= 0 && d < r + t.fish.size * BALANCE.combat.biteReachMul) {
          this.bite(c, t);
        }
      } else if (b.state === 'forage' && b.foodTarget?.alive) {
        const f = b.foodTarget;
        if (Phaser.Math.Distance.Between(mouth.x, mouth.y, f.img.x, f.img.y) < r + f.size) {
          this.food.remove(f);
          b.ate('food');
        }
      }
    }
  }

  playerDied(by: Creature | null, how: 'swallowed' | 'bitten' | 'starved'): void {
    if (this.dead) return;
    this.sfx.death();
    this.stats.maxLevel = Math.max(this.stats.maxLevel, this.player.level);
    this.reportRun(true, how);
    if (!BOT_MODE && !this.testMode) this.saveStageCheckpoint();
    if (BOT_MODE) {
      const log = playtestLog();
      log.deaths.push({
        run: log.run, t: Math.round(this.runTime), level: this.player.level, cause: how,
        by: by ? `${by.fish.species.id} L${by.fish.level}` : '-', difficulty: this.difficultyName,
      });
      this.time.delayedCall(1500, () => this.restartRun());
    }
    this.dead = true;
    this.mouthGfx.clear();
    this.player.setVisible(false);
    this.player.arcadeBody.setVelocity(0, 0);
    this.player.arcadeBody.enable = false;
    // Follow the predator so the player sees what got them.
    if (by) this.cameras.main.startFollow(by.fish, true, 0.05, 0.05);
    if (how !== 'swallowed') this.spawnSkeleton(this.player);
    this.stats.maxLevel = Math.max(this.stats.maxLevel, this.player.level);
    this.hud.showDeath(by?.fish.species.displayName ?? '', by?.fish.level ?? 0, how, this.stats);
  }

  private drawMouth(mouth: Phaser.Math.Vector2, r: number, swallowing: boolean): void {
    const g = this.mouthGfx;
    g.clear();
    // Green = something you can swallow whole; orange = too big, you will bite it.
    const color =
      this.mouthState === 'canSwallow' ? 0x7cff6b : this.mouthState === 'canBite' ? 0xffa53a : this.mouthState === 'full' ? 0x8a9aa8 : 0xffffff;
    const alpha = this.mouthState === 'idle' ? (swallowing ? 0.5 : 0.22) : 0.95;
    const w = Math.max(2, this.player.size * 0.07);
    g.lineStyle(w + 2, 0x0a2236, alpha * 0.6);
    g.strokeCircle(mouth.x, mouth.y, r);
    g.lineStyle(w, color, alpha);
    g.strokeCircle(mouth.x, mouth.y, r);
  }

  /** Food eaten: it goes into the stomach, ~1/3 of its XP is granted now. */
  private gainXp(xp: number, x: number, y: number, big: boolean): void {
    const p = this.player;
    p.heal(p.maxHp * BALANCE.eating.healOnEatPct);
    const now = this.stomach.eat(xp);
    this.hud.popup(`+${xp}`, x, y, big);
    this.grantXp(now);
  }

  private grantXp(xp: number): void {
    const p = this.player;
    const stageBefore = stageIndex(p.level);
    const levels = p.addXp(xp);
    if (levels > 0 && stageIndex(p.level) !== stageBefore) {
      this.stomach.setLevel(p.level);
      this.stats.maxLevel = Math.max(this.stats.maxLevel, p.level);
      this.evolve();
      this.time.delayedCall(2600, () => this.checkPerks());
    } else if (levels > 0) {
      this.stomach.setLevel(p.level);
      this.stats.maxLevel = Math.max(this.stats.maxLevel, p.level);
      this.hud.levelUp(p.level);
      this.sfx.levelUp();
      p.playCelebrate();
      this.checkpoint(false);
      this.burst(p.x, p.y, p.size * 1.5);
      // Let the level-up banner show first.
      this.time.delayedCall(900, () => this.checkPerks());
    }
  }

  /** Metabolism, resting digestion and starvation. */
  private updateStomach(dt: number): void {
    const p = this.player;
    const st = this.stomach;
    st.setLevel(p.level);
    const resting =
      this.lastIntentStrength === 0 && !p.stunned && p.speed < p.cruiseSpeed * BALANCE.stomach.restSpeedRatio;
    const { released, startedDigest } = st.update(dt, resting);
    p.digestPose = st.digesting || st.restTime > 0;

    if (released > 0) {
      // Banked food heals first (condition), the rest becomes XP.
      const hpPerXp = BALANCE.stomach.hpPerXp;
      const heal = Math.min(p.maxHp - p.hp, released * hpPerXp);
      p.heal(heal);
      const xp = released - heal / hpPerXp;
      if (xp > 0) this.grantXp(xp);
      if (startedDigest) {
        this.sfx.digest();
        this.burst(p.x, p.y - p.size * 0.5, p.size * 0.8);
        this.hud.popup(heal > 1 ? `digested: +${Math.round(xp)} XP, +${Math.round(heal)} HP` : `digested: +${Math.round(xp)} XP`, p.x, p.y - p.size, true, '#9fe8ff');
      }
    }

    if (st.starving) {
      p.sinceHurt = 0; // no natural regeneration while starving
      p.hp -= p.maxHp * BALANCE.stomach.starveDamagePerSecond * dt;
      if (p.hp <= 0) this.playerDied(null, 'starved');
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

  /** Put an eaten AI fish back somewhere off-screen in its depth band. */
  private respawnAmbient(c: Creature): void {
    for (const o of this.creatures) o.brain?.forget(c);
    const band = c.band ?? this.swimArea;
    const view = this.cameras.main.worldView;
    let x = 0;
    for (let i = 0; i < 20; i++) {
      x = Phaser.Math.Between(band.left, band.right);
      if (x < view.left - 200 || x > view.right + 200) break;
    }
    const y = Phaser.Math.Between(band.top, band.bottom);
    c.fish.arcadeBody.reset(x, y);
    c.fish.setLevel(Phaser.Math.Between(1, 3));
    c.fish.resetCombat();
    if (c.brain) c.brain.hunger = Phaser.Math.FloatBetween(0.5, 1);
  }

  // ---------------------------------------------------------------- world

  private drawWater(W: number, H: number): void {
    const surfaceY = BALANCE.world.surfaceY;
    const P = WORLD_PX;

    // Sky strip above the surface.
    this.add.rectangle(0, 0, W, surfaceY, 0xc0cbdc).setOrigin(0, 0).setDepth(-100);

    // Water: flat pixel bands (Shallows, Reef, Deep) with dithered edges.
    const rows = Math.ceil((this.seabedTop - surfaceY) / P);
    makeWater(this, 'w_water', rows);
    this.add.tileSprite(0, surfaceY, W, H - surfaceY, 'w_water').setOrigin(0, 0).setTileScale(P).setDepth(-100);

    // Surface line: two art pixels of light.
    this.add.rectangle(0, surfaceY - P, W, P, 0xffffff, 0.6).setOrigin(0, 0).setDepth(-99);
    this.add.rectangle(0, surfaceY, W, P, 0x2ce8f5, 0.5).setOrigin(0, 0).setDepth(-99);

    // Stepped, dithered light rays from the surface.
    makeRay(this, 'w_ray_a', 18, 150, 40);
    makeRay(this, 'w_ray_b', 30, 180, 70);
    for (let x = 200; x < W; x += Phaser.Math.Between(350, 700)) {
      this.add
        .image(Math.round(x / P) * P, surfaceY, Math.random() < 0.5 ? 'w_ray_a' : 'w_ray_b')
        .setOrigin(0, 0)
        .setScale(P)
        .setAlpha(Phaser.Math.FloatBetween(0.04, 0.07))
        .setDepth(-90);
    }

    // One far silhouette layer that scrolls slower than the world (parallax).
    makeSilhouette(this, 'w_far', 360, 90);
    this.add
      .tileSprite(0, this.seabedTop + 10, W * 1.2, 90 * P, 'w_far')
      .setOrigin(0, 1)
      .setTileScale(P)
      .setScrollFactor(0.75, 1)
      .setAlpha(0.55)
      .setDepth(-70);
  }

  private drawSeabed(W: number, H: number): void {
    makeSand(this, 'w_sand');
    this.add
      .tileSprite(0, this.seabedTop - 20, W, H - this.seabedTop + 20, 'w_sand')
      .setOrigin(0, 0)
      .setTileScale(WORLD_PX)
      .setDepth(-20);
  }

  private placeRocks(W: number): void {
    this.rocks = this.physics.add.staticGroup();
    // Rock art in four sizes (two shapes each), always at the same pixel density.
    const sizes = [1.0, 1.7, 2.4, 3.2];
    sizes.forEach((s, i) => {
      for (let v = 0; v < 2; v++) makeRock(this, `w_rock_${i}_${v}`, 100 + i * 10 + v, Math.round(26 * s), Math.round(16 * s));
    });
    for (let i = 0; i < BALANCE.world.rockCount; i++) {
      const x = Phaser.Math.Between(150, W - 150);
      const si = Phaser.Math.Between(0, sizes.length - 1);
      const s = sizes[si];
      const baseY = this.seabedTop + 50;
      this.add
        .image(x, baseY, `w_rock_${si}_${Phaser.Math.Between(0, 1)}`)
        .setOrigin(0.5, 1)
        .setScale(WORLD_PX)
        .setFlipX(Math.random() < 0.5)
        .setDepth(-15);

      // Collision: an invisible circle zone, the same size as before
      // (radius 42*s, centered 20*s above the base, bottom buried in sand).
      const r = 42 * s;
      const cy = baseY - 20 * s;
      const zone = this.add.zone(x, cy, r * 2, r * 2);
      this.physics.add.existing(zone, true);
      (zone.body as Phaser.Physics.Arcade.StaticBody).setCircle(r);
      this.rocks.add(zone);
    }
  }

  private placeKelp(W: number): void {
    // Kelp strands: green ones in several heights plus a few coral and pink ones.
    const variants: Array<[number, string, string, string]> = [
      [50, C.leafDark, C.leaf, C.leafLight],
      [70, C.leafDark, C.leaf, C.leafLight],
      [90, C.leafDark, C.leaf, C.leafLight],
      [110, C.leafDark, C.leaf, C.leafLight],
      [55, C.clay, C.coral, C.coralLight],
      [65, C.pink, C.pinkLight, C.white],
    ];
    const keys = variants.map(([h, d, m, l], i) => {
      const key = `w_kelp_${i}`;
      makeKelp(this, key, 30 + i, h, d, m, l);
      return { key, h };
    });
    for (let p = 0; p < BALANCE.world.kelpPatches; p++) {
      const cx = Phaser.Math.Between(200, W - 200);
      const count = Phaser.Math.Between(4, 9);
      const spread = count * 40;
      let tallest = 0;
      for (let i = 0; i < count; i++) {
        const k = Phaser.Utils.Array.GetRandom(keys);
        tallest = Math.max(tallest, k.h * WORLD_PX);
        const front = Math.random() < 0.45;
        const kelp = this.add
          .image(cx + Phaser.Math.Between(-spread / 2, spread / 2), this.seabedTop + 40, k.key)
          .setOrigin(0.5, 1)
          .setScale(WORLD_PX)
          .setFlipX(Math.random() < 0.5)
          .setDepth(front ? 20 : -10)
          .setAlpha(front ? 0.92 : 1);
        this.tweens.add({
          targets: kelp,
          angle: { from: -3, to: 3 },
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
    for (const [id, baseCount] of Object.entries(BALANCE.population)) {
      const sp = SPECIES[id];
      // Difficulty: more predators on Hard, more small prey on Easy.
      const mul = sp.tier >= 3 ? this.difficulty.predatorDensity : sp.tier <= 1 ? this.difficulty.preySpawnRate : 1;
      const count = Math.max(1, Math.round(baseCount * mul));
      const band = new Phaser.Geom.Rectangle(
        100,
        surfaceY + waterH * sp.spawn.depthMin + 40,
        W - 200,
        Math.max(80, waterH * (sp.spawn.depthMax - sp.spawn.depthMin) - 80),
      );
      for (let i = 0; i < count; i++) {
        const fish = new Fish(this, Phaser.Math.Between(band.left, band.right),
          Phaser.Math.Between(band.top, band.bottom), sp, Phaser.Math.Between(1, 3));
        const look = this.speciesLook(sp.look);
        if (look) {
          fish.applySkin(look.key, look.frames);
          fish.setArt(look.art);
        }
        fish.setDepth(5);
        fish.speedMul = this.difficulty.aiSpeed;
        this.physics.add.collider(fish, this.rocks);
        const c: Creature = { fish, isPlayer: false, band };
        c.brain = new Brain(c, this);
        this.creatures.push(c);
      }
    }
  }

  // ---------------------------------------------------------------- dev tools

  private bindDevKeys(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-G', () => this.player.setLevel(this.player.level + 1));
    kb.on('keydown-R', () => this.restartRun());
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
