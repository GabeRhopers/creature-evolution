import Phaser from 'phaser';

import { ATLAS } from '../assets';
import { ALL_SPECIES_LOOKS } from '../data';
import { createPixelTextures } from '../systems/pixelTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 150, height / 2, 0, 10, 0x9fd3ff).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 304, 14).setStrokeStyle(2, 0x9fd3ff);
    this.load.on('progress', (p: number) => (bar.width = 300 * p));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.failed.push(file.key));

    this.load.atlas(ATLAS, 'assets/atlas.png', 'assets/atlas.json');
    // Music: "Aquaria" by cynicmusic (CC0), see CREDITS.md. MP3 plays everywhere incl. iOS Safari.
    this.load.audio('music', 'assets/audio/music-aquaria.mp3');
    // Pixel looks of the reef fish (Sprite Studio starter designs).
    for (const look of ALL_SPECIES_LOOKS) this.load.json('look:' + look, `studio/seeds/${look}.json`);
  }

  private failed: string[] = [];

  create(): void {
    createPixelTextures(this);
    // The atlas is required; music is optional (the game plays silently without it).
    if (this.failed.includes(ATLAS)) {
      showLoadFailure();
      return;
    }
    // The HUD draws text in the pixel font: wait for it briefly (offline, the fallback font is used).
    const font = document.fonts?.load('700 16px "Pixelify Sans"') ?? Promise.resolve();
    void Promise.race([font, new Promise((r) => setTimeout(r, 2500))])
      .catch(() => undefined)
      .then(() => {
        this.scene.start('Game');
        this.scene.launch('Light');
        this.scene.launch('Hud');
      });
  }
}

/** A failed download shows a Retry button instead of a stuck progress bar. */
function showLoadFailure(): void {
  const box = document.createElement('div');
  box.className = 'panel-wrap open';
  box.style.zIndex = '50';
  box.innerHTML = `<div class="panel"><h3>Could not load the game</h3>
    <p>Some game files did not download. Check the connection and try again. Your saves are safe.</p>
    <div class="row"><button class="btn btn-play" id="loadRetry">Retry</button></div></div>`;
  document.body.appendChild(box);
  document.getElementById('loadRetry')!.onclick = () => window.location.reload();
}
