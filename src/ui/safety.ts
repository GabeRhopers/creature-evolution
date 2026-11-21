// Runtime safety net: errors, app switching, graphics loss.
//
// - Any unexpected error is logged on the device (last 20) and, during a run,
//   a checkpoint is written and a friendly panel offers Resume or Reload.
// - Hiding the tab or switching apps pauses the run and saves it; the sound
//   engine is woken up again on return (iOS suspends it).
// - If the iPad drops the graphics context, the run is saved and the player
//   can reload straight back into it.
import type Phaser from 'phaser';
import { APP_VERSION } from '../save';

const ERROR_KEY = 'ce.errors';
const AUTO_CONTINUE_KEY = 'ce.autoContinue';
const MAX_ERRORS = 20;

export interface LoggedError {
  t: number;
  app: string;
  msg: string;
  where?: string;
  stack?: string;
}

export function readErrorLog(): LoggedError[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(ERROR_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function logError(e: LoggedError): void {
  try {
    const list = readErrorLog();
    list.push(e);
    window.localStorage.setItem(ERROR_KEY, JSON.stringify(list.slice(-MAX_ERRORS)));
  } catch {
    /* storage unavailable */
  }
}

/** Ask the next page load to continue the saved run right away. */
export function requestAutoContinue(): void {
  try {
    window.sessionStorage.setItem(AUTO_CONTINUE_KEY, '1');
  } catch {
    /* ignore */
  }
}
export function takeAutoContinue(): boolean {
  try {
    const v = window.sessionStorage.getItem(AUTO_CONTINUE_KEY) === '1';
    window.sessionStorage.removeItem(AUTO_CONTINUE_KEY);
    return v;
  } catch {
    return false;
  }
}

export interface SafetyHooks {
  /** Save the run now (returns true if a checkpoint was written). */
  saveNow(): boolean;
  /** True while a run is being played (not home, not dead). */
  playing(): boolean;
  /** Pause the run and open the pause menu. */
  pause(): void;
  /** Show the "Something went wrong" panel. */
  showError(saved: boolean): void;
  /** Show the "Tap to restore" panel after graphics loss. */
  showGraphicsLost(saved: boolean): void;
}

export function installSafetyNet(game: Phaser.Game, hooks: SafetyHooks): void {
  let lastShown = 0;
  const onError = (msg: string, where?: string, stack?: string) => {
    logError({ t: Date.now(), app: APP_VERSION, msg: String(msg).slice(0, 300), where, stack: stack?.slice(0, 600) });
    // Show the panel at most once every 10 s so a repeating error cannot lock the screen.
    if (Date.now() - lastShown < 10_000) return;
    lastShown = Date.now();
    let saved = false;
    try {
      saved = hooks.playing() && hooks.saveNow();
    } catch {
      /* the save itself failed: still show the panel */
    }
    hooks.showError(saved);
  };
  window.addEventListener('error', (ev) => {
    // Ignore failed resource loads here (the loader shows its own retry).
    if (!(ev instanceof ErrorEvent)) return;
    onError(ev.message, `${ev.filename ?? ''}:${ev.lineno ?? 0}`, ev.error?.stack);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    onError(r?.message ?? String(r), 'promise', r?.stack);
  });

  // App switching / tab hidden: pause and save. Page closing: save.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (hooks.playing()) hooks.pause(); // pausing also writes a checkpoint
    } else {
      wakeAudio(game);
    }
  });
  window.addEventListener('pagehide', () => {
    if (hooks.playing()) hooks.saveNow();
  });
  // iOS keeps the audio engine suspended until a touch after returning.
  window.addEventListener('pointerdown', () => wakeAudio(game), { passive: true });

  // Graphics context lost (memory pressure on iPad).
  const watchCanvas = () => game.canvas?.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    logError({ t: Date.now(), app: APP_VERSION, msg: 'webgl context lost' });
    let saved = false;
    try {
      saved = hooks.playing() && hooks.saveNow();
    } catch {
      /* ignore */
    }
    hooks.showGraphicsLost(saved);
  });
  if (game.canvas) watchCanvas();
  else game.events.once('ready', watchCanvas);
}

function wakeAudio(game: Phaser.Game): void {
  const ctx = (game.sound as unknown as { context?: AudioContext }).context;
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => undefined);
}
