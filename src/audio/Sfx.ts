import Phaser from 'phaser';
import { BALANCE } from '../data';

/**
 * Procedural sound effects, synthesized with the Web Audio API at play time.
 * No audio files, nothing to license, a few KB of code.
 *
 * Uses Phaser's own AudioContext, so it is unlocked by the same first tap
 * that unlocks music on iOS. If Web Audio is unavailable, every call is a no-op.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  muted = false;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    const ctx = (sound as Phaser.Sound.WebAudioSoundManager).context;
    if (!ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = BALANCE.audio.sfxVolume;
    this.out.connect(ctx.destination);
    // One second of white noise, reused by every noisy effect.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  // ------------------------------------------------------------ effects

  /** Tiny blip for plankton / meat chunks. */
  nibble(): void {
    if (!this.gate('nibble', 0.05)) return;
    this.tone('sine', 900, 1400, 0.06, 0.12);
  }

  /** Swallowing a fish: a downward "gulp", deeper for bigger prey. */
  gulp(size = 20): void {
    const base = Phaser.Math.Clamp(420 - size * 3, 120, 420);
    this.tone('sine', base, base * 0.3, 0.2, 0.5);
    this.noiseHit(500, 0.12, 0.15, 'lowpass');
  }

  bite(): void {
    if (!this.gate('bite', 0.08)) return;
    this.noiseHit(1800, 0.07, 0.45, 'bandpass');
    this.tone('square', 160, 70, 0.06, 0.18);
  }

  kill(): void {
    this.noiseHit(700, 0.25, 0.5, 'lowpass');
    this.tone('sine', 160, 45, 0.35, 0.55);
  }

  hurt(): void {
    if (!this.gate('hurt', 0.12)) return;
    this.tone('sine', 150, 45, 0.25, 0.7);
    this.noiseHit(400, 0.15, 0.35, 'lowpass');
  }

  dash(): void {
    this.sweepNoise(300, 2400, 0.3, 0.4);
  }

  stun(): void {
    if (!this.gate('stun', 0.3)) return;
    this.tone('triangle', 900, 600, 0.12, 0.25);
    this.tone('triangle', 700, 450, 0.12, 0.25, 0.13);
  }

  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.35, i * 0.08));
  }

  /** Bubbly gurgle when digestion starts. */
  digest(): void {
    for (let i = 0; i < 6; i++) {
      const f = Phaser.Math.Between(140, 320);
      this.tone('sine', f, f * 1.6, 0.07, 0.3, i * 0.09);
    }
  }

  /** Low "full stomach" warning. */
  full(): void {
    if (!this.gate('full', 1.5)) return;
    this.tone('sine', 180, 120, 0.25, 0.35);
  }

  heartbeat(): void {
    this.tone('sine', 70, 45, 0.12, 0.6);
    this.tone('sine', 65, 40, 0.12, 0.45, 0.18);
  }

  death(): void {
    this.tone('sawtooth', 420, 50, 1.1, 0.35, 0, 900);
    this.noiseHit(300, 0.8, 0.3, 'lowpass');
  }

  /** Entering a new region: a soft rising chime. */
  chime(): void {
    if (!this.gate('chime', 2)) return;
    [659, 784, 988].forEach((f, i) => this.tone('sine', f, f, 0.5, 0.18, i * 0.12));
  }

  /** The time of day changes: two calm notes, up at dawn, down at dusk. */
  periodChime(up: boolean): void {
    if (!this.gate('period', 5)) return;
    const [a, b] = up ? [523, 784] : [784, 523];
    this.tone('triangle', a, a, 0.6, 0.12);
    this.tone('triangle', b, b, 0.8, 0.12, 0.35);
  }

  /** A boss's electric shock: a buzzing crack. */
  zap(): void {
    if (!this.gate('zap', 0.15)) return;
    this.tone('sawtooth', 1800, 120, 0.25, 0.3);
    this.tone('square', 90, 60, 0.3, 0.2);
    this.noiseHit(5000, 0.2, 0.4, 'highpass');
  }

  /** A boss charging up a shock: a rising electric crackle (the warning). */
  crackle(): void {
    if (!this.gate('crackle', 0.5)) return;
    this.tone('sawtooth', 200, 900, 0.9, 0.12);
    this.noiseHit(3000, 0.9, 0.12, 'bandpass');
  }

  /** The Checkpoint Crab shows up: a low horn with a clack. */
  crabHorn(): void {
    this.tone('sawtooth', 110, 98, 0.7, 0.22, 0, 600);
    this.tone('sawtooth', 147, 131, 0.7, 0.16, 0.05, 600);
    this.noiseHit(2500, 0.05, 0.3, 'bandpass');
  }

  /** A new enemy joins the reef: a short, curious sting. */
  sting(): void {
    [440, 415, 554].forEach((f, i) => this.tone('square', f, f, 0.14, 0.08, i * 0.11, 1800));
  }

  /** Breaking the surface. */
  splash(): void {
    if (!this.gate('splash', 0.4)) return;
    this.sweepNoise(2600, 500, 0.35, 0.35);
  }

  click(): void {
    this.tone('triangle', 1200, 1000, 0.04, 0.2);
  }

  // ------------------------------------------------------------ building blocks

  /** Avoid machine-gun repeats of the same sound. */
  private gate(key: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(key) ?? -1;
    if (now - last < minGap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private ready(): boolean {
    return !!this.ctx && !!this.out && !this.muted && this.ctx.state === 'running';
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    vol: number,
    delay = 0,
    lowpass = 0,
  ): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (lowpass > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(this.out!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseHit(freq: number, dur: number, vol: number, type: BiquadFilterType): void {
    if (!this.ready() || !this.noise) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  private sweepNoise(from: number, to: number, dur: number, vol: number): void {
    if (!this.ready() || !this.noise) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}
