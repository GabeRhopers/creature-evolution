import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { LightScene } from './scenes/LightScene';
import { initMenu } from './ui/menu';
import { applyEnemySettings } from './data/adminSettings';
import { reportError } from './ui/safety';
import { startOffline } from './offline';
import { perfSessionSeconds, readPerfLog, startPerfMeter } from './ui/perfMeter';
import { APP_VERSION } from './save';

// Enemy settings changed on this device (Options > Enemy settings) apply before anything spawns.
applyEnemySettings();

// Add ?canvas to the URL to force the Canvas renderer (debug fallback for
// devices with WebGL driver problems).
const params = new URLSearchParams(window.location.search);

// An error inside one frame must never stop the game for good: Phaser asks the browser for the next
// frame only after this one finishes, so an uncaught error froze the picture (the iPad "freeze").
// Catch it, report it (the safety net logs it and offers Keep playing), and keep the frames coming.
const gameProto = Phaser.Game.prototype as unknown as { step(time: number, delta: number): void };
const realStep = gameProto.step;
gameProto.step = function (this: Phaser.Game, time: number, delta: number) {
  try {
    realStep.call(this, time, delta);
  } catch (err) {
    reportError(err, 'game loop');
  }
};

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
  scene: [BootScene, GameScene, LightScene, HudScene],
});

initMenu(game);

// Handy for debugging from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;

startOffline();
// How smoothly it runs: a session log on the device, and the meter panel when asked for (?perf=1 or Options).
startPerfMeter(game as unknown as Parameters<typeof startPerfMeter>[0], APP_VERSION);
(window as unknown as { cePerf: unknown }).cePerf = { seconds: perfSessionSeconds, log: readPerfLog };
