import Phaser from 'phaser';
import { BALANCE } from '../data';
import type { GameScene } from './GameScene';
import { toggleTuningPanel } from '../ui/tuning';

/**
 * Screen-space overlay (not affected by the game camera's zoom):
 * stamina bar, level readout, controls hint, and touch buttons.
 */
export class HudScene extends Phaser.Scene {
  private game$!: GameScene;
  private staminaFill!: Phaser.GameObjects.Rectangle;
  private staminaBack!: Phaser.GameObjects.Rectangle;
  private info!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private sprintBtn!: Phaser.GameObjects.Arc;
  private sprintLabel!: Phaser.GameObjects.Text;
  private gearBtn!: Phaser.GameObjects.Text;
  private growBtn!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.game$ = this.scene.get('Game') as GameScene;
    const style = { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#e6f6ff' };

    this.add.text(16, 12, 'STAMINA', { ...style, fontSize: '11px', color: '#9fd3ff' });
    this.staminaBack = this.add.rectangle(16, 30, 220, 12, 0x0a2236, 0.8).setOrigin(0, 0).setStrokeStyle(1, 0x9fd3ff, 0.6);
    this.staminaFill = this.add.rectangle(18, 32, 216, 8, 0x5fe0a8).setOrigin(0, 0);
    this.info = this.add.text(16, 48, '', style);
    this.hint = this.add.text(16, 0, '', { ...style, fontSize: '12px', color: '#bfe3ff' }).setAlpha(0.85);

    // Touch controls. The sprint button reserves its pointer so it does not steer.
    this.sprintBtn = this.add.circle(0, 0, 46, 0xffffff, 0.18).setStrokeStyle(3, 0xffffff, 0.6).setInteractive();
    this.sprintLabel = this.add.text(0, 0, 'SPRINT', { ...style, fontSize: '13px' }).setOrigin(0.5);
    this.sprintBtn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.game$.controller.uiPointers.add(p.id);
      this.game$.controller.uiSprint = true;
      this.sprintBtn.setFillStyle(0xffffff, 0.4);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.game$.controller.uiPointers.delete(p.id)) {
        this.game$.controller.uiSprint = false;
        this.sprintBtn.setFillStyle(0xffffff, 0.18);
      }
    });

    this.gearBtn = this.makeButton('TUNE', () => toggleTuningPanel(this.game$.player.species));
    this.growBtn = this.makeButton('GROW +1', () => this.game$.player.setLevel(this.game$.player.level + 1));

    this.layout();
    this.scale.on('resize', () => this.layout());
  }

  private makeButton(label: string, onTap: () => void): Phaser.GameObjects.Text {
    const btn = this.add
      .text(0, 0, label, {
        fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#e6f6ff',
        backgroundColor: '#0a2236cc', padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.game$.controller.uiPointers.add(p.id);
      onTap();
    });
    return btn;
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.sprintBtn.setPosition(width - 76, height - 76);
    this.sprintLabel.setPosition(width - 76, height - 76);
    this.gearBtn.setPosition(width - 12, 12);
    this.growBtn.setPosition(width - 12, 46);
    this.hint.setPosition(16, height - 28);
    const touch = this.sys.game.device.input.touch;
    this.hint.setText(
      touch
        ? 'Hold a finger to swim toward it. Second finger or SPRINT button to sprint.'
        : 'WASD / arrows or hold mouse to swim  |  Shift sprint  |  G/H grow/shrink  |  ` tune  |  P hitboxes  |  F fullscreen',
    );
  }

  update(): void {
    const p = this.game$?.player;
    if (!p) return;
    const ratio = p.stamina / BALANCE.stamina.max;
    this.staminaFill.width = 216 * ratio;
    this.staminaFill.fillColor = p.exhausted ? 0xe0675f : p.isSprinting ? 0xffd166 : 0x5fe0a8;
    this.staminaBack.setStrokeStyle(1, p.exhausted ? 0xe0675f : 0x9fd3ff, 0.6);
    this.info.setText(
      `${p.species.displayName}  |  Level ${p.level}  |  Size ${p.size.toFixed(0)}  |  Speed ${p.speed.toFixed(0)}`,
    );
  }
}
