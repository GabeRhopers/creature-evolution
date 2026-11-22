// Soundtrack: one recorded CC0 track (Sunny Reef) plus calm generative pieces made with Web Audio,
// one per mood (region, time of day, the Deep, the Checkpoint Crab). Nothing to download or license.
//
// Each mood is a small recipe (balance.json "music"): scale, key, tempo, and how busy each voice is
// (a soft pad, a bell/pluck melody, a bass). Every Tide shifts the key a little so the music changes
// as you go. When something hunts you, a low pulse joins in. Moods cross-fade.
import Phaser from 'phaser';
import { BALANCE } from '../data';

export interface MoodDef {
  id: string;
  name: string;
  /** 'file' = the recorded track; otherwise generated. */
  source?: 'file';
  /** Scale steps in semitones from the key note (for example a pentatonic scale). */
  scale: number[];
  /** Key note as a MIDI number (60 = middle C). */
  root: number;
  bpm: number;
  /** Chance (0..1) of a melody note on each eighth note. */
  melody: number;
  /** Melody voice: bell (soft sine with a ring), pluck (short triangle) or glass (high, airy). */
  voice: 'bell' | 'pluck' | 'glass';
  /** Octave of the melody relative to the key (0 = same octave). */
  octave: number;
  /** Bass note on the first beat of each bar (0 = none, 1 = always). */
  bass: number;
  /** Pad loudness (0..1). Chords change every two bars. */
  pad: number;
  /** Lowpass on the pad, Hz (darker below 1000). */
  padTone: number;
  /** Soft ticks (0 = none), for tense moods. */
  ticks: number;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private synth: GainNode | null = null;
  private danger: GainNode | null = null;
  private timer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private mood: MoodDef | null = null;
  private keyShift = 0;
  private dangerOn = false;
  private enabled = true;
  /** The recorded track (Phaser sound), used for the 'file' mood. */
  private file?: Phaser.Sound.BaseSound & { volume?: number; setVolume?: (v: number) => unknown };

  constructor(sound: Phaser.Sound.BaseSoundManager, private tweens: Phaser.Tweens.TweenManager) {
    const ctx = (sound as Phaser.Sound.WebAudioSoundManager).context;
    if (!ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = BALANCE.audio.musicVolume;
    this.out.connect(ctx.destination);
    this.synth = ctx.createGain();
    this.synth.gain.value = 0;
    this.synth.connect(this.out);
    this.danger = ctx.createGain();
    this.danger.gain.value = 0;
    this.danger.connect(this.out);
  }

  setFile(file: Phaser.Sound.BaseSound | undefined): void {
    this.file = file as typeof this.file;
  }

  static moods(): MoodDef[] {
    return (BALANCE as unknown as { music: { moods: MoodDef[] } }).music.moods;
  }

  /** Turn the soundtrack on or off (Options). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.stopScheduler();
      this.fade(this.synth, 0, 0.3);
      this.fade(this.danger, 0, 0.3);
      if (this.file?.isPlaying) this.file.stop();
    } else if (this.mood) {
      const m = this.mood;
      this.mood = null;
      this.play(m.id);
    }
  }

  /** Every Tide moves the key up a little (it wraps after an octave), so long runs keep changing. */
  setTide(tide: number): void {
    this.keyShift = [0, 2, -3, 5, -1, 3, -5, 4][(Math.max(1, tide) - 1) % 8];
  }

  /** Switch to a mood (cross-fade). Unknown ids are ignored. */
  play(id: string): void {
    const m = Music.moods().find((x) => x.id === id);
    if (!m || m === this.mood) return;
    this.mood = m;
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    if (m.source === 'file') {
      this.fade(this.synth, 0, 2);
      this.stopScheduler(2.2);
      if (this.file) {
        const f = this.file;
        if (!f.isPlaying) {
          f.play({ loop: true, volume: 0 });
        }
        this.tweens.add({ targets: f, volume: BALANCE.audio.musicVolume, duration: 2500 });
      }
      return;
    }
    if (this.file?.isPlaying) {
      const f = this.file;
      this.tweens.add({ targets: f, volume: 0, duration: 2000, onComplete: () => this.mood?.source !== 'file' && f.stop() });
    }
    this.fade(this.synth, 1, 2.5);
    this.startScheduler();
  }

  /** Something hunts the player: a low pulse joins (or leaves). */
  setDanger(on: boolean): void {
    if (on === this.dangerOn) return;
    this.dangerOn = on;
    this.fade(this.danger, on && this.enabled ? 1 : 0, on ? 1.2 : 2.5);
    if (on) this.startScheduler();
  }

  get current(): string | null {
    return this.mood?.id ?? null;
  }

  // ------------------------------------------------------------ scheduling

  private startScheduler(): void {
    if (this.timer !== null || !this.ctx) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private stopScheduler(after = 0): void {
    if (this.timer === null) return;
    const t = this.timer;
    window.setTimeout(() => {
      if (this.timer === t && (this.mood?.source === 'file' || !this.enabled) && !this.dangerOn) {
        window.clearInterval(t);
        this.timer = null;
      }
    }, after * 1000);
  }

  /** Plan the notes for the next fraction of a second (Web Audio plays them right on time). */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.mood) return;
    const m = this.mood.source === 'file' ? Music.moods().find((x) => x.id === 'golden') ?? this.mood : this.mood;
    const eighth = 30 / m.bpm;
    while (this.nextBeat < ctx.currentTime + 0.35) {
      const t = this.nextBeat;
      const step = this.beat % 16; // two bars of 4/4 in eighths... one bar = 8 eighths
      const bar = Math.floor(this.beat / 8);
      const root = m.root + this.keyShift;
      const synthOn = this.mood.source !== 'file';
      // Pad: a three-note chord every two bars (scale steps 0-2-4 from a moving degree).
      if (synthOn && m.pad > 0 && step % 16 === 0) {
        const degree = [0, 3, 4, 2][Math.floor(bar / 2) % 4];
        const notes = [0, 2, 4].map((k) => root - 12 + this.scaleNote(m, degree + k));
        for (const n of notes) this.padNote(midi(n), t, eighth * 16, m.pad * 0.08, m.padTone);
      }
      // Bass on the first beat of a bar.
      if (synthOn && m.bass > 0 && step % 8 === 0 && Math.random() < m.bass) this.pluck(midi(root - 24 + this.scaleNote(m, [0, 3, 4, 2][Math.floor(bar / 2) % 4])), t, eighth * 3, 0.12, 'sine');
      // Melody: random notes from the scale, more often on strong beats.
      if (synthOn && Math.random() < m.melody * (step % 2 === 0 ? 1.2 : 0.6)) {
        const n = root + m.octave * 12 + this.scaleNote(m, Math.floor(Math.random() * 7));
        if (m.voice === 'bell') this.bell(midi(n), t, 0.07);
        else if (m.voice === 'glass') this.bell(midi(n + 12), t, 0.04);
        else this.pluck(midi(n), t, eighth * 1.5, 0.06, 'triangle');
      }
      if (synthOn && m.ticks > 0 && step % 2 === 1 && Math.random() < m.ticks) this.tick(t, 0.05);
      // Danger: a low double pulse every beat.
      if (this.dangerOn && step % 2 === 0) {
        this.pulse(t, this.danger!);
      }
      this.nextBeat += eighth;
      this.beat++;
    }
  }

  private scaleNote(m: MoodDef, degree: number): number {
    const n = m.scale.length;
    const oct = Math.floor(degree / n);
    return m.scale[((degree % n) + n) % n] + oct * 12;
  }

  // ------------------------------------------------------------ voices

  private padNote(freq: number, t: number, dur: number, vol: number, tone: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = tone;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.synth!);
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private bell(freq: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    g.connect(this.synth!);
    for (const [mul, v] of [[1, 1], [2.01, 0.25]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  private pluck(freq: number, t: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.synth!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private tick(t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.synth!);
    o.start(t);
    o.stop(t + 0.05);
  }

  private pulse(t: number, dest: GainNode): void {
    const ctx = this.ctx!;
    for (const [dt, v] of [[0, 0.22], [0.16, 0.14]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t + dt);
      o.frequency.exponentialRampToValueAtTime(42, t + dt + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t + dt);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
      o.connect(g).connect(dest);
      o.start(t + dt);
      o.stop(t + dt + 0.2);
    }
  }

  private fade(node: GainNode | null, to: number, seconds: number): void {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(to, now + seconds);
  }
}
