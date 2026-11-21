import Phaser from 'phaser';
import { saves } from '../save';
import { PERK_ICONS, perkIconCanvas } from '../ui/perkIcons';
import { BALANCE } from '../data';
import type { GameScene } from './GameScene';
import { toggleTuningPanel } from '../ui/tuning';
import { Joystick } from '../ui/Joystick';

/** Pixel font for labels, numbers and banners (loaded in index.html). */
const FONT = '"Pixelify Sans", "Courier New", monospace';
/** Plain font for longer help text, so it stays easy to read. */
const BODY = 'system-ui, sans-serif';
/** HUD colors (Endesga 32). */
const HUD = { ink: 0x181425, edge: 0x3a4466, hp: 0xe43b44, stamina: 0x2ce8f5, sprint: 0xfee761, tired: 0xf77622, food: 0x63c74d, digest: 0x2ce8f5, full: 0xf77622, xp: 0xfee761 };

/**
 * Screen-space overlay (not affected by the game camera's zoom):
 * stamina and XP bars, level readout, XP popups, level-up banner,
 * controls hint, and touch buttons (SPRINT, EAT, TUNE, GROW).
 */
export class HudScene extends Phaser.Scene {
  private game$!: GameScene;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpBack!: Phaser.GameObjects.Rectangle;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private dashBtn!: Phaser.GameObjects.Arc;
  private dashLabel!: Phaser.GameObjects.Text;
  private dashCool!: Phaser.GameObjects.Graphics;
  private staminaFill!: Phaser.GameObjects.Rectangle;
  private stomachFill!: Phaser.GameObjects.Rectangle;
  private stomachBack!: Phaser.GameObjects.Rectangle;
  private bankFill!: Phaser.GameObjects.Rectangle;
  private music?: Phaser.Sound.BaseSound;
  /** Developer buttons (TUNE, GROW) only with ?dev in the URL. */
  private readonly dev = new URLSearchParams(window.location.search).has('dev');
  musicOn = true;
  sfxOn = true;
  private joystick!: Joystick;
  private staminaBack!: Phaser.GameObjects.Rectangle;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private info!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private sprintBtn!: Phaser.GameObjects.Arc;
  private sprintLabel!: Phaser.GameObjects.Text;
  private eatBtn!: Phaser.GameObjects.Arc;
  private eatLabel!: Phaser.GameObjects.Text;
  private gearBtn!: Phaser.GameObjects.Text;
  private growBtn!: Phaser.GameObjects.Text;
  private popups: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Text;
  private deathAgain!: Phaser.GameObjects.Text;
  private deathHome!: Phaser.GameObjects.Text;
  private deathLayer!: Phaser.GameObjects.Container;
  private deathTitle!: Phaser.GameObjects.Text;
  private deathStats!: Phaser.GameObjects.Text;
  private deathShade!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.game$ = this.scene.get('Game') as GameScene;
    const style = { fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#181425', strokeThickness: 4 };
    const small = { ...style, fontSize: '12px', color: '#c0cbdc', strokeThickness: 3 };

    // Red screen-edge flash when the player is hurt.
    this.hurtFlash = this.add.rectangle(0, 0, 10, 10, 0xff2020, 0).setOrigin(0, 0).setStrokeStyle(24, 0xff2020, 0.5).setAlpha(0);

    // A dark pixel panel behind the bars keeps them readable over bright water and sky.
    this.add.rectangle(8, 6, 238, 140, HUD.ink, 0.55).setOrigin(0, 0).setStrokeStyle(2, HUD.edge, 0.9);
    this.add.text(16, 10, 'HEALTH', small);
    this.hpBack = this.add.rectangle(16, 26, 220, 12, HUD.ink, 0.9).setOrigin(0, 0).setStrokeStyle(2, HUD.edge, 1);
    this.hpFill = this.add.rectangle(18, 28, 216, 8, HUD.hp).setOrigin(0, 0);

    this.add.text(16, 44, 'STAMINA', small);
    this.staminaBack = this.add.rectangle(16, 60, 220, 12, HUD.ink, 0.9).setOrigin(0, 0).setStrokeStyle(2, HUD.edge, 1);
    this.staminaFill = this.add.rectangle(18, 62, 216, 8, HUD.stamina).setOrigin(0, 0);

    this.add.text(16, 78, 'STOMACH', small);
    this.stomachBack = this.add.rectangle(16, 94, 220, 12, HUD.ink, 0.9).setOrigin(0, 0).setStrokeStyle(2, HUD.edge, 1);
    this.stomachFill = this.add.rectangle(18, 96, 0, 8, HUD.food).setOrigin(0, 0);
    // Markers: 75% (rest to digest) and 95% (full).
    this.add.rectangle(18 + 216 * 0.75, 93, 2, 14, 0xffffff, 0.8).setOrigin(0.5, 0);
    this.add.rectangle(18 + 216 * 0.95, 93, 2, 14, 0xff8a80, 0.8).setOrigin(0.5, 0);

    this.add.text(16, 112, 'GROWTH', small);
    this.add.rectangle(16, 128, 220, 12, HUD.ink, 0.9).setOrigin(0, 0).setStrokeStyle(2, HUD.edge, 1);
    // Banked XP (still in the stomach) shows as a pale segment after the real XP.
    this.bankFill = this.add.rectangle(18, 130, 0, 8, HUD.xp, 0.35).setOrigin(0, 0);
    this.xpFill = this.add.rectangle(18, 130, 0, 8, HUD.xp).setOrigin(0, 0);
    // Pixel notches every 10% on each bar.
    for (const y of [28, 62, 96, 130]) for (let i = 1; i < 10; i++) this.add.rectangle(18 + 21.6 * i, y, 2, 8, HUD.ink, 0.45).setOrigin(0.5, 0);

    this.info = this.add.text(16, 148, '', style);
    this.hint = this.add.text(16, 0, '', { fontFamily: BODY, fontSize: '12px', color: '#c0cbdc', stroke: '#181425', strokeThickness: 3 }).setAlpha(0.9);
    // Perk icons (16x16 pixel art) in a row under the info line.
    for (const id of Object.keys(PERK_ICONS)) {
      if (!this.textures.exists('perk_' + id)) this.textures.addCanvas('perk_' + id, perkIconCanvas(id, 1)!)?.setSmoothPixelArt(true);
    }
    this.banner = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#ffd166', stroke: '#0a2236', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);

    // Virtual joystick (left half of the screen on touch devices).
    this.joystick = new Joystick(
      this,
      (id) => this.game$.controller.uiPointers.add(id),
      (id) => this.game$.controller.uiPointers.delete(id),
    );

    // Touch buttons. Each reserves its pointer so it does not steer the fish.
    [this.sprintBtn, this.sprintLabel] = this.makeHoldButton('SPRINT', 0xffffff, (down) => (this.game$.controller.uiSprint = down));
    [this.eatBtn, this.eatLabel] = this.makeHoldButton('EAT', 0xffa53a, (down) => (this.game$.controller.uiSwallow = down));
    [this.dashBtn, this.dashLabel] = this.makeHoldButton('DASH', 0x9fd3ff, (down) => {
      if (down) this.game$.controller.uiDash = true;
    });
    this.dashBtn.setRadius(36);
    this.dashCool = this.add.graphics();

    this.status = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ff6b6b', stroke: '#0a2236', strokeThickness: 5 })
      .setOrigin(0.5, 0);

    this.gearBtn = this.makeTapButton('TUNE', () => toggleTuningPanel(this.game$.player.species));
    this.menuBtn = this.makeTapButton('II  MENU', () => window.dispatchEvent(new CustomEvent('ce:pause')));
    this.menuBtn.setFontSize(15).setPadding(14, 9, 14, 9);

    // "You were eaten" overlay.
    this.deathShade = this.add.rectangle(0, 0, 10, 10, 0x020c16, 0.72).setOrigin(0, 0);
    this.deathTitle = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ff6b6b', stroke: '#0a2236', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5);
    this.deathStats = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#e6f6ff', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5);
    const btnStyle = { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', padding: { x: 22, y: 12 } };
    this.deathAgain = this.add.text(0, 0, 'SWIM AGAIN', { ...btnStyle, color: '#1b1400', backgroundColor: '#ffd23f' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.deathHome = this.add.text(0, 0, 'HOME', { ...btnStyle, color: '#eaf6ff', backgroundColor: '#123a5a' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.deathAgain.on('pointerdown', () => this.deathLayer.visible && this.respawn());
    this.deathHome.on('pointerdown', () => {
      if (!this.deathLayer.visible) return;
      this.hideDeath();
      this.game$.goHome();
    });
    this.deathLayer = this.add
      .container(0, 0, [this.deathShade, this.deathTitle, this.deathStats, this.deathAgain, this.deathHome])
      .setVisible(false)
      .setDepth(100);
    this.input.keyboard?.on('keydown-R', () => this.deathLayer.visible && this.respawn());

    // Sound options (set from the home screen's Options panel, remembered per device).
    const o = saves.loadProfile().data.settings;
    this.musicOn = o.music;
    this.sfxOn = o.sfx;
    this.game$.sfx.setMuted(!this.sfxOn);

    if (this.cache.audio.exists('music')) this.music = this.sound.add('music', { loop: true, volume: BALANCE.audio.musicVolume });
    this.growBtn = this.makeTapButton('DEV: GROW +1', () => this.game$.player.setLevel(this.game$.player.level + 1));
    this.gearBtn.setVisible(this.dev);
    this.growBtn.setVisible(this.dev);

    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  // ------------------------------------------------------------ public API

  /** Floating "+XP" text at a world position. */
  popup(text: string, worldX: number, worldY: number, big: boolean, color?: string): void {
    const cam = this.game$.cameras.main;
    // World -> screen (the HUD camera is not zoomed or scrolled).
    const sx = (worldX - cam.worldView.x) * cam.zoom;
    const sy = (worldY - cam.worldView.y) * cam.zoom;
    let t = this.popups.find((p) => !p.active);
    if (!t) {
      t = this.add.text(0, 0, '', { fontFamily: FONT, fontStyle: 'bold', color: '#fff', stroke: '#0a2236', strokeThickness: 4 }).setOrigin(0.5);
      this.popups.push(t);
    }
    t.setActive(true).setVisible(true).setText(text).setPosition(sx, sy).setAlpha(1)
      .setFontSize(big ? 24 : 14).setColor(color ?? (big ? '#ffd166' : '#d9ffc9'));
    this.tweens.add({
      targets: t,
      y: sy - (big ? 60 : 32),
      alpha: 0,
      duration: big ? 1100 : 700,
      ease: 'Cubic.easeOut',
      onComplete: () => t!.setActive(false).setVisible(false),
    });
  }

  /** Start (or resume) the music loop if music is on. Call from a user gesture. */
  startMusic(): void {
    if (!this.music || !this.musicOn) return;
    if (!this.music.isPlaying) this.music.play();
  }

  setMusicOn(on: boolean): void {
    this.musicOn = on;
    if (!this.music) return;
    if (on) this.startMusic();
    else this.music.stop();
  }

  setSfxOn(on: boolean): void {
    this.sfxOn = on;
    this.game$.sfx.setMuted(!on);
  }

  /** Red edge flash + small shake when the player takes a hit. */
  hurt(): void {
    this.hurtFlash.setAlpha(1);
    this.tweens.killTweensOf(this.hurtFlash);
    this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 450 });
  }

  showDeath(
    byName: string,
    byLevel: number,
    how: 'swallowed' | 'bitten' | 'starved',
    stats: { plankton: number; fish: number; kills: number; maxLevel: number },
  ): void {
    this.deathTitle.setText(
      how === 'swallowed' ? `Finished off by a ${byName}!` : how === 'bitten' ? `Bitten to death by a ${byName}!` : 'You starved!',
    );
    this.deathStats.setText(
      `${how === 'starved' ? 'Keep your stomach from emptying.' : `It was level ${byLevel}.`}\nYou reached level ${stats.maxLevel}: swallowed ${stats.fish} fish, killed ${stats.kills}, ate ${stats.plankton} morsels.`,
    );
    const from = this.game$.stageRestartLevel;
    this.deathAgain.setText(from > 1 ? `SWIM AGAIN FROM LEVEL ${from}` : 'SWIM AGAIN');
    this.time.delayedCall(900, () => {
      const { width, height } = this.scale;
      // The shade blocks touches to the joystick / buttons underneath.
      this.deathShade.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
      this.deathLayer.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.deathLayer, alpha: 1, duration: 300 });
    });
  }

  hideDeath(): void {
    this.deathLayer.setVisible(false);
    this.deathShade.disableInteractive();
  }

  private respawn(): void {
    this.hideDeath();
    this.game$.restartFromStage();
  }

  /** Short banner the first time you swim into an area. */
  areaBanner(name: string): void {
    this.banner.setText(name.toUpperCase()).setAlpha(1).setScale(0.7);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 0.85, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1400, duration: 600 });
  }

  /** Big banner when the creature evolves into its next stage. */
  evolved(stageName: string, sub: string): void {
    this.banner.setText(`EVOLVED: ${stageName.toUpperCase()}!\n${sub}`).setAlpha(1).setScale(0.5);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 2200, duration: 600 });
  }

  levelUp(level: number): void {
    this.banner.setText(`LEVEL ${level}!`).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 900, duration: 500 });
  }

  // ------------------------------------------------------------ internals

  private makeHoldButton(label: string, color: number, set: (down: boolean) => void): [Phaser.GameObjects.Arc, Phaser.GameObjects.Text] {
    const btn = this.add.circle(0, 0, 44, color, 0.18).setStrokeStyle(3, color, 0.65).setInteractive();
    const text = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '13px', color: '#e6f6ff' }).setOrigin(0.5);
    let owner = -1;
    btn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      owner = p.id;
      this.game$.controller.uiPointers.add(p.id);
      set(true);
      btn.setFillStyle(color, 0.42);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== owner) return;
      owner = -1;
      this.game$.controller.uiPointers.delete(p.id);
      set(false);
      btn.setFillStyle(color, 0.18);
    });
    return [btn, text];
  }

  private makeTapButton(label: string, onTap: () => void): Phaser.GameObjects.Text {
    const btn = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '13px', color: '#e6f6ff', backgroundColor: '#0a2236cc', padding: { x: 10, y: 6 } })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.game$.controller.uiPointers.add(p.id);
      onTap();
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (btn.getBounds().contains(p.downX, p.downY)) this.game$.controller.uiPointers.delete(p.id);
    });
    return btn;
  }

  /** The perks picked this run, as a row of pixel icons under the info line. */
  private perkIcons: Phaser.GameObjects.Image[] = [];
  private perkKey = '';
  private renderPerkIcons(perks: string[]): void {
    const key = perks.join(',');
    if (key === this.perkKey) return;
    this.perkKey = key;
    this.perkIcons.forEach((i) => i.destroy());
    this.perkIcons = perks
      .filter((id) => this.textures.exists('perk_' + id))
      .map((id, i) => this.add.image(16 + i * 28, 172, 'perk_' + id).setOrigin(0, 0).setScale(1.5));
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.sprintBtn.setPosition(width - 70, height - 70);
    this.sprintLabel.setPosition(width - 70, height - 70);
    this.eatBtn.setPosition(width - 175, height - 70);
    this.eatLabel.setPosition(width - 175, height - 70);
    this.dashBtn.setPosition(width - 122, height - 165);
    this.dashLabel.setPosition(width - 122, height - 165);
    this.hurtFlash.setSize(width, height);
    this.menuBtn.setPosition(width - 12, 12);
    this.gearBtn.setPosition(width - 12, 58);
    this.growBtn.setPosition(width - 12, 92);
    this.status.setPosition(width / 2, 14);
    this.deathShade.setSize(width, height);
    this.deathTitle.setPosition(width / 2, height * 0.4);
    this.deathStats.setPosition(width / 2, height * 0.4 + 80);
    this.deathAgain.setPosition(width / 2 - 100, height * 0.4 + 170);
    this.deathHome.setPosition(width / 2 + 100, height * 0.4 + 170);
    this.banner.setPosition(width / 2, height * 0.28);
    this.hint.setPosition(16, height - 28);
    const touch = this.sys.game.device.input.touch;
    this.joystick.layout(width, height, touch);
    this.hint.setText(
      touch
        ? 'Left thumb: joystick to swim. EAT: green ring = swallow, orange = bite. The round button is your stage ability.'
        : 'WASD/arrows or mouse: swim | Shift: sprint | Space/right-click: eat (green swallow, orange bite) | E/Q: ability | R restart | ` tune | P hitboxes',
    );
  }

  update(): void {
    const g = this.game$;
    const p = g?.player;
    if (!p) return;
    const c = g.controller.stick;
    c.active = this.joystick.active;
    c.x = this.joystick.x;
    c.y = this.joystick.y;
    c.strength = this.joystick.strength;
    this.hpFill.width = 216 * Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    this.hpBack.setStrokeStyle(2, p.wounded ? HUD.hp : HUD.edge, p.wounded ? 0.6 + 0.4 * Math.sin(this.time.now / 100) : 1);
    const ratio = p.stamina / BALANCE.stamina.max;
    this.staminaFill.width = 216 * ratio;
    this.staminaFill.fillColor = p.exhausted ? HUD.tired : p.isSprinting ? HUD.sprint : HUD.stamina;
    this.staminaBack.setStrokeStyle(2, p.exhausted ? HUD.tired : HUD.edge, 1);
    const xpRatio = Phaser.Math.Clamp(p.xp / p.xpNeeded, 0, 1);
    this.xpFill.width = 216 * xpRatio;
    this.bankFill.width = 216 * Phaser.Math.Clamp((p.xp + g.stomach.bank) / p.xpNeeded, 0, 1);

    const st = g.stomach;
    this.stomachFill.width = 216 * Phaser.Math.Clamp(st.ratio, 0, 1);
    this.stomachFill.fillColor = st.digesting ? HUD.digest : st.full ? HUD.full : st.readyToDigest ? 0xffffff : HUD.food;
    const starving = st.ratio < 0.1;
    this.stomachBack.setStrokeStyle(2, starving ? HUD.hp : HUD.edge, starving ? 0.6 + 0.4 * Math.sin(this.time.now / 100) : 1);
    this.info.setText(
      `${p.stage ? `${p.stage.name} · ` : ''}Level ${p.level}${p.atMaxLevel ? ' (MAX)' : ''}  |  HP ${Math.ceil(p.hp)}/${p.maxHp}  |  Bite ${p.biteDamage.toFixed(0)}  |  Swallows up to size ${p.devourSize.toFixed(0)}  |  Kills ${g.stats.kills}`,
    );
    this.renderPerkIcons(g.perks);
    // Hidden while the home screen shows the ocean behind it.
    this.cameras.main.setVisible(!g.menuMode);
    if (!g.dead && this.deathLayer.visible) this.hideDeath(); // run restarted elsewhere (R key, bot)
    if (g.dead) {
      this.status.setText('');
    } else if (p.stunned) {
      this.status.setText('STUNNED!').setColor('#ffd166').setAlpha(1);
    } else if (st.digesting) {
      this.status.setText('Digesting...').setColor('#9fe8ff').setAlpha(1);
    } else if (p.wounded) {
      this.status.setText(g.playerHunted ? 'WOUNDED AND HUNTED! Hide or eat to heal' : 'WOUNDED: eat to heal').setColor('#ff6b6b');
      this.status.setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 120));
    } else if (g.playerHunted) {
      this.status.setText(g.playerHidden ? 'HUNTED (hiding in kelp)' : 'YOU ARE BEING HUNTED!').setColor('#ff6b6b');
      this.status.setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 120));
    } else if (st.starving) {
      this.status.setText('STARVING! Eat something').setColor('#ff6b6b').setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 120));
    } else if (st.readyToDigest) {
      const pct = Math.round((st.restTime / BALANCE.stomach.restSeconds) * 100);
      this.status
        .setText(st.restTime > 0 ? `Digesting in... ${pct}%` : st.full ? 'Stomach full: stay still to digest' : 'Stay still to digest')
        .setColor('#ffffff')
        .setAlpha(0.95);
    } else if (g.depthBlocked) {
      const next = p.stage?.id === 'hatchling' ? 'juvenile' : 'adult';
      this.status.setText(`Too deep for a ${p.stage?.name.toLowerCase() ?? 'baby'}: grow into a ${next} to dive deeper`).setColor('#9fe8ff').setAlpha(0.95);
    } else if (g.playerHidden) {
      this.status.setText('Hidden in kelp').setColor('#7cff6b').setAlpha(0.9);
    } else {
      this.status.setText('');
    }

    // Pulse the EAT button when something swallowable is in reach.
    const ready = g.mouthState === 'canSwallow' || g.mouthState === 'canBite';
    const ring = g.mouthState === 'canSwallow' ? 0x7cff6b : g.mouthState === 'full' ? 0x8a9aa8 : 0xffa53a;
    this.eatBtn.setStrokeStyle(ready ? 5 : 3, ring, ready ? 1 : 0.65);
    this.eatLabel.setText(g.mouthState === 'canBite' ? 'BITE' : g.mouthState === 'full' ? 'FULL' : 'EAT');

    // Stage ability button (SHELL / LUNGE / ROLL) with its cooldown pie.
    const ab = g.ability;
    if (this.dashLabel.text !== ab.label) this.dashLabel.setText(ab.label);
    const cd = Phaser.Math.Clamp(ab.ratio, 0, 1);
    this.dashCool.clear();
    if (cd > 0) {
      this.dashCool.fillStyle(0x0a2236, 0.65);
      this.dashCool.slice(this.dashBtn.x, this.dashBtn.y, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false);
      this.dashCool.fillPath();
    }
    this.dashLabel.setAlpha(cd > 0 || !ab.usable ? 0.5 : 1);
  }
}
