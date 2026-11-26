import Phaser from 'phaser';
import { BALANCE, DEFAULT_HERO, DIFFICULTY, SPECIES, aiLevelBonus, biomeWeight, areaAt, getSpecies, isHero, setHero, tideName, tideOf, type Difficulty, type DifficultyName } from '../data';
import { Fish } from '../entities/Fish';
import { PlayerController } from '../entities/PlayerController';
import { toggleTuningPanel } from '../ui/tuning';
import { Bubbles } from '../systems/Bubbles';
import { C, makeGiantKelp, makeKelp, makeRay, makeRock, makeSilhouette, makeWater, makeWaterBlend, regionStops } from '../systems/worldTextures';
import { Terrain, type TerrainConfig } from '../systems/terrain';
import { SpatialGrid } from '../systems/spatialGrid';
import { countInTide, factorsFor, groupSizes, outShare, rollLevel, type PeriodId, type SpawnFactors } from '../systems/spawnFactors';
import { openedFromSave, type GatesConfig } from '../systems/gates';
import { GateSystem } from './GateSystem';
import { arenaLayout, beatenFromSave, bossPerks, clampToBox, inBox, shockMul, type ArenaConfig, type ArenaLayout, type BossDef } from '../systems/bosses';
import { makeArena, makeCaveEntrance } from '../systems/arenaArt';
import { BossSystem } from './BossSystem';
import { keptShare, outgrownMul, regionDensities, regionFactors, trimCrowd, type CrowdConfig } from '../systems/crowd';
import { Regions, migrateX, pickHomeX, type RegionDef, type RegionsConfig } from '../systems/regions';
import { DayNight, type DayNightConfig, type Light, type Period } from '../systems/dayNight';
import { caveRockRows, CORAL_KINDS, makeCaveRock, makeCoral, makeGround, makeIceberg, makeIsland, makeMangrove, makeShadow, makeVolcano, volcanoRows, VOLCANO_REACH } from '../systems/terrainArt';
import { Grid, SCENERY_SIZE, makeFarIslands, makeFarPeaks, makeFloat, makeScenery, type FloatKind, type SceneryKind } from '../systems/sceneryArt';

/** World px per art px for the seabed, water and plants. */
const WORLD_PX = 4;
/** Fish farther than this from the player think less often (they are far off screen). */
const LOD_DISTANCE = 5000;
/** Rocks take the color of their region: muddy in the Swamp, icy in the Frozen Sea. */
const ROCK_TINT: Record<string, number> = { coral: 0xffffff, swamp: 0x9a8a70, volcano: 0x7a6f80, ice: 0xdff4ff };
import { ATLAS } from '../assets';
import { FoodField } from '../entities/Food';
import { Brain, type AIWorld, type Creature } from '../ai/Brain';
import type { HudScene } from './HudScene';
import { Stomach } from '../systems/Stomach';
import { Sfx } from '../audio/Sfx';
import { PlayerBot } from '../dev/PlayerBot';
import { saves, type Checkpoint, type DeathCause } from '../save';
import { buildSkinTexture, getActiveSkin, getStageLook, heroLookSkin, validateProject, type SkinArt, type SkinFrames, type StudioProject } from '../skins';
import { stageIndex } from '../systems/growth';
import { playerTwist, twistFor, type RegionTwist } from '../systems/regionTwists';
import { earlyHelpMods, offerPerks, perkById, perkMods, perksOwed } from '../systems/perks';
import { noteError } from '../ui/safety';

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
/** The hero for the next run (chosen on the home screen; a saved run brings its own). */
let currentHero: string = DEFAULT_HERO;
/** A saved run to continue on the next start (set by Continue on the home screen). */
let pendingResume: Checkpoint | null = null;
/** Test swim from Sprite Studio: nothing is saved or recorded. */
let nextTestMode = false;
/** Level a fresh run starts at (after a death: the start of the stage you reached). */
let nextStartLevel = 1;
/** Perks carried into the next run (a stage restart keeps them). */
let nextPerks: string[] = [];
/** Level of the last Checkpoint Crab defeated, carried into a restart after dying. */
let nextCrabLevel = 0;
/** Gates broken in the run that carries on (SWIM AGAIN keeps them, like the crab level). */
let nextGatesOpen: string[] = [];
/** Bosses beaten in the run that SWIM AGAIN continues. */
let nextBossesBeaten: string[] = [];

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
  /** Seabed dunes, ridges, seamounts and islands (solid ground and hiding places). */
  terrain!: Terrain;
  /** Coral Sea, Mangrove Swamp, Frozen Sea (looks per region; the sea loops around). */
  regions!: Regions;
  /** The region the player is in (for the banner). */
  region: RegionDef | null = null;
  /** Region twists by region id (see src/systems/regionTwists.ts). */
  private twists = new Map<string, RegionTwist>();
  twistOf(id: string | undefined): RegionTwist {
    const k = id ?? '';
    let t = this.twists.get(k);
    if (!t) this.twists.set(k, (t = twistFor(id)));
    return t;
  }
  /** The twist of the region the player is in. */
  get twist(): RegionTwist {
    return this.twistOf(this.region?.id);
  }
  /** How far fish see at x (murky water sees less). Used by the brains. */
  visionAt(x: number): number {
    return this.regions ? this.twistOf(this.regions.at(x).id).vision : 1;
  }
  /** Seconds left blinded by a vampire squid's glowing cloud, and how long it lasted (the Light scene draws the glare). */
  blindT = 0;
  blindMax = 1;
  /** Darkness of the region around the player (eases in and out; the Light scene draws it). */
  regionDark = 0;
  /** Region and vent state the player's perks were last set for (re-apply when it changes). */
  private twistKey = '';
  food!: FoodField;
  swimArea!: Phaser.Geom.Rectangle;
  difficulty!: Difficulty;
  difficultyName: DifficultyName = 'normal';
  mouthState: MouthState = 'idle';
  /** True while at least one AI fish is hunting the player (HUD warning). */
  playerHunted = false;
  /** The player's bites this run (the first-minutes coach watches it). */
  playerBites = 0;
  playerHidden = false;
  /** Day and night: the cycle, seconds into it, and the light right now (read by brains, food, overlay, HUD). */
  readonly dayNight = new DayNight(BALANCE.dayNight as DayNightConfig);
  dayTime = 0;
  light!: Light;
  period: Period = 'day';
  private skyRect!: Phaser.GameObjects.Rectangle;
  private rays: Array<{ img: Phaser.GameObjects.Image; base: number }> = [];
  private stars: Phaser.GameObjects.Image[] = [];
  private sun!: Phaser.GameObjects.Image;
  private moon!: Phaser.GameObjects.Image;
  /** The player is resting by a warm vent (heals slowly). */
  inVent = false;
  /** Warm vents: centers of their healing circles. */
  vents: Array<{ x: number; y: number }> = [];
  private ventBubbleTimer = 0;
  /** World x ranges taken by scenery pieces (rocks and kelp stay out). */
  private sceneryRanges: Array<[number, number]> = [];
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
  private slamFx: { x: number; y: number; r: number; t: number } | null = null;
  private frenzyTimer = 0;
  /** Level saved by the last Checkpoint Crab defeated this run (0 = none yet). */
  crabLevel = 0;
  /** The Checkpoint Crab waiting in the water, and the level it guards. */
  crab: Creature | null = null;
  crabMilestone = 0;
  private crabCheckTimer = 0;
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
    this.landState = 'water';
    this.dryTime = 0;
    // A restart (new run, swim again, home) is never inside a boss arena.
    this.arena = null;
    this.cavePrompt = null;
    this.caveDeclined = null;
    this.rays = [];
    this.stars = [];
    this.dayTime = this.dayNight.startOf((BALANCE.dayNight.startAt as Period) ?? 'day');
    this.period = this.dayNight.periodAt(this.dayTime);
    this.light = this.dayNight.lightAt(this.dayTime);
    this.stats = { plankton: 0, fish: 0, kills: 0, maxLevel: 1 };
    this.dead = false;
    this.aiMeals = 0;
    this.playerHunted = false;
    this.playerBites = 0;
    this.playerHidden = false;
    this.mouthState = 'idle';
    this.swallowCooldown = 0;
    this.runReported = false;
    this.menuMode = nextMenuMode && !BOT_MODE;
    this.testMode = nextTestMode && !this.menuMode;
    this.runTime = 0;
    this.runStartLevel = 0;
    this.sampleTimer = 0;
    this.autosaveTimer = AUTOSAVE_SECONDS;
    this.lastCheckpointAt = 0;
    this.abilityCooldown = 0;
    this.shellTimer = 0;
    this.rollTimer = 0;
    this.slamFx = null;
    this.frenzyTimer = 0;
    this.crab = null;
    this.crabMilestone = 0;
    this.crabCheckTimer = 1;
    this.crabLevel = nextCrabLevel;
    nextCrabLevel = 0;
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

    // Swimmable area: from the surface down to just inside the sand. The sea loops sideways
    // (x and x + W are the same place), so there are no side walls: fish far from the player
    // may sit a world-width to either side (see keepNearFocus).
    const swimTop = BALANCE.world.surfaceY;
    // The top is the sky (the player can leap out of the water); fish stay below the surface on their own.
    // Down to the boss arenas below the world (each is a closed cave of its own; the seabed stops everyone else).
    const A = BALANCE.bosses.arena as ArenaConfig;
    this.physics.world.setBounds(-W, 0, W * 3, H + A.gapBelowWorld + A.height + 40);
    this.swimArea = new Phaser.Geom.Rectangle(-W, swimTop + 30, W * 3, this.seabedTop - swimTop - 40);
    this.terrain = new Terrain(BALANCE.terrain as TerrainConfig, W, swimTop, this.seabedTop);
    this.regions = new Regions(BALANCE.regions as unknown as RegionsConfig, W);
    const staticsFrom = this.children.list.length;
    this.drawWater(W, H);
    this.drawSeabed(W, H);
    this.drawIslands();
    this.plantCoral();
    this.rocks = this.physics.add.staticGroup(); // rocks and the arch
    this.placeScenery();
    this.placeFloats();
    this.placeRocks(W);
    this.placeKelp(W);
    this.mirrorEdges(staticsFrom);
    this.collectStatics(staticsFrom);
    this.ambientBubbles = new Bubbles(this, 'bubble6', -5);
    this.trailBubbles = new Bubbles(this, 'bubble', 9);

    // Player.
    // A saved run keeps the hero it was played with.
    if (pendingResume && isHero(pendingResume.species)) currentHero = pendingResume.species;
    setHero(currentHero);
    const species = getSpecies(currentHero);
    const startY = swimTop + (this.seabedTop - swimTop) * BALANCE.playerStartDepth;
    this.player = new Fish(this, BALANCE.world.startX, startY, species, 1);
    this.player.enableStages();
    this.player.setDepth(10);
    this.playerCreature = { fish: this.player, isPlayer: true };
    this.creatures.push(this.playerCreature);
    this.controller = new PlayerController(this, this.player);
    // Hitting a rock at speed stuns you.
    this.physics.add.collider(this.player, this.rocks, (_p, rock) => {
      const p = this.player;
      // Only a head-on hit stuns: the speed aimed into the rock, not a graze along it.
      const r = rock as Phaser.GameObjects.Image;
      const d = Math.hypot(r.x - p.x, r.y - p.y) || 1;
      const into = (p.lastVx * (r.x - p.x) + p.lastVy * (r.y - p.y)) / d;
      if (!p.stunned && into > p.cruiseSpeed * BALANCE.combat.ramSpeedRatio) {
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
    this.buildGates();
    this.buildBosses();
    if (BOT_MODE) {
      this.bot = new PlayerBot(this);
      playtestLog().run++;
    }

    this.food = new FoodField(this, this.swimArea, this.terrain);
    this.spawnAmbientFish(W);

    // Camera.
    const cam = this.cameras.main;
    const O = BALANCE.world.loopOverlap;
    cam.setBounds(-O, 0, W + O * 2, H);
    cam.startFollow(this.player, true, BALANCE.camera.lerp, BALANCE.camera.lerp);
    cam.setZoom(this.targetZoom());
    cam.setBackgroundColor(0x0b2a45);
    if (this.menuMode) {
      // No player in attract mode: hide it and let the camera wander the reef.
      this.player.setVisible(false);
      this.player.arcadeBody.enable = false;
      cam.stopFollow();
      cam.setZoom(0.8);
      cam.centerOn(BALANCE.world.startX - 1300, this.seabedTop - 520);
    }
    cam.preRender();
    this.food.fill(cam.worldView);

    this.bindDevKeys();
  }

  /** Errors caught in the game loop (each logged once); the game keeps running instead of freezing. */
  frameErrors = 0;
  private loggedErrors = new Set<string>();

  update(time: number, deltaMs: number): void {
    if (!this.runStartLevel && !this.menuMode && this.player) this.runStartLevel = this.player.level;
    try {
      this.step(time, deltaMs);
    } catch (err) {
      // One bad frame (a rare bug in some system) must not stop the whole game loop: log it once and go on.
      this.frameErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.loggedErrors.has(msg)) {
        this.loggedErrors.add(msg);
        console.error('[game] frame error (the game keeps running):', err);
        // Kept on the device too (Options > Problem log), so a freeze on the iPad can be reported.
        noteError(err, `game frame (${this.player?.species.id ?? '?'}, ${this.landState})`);
        window.dispatchEvent(new CustomEvent('ce:error', { detail: { message: msg } }));
      }
    }
  }

  private step(time: number, deltaMs: number): void {
    // Clamp dt so a background tab or hitch does not launch fish across the map.
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    this.updateDayNight(dt);
    this.updateMood(dt);

    if (this.menuMode) {
      this.updateAttract(dt, time);
      return;
    }

    if (!this.dead) {
      // Level changed (level up, checkpoint, test tools): refresh the head start and perks.
      if (this.player.level !== this.modsLevel || this.twistKeyNow() !== this.twistKey) this.applyPerks();
      const intent = this.bot ? this.bot.read(dt) : this.controller.read();
      // Tucked in the shell, or mid-evolution: hold still.
      if (this.shellTimer > 0 || this.evolveLock > 0) {
        intent.strength = 0;
        intent.sprint = false;
      }
      this.lastIntentStrength = intent.strength;
      this.guardPlayer(dt);
      if (this.landState === 'water') {
        this.player.swim(intent, dt);
        this.checkLeap();
      } else this.updateOutOfWater(intent, dt);
      this.updateDrying(dt);
      this.updateAbility(dt);
      this.updateAreas(dt);
    }
    this.updateBubbles(dt);

    let hunted = false;
    this.lodFrame++;
    const focusX = this.player.x;
    // Who is where (brains ask the grid instead of checking every creature), and which fish to draw.
    this.grid.clear();
    const view = this.cameras.main.worldView;
    const margin = Math.max(view.width, view.height) * 0.5;
    for (const c of this.creatures) {
      if (!c.fish.active) continue;
      this.grid.insert(c, c.fish.x, c.fish.y);
      if (c.isPlayer) continue;
      // Fish far outside the view are not drawn (Phaser draws everything otherwise); they still swim and hunt.
      const f = c.fish;
      const pad = margin + f.size * 2;
      f.setVisible(!c.asleep && f.x > view.left - pad && f.x < view.right + pad && f.y > view.top - pad && f.y < view.bottom + pad);
    }
    const huntCount = this.huntCount;
    huntCount.clear();
    let huntersTotal = 0;
    this.updateSpawnFactors(dt);
    this.updateEnvironment(dt);
    this.updateArena(dt);
    this.bosses.update(dt, this.player.level);
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      if (!c.brain) continue;
      // Very far from the player (another part of the sea), fish sleep: no thinking, no physics, not drawn.
      // They wake up, where they were, when the player comes within sleepDistance. Fish that are not out
      // (time of day, waves) or are waiting to respawn sleep too.
      if (c.respawnT && c.respawnT > 0) c.respawnT -= dt;
      const far = Math.abs(c.fish.x - focusX) > BALANCE.ai.sleepDistance || !!c.away || !!c.crowded || (c.respawnT ?? 0) > 0;
      if (far !== !!c.asleep) {
        c.asleep = far;
        c.fish.arcadeBody.enable = !far;
        if (far) c.fish.arcadeBody.setVelocity(0, 0);
      }
      if (far) continue;
      // Far from the player, fish think every third frame (with three frames of time): cheaper, same result.
      if (Math.abs(c.fish.x - focusX) > LOD_DISTANCE) {
        if ((this.lodFrame + i) % 3 !== 0) continue;
        c.fish.swim(c.brain.think(dt * 3), dt * 3);
        continue;
      }
      c.fish.swim(c.brain.think(dt), dt);
      if (c.brain.state === 'hunt' && c.brain.target === this.playerCreature) {
        // At most maxHunters of a species chase you at once; the others give up.
        const id = c.fish.species.id;
        const max = this.factorsOf(id).maxHunters;
        const n = (huntCount.get(id) ?? 0) + 1;
        // At most crowd.maxHuntersTotal fish of all species hunt you at once.
        if ((max > 0 && n > max) || huntersTotal >= (BALANCE.crowd as CrowdConfig).maxHuntersTotal) c.brain.forget(this.playerCreature);
        else {
          huntersTotal++;
          huntCount.set(id, n);
          hunted = true;
        }
      }
    }
    this.cullStatics();
    this.playerHunted = hunted && !this.dead;
    this.collideTerrain();
    this.loopWorld();
    if (!this.dead && !this.menuMode) this.gates.update(dt);
    this.playerHidden = this.inKelp(this.player);
    this.updateVents(dt);

    this.food.update(dt, this.cameras.main.worldView, time);
    if (!this.dead) {
      if (this.controller.consumeDash()) this.useAbility();
      this.updateStomach(dt);
      this.updatePlayerEating(dt);
      this.updateRams();
    }
    this.updateAiEating();
    this.updateCrab(dt);

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
    // A camouflaged animal (the octopus) sitting still blends into the rocks, like a fish in kelp.
    if (!this.inKelp(target) && !target.camouflaged) return false;
    const d = Phaser.Math.Distance.Between(target.x, target.y, observer.x, observer.y);
    return d > target.size * BALANCE.ai.kelpSeeThroughDistance;
  }

  inKelp(f: Fish): boolean {
    // Fish far from the player may sit on another copy of the looping sea: fold x back in.
    const x = this.terrain.wrap(f.x);
    return this.kelpZones.some((z) => z.contains(x, f.y));
  }

  // ---------------------------------------------------------------- difficulty / restart

  setDifficulty(name: DifficultyName): void {
    currentDifficulty = name;
    this.restartRun();
  }

  /** Start over from level 1: the current run ends and its checkpoint is dropped. */
  restartRun(): void {
    nextPerks = [];
    nextCrabLevel = 0;
    nextGatesOpen = [];
    nextBossesBeaten = [];
    this.reportRun(true);
    if (!BOT_MODE && !this.testMode) saves.clearCheckpoint();
    pendingResume = null;
    nextMenuMode = false;
    nextTestMode = this.testMode;
    this.scene.restart();
  }

  /** After a death: swim again from the level saved by the last Checkpoint Crab you defeated (or level 1). */
  restartFromStage(): void {
    const from = this.stageRestartLevel;
    nextPerks = this.perks.slice();
    nextCrabLevel = this.crabLevel;
    nextGatesOpen = this.gates?.openIds() ?? [];
    nextBossesBeaten = this.bossesBeaten.slice();
    this.reportRun(true);
    pendingResume = null;
    nextMenuMode = false;
    nextTestMode = this.testMode;
    nextStartLevel = from;
    this.scene.restart();
  }

  /** Level SWIM AGAIN starts from after a death: the last Checkpoint Crab you defeated. */
  get stageRestartLevel(): number {
    return Math.max(1, this.crabLevel);
  }

  /** Start a run from the home screen (a fresh one, or a saved one to continue). */
  startPlay(difficulty: DifficultyName, resume: Checkpoint | null = null, test = false, hero?: string): void {
    currentDifficulty = difficulty;
    nextCrabLevel = 0;
    nextGatesOpen = [];
    nextBossesBeaten = [];
    if (hero && isHero(hero)) currentHero = hero;
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
      new CustomEvent('ce:run', {
        detail: {
          level, kills: this.stats.kills, fish: this.stats.fish, ended, cause,
          // For the playtest log (src/ui/playLog.ts).
          seconds: this.runTime, startLevel: this.runStartLevel || level, region: this.region?.name, hero: this.player?.species.id,
        },
      }),
    );
  }

  // ---------------------------------------------------------------- save / continue

  /** After a death: keep a checkpoint at the last Checkpoint Crab's level (or none before the first crab). */
  private saveStageCheckpoint(): void {
    const from = this.stageRestartLevel;
    if (from <= 1) {
      saves.clearCheckpoint();
      return;
    }
    const a = this.swimArea;
    saves.saveCheckpoint({
      species: this.player.species.id,
      difficulty: this.difficultyName,
      level: from,
      xp: 0,
      hpRatio: 1,
      stamina: BALANCE.stamina.max,
      stomachRatio: BALANCE.stomach.startFill,
      stomachBank: 0,
      x: BALANCE.world.startX,
      y: a.top + (this.seabedTop - a.top) * BALANCE.playerStartDepth,
      runTime: 0,
      stats: { plankton: 0, fish: 0, kills: 0, maxLevel: from },
      perks: this.perks.slice(),
      crabLevel: this.crabLevel,
      gatesOpen: this.gates?.openIds() ?? [],
      dayTime: this.dayTime,
      worldW: BALANCE.world.width,
      bossesBeaten: [],
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
      // The hero's picked skin (studio "New skin") when it has one, else its own design.
      const skinId = st ? heroLookSkin(p.species.id, st.id) : null;
      const look = st ? (skinId ? getStageLook(skinId) : null) ?? getStageLook(st.skin) : null;
      if (st && look) {
        // The crocodile keeps its old texture names (stage_adult); other heroes add their id.
        const hero = p.species.id;
        const key = skinId ? 'skin_' + skinId : hero === DEFAULT_HERO ? 'stage_' + st.id : `stage_${hero}_${st.id}`;
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
    if (st.ability === 'lunge' || st.ability === 'dart') {
      const d = BALANCE.combat.dash;
      return { label: ab[st.ability].label, ratio: this.player.dashCooldown / (d.cooldownSeconds * this.player.mods.cooldown), usable: this.player.stamina >= d.staminaCost };
    }
    const cfg = ab[st.ability];
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
    if (st.ability === 'lunge' || st.ability === 'dart') {
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
    if (st.ability === 'slam') {
      this.tailSlam();
      return;
    }
    if (st.ability === 'frenzy') {
      const f = ab.frenzy;
      this.abilityCooldown = f.cooldownSeconds * p.mods.cooldown;
      this.frenzyTimer = f.durationSeconds;
      this.applyPerks();
      this.sfx.dash();
      this.cameras.main.shake(160, 0.006);
      this.hud.popup('FEEDING FRENZY!', p.x, p.y - p.size * 1.6, true, '#ff6b6b');
      return;
    }
    // Death Roll (spins) or Crushing Bite (no spin): grab the nearest fish in reach.
    const grab = st.ability === 'crush' ? ab.crush : ab.roll;
    const mouth = p.mouthPoint();
    const reach = p.mouthRadius(true) * grab.reachMul;
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
      this.hud.popup(st.ability === 'crush' ? 'Get closer to bite' : 'Get closer to roll', p.x, p.y - p.size * 1.4, false, '#cfe8ff');
      return;
    }
    this.abilityCooldown = grab.cooldownSeconds * p.mods.cooldown;
    if (st.ability === 'roll') {
      this.rollTimer = ab.roll.spinSeconds;
      this.rollBase = p.rotation;
    }
    const t = best.fish;
    const dmg = t.armored(p.biteDamage * grab.damageMul);
    const killed = t.takeDamage(dmg);
    t.stun(grab.stunSeconds);
    p.playBite();
    this.spawnChunks(t.x, t.y, p, dmg * BALANCE.combat.meatXpPerDamage, 3, true);
    this.hud.popup(`${grab.name.toUpperCase()} -${Math.round(dmg)}`, t.x, t.y - t.size, true, '#ffb36b');
    this.sfx.bite();
    this.cameras.main.shake(260, 0.01);
    best.brain?.onHurt(this.playerCreature);
    if (killed) this.kill(best, this.playerCreature);
  }

  /** Tail Slam: every fish around you takes a hit and is stunned. Works even with nothing in reach. */
  private tailSlam(): void {
    const p = this.player;
    const cfg = BALANCE.abilities.slam;
    this.abilityCooldown = cfg.cooldownSeconds * p.mods.cooldown;
    const radius = p.size * cfg.radiusMul;
    this.slamFx = { x: p.x, y: p.y, r: radius, t: 0.35 };
    this.cameras.main.shake(220, 0.008);
    this.sfx.stun();
    this.burst(p.x, p.y, p.size * 1.2);
    let hits = 0;
    for (const c of this.creatures.slice()) {
      if (!c.brain || !c.fish.active) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, c.fish.x, c.fish.y) - c.fish.size > radius) continue;
      const t = c.fish;
      const dmg = t.armored(p.biteDamage * cfg.damageMul);
      const killed = t.takeDamage(dmg);
      t.stun(cfg.stunSeconds);
      hits++;
      this.spawnChunks(t.x, t.y, p, dmg * BALANCE.combat.meatXpPerDamage, 1, true);
      c.brain.onHurt(this.playerCreature);
      if (killed) this.kill(c, this.playerCreature);
    }
    this.hud.popup(hits ? `TAIL SLAM x${hits}` : 'TAIL SLAM', p.x, p.y - p.size * 1.6, hits > 0, '#ffb36b');
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
    if (this.frenzyTimer > 0) {
      // A pulsing red ring while the frenzy lasts; when it ends, the perks alone apply again.
      this.frenzyTimer = Math.max(0, this.frenzyTimer - dt);
      g.lineStyle(3, 0xe43b44, 0.5 + 0.4 * Math.sin(this.time.now / 70));
      g.strokeCircle(p.x, p.y, p.size * 1.35);
      if (this.frenzyTimer === 0) this.applyPerks();
    }
    if (this.slamFx) {
      // A widening shock ring from the tail slam.
      const f = this.slamFx;
      f.t -= dt;
      const k = 1 - Math.max(0, f.t) / 0.35;
      g.lineStyle(4, 0xc0cbdc, 0.8 * (1 - k));
      g.strokeCircle(f.x, f.y, f.r * (0.4 + 0.6 * k));
      if (f.t <= 0) this.slamFx = null;
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
    // In a boss arena there is no depth: no current pushing you up, no area banners.
    if (this.arena) {
      this.depthBlocked = false;
      return;
    }
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

  // ---------------------------------------------------------------- gates between regions

  gates!: GateSystem;

  private buildBosses(): void {
    this.bossesBeaten = this.resumedBosses ?? nextBossesBeaten.slice();
    this.resumedBosses = null;
    nextBossesBeaten = [];
    const host = this;
    this.bosses = new BossSystem({
      scene: this,
      world: this,
      player: this.player,
      playerCreature: this.playerCreature,
      creatures: this.creatures,
      get dead() { return host.dead; },
      surfaceY: BALANCE.world.surfaceY,
      layout: (d) => this.arenaLayout(d),
      addCreature: (fish, c) => {
        const look = this.speciesLook(fish.species.look);
        if (look) {
          fish.applySkin(look.key, look.frames);
          fish.setArt(look.art);
        }
        fish.setDepth(6);
        this.physics.add.collider(fish, this.rocks);
        this.creatures.push(c);
      },
      hurtPlayer: (by, frac, stun, label) => this.hurtPlayerBy(by, frac, stun, label),
      bossBar: (name, ratio, weak) => this.hud.bossBar(name, ratio, weak),
      banner: (title, line) => this.hud.bigBanner(title, line),
      popup: (t, x, y, color) => this.hud.popup(t, x, y, true, color),
      sfx: (k) => (k === 'zap' ? this.sfx.zap() : k === 'warn' ? this.sfx.crackle() : k === 'gulp' ? this.sfx.splash() : this.sfx.crabHorn()),
      beaten: (id) => this.bossesBeaten.includes(id),
      arena: () => this.arena?.id ?? null,
      defeated: (id, c) => this.bossDefeated(id, c),
    });
    this.buildCaves();
  }

  // ---------------------------------------------------------------- boss arenas
  //
  // Each boss has its own arena, a separate screen (Rhopers, Nov 25): a small cave entrance sits on the seabed in the
  // open world; swimming onto it always asks "Enter the cave?". Yes takes you to a closed cave below the world (the
  // camera shows only it). Swimming into its EXIT tunnel asks "Leave the cave?"; yes puts you back above the entrance.
  // Losing inside never ends the run: you wake up at the entrance.

  /** The boss arena the player is in, or null. */
  arena: BossDef | null = null;
  /** Waiting for an answer (the game is paused meanwhile). */
  cavePrompt: { d: BossDef; mode: 'enter' | 'leave' } | null = null;
  /** "Not now" (or just came out): no question at this entrance until the player has swum away from it. */
  private caveDeclined: string | null = null;
  /** "Stay": no question at the exit until the player has swum out of the tunnel. */
  private exitDeclined = false;

  private get arenaCfg(): ArenaConfig {
    return BALANCE.bosses.arena as ArenaConfig;
  }
  arenaLayout(d: BossDef): ArenaLayout {
    return arenaLayout(d, this.arenaCfg, BALANCE.world.height);
  }
  /** The middle of a cave entrance's hole (where swimming asks to go in). */
  entranceSpot(d: BossDef): { x: number; y: number } {
    return { x: d.entranceX, y: this.terrain.groundAt(d.entranceX) - 50 };
  }

  /** The entrances on the seabed and each arena's cave (drawn once). */
  private buildCaves(): void {
    const A = this.arenaCfg;
    const P = WORLD_PX;
    makeCaveEntrance(this, 'w_cave_entrance');
    for (const d of this.bosses.defs) {
      const g = this.terrain.groundAt(d.entranceX);
      this.add.image(d.entranceX, g + 2 * P, 'w_cave_entrance').setOrigin(0.5, 1).setScale(P).setDepth(-11); // in front of the coral, behind every fish
      this.add
        .text(d.entranceX, g - 34 * P, d.cave.toUpperCase(), { fontFamily: '"Pixelify Sans", "Courier New", monospace', fontSize: '22px', color: '#fee761', stroke: '#181425', strokeThickness: 5 })
        .setOrigin(0.5, 1)
        .setDepth(-15)
        .setAlpha(0.85);
      const L = this.arenaLayout(d);
      const key = `w_arena_${d.id}`;
      makeArena(this, key, Math.round(L.outer.w / P), Math.round(L.outer.h / P), Math.round(A.wall / P), A.airPocketAt,
        Math.round((L.exit.y - L.outer.y) / P), Math.round((L.exit.y + L.exit.h - L.outer.y) / P));
      this.add.image(L.outer.x, L.outer.y, key).setOrigin(0, 0).setScale(P).setDepth(-30);
      this.add
        .text(L.exit.x + 10, L.exit.y - 18, 'EXIT', { fontFamily: '"Pixelify Sans", "Courier New", monospace', fontSize: '34px', color: '#fee761', stroke: '#181425', strokeThickness: 6 })
        .setOrigin(0, 1)
        .setDepth(-14);
    }
  }

  /** Ask at an entrance or at the exit; inside, keep swimmers in the open water. */
  private updateArena(_dt: number): void {
    if (this.dead || this.cavePrompt || this.menuMode) return;
    const A = this.arenaCfg;
    const p = this.player;
    if (this.arena) {
      const L = this.arenaLayout(this.arena);
      if (!inBox(p.x, p.y, L.exit)) {
        this.exitDeclined = false;
        return;
      }
      if (!this.exitDeclined) this.askCave(this.arena, 'leave');
      return;
    }
    for (const d of this.bosses.defs) {
      const e = this.entranceSpot(d);
      const dx = this.terrain.wrap(p.x - e.x + BALANCE.world.width / 2) - BALANCE.world.width / 2;
      const dist = Math.hypot(dx, p.y - e.y);
      if (this.caveDeclined === d.id) {
        if (dist > A.askAgainRadius) this.caveDeclined = null;
        continue;
      }
      if (dist > A.enterRadius) continue;
      this.caveDeclined = d.id; // one question per visit
      if (BOT_MODE || this.testMode) continue;
      if (p.level < d.level && !this.bossesBeaten.includes(d.id)) {
        this.hud.popup(`${d.cave}: too dangerous before level ${d.level}`, p.x, p.y - p.size * 1.6, true, '#fee761');
        continue;
      }
      this.askCave(d, 'enter');
      return;
    }
  }

  private askCave(d: BossDef, mode: 'enter' | 'leave'): void {
    this.cavePrompt = { d, mode };
    window.dispatchEvent(
      new CustomEvent('ce:cave', { detail: { id: d.id, cave: d.cave, boss: d.name, beaten: this.bossesBeaten.includes(d.id), mode } }),
    );
  }

  /** The answer to "Enter the cave?" or "Leave the cave?" (from the menu's prompt). */
  answerCave(yes: boolean): void {
    const q = this.cavePrompt;
    this.cavePrompt = null;
    if (!q || this.dead) return;
    if (q.mode === 'enter') {
      if (yes) this.enterArena(q.d);
      else this.caveDeclined = q.d.id;
      return;
    }
    if (yes) return this.leaveArena();
    // Stay: back out of the tunnel a little, and no more questions until you swim into it again.
    this.exitDeclined = true;
    const L = this.arenaLayout(q.d);
    this.player.arcadeBody.reset(L.exit.x + L.exit.w + 90, this.player.y);
  }

  /** Into the arena: a separate screen, just inside the EXIT tunnel. */
  enterArena(d: BossDef): void {
    const p = this.player;
    const L = this.arenaLayout(d);
    this.arena = d;
    this.caveDeclined = null;
    this.exitDeclined = false;
    this.landState = 'water';
    p.arcadeBody.reset(L.start.x, L.start.y);
    p.arcadeBody.setVelocity(0, 0);
    p.heading = 0;
    const cam = this.cameras.main;
    cam.setBounds(L.outer.x, L.outer.y, L.outer.w, L.outer.h);
    cam.centerOn(p.x, p.y);
    cam.flash(300, 10, 10, 20);
    if (this.bossesBeaten.includes(d.id)) this.hud.areaBanner(d.cave.toUpperCase(), 'Quiet now. Swim into the EXIT tunnel to leave');
    else this.hud.popup('Swim into the EXIT tunnel to leave', p.x, p.y - p.size * 1.8, false, '#ffffff');
  }

  /** Back to the open sea, just above the cave entrance. */
  leaveArena(): void {
    const d = this.arena;
    if (!d) return;
    this.arena = null;
    const O = BALANCE.world.loopOverlap;
    const cam = this.cameras.main;
    cam.setBounds(-O, 0, BALANCE.world.width + O * 2, BALANCE.world.height);
    const e = this.entranceSpot(d);
    this.player.arcadeBody.reset(e.x, e.y - 40);
    this.player.arcadeBody.setVelocity(0, 0);
    cam.centerOn(this.player.x, this.player.y);
    cam.flash(300, 10, 10, 20);
    // No question again until you have swum away from the entrance.
    this.caveDeclined = d.id;
  }

  /** Lost to the boss: no death; you wake up at the entrance with some health, and the boss is back to full. */
  private arenaLoss(by: Creature | null): void {
    const d = this.arena!;
    const A = this.arenaCfg;
    const p = this.player;
    this.leaveArena();
    p.hp = Math.max(1, p.maxHp * A.lossHpFraction);
    p.invulnTimer = A.lossInvulnSeconds;
    this.bosses.healFull();
    for (const o of this.creatures) if (o.brain && o !== by) o.brain.forget(this.playerCreature);
    this.hud.bigBanner(`${d.name.toUpperCase()} WINS THIS TIME`, 'You woke up at the cave entrance. Heal up and try again');
    if (!this.testMode && !BOT_MODE) this.checkpoint(true);
  }

  /** Swimmers in an arena (the player inside, a boss) stay in its open water: there is no seabed down there. */
  private collideArena(c: Creature): boolean {
    const f = c.fish;
    if (f.y < BALANCE.world.height) return false;
    const d = c.boss ? this.bosses.defs.find((b) => b.id === c.boss) : this.arena;
    if (!d) return false;
    const L = this.arenaLayout(d);
    const r = (f.body as Phaser.Physics.Arcade.Body | null)?.halfWidth ?? f.size;
    const q = clampToBox(f.x, f.y, r, L.inner);
    if (q.x !== f.x || q.y !== f.y) {
      const body = f.body as Phaser.Physics.Arcade.Body;
      // In the air pocket and the EXIT tunnel the walls open a little.
      const inAir = Math.abs(f.x - L.air.x) < 140 && f.y < L.inner.y + r;
      const inExit = c.isPlayer && f.x < L.inner.x + r && f.y > L.exit.y && f.y < L.exit.y + L.exit.h;
      if (!inAir && !inExit) {
        f.setPosition(q.x, q.y);
        if (q.x !== f.x) body.velocity.x = 0;
        body.velocity.set(q.x === f.x ? body.velocity.x : 0, q.y === f.y ? body.velocity.y : 0);
      }
      if (inExit) f.x = Math.max(L.outer.x + r, f.x);
      if (inAir) f.y = Math.max(L.outer.y + r, f.y);
    }
    return true;
  }

  /** A boss's bite or shock: a share of the player's health (trophies soften shocks), a stun, knockback. */
  private hurtPlayerBy(by: Creature, hpFraction: number, stun: number, label: string): void {
    const p = this.player;
    if (this.dead || p.invulnTimer > 0) return;
    const def = BALANCE.playerDefense;
    const mul = label === 'BITE' ? 1 : shockMul(this.bossesBeaten, BALANCE.bosses.list as unknown as BossDef[]);
    const dmg = Math.min(p.armored(p.maxHp * hpFraction * mul), p.maxHp * def.maxHitFraction);
    const killed = p.takeDamage(dmg, false);
    p.invulnTimer = def.invulnerableSeconds;
    p.stun(Math.max(def.stunOnHitSeconds, stun));
    const a = by.fish;
    const d = Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) || 1;
    p.arcadeBody.setVelocity(((p.x - a.x) / d) * def.knockback, ((p.y - a.y) / d) * def.knockback);
    this.hud.popup(label === 'BITE' ? `-${Math.round(dmg)}` : `${label} -${Math.round(dmg)}`, p.x, p.y - p.size, true, label === 'BITE' ? '#ff5c5c' : '#fee761');
    this.hud.hurt();
    this.sfx.hurt();
    this.cameras.main.shake(160, 0.007);
    if (killed) this.playerDied(by, 'bitten');
  }

  /** A boss beaten: a big reward (XP and full health), its trophy, a banner, and the save is written right away. */
  private bossDefeated(id: string, c: Creature): void {
    const def = (BALANCE.bosses.list as unknown as BossDef[]).find((b) => b.id === id)!;
    const p = this.player;
    for (const o of this.creatures) o.brain?.forget(c);
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    c.fish.destroy();
    if (!this.bossesBeaten.includes(id)) this.bossesBeaten.push(id);
    p.hp = p.maxHp;
    this.spawnChunks(c.fish.x, c.fish.y, p, p.xpNeeded * def.rewardLevels, 8);
    this.cameras.main.flash(450, 255, 240, 160);
    this.sfx.levelUp();
    const free = Math.max(0, Math.round(def.rewardPerks ?? 0));
    this.hud.bigBanner(
      `${def.name.toUpperCase()} DEFEATED!`,
      `Trophy: ${def.trophy}. Shocks hurt you ${Math.round((1 - def.trophyShockMul) * 100)}% less${free ? `. Plus a free perk!` : ''}`,
    );
    if (!this.testMode && !BOT_MODE) this.checkpoint(true);
    // The free perk choice opens after the banner has had a moment.
    if (free) this.time.delayedCall(BALANCE.bosses.perkDelaySeconds * 1000, () => this.checkPerks());
    window.dispatchEvent(new CustomEvent('ce:boss', { detail: { defeated: id } }));
  }

  private buildGates(): void {
    const all = (BALANCE as unknown as { gates: GatesConfig }).gates.list;
    // A continued run keeps its broken gates (older saves: all open); SWIM AGAIN keeps them; a new run has none.
    const opened = this.resumedGates !== null ? openedFromSave(this.resumedGates, all) : nextGatesOpen.slice();
    this.resumedGates = null;
    nextGatesOpen = [];
    this.gates = new GateSystem(
      {
        scene: this,
        player: () => this.player,
        crabLevel: () => this.crabLevel,
        biting: () => (this.bot ? this.bot.wantsSwallow() : this.controller.wantsSwallow()),
        groundAt: (x) => this.terrain.groundAt(x),
        surfaceY: BALANCE.world.surfaceY,
        burst: (x, y, size) => this.burst(x, y, size),
        popup: (t, x, y, big, color) => this.hud.popup(t, x, y, big, color),
        banner: (title, line) => this.hud.bigBanner(title, line),
        sfx: this.sfx,
        opened: (id) => {
          if (!this.testMode && !BOT_MODE) this.checkpoint(true);
          window.dispatchEvent(new CustomEvent('ce:gate', { detail: { opened: id } }));
        },
      },
      opened,
    );
  }

  // ---------------------------------------------------------------- perks

  /** The level the player's modifiers were last worked out for (the head start changes with level). */
  private modsLevel = -1;

  private applyPerks(): void {
    const m = perkMods(this.perks);
    // The hatchling head start (strongest at the first levels, gone by earlyHelp.endsAt).
    const h = earlyHelpMods(this.player.level);
    for (const k of Object.keys(m) as Array<keyof typeof m>) m[k] *= h[k];
    this.modsLevel = this.player.level;
    // Feeding Frenzy (the shark's adult ability) adds to the perks while it lasts.
    if (this.frenzyTimer > 0) {
      const f = BALANCE.abilities.frenzy;
      m.bite *= f.biteMul;
      m.speed *= f.speedMul;
    }
    // Region twist: cold water slows you, hot and cold water make you hungry (a warm vent helps in the cold).
    const pt = playerTwist(this.twist, this.inVent);
    m.speed *= pt.speed;
    this.twistKey = this.twistKeyNow();
    this.player.mods = m;
    this.stomach.capacityMul = m.stomach;
    this.stomach.hungerMul = m.hunger * pt.hunger;
  }

  /**
   * Region twists that act on every swimmer: the Sargasso current pushes everyone east, the kelp slows
   * big bodies, and the Trench is dark around the player.
   */
  private updateEnvironment(dt: number): void {
    const adult = stageIndex(this.player.level) >= 2;
    for (const c of this.creatures) {
      if (c.asleep) continue;
      const f = c.fish;
      const t = this.twistOf(this.regions.at(f.x).id);
      const big = c.isPlayer ? adult : f.species.tier >= 3;
      f.envSpeed = big ? t.bigSlow : 1;
      if (t.current && !(c.isPlayer && this.dead) && !c.guardian) f.x += t.current * dt;
      if (f.species.cloud) this.checkCloud(c, dt);
    }
    this.blindT = Math.max(0, this.blindT - dt);
    const cave = this.arena && !this.dead ? BALANCE.bosses.caveDark : 0;
    const want = this.dead ? 0 : Math.max(this.twist.dark, cave);
    this.regionDark += (want - this.regionDark) * Math.min(1, dt * 1.5);
  }

  /**
   * A vampire squid that the player gets close to (and that is smaller than the player) puffs a cloud of glowing
   * slime: the player is blinded for `species.cloud` seconds and the squid flees. Then it waits `trench.cloudCooldown`.
   */
  private checkCloud(c: Creature, dt: number): void {
    if ((c.cloudT ?? 0) > 0) {
      c.cloudT = (c.cloudT ?? 0) - dt;
      return;
    }
    const p = this.player, f = c.fish;
    // One cloud at a time: a second squid nearby doesn't blind you again while you are still blinded.
    if (this.dead || !p || p.rank <= f.rank || this.blindT > 0) return;
    const cfg = BALANCE.trench;
    if (Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y) > (p.size + f.size) * cfg.cloudRange) return;
    c.cloudT = cfg.cloudCooldown;
    this.blindT = this.blindMax = f.species.cloud ?? 0;
    c.brain?.onHurt(this.playerCreature);
    for (let i = 0; i < 14; i++) {
      this.ambientBubbles.spawn(f.x + Phaser.Math.Between(-20, 20), f.y + Phaser.Math.Between(-20, 20), {
        vy: -Phaser.Math.Between(10, 50),
        life: Phaser.Math.FloatBetween(1.5, 3),
        scale: Phaser.Math.FloatBetween(0.15, 0.35),
        alpha: 0.8,
      });
    }
    this.hud.popup('Glowing slime!', f.x, f.y - f.size, false, '#2ce8f5');
  }

  private twistKeyNow(): string {
    return `${this.region?.id ?? ''}:${this.inVent && this.twist.ventWarms}`;
  }

  /** Offer a perk choice if one is earned (not in test swims; the bot picks at random). */
  checkPerks(): void {
    if (this.menuMode || this.dead || this.testMode || this.perkPending) return;
    if (perksOwed(this.player.level, this.perks.length, bossPerks(this.bossesBeaten, BALANCE.bosses.list as unknown as BossDef[])) <= 0) return;
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
    this.hud.popup(`${perk.name}!`, p.x, p.y - p.size * 1.6, true, '#ffd166');
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
      // Saved inside a boss arena: the run continues at its entrance (the arena is not part of the sea).
      x: this.arena ? this.entranceSpot(this.arena).x : p.x,
      y: this.arena ? this.entranceSpot(this.arena).y - 40 : p.y,
      runTime: this.runTime,
      stats: { ...this.stats, maxLevel: Math.max(this.stats.maxLevel, p.level) },
      perks: this.perks.slice(),
      crabLevel: this.crabLevel,
      gatesOpen: this.gates?.openIds() ?? [],
      dayTime: this.dayTime,
      worldW: BALANCE.world.width,
      bossesBeaten: this.bossesBeaten.slice(),
    });
    if (ok) {
      this.lastCheckpointAt = saves.lastSavedAt;
      window.dispatchEvent(new CustomEvent('ce:saved', { detail: { at: this.lastCheckpointAt, persistent: saves.persistent } }));
    } else {
      window.dispatchEvent(new CustomEvent('ce:savefailed'));
    }
    return ok;
  }

  /** Bosses beaten in this run (saved; they don't come back), and the list from a continued save. */
  bossesBeaten: string[] = [];
  private resumedBosses: string[] | null = null;
  bosses!: BossSystem;

  /** Gates saved with the run being continued (undefined = a save from before gates: keep the sea open). */
  private resumedGates: string[] | undefined | null = null;

  private applyCheckpoint(c: Checkpoint): void {
    this.resumedGates = c.gatesOpen;
    this.resumedBosses = beatenFromSave(c.bossesBeaten, BALANCE.bosses.list as unknown as BossDef[]);
    const p = this.player;
    p.setLevel(c.level);
    p.hp = Math.max(1, Math.round(p.maxHp * c.hpRatio));
    p.xp = Math.min(c.xp, p.xpNeeded - 0.001);
    p.stamina = c.stamina;
    const a = this.swimArea;
    p.setPosition(this.terrain.wrap(migrateX(c.x, c.worldW, BALANCE.world.width)), Phaser.Math.Clamp(c.y, a.top, a.bottom));
    this.stomach.reset(c.level);
    this.stomach.fill = this.stomach.capacity * c.stomachRatio;
    this.stomach.bank = c.stomachBank;
    this.runTime = c.runTime;
    this.stats = { ...c.stats };
    this.perks = (c.perks ?? []).filter((id) => !!perkById(id));
    this.crabLevel = Math.min(c.crabLevel ?? 0, c.level);
    if (c.dayTime !== undefined) this.dayTime = c.dayTime;
    p.invulnTimer = RESUME_SHIELD_SECONDS;
    this.lastCheckpointAt = Date.now();
  }
  private runReported = false;
  /** The level this run (or this Continue) started at, for the playtest log. */
  runStartLevel = 0;

  /** Attract mode: AI, food and bubbles run; the camera drifts back and forth. */
  private attractDir = 1;
  private updateAttract(dt: number, time: number): void {
    this.updateBubbles(dt);
    for (const c of this.creatures) if (c.brain) c.fish.swim(c.brain.think(dt), dt);
    this.food.update(dt, this.cameras.main.worldView, time);
    this.updateAiEating();
    this.cullStatics();
    const cam = this.cameras.main;
    cam.scrollX += 28 * this.attractDir * dt;
    // The sea loops: past the edge, jump one world width (the copied edge scenery hides the jump).
    const mid = cam.worldView.centerX;
    if (mid > BALANCE.world.width) this.loopShift(-BALANCE.world.width);
    else if (mid < 0) this.loopShift(BALANCE.world.width);
    this.keepNearFocus(cam.worldView.centerX);
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
    for (let i = this.food.items.length - 1; i >= 0; i--) {
      const f = this.food.items[i];
      if (full && !f.scrap) continue;
      if (p.canSwallow(f.size) && Phaser.Math.Distance.Between(mouth.x, mouth.y, f.img.x, f.img.y) < touchR + f.size) {
        this.food.remove(f);
        this.sfx.nibble();
        if (f.scrap) {
          // Bite scraps: a little XP, but no food in the stomach (kill it and eat the carcass for that).
          const xp = Math.max(1, Math.round(f.xp * BALANCE.stomach.biteScrapXpFraction));
          this.hud.popup(`+${xp}`, f.img.x, f.img.y, false, '#c0cbdc');
          this.grantXp(xp);
          continue;
        }
        this.stats.plankton++;
        this.gainXp(Math.max(1, Math.round(f.xp)), f.img.x, f.img.y, false);
      }
    }

    // Fish in reach: swallow if small enough, otherwise bite.
    let swallowTarget: Creature | null = null;
    let biteTarget: Creature | null = null;
    const checkR = p.mouthRadius(true);
    for (const c of this.creatures) {
      // Friends (green sea turtles) can't be eaten or bitten.
      if (c.isPlayer || c.asleep || c.fish.species.friendly) continue;
      const d = Phaser.Math.Distance.Between(mouth.x, mouth.y, c.fish.x, c.fish.y);
      if (p.canSwallow(c.fish.size) && !c.guardian) {
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
          if (t.species.venom) this.sting(swallowTarget);
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
    if (attacker.isPlayer) this.playerBites++;
    if (target.isPlayer) {
      this.attackPlayer(attacker, damageMul);
      return;
    }
    // A boss gulping air takes extra damage from your bites.
    if (attacker.isPlayer && target.boss) damageMul *= this.bosses.damageMulAgainst(target);
    const dmg = t.armored(a.biteDamage * damageMul);
    const killed = t.takeDamage(dmg);

    // Meat chunks torn off at the wound, sized so the attacker can swallow them.
    const wx = Phaser.Math.Linear(t.x, a.x, 0.35);
    const wy = Phaser.Math.Linear(t.y, a.y, 0.35);
    this.spawnChunks(wx, wy, a, dmg * cb.meatXpPerDamage, Phaser.Math.Between(1, 2), true);
    if (attacker.isPlayer) {
      this.hud.popup(`-${Math.round(dmg)}`, t.x, t.y - t.size, false, '#ff9a8a');
      this.sfx.bite();
      if (t.species.venom) this.sting(target);
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
    if (attacker.boss) {
      const bd = (BALANCE.bosses.list as unknown as BossDef[]).find((b) => b.id === attacker.boss);
      if (bd) return this.hurtPlayerBy(attacker, bd.biteHpFraction, bd.biteStunSeconds, 'BITE');
    }
    const chomp = a.canSwallow(p.size);
    // The Checkpoint Crab's pinch is set from your health, so the fight is fair for every hero.
    const raw = attacker.guardian
      ? p.maxHp * BALANCE.checkpointCrab.pinchHpFraction
      : a.biteDamage * damageMul * (chomp ? def.chompMultiplier : 1);
    const dmg = Math.min(p.armored(raw), p.maxHp * def.maxHitFraction);
    const killed = p.takeDamage(dmg, false);

    p.invulnTimer = def.invulnerableSeconds;
    p.stun(attacker.guardian ? Math.max(def.stunOnHitSeconds, BALANCE.checkpointCrab.pinchStunSeconds) : def.stunOnHitSeconds);
    const d = Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) || 1;
    p.arcadeBody.setVelocity(((p.x - a.x) / d) * def.knockback, ((p.y - a.y) / d) * def.knockback);

    const wx = Phaser.Math.Linear(p.x, a.x, 0.35);
    const wy = Phaser.Math.Linear(p.y, a.y, 0.35);
    this.spawnChunks(wx, wy, a, dmg * BALANCE.combat.meatXpPerDamage, 1, true);
    this.hud.popup(`-${Math.round(dmg)}`, p.x, p.y - p.size, true, '#ff5c5c');
    this.hud.hurt();
    this.sfx.hurt();
    this.cameras.main.shake(140, chomp ? 0.008 : 0.005);
    if (killed) this.playerDied(attacker, chomp ? 'swallowed' : 'bitten');
  }

  /** Meat chunks. `scrap` = torn off a fish that is still alive (XP only, it does not fill the stomach). */
  private spawnChunks(x: number, y: number, eater: Fish, totalXp: number, count: number, scrap = false): void {
    const size = Phaser.Math.Clamp(eater.devourSize * 0.6, 3, 40);
    for (let i = 0; i < count; i++) {
      const f = this.food.spawnMeat(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), size, totalXp / count, scrap);
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
    if (victim.boss) {
      this.bosses.onKilled(victim);
      return;
    }
    if (victim.guardian) {
      this.crabDefeated(victim);
      return;
    }
    this.respawnAmbient(victim);
  }

  /** Venomous spines (lionfish): biting or swallowing one costs a little health. */
  private sting(by: Creature): void {
    const p = this.player;
    if (this.dead) return;
    const dmg = p.maxHp * (by.fish.species.venom ?? 0);
    const killed = p.takeDamage(dmg, false);
    this.hud.popup(`Ouch, spines! -${Math.round(dmg)}`, p.x, p.y - p.size * 1.4, true, '#f6757a');
    this.hud.hurt();
    this.sfx.hurt();
    if (killed) this.playerDied(by, 'bitten');
  }

  // ---------------------------------------------------------------- Checkpoint Crab

  /** The crab level you have reached but not beaten yet (0 = none): the highest multiple of everyLevels. */
  get pendingCrabLevel(): number {
    const every = BALANCE.checkpointCrab.everyLevels;
    const milestone = Math.floor(this.player.level / every) * every;
    return milestone >= every && milestone > this.crabLevel ? milestone : 0;
  }

  private updateCrab(dt: number): void {
    if (this.menuMode || this.dead || !this.player) return;
    this.crabCheckTimer -= dt;
    if (this.crabCheckTimer > 0) return;
    this.crabCheckTimer = 0.5;
    const pending = this.pendingCrabLevel;
    if (pending && !this.crab) this.spawnCrab(pending);
  }

  /** A Checkpoint Crab appears near the deepest water you may swim in, a short way off to one side. */
  private spawnCrab(milestone: number): void {
    const cfg = BALANCE.checkpointCrab;
    const p = this.player;
    const sp = getSpecies('checkpoint_crab');
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = p.x + side * cfg.spawnDistance;
    // The crab waits above the ground (a seamount top counts), never inside it.
    let ground = this.seabedTop;
    for (let dx = -cfg.homeWidth / 2; dx <= cfg.homeWidth / 2; dx += 40) ground = Math.min(ground, this.terrain.groundAt(x + dx));
    const floor = Math.min(this.depthLimitY ?? this.seabedTop, ground) - 40;
    const home = new Phaser.Geom.Rectangle(x - cfg.homeWidth / 2, floor - cfg.homeHeight, cfg.homeWidth, cfg.homeHeight);
    // As big as you (a little bigger), and as tough as `hitsToDefeat` of your bites.
    let level = 1;
    const crab = new Fish(this, x, home.centerY, sp, 1);
    while (level < 80 && crab.size < p.size * cfg.sizeRatio) crab.setLevel(++level);
    crab.maxHp = Math.max(1, Math.round(p.biteDamage * (1 - (sp.armor ?? 0)) * cfg.hitsToDefeat)); // each bite is softened by its shell
    crab.hp = crab.maxHp;
    const look = this.speciesLook(sp.look);
    if (look) {
      crab.applySkin(look.key, look.frames);
      crab.setArt(look.art);
    }
    crab.setDepth(6);
    this.physics.add.collider(crab, this.rocks);
    const c: Creature = { fish: crab, isPlayer: false, band: home, guardian: true };
    c.brain = new Brain(c, this);
    this.creatures.push(c);
    this.crab = c;
    this.crabMilestone = milestone;
    this.hud.crabAppeared(milestone);
    this.sfx.crabHorn();
    this.sfx.stun();
    window.dispatchEvent(new CustomEvent('ce:crab', { detail: { appeared: milestone } }));
  }

  /** Crab defeated: its level is saved, a big reward, and the save is written right away. */
  private crabDefeated(c: Creature): void {
    const p = this.player;
    for (const o of this.creatures) o.brain?.forget(c);
    const { x, y } = c.fish;
    this.creatures.splice(this.creatures.indexOf(c), 1);
    c.fish.destroy();
    this.crab = null;
    this.crabLevel = Math.max(this.crabLevel, this.crabMilestone);
    this.spawnChunks(x, y, p, p.xpNeeded * BALANCE.checkpointCrab.rewardLevels, 6);
    this.cameras.main.flash(350, 255, 240, 200);
    this.sfx.levelUp();
    this.hud.crabDefeated(this.crabLevel);
    this.checkpoint(true);
    window.dispatchEvent(new CustomEvent('ce:crab', { detail: { defeated: this.crabLevel } }));
  }

  /** A species' pixel look, built into a texture once per scene (null = keep the atlas art). */
  private speciesLooks = new Map<string, { key: string; frames: SkinFrames; art: SkinArt | null } | null>();
  private speciesLook(look?: string): { key: string; frames: SkinFrames; art: SkinArt | null } | null {
    if (!look) return null;
    if (this.speciesLooks.has(look)) return this.speciesLooks.get(look)!;
    let built: { key: string; frames: SkinFrames; art: SkinArt | null } | null = null;
    // The studio design (edited or not) wins; the design shipped with the game is the fallback.
    const project = getStageLook(look) ?? (this.cache.json.get('look:' + look) as StudioProject | undefined);
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
      this.tweens.add({ targets: bone, y: Math.min(t.y + 400, this.terrain.groundAt(t.x) + 10), angle: bone.angle + 160, alpha: 0, duration: 6000, ease: 'Sine.easeIn', onComplete: () => bone.destroy() });
      return;
    }
    // The player (and other animated species) sink belly-up, greyed out, in their current look.
    const rest = t.species.art?.frames?.rest;
    if (rest || t === this.player || t.species.upright) {
      const body = this.add.image(t.x, t.y, t.texture.key, t.frame.name).setScale(t.scaleX).setFlipY(!t.flipY).setRotation(t.rotation).setTint(0x7a8a7a).setDepth(3);
      this.tweens.add({ targets: body, y: Math.min(t.y + 400, this.terrain.groundAt(t.x) + 10), alpha: 0, duration: 6000, ease: 'Sine.easeIn', onComplete: () => body.destroy() });
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
      y: Math.min(t.y + 400, this.terrain.groundAt(t.x) + 10),
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
      if (c.isPlayer || c.asleep) continue;
      const t = c.fish;
      const d = Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y);
      if (d > (p.size + t.size) * 0.9) continue;

      // The player ramming an AI fish: the speed aimed at it counts (brushing past is not a ram).
      const nx = (t.x - p.x) / (d || 1);
      const ny = (t.y - p.y) / (d || 1);
      const into = p.lastVx * nx + p.lastVy * ny;
      const fast = p.dashing || into > p.cruiseSpeed * cb.ramSpeedRatio;
      if (fast && !t.stunned) {
        if (p.dashing && t.rank > p.rank * cb.dash.reboundSizeRatio) {
          p.arcadeBody.setVelocity(-nx * p.lastSpeed * 0.5, -ny * p.lastSpeed * 0.5);
          p.dashTimer = 0;
          p.stun(0.5);
          this.sfx.stun();
          this.cameras.main.shake(120, 0.005);
        } else if (t.rank <= p.rank * cb.ramSizeRatio || p.dashing) {
          t.stun(cb.ramStunSeconds);
          t.arcadeBody.setVelocity(nx * cb.dash.knockback, ny * cb.dash.knockback);
          // A fish about your size or smaller is just knocked aside; only bumping into something clearly stronger slows you.
          if (t.rank > p.rank * cb.ramSlowRankRatio) p.arcadeBody.velocity.scale(0.5);
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
      if (!b || c.asleep) continue;
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

  playerDied(by: Creature | null, how: DeathCause): void {
    if (this.dead) return;
    // Losing inside a boss arena is not the end of the run.
    if (this.arena) return this.arenaLoss(by);
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
    const tideBefore = tideOf(p.level);
    const levels = p.addXp(xp);
    if (levels > 0) this.spawnUnlocked();
    // A new Tide: its banner comes after the level-up or evolution banner.
    const tide = tideOf(p.level);
    if (levels > 0 && tide > tideBefore) this.time.delayedCall(3200, () => !this.dead && this.hud.newTide(tide, tideName(tide)));
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

  /** Put an eaten AI fish back somewhere off-screen in its depth band (after its respawn delay). */
  private respawnAmbient(c: Creature): void {
    for (const o of this.creatures) o.brain?.forget(c);
    const f = this.factorsOf(c.fish.species.id);
    this.placeAmbient(c, Math.random() < f.nearPlayer);
    const roll = rollLevel(f, this.aiLevelBonus);
    c.fish.setLevel(roll.level);
    c.fish.setElite(roll.elite);
    c.fish.resetCombat();
    if (c.brain) c.brain.hunger = Phaser.Math.FloatBetween(0.5, 1);
    // Hidden until the delay is over (it sleeps meanwhile).
    c.respawnT = f.respawnDelay;
  }

  /** Move an AI fish somewhere out of sight: near its home, or (`nearPlayer`) just off the player's screen. */
  private placeAmbient(c: Creature, nearPlayer: boolean): void {
    const band = c.band ?? this.swimArea;
    const view = this.cameras.main.worldView;
    let x = 0;
    let y = 0;
    for (let i = 0; i < 20; i++) {
      if (nearPlayer && i < 10) {
        // Just past the edge of the screen, left or right.
        const side = Math.random() < 0.5 ? -1 : 1;
        x = view.centerX + side * (view.width / 2 + Phaser.Math.Between(250, 600));
      } else {
        // The nearest copy to the camera (the sea loops), out of sight and not inside rock.
        x = this.wrapNear(c.homeX?.() ?? Phaser.Math.Between(band.left, band.right), view.centerX);
      }
      y = Phaser.Math.Between(band.top, band.bottom);
      if ((x < view.left - 200 || x > view.right + 200) && !this.terrain.isSolid(x, y, 40)) break;
    }
    c.fish.arcadeBody.reset(x, y);
  }

  // ---------------------------------------------------------------- world

  private drawWater(W: number, H: number): void {
    const surfaceY = BALANCE.world.surfaceY;
    const P = WORLD_PX;

    // Sky strip above the surface.
    const O = BALANCE.world.loopOverlap;
    this.skyRect = this.add.rectangle(-O, 0, W + O * 2, surfaceY, 0xc0cbdc).setOrigin(0, 0).setDepth(-100);
    this.drawSkyLights(W, surfaceY);

    // Water: flat pixel bands (Shallows, Reef, Deep) with dithered edges, in each region's colors.
    // Each region is a repeating 4-pixel-wide pattern; a dithered strip blends one region into the next.
    const rows = Math.ceil((H - surfaceY) / P);
    const half = BALANCE.regions.blend / 2;
    for (const reg of this.regions.cfg.list) {
      makeWater(this, `w_water_${reg.id}`, 4, rows, regionStops(reg.water));
      this.add
        .tileSprite(reg.from + half, surfaceY, reg.to - reg.from - half * 2, rows * P, `w_water_${reg.id}`)
        .setOrigin(0, 0)
        .setTileScale(P)
        .setDepth(-100);
    }
    for (const b of this.regions.borders()) {
      const key = `w_water_${b.left.id}_${b.right.id}`;
      makeWaterBlend(this, key, regionStops(b.left.water), regionStops(b.right.water), Math.round((half * 2) / P), rows);
      // The last border is the loop's seam: draw it at the right edge (the copy past the left edge comes from mirrorEdges).
      const bx = b.x === 0 ? W : b.x;
      this.add.image(bx - half, surfaceY, key).setOrigin(0, 0).setScale(P).setDepth(-100);
    }

    // Surface line: two art pixels of light.
    this.add.rectangle(-O, surfaceY - P, W + O * 2, P, 0xffffff, 0.6).setOrigin(0, 0).setDepth(-99);
    this.add.rectangle(-O, surfaceY, W + O * 2, P, 0x2ce8f5, 0.5).setOrigin(0, 0).setDepth(-99);

    // Stepped, dithered light rays from the surface.
    makeRay(this, 'w_ray_a', 18, 150, 40);
    makeRay(this, 'w_ray_b', 30, 180, 70);
    for (let x = 200; x < W; x += Phaser.Math.Between(350, 700)) {
      const base = Phaser.Math.FloatBetween(0.04, 0.07);
      const img = this.add
        .image(Math.round(x / P) * P, surfaceY, Math.random() < 0.5 ? 'w_ray_a' : 'w_ray_b')
        .setOrigin(0, 0)
        .setScale(P)
        .setAlpha(base)
        .setDepth(-90);
      this.rays.push({ img, base });
    }

    // Far layers per depth (parallax): islands on the horizon above the Shallows,
    // tall faded peaks behind the Reef.
    // When the sea loops, the camera jumps one world width; each layer moves W x factor on screen,
    // which is a whole number of its tiles (texture widths chosen for that), so nothing visibly jumps.
    const farX = -O * 2 - 4000;
    const farW = W * 1.4 + O * 4 + 12000;
    makeFarIslands(this, 'w_far_islands', 375, 16);
    this.add
      .tileSprite(farX, surfaceY, farW, 16 * P, 'w_far_islands')
      .setOrigin(0, 1)
      .setTileScale(P)
      .setScrollFactor(0.5, 1)
      .setAlpha(0.45)
      .setDepth(-99);
    makeFarPeaks(this, 'w_far_peaks', 450, 300);
    this.add
      .tileSprite(farX, this.seabedTop + 10, farW, 300 * P, 'w_far_peaks')
      .setOrigin(0, 1)
      .setTileScale(P)
      .setScrollFactor(0.6, 1)
      .setAlpha(0.22)
      .setDepth(-95);

    // One far silhouette layer that scrolls slower than the world (parallax).
    makeSilhouette(this, 'w_far', 375, 90);
    this.add
      .tileSprite(farX, this.seabedTop + 10, farW, 90 * P, 'w_far')
      .setOrigin(0, 1)
      .setTileScale(P)
      .setScrollFactor(0.75, 1)
      .setAlpha(0.55)
      .setDepth(-70);
  }

  private drawSeabed(_W: number, H: number): void {
    // One image for the whole ground line: dunes, rocky ridges and seamounts.
    const g = makeGround(this, 'w_ground', this.terrain, this.regions, H, WORLD_PX);
    for (const ch of g.chunks) this.add.image(ch.x, ch.y, ch.key).setOrigin(0, 0).setScale(WORLD_PX).setDepth(-20);
  }

  /** Islands at the surface: palms above, a sandbank and mangrove roots (a hiding place) below. */
  private drawIslands(): void {
    const t = this.terrain;
    const above = BALANCE.world.surfaceY - 4;
    t.cfg.islands.forEach((isl, i) => {
      const key = `w_island_${i}`;
      if (isl.style === 'iceberg') makeIceberg(this, key, t, isl.x, isl.width, isl.depth, above, WORLD_PX, 60 + i);
      else if (isl.style === 'volcano') makeVolcano(this, key, t, isl.x, isl.width, isl.depth, above, WORLD_PX, 60 + i);
      else if (isl.style === 'mangrove') makeMangrove(this, key, t, isl.x, isl.width, isl.depth, t.cfg.rootsDepth * 1.4, above, WORLD_PX, 60 + i);
      else if (isl.style === 'cave') makeCaveRock(this, key, t, isl.x, isl.width, isl.depth, above, WORLD_PX, 60 + i);
      else makeIsland(this, key, t, isl.x, isl.width, isl.depth, t.cfg.rootsDepth, above, WORLD_PX, 60 + i);
      this.add.image(isl.x, t.surfaceY - Math.floor(above / WORLD_PX) * WORLD_PX, key).setOrigin(0.5, 0).setScale(WORLD_PX).setDepth(-18);
      const sw = Math.round((isl.width * 0.9) / WORLD_PX);
      makeShadow(this, `w_shadow_${i}`, sw, 70);
      this.add
        .image(isl.x, t.surfaceY + isl.depth * 0.6, `w_shadow_${i}`)
        .setOrigin(0.5, 0)
        .setScale(WORLD_PX)
        .setAlpha(0.22)
        .setDepth(-60);
    });
    for (const [x, y, w, h] of t.rootZones()) this.kelpZones.push(new Phaser.Geom.Rectangle(x, y, w, h));
  }

  /** Coral gardens on the seamount tops: brain coral, branching coral, sea fans, anemones, sponges. */
  private plantCoral(): void {
    const t = this.terrain;
    CORAL_KINDS.forEach((k, i) => {
      for (let v = 0; v < 2; v++) makeCoral(this, `w_coral_${k}_${v}`, k, 200 + i * 7 + v);
    });
    const per = Math.max(3, Math.round(BALANCE.terrain.corals));
    // Coral grows only in the warm Coral Sea (Swamp and Frozen Sea seamounts stay bare).
    for (const top of t.plateaus().filter((pl) => this.regions.at(pl.x).id === 'coral')) {
      for (let i = 0; i < per; i++) {
        const x = top.x + Phaser.Math.FloatBetween(-top.half, top.half);
        if (Math.abs(t.slopeAt(x)) > 0.6) continue;
        const kind = Phaser.Utils.Array.GetRandom(CORAL_KINDS as unknown as string[]);
        const front = Math.random() < 0.3;
        const piece = this.add
          .image(x, t.groundAt(x) + WORLD_PX * 2, `w_coral_${kind}_${Phaser.Math.Between(0, 1)}`)
          .setOrigin(0.5, 1)
          .setScale(WORLD_PX * Phaser.Math.FloatBetween(0.9, 1.3))
          .setFlipX(Math.random() < 0.5)
          .setDepth(front ? 19 : -12)
          .setAlpha(front ? 0.92 : 1);
        if (kind === 'anemone' || kind === 'fan') this.sway(piece, 4, Phaser.Math.Between(1400, 2600), Phaser.Math.Between(0, 1200));
      }
      // Coral gardens are hiding places, like kelp.
      this.kelpZones.push(new Phaser.Geom.Rectangle(top.x - top.half, top.y - 150, top.half * 2, 160));
    }
  }

  // ---------------------------------------------------------------- day and night

  /** Sun, moon and stars in the sky strip (they fade in and out with the time of day). */
  private drawSkyLights(W: number, surfaceY: number): void {
    const P = WORLD_PX;
    if (!this.textures.exists('w_sun')) {
      const g = new Grid(13, 13);
      g.ellipse(6, 6, 6, 6, (_x, _y, u, v) => (u * u + v * v < 0.35 ? C.yellow : C.gold));
      g.toTexture(this, 'w_sun');
      const m = new Grid(11, 11);
      m.ellipse(5, 5, 5, 5, C.white);
      m.ellipse(7, 4, 4, 4, null);
      m.dot(3, 6, C.mist);
      m.dot(4, 8, C.mist);
      m.toTexture(this, 'w_moon');
      const st = new Grid(3, 3);
      st.dot(1, 0, C.mist); st.dot(0, 1, C.mist); st.dot(2, 1, C.mist); st.dot(1, 2, C.mist); st.dot(1, 1, C.white);
      st.toTexture(this, 'w_star');
    }
    this.sun = this.add.image(0, surfaceY * 0.5, 'w_sun').setScale(P).setDepth(-99.5);
    this.moon = this.add.image(0, surfaceY * 0.45, 'w_moon').setScale(P).setDepth(-99.5);
    for (let i = 0; i < W / 140; i++) {
      this.stars.push(
        this.add
          .image(Phaser.Math.Between(0, W), Phaser.Math.Between(6, surfaceY - 14), 'w_star')
          .setScale(Math.random() < 0.3 ? P : P / 2)
          .setDepth(-99.6)
          .setAlpha(0),
      );
    }
  }

  /** Time passes: blend the light, move the sun and moon, and tell the player when the period changes. */
  private updateDayNight(dt: number): void {
    if (!this.light) return;
    if (!this.dead) this.dayTime += dt;
    const L = (this.light = this.dayNight.lightAt(this.dayTime));
    this.skyRect?.setFillStyle(L.sky);
    for (const r of this.rays) r.img.setAlpha(r.base * L.rays);
    // Sun across the sky from dawn to the end of dusk; moon across the night.
    const view = this.cameras.main.worldView;
    const dn = this.dayNight;
    const t = dn.cycleAt(this.dayTime) * dn.length;
    const nightStart = dn.startOf('night');
    const dayFrac = Phaser.Math.Clamp(t / nightStart, 0, 1);
    const nightFrac = Phaser.Math.Clamp((t - nightStart) / (dn.length - nightStart), 0, 1);
    const arc = (f: number) => BALANCE.world.surfaceY * (0.75 - 0.5 * Math.sin(Math.PI * f));
    if (this.sun) {
      this.sun.setPosition(view.x + view.width * (0.08 + 0.84 * dayFrac), arc(dayFrac)).setAlpha(Math.min(1, 1 - L.stars * 0.9));
      this.sun.setTint(L.sky === 0xc0cbdc ? 0xffffff : 0xffd9a8);
    }
    if (this.moon) this.moon.setPosition(view.x + view.width * (0.08 + 0.84 * nightFrac), arc(nightFrac)).setAlpha(L.stars);
    const tw = this.time.now / 600;
    this.stars.forEach((st, i) => st.setAlpha(L.stars * (0.55 + 0.45 * Math.sin(tw + i * 1.7))));
    // Plankton: more at night (it rises to the surface), and it glows.
    if (this.food) {
      this.food.density = L.plankton * this.twist.food;
      this.food.glow = L.glow;
    }
    const p = dn.periodAt(this.dayTime);
    if (p !== this.period) {
      this.period = p;
      if (!this.menuMode && !this.dead) {
        const k = BALANCE.dayNight.periods[p];
        this.hud?.dayPeriod(k.name, k.line);
        if (p === 'dawn' || p === 'dusk') this.sfx.periodChime(p === 'dawn');
      }
    }
  }

  // ---------------------------------------------------------------- leaving the water

  /** Where the player is: swimming, flying through the air after a leap, or on an island. */
  landState: 'water' | 'air' | 'land' = 'water';
  /** Seconds out of the water (drying out after `land.drySafeSeconds`). */
  dryTime = 0;

  /**
   * Where you can stand on an island at x (the top of the sand hump, the mangrove mud or the
   * iceberg), or null where there is none. Matches the island art in terrainArt.
   */
  landTopAt(x: number): number | null {
    const t = this.terrain;
    const surfaceY = t.surfaceY;
    const P = WORLD_PX;
    const aboveRows = Math.floor((BALANCE.world.surfaceY - 4) / P);
    let best: number | null = null;
    for (const isl of t.cfg.islands) {
      let d = Math.abs(t.wrap(x) - isl.x) % BALANCE.world.width;
      d = Math.min(d, BALANCE.world.width - d);
      const half = (isl.width / 2 + 2 * P) * (isl.style === 'iceberg' ? 0.85 : isl.style === 'volcano' ? VOLCANO_REACH : 0.8);
      if (d >= half) continue;
      const u = d / half;
      let h: number;
      if (isl.style === 'iceberg') h = (aboveRows - 3) * P * Math.pow(1 - u, 1.1);
      else if (isl.style === 'volcano') h = Math.max(0, volcanoRows(u, aboveRows) - 1) * P;
      else if (isl.style === 'mangrove') h = 2 * P;
      else if (isl.style === 'cave') h = Math.max(0, caveRockRows(u, aboveRows) - 1) * P;
      else h = Math.min(8, aboveRows - 2) * P * Math.pow(1 - u * u, 0.6);
      const top = surfaceY - h;
      if (h > P * 0.5 && (best === null || top < best)) best = top;
    }
    return best;
  }

  /** Seconds in the air since the last leap or hop (a long fall means something went wrong). */
  private airTime = 0;
  private safeX = 0;
  private safeY = 0;
  /**
   * A safety check every frame: a hero with a broken position (not a number) or stuck in the air
   * goes back into the water at the last good spot instead of hanging the run.
   */
  private guardPlayer(dt: number): void {
    const p = this.player;
    const body = p.arcadeBody;
    const bad = !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(body.velocity.x) || !Number.isFinite(body.velocity.y);
    this.airTime = this.landState === 'air' ? this.airTime + dt : 0;
    if (bad || this.airTime > BALANCE.land.maxAirSeconds) {
      this.landState = 'water';
      this.airTime = 0;
      body.reset(this.safeX || this.terrain.wrap(Number.isFinite(p.x) ? p.x : 4500), Math.max(this.safeY, BALANCE.world.surfaceY + p.size * 2 + 40));
      body.setVelocity(0, 0);
      return;
    }
    if (this.landState === 'water' && p.y > BALANCE.world.surfaceY + p.size) {
      this.safeX = p.x;
      this.safeY = p.y;
    }
  }

  /** Sprinting up through the surface fast enough launches you into the air. */
  private checkLeap(): void {
    const p = this.player;
    const body = p.arcadeBody;
    const L = BALANCE.land;
    if (this.shellTimer > 0 || this.evolveLock > 0 || p.stunned) return;
    if (!p.isSprinting || p.y - p.size > BALANCE.world.surfaceY + 16 || body.velocity.y > -L.jumpSpeed) return;
    this.landState = 'air';
    body.setVelocity(body.velocity.x, Math.max(-L.maxJumpSpeed, body.velocity.y * 1.25));
    this.sfx.splash();
    this.burst(p.x, BALANCE.world.surfaceY, p.size * 0.5);
  }

  /** Out of the water: fall with gravity, land on islands, crawl, hop, and splash back in. */
  private updateOutOfWater(intent: { dirX: number; dirY: number; strength: number; sprint: boolean }, dt: number): void {
    const p = this.player;
    const body = p.arcadeBody;
    const L = BALANCE.land;
    const surfaceY = BALANCE.world.surfaceY;
    const foot = body.halfHeight * 0.85;
    if (this.landState === 'air') {
      body.setVelocity(body.velocity.x * Math.pow(0.99, dt * 60), body.velocity.y + L.gravity * dt);
      p.heading = Math.atan2(body.velocity.y, body.velocity.x || 0.001);
      const top = this.landTopAt(p.x);
      if (top !== null && body.velocity.y > 0 && p.y + foot >= top) {
        // Landed on an island.
        this.landState = 'land';
        p.y = top - foot;
        body.setVelocity(0, 0);
        this.burst(p.x, top, p.size * 0.3);
      } else if (body.velocity.y > 0 && p.y > surfaceY + 6) {
        // Back in the water.
        this.landState = 'water';
        body.setVelocity(body.velocity.x * 0.6, body.velocity.y * 0.35);
        this.sfx.splash();
        this.burst(p.x, surfaceY, p.size * 0.5);
      }
    } else {
      // On an island: crawl left and right; push up and sprint to hop; walk off the edge to fall.
      const dx = intent.strength > 0 ? intent.dirX * intent.strength : 0;
      body.setVelocity(dx * L.crawlSpeed * (p.size > 40 ? 1.4 : 1), 0);
      if (Math.abs(dx) > 0.1) p.heading = dx > 0 ? 0 : Math.PI;
      const top = this.landTopAt(p.x + body.velocity.x * dt);
      if (top === null) {
        this.landState = 'air';
        body.setVelocity(body.velocity.x, 40);
      } else {
        p.y = top - foot;
        if (intent.sprint && intent.dirY < -0.4) {
          this.landState = 'air';
          body.setVelocity(body.velocity.x * 1.5, -L.hopSpeed);
        }
      }
    }
    p.pose(dt);
  }

  /** Out of the water you dry out: harmless for a few seconds, then it hurts. */
  private updateDrying(dt: number): void {
    const p = this.player;
    const L = BALANCE.land;
    if (this.landState === 'water') {
      this.dryTime = Math.max(0, this.dryTime - dt * 3);
      return;
    }
    this.dryTime += dt;
    if (this.dryTime > L.drySafeSeconds && !this.dead) {
      p.hp -= p.maxHp * L.dryDamagePerSecond * dt;
      if (p.hp <= 0) this.playerDied(null, 'dried');
    }
  }

  // ---------------------------------------------------------------- soundtrack mood

  private moodTimer = 0;
  /** Pick the music for where and when you are: crab fight, the Deep, the region, then the time of day. */
  private updateMood(dt: number): void {
    this.moodTimer -= dt;
    if (this.moodTimer > 0 || !this.light) return;
    this.moodTimer = 1;
    const p = this.player;
    const x = this.menuMode || !p ? this.cameras.main.worldView.centerX : p.x;
    const region = this.regions.at(x).id;
    let mood = 'sunny';
    const crabNear = this.crab && p && Phaser.Math.Distance.Between(this.crab.fish.x, this.crab.fish.y, p.x, p.y) < 1400;
    const bossNear = this.bosses?.current && p && Phaser.Math.Distance.Between(this.bosses.current.fish.x, this.bosses.current.fish.y, p.x, p.y) < 1400;
    if (!this.menuMode && (crabNear || bossNear)) mood = 'crab';
    else if (!this.menuMode && p && this.depthOf(p.y) > 0.72) mood = 'deep';
    else if (region === 'swamp') mood = 'swamp';
    else if (region === 'ice') mood = 'ice';
    else if (region === 'volcano') mood = 'volcano';
    else if (region === 'trench') mood = 'deep';
    else if (region === 'kelp') mood = this.period === 'night' ? 'moonlit' : 'golden';
    else mood = this.period === 'night' ? 'moonlit' : this.period === 'day' ? 'sunny' : 'golden';
    this.hud?.setMood(mood, this.menuMode || !p ? 1 : tideOf(p.level), !this.menuMode && this.playerHunted);
  }

  // ---------------------------------------------------------------- the looping sea

  /**
   * The sea loops: when the player swims past an edge, everything moves one world width the other
   * way in the same frame (player, camera, food, bubbles), so the view doesn't change. Fish stay
   * within half a world of the player (keepNearFocus), on the copy of the sea the player sees.
   */
  private loopWorld(): void {
    const W = BALANCE.world.width;
    const p = this.player;
    if (!this.dead && p) {
      if (p.x >= W) this.loopShift(-W);
      else if (p.x < 0) this.loopShift(W);
      const r = this.regions.at(p.x);
      if (r !== this.region) {
        const first = this.region === null;
        this.region = r;
        if (!first && !this.menuMode) {
          this.hud.areaBanner(r.name, this.twistOf(r.id).hint);
          this.sfx.chime();
        }
      }
    }
    this.keepNearFocus(p && !this.dead ? p.x : this.cameras.main.worldView.centerX);
  }

  /** Move the player, camera and the things around them by `dx` (one world width). */
  private loopShift(dx: number): void {
    const p = this.player;
    if (p && !this.menuMode) p.x += dx;
    this.cameras.main.scrollX += dx;
    for (const f of this.food.items) f.img.x += dx;
    this.ambientBubbles.shiftX(dx);
    this.trailBubbles.shiftX(dx);
  }

  /** Keep every fish on the copy of the sea nearest to `focus` (within half a world width). */
  private keepNearFocus(focus: number): void {
    const W = BALANCE.world.width;
    for (const c of this.creatures) {
      if (c.isPlayer) continue;
      const f = c.fish;
      const d = f.x - focus;
      if (d > W / 2 || d < -W / 2) {
        const dx = d > 0 ? -W : W;
        f.x += dx;
        // A guardian's home moves with it (the crab guards the same spot of the sea).
        if (c.guardian && c.band) c.band.x += dx;
      }
    }
  }

  /** Scenery pieces with their sideways extent, so the ones far off screen can be skipped when drawing. */
  private statics: Array<{ obj: Phaser.GameObjects.Components.Visible; left: number; right: number }> = [];
  private lodFrame = 0;
  private cullTimer = 0;

  /** Remember every scenery piece built so far (from display-list index `from`) for culling. */
  private collectStatics(from: number): void {
    this.statics = [];
    for (const o of this.children.list.slice(from)) {
      const any = o as unknown as { getBounds?: () => Phaser.Geom.Rectangle; scrollFactorX?: number; setVisible?: unknown };
      if (!any.getBounds || !any.setVisible || (any.scrollFactorX ?? 1) !== 1) continue;
      if (o === this.sun || o === this.moon) continue;
      const b = any.getBounds();
      if (b.width > BALANCE.world.width) continue; // spans the whole sea
      this.statics.push({ obj: o as unknown as Phaser.GameObjects.Components.Visible, left: b.left - 120, right: b.right + 120 });
    }
  }

  /** Hide scenery far outside the view (drawing it costs time even off screen). A few times a second. */
  private cullStatics(): void {
    this.cullTimer -= this.game.loop.delta / 1000;
    if (this.cullTimer > 0) return;
    this.cullTimer = 0.2;
    const v = this.cameras.main.worldView;
    const left = v.left - v.width * 0.5, right = v.right + v.width * 0.5;
    for (const s of this.statics) {
      const show = s.right >= left && s.left <= right;
      if (show === s.obj.visible) continue;
      s.obj.setVisible(show);
      // Kelp far away stops swaying too (hundreds of tweens otherwise run every frame).
      const tw = (s.obj as unknown as Phaser.GameObjects.GameObject).getData?.('swayTween') as Phaser.Tweens.Tween | undefined;
      if (tw) {
        if (show) tw.resume();
        else tw.pause();
      }
    }
  }

  /** Creatures near a point, from this frame's grid (AIWorld). */
  nearby(x: number, y: number, r: number, out: Creature[]): Creature[] {
    return this.grid.query(x, y, r, out);
  }
  private grid = new SpatialGrid<Creature>(BALANCE.ai.gridCell);

  /** Nearest copy of x to `near` (the sea loops). For AI targets. */
  wrapNear(x: number, near: number): number {
    const W = BALANCE.world.width;
    return x + Math.round((near - x) / W) * W;
  }

  /** A gentle sway (kelp, sea fans), remembered so the loop's copies sway too. */
  private sway(obj: Phaser.GameObjects.Image, amp: number, duration: number, delay: number): void {
    obj.setData('sway', { amp, duration, delay });
    obj.setData('swayTween', this.tweens.add({ targets: obj, angle: { from: -amp, to: amp }, duration, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay }));
  }

  /**
   * The sea loops: copy every piece of scenery near an edge past the other edge (images, tiles,
   * rock circles, hiding places, vents), so the camera never sees a gap around the seam.
   * `from` = the first display-list index of the scenery built in create().
   */
  private mirrorEdges(from: number): void {
    const W = BALANCE.world.width;
    const O = BALANCE.world.loopOverlap;
    const list = this.children.list.slice(from);
    for (const obj of list) {
      const o = obj as Phaser.GameObjects.Image & { scrollFactorX: number };
      if (o.scrollFactorX !== undefined && o.scrollFactorX !== 1) continue; // parallax layers are already wide
      if (o === this.sun || o === this.moon) continue; // they follow the camera
      const b = (o as unknown as { getBounds?: () => Phaser.Geom.Rectangle }).getBounds?.();
      if (!b) continue;
      if (b.left < 0 && b.right > W) continue; // already spans the whole loop (sky, surface lines)
      for (const shift of [W, -W]) {
        // Copy what lies within O of the edge it would wrap past.
        if (shift > 0 ? b.left > O : b.right < W - O) continue;
        this.cloneStatic(o, shift);
      }
    }
    for (const z of this.kelpZones.slice()) {
      if (z.left < O) this.kelpZones.push(new Phaser.Geom.Rectangle(z.x + W, z.y, z.width, z.height));
      if (z.right > W - O) this.kelpZones.push(new Phaser.Geom.Rectangle(z.x - W, z.y, z.width, z.height));
    }
    for (const v of this.vents.slice()) {
      if (v.x < O) this.vents.push({ x: v.x + W, y: v.y });
      if (v.x > W - O) this.vents.push({ x: v.x - W, y: v.y });
    }
  }

  /** One copy of a scenery object, shifted sideways by `dx` (same look; rocks keep their collision). */
  private cloneStatic(o: Phaser.GameObjects.GameObject, dx: number): void {
    const any = o as unknown as Record<string, unknown> & Phaser.GameObjects.Image;
    let c: Phaser.GameObjects.GameObject | null = null;
    if (o instanceof Phaser.GameObjects.TileSprite) {
      c = this.add
        .tileSprite(o.x + dx, o.y, o.width, o.height, o.texture.key)
        .setOrigin(o.originX, o.originY)
        .setTileScale(o.tileScaleX, o.tileScaleY)
        .setTilePosition(o.tilePositionX, o.tilePositionY);
    } else if (o instanceof Phaser.GameObjects.Image) {
      c = this.add.image(o.x + dx, o.y, o.texture.key, o.frame.name).setOrigin(o.originX, o.originY).setFlip(o.flipX, o.flipY).setRotation(o.rotation);
      if (o.isTinted) (c as Phaser.GameObjects.Image).setTint(o.tintTopLeft);
      (c as Phaser.GameObjects.Image).setBlendMode(o.blendMode);
      const sw = o.getData('sway') as { amp: number; duration: number; delay: number } | undefined;
      if (sw) this.sway(c as Phaser.GameObjects.Image, sw.amp, sw.duration, sw.delay);
      // Rays fade with the time of day like the originals.
      const ray = this.rays.find((r) => r.img === o);
      if (ray) this.rays.push({ img: c as Phaser.GameObjects.Image, base: ray.base });
      if (this.stars.includes(o)) this.stars.push(c as Phaser.GameObjects.Image);
    } else if (o instanceof Phaser.GameObjects.Rectangle) {
      c = this.add.rectangle(o.x + dx, o.y, o.width, o.height, o.fillColor, o.fillAlpha).setOrigin(o.originX, o.originY);
    } else if (o instanceof Phaser.GameObjects.Zone) {
      const body = o.body as Phaser.Physics.Arcade.StaticBody | null;
      const z = this.add.zone(o.x + dx, o.y, o.width, o.height);
      if (body) {
        this.physics.add.existing(z, true);
        (z.body as Phaser.Physics.Arcade.StaticBody).setCircle(body.halfWidth);
        if (this.rocks.contains(o)) this.rocks.add(z);
      }
      return;
    }
    if (!c) return;
    const t = c as Phaser.GameObjects.Image;
    const src = any as Phaser.GameObjects.Image;
    if (!(o instanceof Phaser.GameObjects.Rectangle)) t.setScale(src.scaleX, src.scaleY);
    t.setDepth(src.depth).setAlpha(src.alpha).setVisible(src.visible);
  }

  private sceneryAt(x: number): boolean {
    return this.sceneryRanges.some(([a, b]) => x > a - 60 && x < b + 60);
  }

  /**
   * Scenery on the ground (balance.json "scenery"): wrecks, a submarine, whale bones, ruins,
   * an arch, warm vents and small props. Some are hiding places; the arch is solid rock with
   * an opening; vents heal.
   */
  private placeScenery(): void {
    const cfg = BALANCE.scenery;
    const t = this.terrain;
    const P = WORLD_PX;
    for (const [i, pc] of cfg.pieces.entries()) {
      const kind = pc.kind as SceneryKind;
      const key = `w_scn_${kind}`;
      makeScenery(this, key, kind, 70 + kind.length);
      const [aw, ah] = SCENERY_SIZE[kind];
      const scale = P * ((pc as { scale?: number }).scale ?? 1);
      const w = aw * scale, h = ah * scale;
      // Sit on the ground: the average height under the piece, sunk in a little.
      let gy = 0;
      for (let k = 0; k <= 4; k++) gy += t.groundAt(pc.x - w / 2 + (w * k) / 4);
      gy = gy / 5 + ((pc as { sink?: number }).sink ?? 6);
      const flip = kind !== 'arch' && kind !== 'vent' && i % 2 === 1;
      const front = kind === 'whale';
      this.add.image(pc.x, gy, key).setOrigin(0.5, 1).setScale(scale).setFlipX(flip).setDepth(front ? 18 : -14).setAlpha(front ? 0.95 : 1);
      this.sceneryRanges.push([pc.x - w / 2, pc.x + w / 2]);
      if (cfg.hide.includes(kind)) {
        const zone = kind === 'arch' ? [pc.x - w * 0.25, gy - h * 0.62, w * 0.5, h * 0.62] : [pc.x - w * 0.45, gy - h * 0.7, w * 0.9, h * 0.7];
        this.kelpZones.push(new Phaser.Geom.Rectangle(zone[0], zone[1], zone[2], zone[3]));
      }
      if (kind === 'arch') this.archRocks(pc.x, gy, w, h);
      if (kind === 'vent') this.vents.push({ x: pc.x, y: gy - h + 4 * scale });
    }
  }

  /** The arch is solid: a ring of rock circles along its band, open underneath. */
  private archRocks(cx: number, baseY: number, w: number, h: number): void {
    // Matches the art: outer ellipse (w/2, h) and inner opening about half as wide.
    const band = w * 0.12;
    const rx = w / 2 - band, ry = h - band;
    for (let k = 0; k <= 10; k++) {
      const a = (Math.PI * k) / 10;
      const zone = this.add.zone(cx + Math.cos(a) * rx, baseY - Math.sin(a) * ry, band * 2, band * 2);
      this.physics.add.existing(zone, true);
      (zone.body as Phaser.Physics.Arcade.StaticBody).setCircle(band);
      this.rocks.add(zone);
    }
  }

  /** Floating at the surface: rowboats, a beach ball, bottles. They bob and drift a little. */
  private placeFloats(): void {
    const y = BALANCE.world.surfaceY;
    for (const [i, f] of BALANCE.scenery.floats.entries()) {
      const kind = f.kind as FloatKind;
      makeFloat(this, `w_float_${kind}`, kind);
      const weed = kind === 'weed';
      const img = this.add
        .image(f.x, y + (kind === 'rowboat' ? -2 : weed ? 30 : 4), `w_float_${kind}`)
        .setScale(WORLD_PX)
        .setFlipX(i % 2 === 1)
        .setDepth(weed ? 19 : -17);
      this.tweens.add({ targets: img, y: img.y + 6, angle: weed ? { from: -1, to: 1 } : { from: -3, to: 3 }, duration: 1600 + i * 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      // Sargassum mats are hiding places just under the surface (they stay put, so the hiding spot does too).
      if (weed) {
        this.kelpZones.push(new Phaser.Geom.Rectangle(f.x - img.displayWidth * 0.45, y, img.displayWidth * 0.9, img.displayHeight * 0.8));
        continue;
      }
      if (kind !== 'rowboat') this.tweens.add({ targets: img, x: img.x + (i % 2 ? -260 : 260), duration: 26000 + i * 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  /** Warm vents: bubbles rise from them, and the player heals slowly beside one. */
  private updateVents(dt: number): void {
    const cfg = BALANCE.scenery.vent;
    const view = this.cameras.main.worldView;
    this.ventBubbleTimer -= dt;
    const puff = this.ventBubbleTimer <= 0;
    if (puff) this.ventBubbleTimer = 0.12;
    this.inVent = false;
    for (const v of this.vents) {
      if (puff && view.contains(v.x, v.y - 100)) {
        this.ambientBubbles.spawn(v.x + Phaser.Math.Between(-6, 6), v.y, {
          vy: -Phaser.Math.Between(110, 180),
          life: Phaser.Math.FloatBetween(3, 6),
          scale: Phaser.Math.FloatBetween(0.08, 0.2),
          alpha: 0.7,
        });
      }
      const p = this.player;
      if (!this.menuMode && !this.dead && p && Phaser.Math.Distance.Between(p.x, p.y, v.x, v.y - cfg.radius * 0.4) < cfg.radius) this.inVent = true;
    }
    if (this.inVent && this.player.hp < this.player.maxHp) this.player.heal(this.player.maxHp * cfg.healPerSecond * this.twist.ventHeal * dt);
  }

  /**
   * Keep every swimmer out of the seamounts, dunes and island sandbanks: push it back out along
   * the ground's normal and drop the part of its speed that points into the rock.
   * Ramming the terrain fast stuns you, like a rock.
   */
  private collideTerrain(): void {
    for (const c of this.creatures) {
      const f = c.fish;
      const body = f.body as Phaser.Physics.Arcade.Body | null;
      if (!body || !f.active || c.asleep) continue;
      if (c.isPlayer && this.landState !== 'water') continue; // in the air or on an island
      if (this.collideArena(c)) continue; // in a boss arena: its walls, not the seabed
      const r = body.halfWidth;
      const hit = this.terrain.resolve(f.x, f.y, r);
      if (!hit) continue;
      f.setPosition(hit.x, hit.y);
      const into = body.velocity.x * hit.nx + body.velocity.y * hit.ny;
      if (into < 0) body.velocity.set(body.velocity.x - into * hit.nx, body.velocity.y - into * hit.ny);
      if (c.isPlayer && !f.stunned && -into > f.cruiseSpeed * BALANCE.combat.ramSpeedRatio) {
        f.stun(BALANCE.combat.rockStunSeconds);
        this.sfx.stun();
        this.cameras.main.shake(120, 0.004);
        this.burst(f.x, f.y, f.size * 0.6);
      }
    }
  }

  private placeRocks(W: number): void {
    // Rock art in four sizes (two shapes each), always at the same pixel density.
    const sizes = [1.0, 1.7, 2.4, 3.2];
    sizes.forEach((s, i) => {
      for (let v = 0; v < 2; v++) makeRock(this, `w_rock_${i}_${v}`, 100 + i * 10 + v, Math.round(26 * s), Math.round(16 * s));
    });
    for (let i = 0; i < BALANCE.world.rockCount; i++) {
      // Rocks sit on fairly flat ground (dunes, ridges, seamount tops), never on steep walls.
      let x = Phaser.Math.Between(150, W - 150);
      for (let k = 0; k < 14 && (Math.abs(this.terrain.slopeAt(x)) > 0.35 || this.sceneryAt(x)); k++) x = Phaser.Math.Between(150, W - 150);
      const si = Phaser.Math.Between(0, sizes.length - 1);
      const s = sizes[si];
      const baseY = this.terrain.groundAt(x) + 50;
      this.add
        .image(x, baseY, `w_rock_${si}_${Phaser.Math.Between(0, 1)}`)
        .setOrigin(0.5, 1)
        .setScale(WORLD_PX)
        .setFlipX(Math.random() < 0.5)
        .setDepth(-15)
        .setTint(ROCK_TINT[this.regions.at(x).id] ?? 0xffffff);

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
    // Swamp: dark reeds and weeds. Frozen Sea: tall brown kelp (cold-water kelp forests).
    const regional = (id: string, list: Array<[number, string, string, string]>) =>
      list.map(([h, d, m, l], i) => {
        const key = `w_kelp_${id}_${i}`;
        makeKelp(this, key, 70 + i + id.length * 7, h, d, m, l);
        return { key, h };
      });
    const byRegion: Record<string, Array<{ key: string; h: number }>> = {
      coral: keys,
      swamp: regional('swamp', [[60, C.bark, C.leafDark, C.leaf], [85, C.leafDark, C.leaf, C.leafLight], [100, C.bark, C.brown, C.leaf], [45, C.sea, C.leafDark, C.leaf]]),
      // Volcanic Rift: tube worms (white stalks with red plumes) and a little dark weed.
      volcano: regional('volcano', [[22, C.mist, C.white, C.red], [30, C.stone, C.white, C.red], [38, C.mist, C.white, C.orange], [50, C.bark, C.plum, C.pink]]),
      ice: regional('ice', [[90, C.bark, C.brown, C.clay], [120, C.brown, C.clay, C.sand], [140, C.bark, C.brown, C.sand], [70, C.brown, C.clay, C.peach]]),
      // Sargasso Drift: a little pale sea grass on the deep sand (the weed floats at the surface).
      sargasso: regional('sargasso', [[18, C.sandDark, C.bone, C.sand], [26, C.clay, C.sandDark, C.bone], [34, C.sandDark, C.gold, C.bone]]),
      // Twilight Trench: short sea pens and whips that glow faintly.
      trench: regional('trench', [[20, C.navy, C.plum, C.cyan], [30, C.navy, C.slate, C.cyan], [42, C.ink, C.plum, C.pinkLight]]),
      // Kelp Forest: giant kelp, the tallest plants in the sea (from the seabed up to the surface), and a few short ones.
      kelp: [
        ...[420, 520, 600, 660].map((h, i) => {
          const key = `w_giantkelp_${i}`;
          makeGiantKelp(this, key, 90 + i, h);
          return { key, h };
        }),
        ...regional('kelp', [[70, C.brown, C.clay, C.gold], [50, C.leafDark, C.leaf, C.gold]]),
      ],
    };
    // The Kelp Forest gets many more patches than anywhere else (its own share on top of the even spread).
    const kelpForest = this.regions.cfg.list.find((r) => r.id === 'kelp');
    const extra = kelpForest ? Math.round(((kelpForest.to - kelpForest.from) / 1000) * 3) : 0;
    for (let p = 0; p < BALANCE.world.kelpPatches + extra; p++) {
      const pick = () => (p >= BALANCE.world.kelpPatches && kelpForest ? Phaser.Math.Between(kelpForest.from + 300, kelpForest.to - 300) : Phaser.Math.Between(200, W - 200));
      let cx = pick();
      for (let k = 0; k < 14 && (Math.abs(this.terrain.slopeAt(cx)) > 0.3 || this.sceneryAt(cx)); k++) cx = pick();
      const count = Phaser.Math.Between(4, 9);
      const spread = count * 40;
      let tallest = 0;
      const pool = byRegion[this.regions.at(cx).id] ?? keys;
      for (let i = 0; i < count; i++) {
        const k = Phaser.Utils.Array.GetRandom(pool);
        tallest = Math.max(tallest, k.h * WORLD_PX);
        const front = Math.random() < 0.45;
        const kx = cx + Phaser.Math.Between(-spread / 2, spread / 2);
        const kelp = this.add
          .image(kx, this.terrain.groundAt(kx) + 40, k.key)
          .setOrigin(0.5, 1)
          .setScale(WORLD_PX)
          .setFlipX(Math.random() < 0.5)
          .setDepth(front ? 20 : -10)
          .setAlpha(front ? 0.92 : 1);
        this.sway(kelp, 3, Phaser.Math.Between(1800, 3200), Phaser.Math.Between(0, 1500));
      }
      this.kelpZones.push(
        new Phaser.Geom.Rectangle(cx - spread / 2 - 30, this.terrain.groundAt(cx) + 40 - tallest * 0.9, spread + 60, tallest * 0.9),
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
      const y = Math.min(this.terrain.groundAt(x) + 10, view.bottom + 40);
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

  /** Reef fish spawn this many levels higher in later Tides (none on the home screen). */
  private get aiLevelBonus(): number {
    return this.menuMode || !this.player ? 0 : aiLevelBonus(this.player.level);
  }

  /** Species already swimming in this run (new enemies join once you reach their level). */
  private spawnedSpecies = new Set<string>();

  /** Spawn the reef's fish: every unlocked species, or `only` these (new enemies joining mid-run). */
  private spawnAmbientFish(W: number, only: string[] | null = null): void {
    if (!only) {
      this.spawnedSpecies = new Set();
      this.factorCache.clear();
      this.updateCrowdFactors();
      this.popTide = this.menuMode ? 1 : tideOf(this.player.level);
    }
    const level = this.menuMode ? 1 : this.player.level;
    for (const id of Object.keys(BALANCE.population)) {
      const sp = SPECIES[id];
      if (only ? !only.includes(id) : (sp.unlockLevel ?? 1) > level) continue;
      this.spawnedSpecies.add(id);
      this.spawnSpecies(id, this.targetCount(id), W);
    }
  }

  /** Spawn factors of a species (cached per run; see src/systems/spawnFactors.ts). */
  private factorCache = new Map<string, SpawnFactors>();
  factorsOf(id: string): SpawnFactors {
    let f = this.factorCache.get(id);
    if (!f) this.factorCache.set(id, (f = factorsFor(id)));
    return f;
  }

  /** How many of each species hunt the player this frame (for maxHunters). */
  private huntCount = new Map<string, number>();

  /** The Tide the population was last sized for (each Tide may add more of some enemies). */
  private popTide = 1;

  /** How much each region is thinned so no region holds more than `crowd.regionMaxDensity` fish per 1000 px. */
  private crowdFactors: Record<string, number> = {};
  private updateCrowdFactors(): void {
    const scale = BALANCE.world.populationScale ?? 1;
    const counts = Object.fromEntries(Object.entries(BALANCE.population as Record<string, number>).map(([id, n]) => [id, n * scale]));
    const cfg = BALANCE.crowd as CrowdConfig;
    this.crowdFactors = regionFactors(regionDensities(counts, biomeWeight, BALANCE.regions.list), cfg.regionMaxDensity);
  }

  /** How many of a species should live in the sea now: count, difficulty, world size, Tide and crowding. */
  private targetCount(id: string): number {
    const sp = SPECIES[id];
    const base = (BALANCE.population as Record<string, number>)[id] ?? 0;
    // Difficulty: more predators on Hard, more small prey on Easy.
    const mul = sp.tier >= 3 ? this.difficulty.predatorDensity : sp.tier <= 1 ? this.difficulty.preySpawnRate : 1;
    const tide = this.menuMode ? 1 : tideOf(this.player.level);
    const cfg = BALANCE.crowd as CrowdConfig;
    // Tides add enemies, but never more than maxTideMul x the base count.
    const n = Math.min(countInTide(base, this.factorsOf(id), tide), base * cfg.maxTideMul);
    const kept = keptShare(id, biomeWeight, BALANCE.regions.list, this.crowdFactors);
    return Math.max(1, Math.round(n * mul * kept * (BALANCE.world.populationScale ?? 1)));
  }

  /** Add `n` fish of a species, in groups (schools, packs), in the regions and depths it likes. */
  private spawnSpecies(id: string, n: number, W = BALANCE.world.width): void {
    const sp = SPECIES[id];
    const f = this.factorsOf(id);
    const surfaceY = BALANCE.world.surfaceY;
    const waterH = this.seabedTop - surfaceY;
    const band = new Phaser.Geom.Rectangle(
      0,
      surfaceY + waterH * sp.spawn.depthMin + 40,
      W,
      Math.max(80, waterH * (sp.spawn.depthMax - sp.spawn.depthMin) - 80),
    );
    // Each species lives mostly in the regions it likes (balance "biomes"), wandering up to its roam distance.
    // Crowded regions get fewer of every species (crowdFactors), so the mix stays and only the crowd shrinks.
    const homeX = (near?: number) => pickHomeX(this.regions, (r) => biomeWeight(id, r) * (this.crowdFactors[r] ?? 1), near, f.roam);
    if (homeX() === null) return;
    const spot = () => this.regions.wrap(homeX() ?? Phaser.Math.Between(band.left, band.right));
    for (const size of groupSizes(n, f)) {
      // One spot per group, its members close together around it.
      let gx = spot(), gy = Phaser.Math.Between(band.top, band.bottom);
      for (let k = 0; k < 12 && this.terrain.isSolid(gx, gy, 40); k++) {
        gx = spot();
        gy = Phaser.Math.Between(band.top, band.bottom);
      }
      for (let m = 0; m < size; m++) {
        let fx = gx, fy = gy;
        if (size > 1) {
          for (let k = 0; k < 6; k++) {
            fx = gx + Phaser.Math.Between(-140, 140);
            fy = Phaser.Math.Clamp(gy + Phaser.Math.Between(-90, 90), band.top, band.bottom);
            // Stay in the group's region (a school near a border must not spill into the next biome).
            if (!this.terrain.isSolid(fx, fy, 30) && this.regions.at(this.regions.wrap(fx)).id === this.regions.at(gx).id) break;
            fx = gx;
            fy = gy;
          }
        }
        const roll = rollLevel(f, this.aiLevelBonus);
        const fish = new Fish(this, fx, fy, sp, roll.level);
        const look = this.speciesLook(sp.look);
        if (look) {
          fish.applySkin(look.key, look.frames);
          fish.setArt(look.art);
        }
        fish.setElite(roll.elite);
        fish.setDepth(5);
        fish.speedMul = this.difficulty.aiSpeed;
        this.physics.add.collider(fish, this.rocks);
        // `slot` decides who is out when only a share of them is (time of day, waves).
        const c: Creature = { fish, isPlayer: false, band, homeX, slot: Math.random() };
        c.brain = new Brain(c, this);
        this.creatures.push(c);
      }
    }
  }

  /**
   * Once a second: who is out (time of day, waves, last level), and more enemies when a new Tide starts.
   * Fish that are not out are hidden (like sleeping fish) and come back off screen.
   */
  private spawnTimer = 0;
  private updateSpawnFactors(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 1;
    const level = this.menuMode ? 1 : this.player.level;
    const share = new Map<string, number>();
    for (const c of this.creatures) {
      if (!c.brain || c.guardian || c.isPlayer) continue;
      const id = c.fish.species.id;
      let sh = share.get(id);
      if (sh === undefined) share.set(id, (sh = outShare(this.factorsOf(id), this.period as PeriodId, this.runTime, level)));
      // Fish far weaker than you are background: only a share of them stay out (crowd.outgrownShare).
      const mine = this.menuMode ? sh : sh * outgrownMul(this.player.rank, c.fish.rank, BALANCE.crowd as CrowdConfig);
      const away = (c.slot ?? 0) >= mine;
      if (c.away && !away) this.placeAmbient(c, false); // back from hiding: off screen, not in front of you
      c.away = away;
    }
    this.updateScreenBudget();
    // A new Tide: top up the enemies that grow in number each Tide.
    const tide = this.menuMode ? 1 : tideOf(level);
    if (tide > this.popTide) {
      this.popTide = tide;
      for (const id of this.spawnedSpecies) {
        const have = this.creatures.filter((c) => c.brain && !c.guardian && c.fish.species.id === id).length;
        const want = this.targetCount(id);
        if (want > have) this.spawnSpecies(id, want - have);
      }
    }
  }

  /**
   * Screen budget (crowd.nearMax): too many awake fish around the player, and the extra ones that are off screen
   * nap (`crowded`, asleep like far fish), farthest first; once the crowd thins below nearWake they wake, still
   * off screen. Fish that wander out of the area wake too. Nobody vanishes or pops up in view.
   */
  private updateScreenBudget(): void {
    const cfg = BALANCE.crowd as CrowdConfig;
    const focusX = this.menuMode || !this.player ? this.cameras.main.worldView.centerX : this.player.x;
    const focusY = this.menuMode || !this.player ? this.cameras.main.worldView.centerY : this.player.y;
    const view = Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(this.cameras.main.worldView), 120, 120);
    const awake: Creature[] = [];
    const napping: Creature[] = [];
    for (const c of this.creatures) {
      if (!c.brain || c.guardian || c.isPlayer || c.away || (c.respawnT ?? 0) > 0) continue;
      const d = Math.hypot(c.fish.x - focusX, c.fish.y - focusY);
      const inView = view.contains(c.fish.x, c.fish.y);
      if (d > cfg.nearRadius) {
        if (c.crowded && !inView) c.crowded = false;
        continue;
      }
      (c.crowded ? napping : awake).push(c);
    }
    if (awake.length > cfg.nearMax) {
      const near = awake.map((c) => ({ d: Math.hypot(c.fish.x - focusX, c.fish.y - focusY), onScreen: view.contains(c.fish.x, c.fish.y) }));
      for (const i of trimCrowd(near, cfg.nearMax)) awake[i].crowded = true;
    } else if (awake.length < cfg.nearWake) {
      let room = cfg.nearWake - awake.length;
      for (const c of napping) {
        if (room <= 0) break;
        if (view.contains(c.fish.x, c.fish.y)) continue;
        c.crowded = false;
        room--;
      }
    }
  }

  /** New enemies: species whose unlock level you just reached join the reef, with a banner. */
  private spawnUnlocked(): void {
    if (this.menuMode) return;
    const level = this.player.level;
    const fresh = Object.keys(BALANCE.population).filter(
      (id) => !this.spawnedSpecies.has(id) && (SPECIES[id].unlockLevel ?? 1) <= level,
    );
    if (!fresh.length) return;
    this.spawnAmbientFish(BALANCE.world.width, fresh);
    // One NEW banner each (several can unlock at once after a big jump in level), newest first.
    fresh
      .sort((a, b) => (SPECIES[b].unlockLevel ?? 1) - (SPECIES[a].unlockLevel ?? 1))
      .forEach((id, i) => {
        const sp = SPECIES[id];
        this.time.delayedCall(1600 + i * 4200, () => {
          this.hud.newCreature(sp.displayName, sp.intro ?? '');
          this.sfx.sting();
        });
      });
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
