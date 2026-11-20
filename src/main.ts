import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';

// Add ?canvas to the URL to force the Canvas renderer (debug fallback for
// devices with WebGL driver problems).
const params = new URLSearchParams(window.location.search);

const game = new Phaser.Game({
  type: params.has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b2a45',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  input: { activePointers: 3 },
  scene: [BootScene, GameScene, HudScene],
});

// Handy for debugging from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
