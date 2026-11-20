import Phaser from 'phaser';

import { ATLAS } from '../assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 150, height / 2, 0, 10, 0x9fd3ff).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 304, 14).setStrokeStyle(2, 0x9fd3ff);
    this.load.on('progress', (p: number) => (bar.width = 300 * p));

    this.load.atlas(ATLAS, 'assets/atlas.png', 'assets/atlas.json');
  }

  create(): void {
    this.scene.start('Game');
    this.scene.launch('Hud');
  }
}
