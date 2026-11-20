import Phaser from 'phaser';
import { BALANCE } from '../data';
import type { GameScene } from './GameScene';
import type { DifficultyName } from '../data';
import { toggleTuningPanel } from '../ui/tuning';
import { BOT_MODE } from './GameScene';

const FONT = 'system-ui, sans-serif';

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
  private soundBtn!: Phaser.GameObjects.Text;
  private music?: Phaser.Sound.BaseSound;
  private startLayer?: Phaser.GameObjects.Container;
  private static started = false;
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
  private modeBtn!: Phaser.GameObjects.Text;
  private deathLayer!: Phaser.GameObjects.Container;
  private deathTitle!: Phaser.GameObjects.Text;
  private deathStats!: Phaser.GameObjects.Text;
  private deathShade!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.game$ = this.scene.get('Game') as GameScene;
    const style = { fontFamily: FONT, fontSize: '15px', color: '#e6f6ff' };
    const small = { ...style, fontSize: '11px', color: '#9fd3ff' };

    // Red screen-edge flash when the player is hurt.
    this.hurtFlash = this.add.rectangle(0, 0, 10, 10, 0xff2020, 0).setOrigin(0, 0).setStrokeStyle(24, 0xff2020, 0.5).setAlpha(0);

    this.add.text(16, 10, 'HEALTH', small);
    this.hpBack = this.add.rectangle(16, 26, 220, 12, 0x0a2236, 0.8).setOrigin(0, 0).setStrokeStyle(1, 0xff8a80, 0.6);
    this.hpFill = this.add.rectangle(18, 28, 216, 8, 0xff6b6b).setOrigin(0, 0);

    this.add.text(16, 44, 'STAMINA', small);
    this.staminaBack = this.add.rectangle(16, 60, 220, 12, 0x0a2236, 0.8).setOrigin(0, 0).setStrokeStyle(1, 0x9fd3ff, 0.6);
    this.staminaFill = this.add.rectangle(18, 62, 216, 8, 0x5fe0a8).setOrigin(0, 0);

    this.add.text(16, 78, 'STOMACH', small);
    this.stomachBack = this.add.rectangle(16, 94, 220, 12, 0x0a2236, 0.8).setOrigin(0, 0).setStrokeStyle(1, 0xc8e6c9, 0.6);
    this.stomachFill = this.add.rectangle(18, 96, 0, 8, 0x8bc34a).setOrigin(0, 0);
    // Markers: 75% (rest to digest) and 95% (full).
    this.add.rectangle(18 + 216 * 0.75, 93, 2, 14, 0xffffff, 0.8).setOrigin(0.5, 0);
    this.add.rectangle(18 + 216 * 0.95, 93, 2, 14, 0xff8a80, 0.8).setOrigin(0.5, 0);

    this.add.text(16, 112, 'GROWTH', small);
    this.add.rectangle(16, 128, 220, 12, 0x0a2236, 0.8).setOrigin(0, 0).setStrokeStyle(1, 0xffd166, 0.6);
    // Banked XP (still in the stomach) shows as a pale segment after the real XP.
    this.bankFill = this.add.rectangle(18, 130, 0, 8, 0xffd166, 0.35).setOrigin(0, 0);
    this.xpFill = this.add.rectangle(18, 130, 0, 8, 0xffd166).setOrigin(0, 0);

    this.info = this.add.text(16, 148, '', style);
    this.hint = this.add.text(16, 0, '', { ...style, fontSize: '12px', color: '#bfe3ff' }).setAlpha(0.85);
    this.banner = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#ffd166', stroke: '#0a2236', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);

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
    this.modeBtn = this.makeTapButton('', () => {
      const order: DifficultyName[] = ['easy', 'normal', 'hard'];
      const next = order[(order.indexOf(this.game$.difficultyName) + 1) % order.length];
      this.hideDeath();
      this.game$.setDifficulty(next);
    });

    // "You were eaten" overlay.
    this.deathShade = this.add.rectangle(0, 0, 10, 10, 0x020c16, 0.72).setOrigin(0, 0);
    this.deathTitle = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ff6b6b', stroke: '#0a2236', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5);
    this.deathStats = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#e6f6ff', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5);
    this.deathLayer = this.add.container(0, 0, [this.deathShade, this.deathTitle, this.deathStats]).setVisible(false).setDepth(100);
    this.deathShade.on('pointerdown', () => this.respawn());
    this.input.keyboard?.on('keydown-R', () => this.deathLayer.visible && this.respawn());

    // Sound toggle (remembered on this device when storage is available).
    let muted = false;
    try {
      muted = window.localStorage.getItem('fishgame.muted') === '1';
    } catch {
      /* storage unavailable: default on */
    }
    this.sound.mute = muted;
    this.game$.sfx.setMuted(muted);
    this.soundBtn = this.makeTapButton('', () => {
      this.sound.mute = !this.sound.mute;
      this.game$.sfx.setMuted(this.sound.mute);
      try {
        window.localStorage.setItem('fishgame.muted', this.sound.mute ? '1' : '0');
      } catch {
        /* ignore */
      }
    });

    this.music = this.sound.add('music', { loop: true, volume: BALANCE.audio.musicVolume });
    if (!HudScene.started && !BOT_MODE) this.showStart();
    this.growBtn = this.makeTapButton('DEV: GROW +1', () => this.game$.player.setLevel(this.game$.player.level + 1));

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

  /** Title / "tap to start" screen. Pauses the game; the tap also unlocks audio on iOS. */
  private showStart(): void {
    const { width, height } = this.scale;
    this.scene.pause('Game');
    const shade = this.add.rectangle(0, 0, width, height, 0x020c16, 0.78).setOrigin(0, 0);
    const title = this.add
      .text(width / 2, height * 0.3, 'FISH GROW', { fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#ffd166', stroke: '#0a2236', strokeThickness: 8 })
      .setOrigin(0.5);
    const sub = this.add
      .text(width / 2, height * 0.3 + 52, '(working title)', { fontFamily: FONT, fontSize: '14px', color: '#9fd3ff' })
      .setOrigin(0.5);
    const touch = this.sys.game.device.input.touch;
    const how = this.add
      .text(
        width / 2,
        height * 0.55,
        [
          'You are a young crocodile. Eat plankton, then fish smaller than you.',
          'Green ring = swallow whole. Orange ring = bite.',
          'Stomach full? Stay still for a moment to digest.',
          'Hide in kelp when something big hunts you.',
          'Big predators live in deep water. Grow up in the shallows.',
          '',
          touch ? 'Hold a finger to swim. Buttons: EAT, SPRINT, DASH.' : 'WASD / mouse to swim, Space eat, Shift sprint, E dash.',
        ].join('\n'),
        { fontFamily: FONT, fontSize: '17px', color: '#e6f6ff', align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5);
    const go = this.add
      .text(width / 2, height * 0.82, touch ? 'Tap to start' : 'Click or press any key to start', {
        fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#7cff6b',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: go, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.startLayer = this.add.container(0, 0, [shade, title, sub, how, go]).setDepth(200);
    shade.setInteractive();
    const start = () => {
      if (HudScene.started) return;
      HudScene.started = true;
      this.startLayer?.destroy();
      this.startLayer = undefined;
      this.scene.resume('Game');
      this.music?.play();
      this.game$.sfx.click();
    };
    shade.once('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
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
      how === 'swallowed' ? `Swallowed by a ${byName}!` : how === 'bitten' ? `Bitten to death by a ${byName}!` : 'You starved!',
    );
    this.deathStats.setText(
      `${how === 'starved' ? 'Keep your stomach from emptying.' : `It was level ${byLevel}.`}\nYou reached level ${stats.maxLevel}: swallowed ${stats.fish} fish, killed ${stats.kills}, ate ${stats.plankton} morsels.\n\nTap anywhere (or press R) to swim again`,
    );
    this.time.delayedCall(900, () => {
      const { width, height } = this.scale;
      this.deathShade.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
      this.deathLayer.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.deathLayer, alpha: 1, duration: 300 });
    });
  }

  private hideDeath(): void {
    this.deathLayer.setVisible(false);
    this.deathShade.disableInteractive();
  }

  private respawn(): void {
    this.hideDeath();
    this.game$.restartRun();
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

  private layout(): void {
    const { width, height } = this.scale;
    this.sprintBtn.setPosition(width - 70, height - 70);
    this.sprintLabel.setPosition(width - 70, height - 70);
    this.eatBtn.setPosition(width - 175, height - 70);
    this.eatLabel.setPosition(width - 175, height - 70);
    this.dashBtn.setPosition(width - 122, height - 165);
    this.dashLabel.setPosition(width - 122, height - 165);
    this.hurtFlash.setSize(width, height);
    this.gearBtn.setPosition(width - 12, 12);
    this.growBtn.setPosition(width - 12, 46);
    this.modeBtn.setPosition(width - 12, 80);
    this.soundBtn.setPosition(width - 12, 114);
    this.status.setPosition(width / 2, 14);
    this.deathShade.setSize(width, height);
    this.deathTitle.setPosition(width / 2, height * 0.4);
    this.deathStats.setPosition(width / 2, height * 0.4 + 90);
    this.banner.setPosition(width / 2, height * 0.28);
    this.hint.setPosition(16, height - 28);
    const touch = this.sys.game.device.input.touch;
    this.hint.setText(
      touch
        ? 'Hold a finger to swim. EAT: green ring = swallow, orange ring = bite. DASH lunges and stuns.'
        : 'WASD/arrows or mouse: swim | Shift: sprint | Space/right-click: eat (green swallow, orange bite) | E/Q: dash | R restart | ` tune | P hitboxes',
    );
  }

  update(): void {
    const g = this.game$;
    const p = g?.player;
    if (!p) return;
    this.hpFill.width = 216 * Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    this.hpBack.setStrokeStyle(1, p.wounded ? 0xff2020 : 0xff8a80, p.wounded ? 0.6 + 0.4 * Math.sin(this.time.now / 100) : 0.6);
    const ratio = p.stamina / BALANCE.stamina.max;
    this.staminaFill.width = 216 * ratio;
    this.staminaFill.fillColor = p.exhausted ? 0xe0675f : p.isSprinting ? 0xffd166 : 0x5fe0a8;
    this.staminaBack.setStrokeStyle(1, p.exhausted ? 0xe0675f : 0x9fd3ff, 0.6);
    const xpRatio = Phaser.Math.Clamp(p.xp / p.xpNeeded, 0, 1);
    this.xpFill.width = 216 * xpRatio;
    this.bankFill.width = 216 * Phaser.Math.Clamp((p.xp + g.stomach.bank) / p.xpNeeded, 0, 1);

    const st = g.stomach;
    this.stomachFill.width = 216 * Phaser.Math.Clamp(st.ratio, 0, 1);
    this.stomachFill.fillColor = st.digesting ? 0x9fe8ff : st.full ? 0xffa53a : st.readyToDigest ? 0xffffff : 0x8bc34a;
    const starving = st.ratio < 0.1;
    this.stomachBack.setStrokeStyle(1, starving ? 0xff2020 : 0xc8e6c9, starving ? 0.6 + 0.4 * Math.sin(this.time.now / 100) : 0.6);
    this.soundBtn.setText(`SOUND: ${this.sound.mute ? 'OFF' : 'ON'}`);
    this.info.setText(
      `Level ${p.level}  |  HP ${Math.ceil(p.hp)}/${p.maxHp}  |  Bite ${p.biteDamage.toFixed(0)}  |  Swallows up to size ${p.devourSize.toFixed(0)}  |  Kills ${g.stats.kills}`,
    );
    this.modeBtn.setText(`MODE: ${g.difficultyName.toUpperCase()}`);
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

    // Dash cooldown pie.
    const cd = p.dashCooldown / BALANCE.combat.dash.cooldownSeconds;
    this.dashCool.clear();
    if (cd > 0) {
      this.dashCool.fillStyle(0x0a2236, 0.65);
      this.dashCool.slice(this.dashBtn.x, this.dashBtn.y, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false);
      this.dashCool.fillPath();
    }
    this.dashLabel.setAlpha(cd > 0 || p.stamina < BALANCE.combat.dash.staminaCost ? 0.5 : 1);
  }
}
