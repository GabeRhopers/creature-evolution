// Performance meter (Options > Performance meter, or ?perf=1): a small corner panel that shows how smoothly the game
// runs on this device: frames per second, the slowest recent frames, how many creatures exist / are awake / are drawn,
// and the renderer. It also keeps a short log of past sessions on the device (`ce.perf`), which travels in the backup
// file, so playtest devices can report how they ran. The stats helpers are pure (tests/perf.test.ts).

export interface FrameSummary {
  /** Average frames per second over the window. */
  fps: number;
  /** The fps of the slowest 5% of frames (what a player feels as stutter). */
  low: number;
  /** The slowest frame, in milliseconds. */
  worstMs: number;
  /** Share of frames slower than 1/30 s (visible hitches). */
  hitches: number;
}

/** Summarize frame times (ms). */
export function summarizeFrames(ms: number[]): FrameSummary {
  const f = ms.filter((v) => v > 0 && v < 1000);
  if (!f.length) return { fps: 0, low: 0, worstMs: 0, hitches: 0 };
  const total = f.reduce((a, b) => a + b, 0);
  const sorted = [...f].sort((a, b) => b - a);
  const slow = sorted.slice(0, Math.max(1, Math.round(f.length * 0.05)));
  const slowAvg = slow.reduce((a, b) => a + b, 0) / slow.length;
  return {
    fps: Math.round((1000 * f.length) / total),
    low: Math.round(1000 / slowAvg),
    worstMs: Math.round(sorted[0]),
    hitches: Math.round((100 * f.filter((v) => v > 1000 / 30).length) / f.length) / 100,
  };
}

/** A plain-language grade for the meter and the log. */
export function grade(s: FrameSummary): 'smooth' | 'ok' | 'choppy' {
  if (s.fps >= 55 && s.low >= 40) return 'smooth';
  if (s.fps >= 40 && s.low >= 25) return 'ok';
  return 'choppy';
}

export interface PerfSession {
  at: string;
  app: string;
  device: string;
  seconds: number;
  fps: number;
  low: number;
  hitches: number;
  maxAwake: number;
  maxDrawn: number;
  grade: string;
}
const LOG_KEY = 'ce.perf';
const LOG_MAX = 20;
export function readPerfLog(): PerfSession[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writePerfLog(list: PerfSession[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-LOG_MAX)));
  } catch {
    /* storage full: the log is only a helper */
  }
}
/** A short device name for the log (from the browser's description). */
export function deviceName(ua: string): string {
  if (/iPad|Macintosh.*Mobile|Macintosh.*Safari/.test(ua) && 'ontouchend' in document) return 'iPad';
  const android = /Android [\d.]+; ([^;)]+)/.exec(ua);
  if (android) return 'Android ' + android[1].trim();
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Device';
}

// ---------------------------------------------------------------- the meter
interface GameLike {
  events: { on(ev: string, fn: (time: number, delta: number) => void): void; off(ev: string, fn: (time: number, delta: number) => void): void };
  scene: { getScene(key: string): unknown };
  renderer: { type: number; width: number; height: number };
  textures: { list: Record<string, unknown> };
}
interface CreatureLike {
  asleep?: boolean;
  fish: { visible: boolean };
}
interface GameSceneLike {
  creatures?: CreatureLike[];
  menuMode?: boolean;
  children?: { length: number };
}

const SHOW_KEY = 'ce.perf.show';
export const perfMeterWanted = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('perf') || localStorage.getItem(SHOW_KEY) === '1';
  } catch {
    return false;
  }
};
export function setPerfMeterWanted(on: boolean): void {
  try {
    if (on) localStorage.setItem(SHOW_KEY, '1');
    else localStorage.removeItem(SHOW_KEY);
  } catch {
    /* ignore */
  }
}

let stop: (() => void) | null = null;
let setPanel: ((on: boolean) => void) | null = null;
/** Show or hide the panel (Options), remembered on this device. */
export function showPerfMeter(on: boolean): void {
  setPerfMeterWanted(on);
  panelOn = on;
  setPanel?.(on);
}
/** Is the panel showing now? */
export const perfMeterShown = (): boolean => panelOn;
/** Seconds of play measured this session (not yet logged). For tests and the Options line. */
export const perfSessionSeconds = (): number => sessionSeconds();
let panelOn = false;
let sessionSeconds = () => 0;

/** Start measuring. The session log always runs (it is cheap); the panel shows when `showPanel` is on. */
export function startPerfMeter(game: GameLike, appVersion: string, showPanel = perfMeterWanted()): void {
  if (stop) return;
  const frames: number[] = [];
  const session: number[] = [];
  let maxAwake = 0, maxDrawn = 0, played = 0;
  const onStep = (_t: number, delta: number) => {
    frames.push(delta);
    if (frames.length > 240) frames.shift();
    const g = game.scene.getScene('Game') as GameSceneLike | null;
    if (g && !g.menuMode) {
      played += delta / 1000;
      session.push(delta);
      if (session.length > 36000) session.splice(0, 18000); // keep about the last 10 minutes
    }
  };
  game.events.on('poststep', onStep);
  sessionSeconds = () => played;

  const box = document.createElement('div');
  box.id = 'perfMeter';
  box.setAttribute('aria-live', 'off');
  box.style.cssText =
    'position:fixed;left:6px;bottom:6px;z-index:60;pointer-events:none;background:rgba(10,16,28,.82);color:#e8f1ff;' +
    'font:600 11px/1.35 ui-monospace,Menlo,monospace;padding:6px 8px;border-radius:6px;border:1px solid #3a4466;white-space:pre';
  panelOn = showPanel;
  box.style.display = showPanel ? '' : 'none';
  document.body.appendChild(box);
  setPanel = (on: boolean) => (box.style.display = on ? '' : 'none');
  const colors = { smooth: '#63c74d', ok: '#feae34', choppy: '#e43b44' };
  const timer = window.setInterval(() => {
    const s = summarizeFrames(frames);
    const g = game.scene.getScene('Game') as GameSceneLike | null;
    const list = g?.creatures ?? [];
    const awake = list.filter((c) => !c.asleep).length;
    const drawn = list.filter((c) => !c.asleep && c.fish.visible).length;
    if (g && !g.menuMode) {
      maxAwake = Math.max(maxAwake, awake);
      maxDrawn = Math.max(maxDrawn, drawn);
    }
    if (box.style.display === 'none') return;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const gr = grade(s);
    box.innerHTML =
      `<b style="color:${colors[gr]}">${s.fps} fps</b> · slowest ${s.low} fps · worst ${s.worstMs} ms\n` +
      `creatures ${list.length} · awake ${awake} · drawn ${drawn}\n` +
      `objects ${g?.children?.length ?? 0} · textures ${Object.keys(game.textures.list).length}\n` +
      `${game.renderer.type === 2 ? 'WebGL' : 'Canvas'} ${game.renderer.width}x${game.renderer.height} @${window.devicePixelRatio}x` +
      (mem ? ` · ${Math.round(mem.usedJSHeapSize / 1048576)} MB` : '');
  }, 500);

  // One log line per session with at least half a minute of play (written when the page hides or closes).
  const save = () => {
    if (played < 30 || !session.length) return;
    const s = summarizeFrames(session);
    const log = readPerfLog();
    log.push({ at: new Date().toISOString(), app: appVersion, device: deviceName(navigator.userAgent), seconds: Math.round(played),
      fps: s.fps, low: s.low, hitches: s.hitches, maxAwake, maxDrawn, grade: grade(s) });
    writePerfLog(log);
    played = 0;
    session.length = 0;
    maxAwake = maxDrawn = 0;
  };
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', save);
  stop = () => {
    save();
    window.clearInterval(timer);
    game.events.off('poststep', onStep);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', save);
    box.remove();
    stop = null;
    setPanel = null;
  };
}
export function stopPerfMeter(): void {
  stop?.();
}
