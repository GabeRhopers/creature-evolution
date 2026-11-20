import { BALANCE } from '../data';

/**
 * The player's stomach (Feed and Grow style "modern" rules).
 *
 *  - Eating fills the stomach by the food's value (= its XP) and pays out
 *    about 1/3 of the XP right away; the other 2/3 is banked.
 *  - Above 95% full you cannot eat.
 *  - Above 75% full, staying still for a moment triggers digestion: the
 *    stomach drops to 50% and the whole bank converts, healing first and
 *    then turning into XP. Resting is a risk: predators keep hunting.
 *  - Metabolism slowly empties the stomach, converting the bank proportionally.
 *  - An empty stomach starves you (slow HP loss).
 *  - Capacity grows with level, so bigger fish need much more food.
 *
 * Pure logic: GameScene feeds it events and applies the results.
 */
export class Stomach {
  fill = 0;
  bank = 0;
  /** Seconds the player has been resting while ready to digest. */
  restTime = 0;
  /** Seconds left in the current digestion animation (0 = not digesting). */
  digestTimer = 0;
  private level = 1;

  get cfg() {
    return BALANCE.stomach;
  }

  get enabled(): boolean {
    return this.cfg.enabled;
  }

  get capacity(): number {
    return this.cfg.capacityBase * Math.pow(this.level, this.cfg.capacityExponent);
  }

  get ratio(): number {
    return this.fill / this.capacity;
  }

  get full(): boolean {
    return this.enabled && this.ratio >= this.cfg.fullAt;
  }

  get readyToDigest(): boolean {
    return this.enabled && this.ratio >= this.cfg.restReadyAt;
  }

  get digesting(): boolean {
    return this.digestTimer > 0;
  }

  get starving(): boolean {
    return this.enabled && this.fill <= 0;
  }

  setLevel(level: number): void {
    this.level = level;
  }

  reset(level: number): void {
    this.level = level;
    this.fill = this.capacity * this.cfg.startFill;
    this.bank = 0;
    this.restTime = 0;
    this.digestTimer = 0;
  }

  /** Eat food worth `xp`. Returns the XP to grant immediately. */
  eat(xp: number): number {
    if (!this.enabled) return xp;
    this.fill = Math.min(this.capacity, this.fill + xp);
    const now = xp * this.cfg.immediateXpFraction;
    this.bank += xp - now;
    return now;
  }

  /**
   * Advance time. `resting` = the player is (nearly) still with no input.
   * Returns the banked value released this frame (to heal / grant as XP).
   */
  update(dt: number, resting: boolean): { released: number; startedDigest: boolean } {
    if (!this.enabled) return { released: 0, startedDigest: false };
    let released = 0;
    let startedDigest = false;

    // Metabolism: empty slowly, releasing the bank in proportion.
    const burn = Math.min(this.fill, this.capacity * this.cfg.metabolismPerSecond * dt);
    if (burn > 0 && this.fill > 0) {
      const share = this.bank * (burn / this.fill);
      this.bank -= share;
      released += share;
      this.fill -= burn;
    }

    // Resting digestion.
    if (this.digesting) {
      this.digestTimer = Math.max(0, this.digestTimer - dt);
    } else if (this.readyToDigest && resting) {
      this.restTime += dt;
      if (this.restTime >= this.cfg.restSeconds) {
        this.restTime = 0;
        this.digestTimer = this.cfg.digestSeconds;
        this.fill = this.capacity * this.cfg.digestTo;
        released += this.bank;
        this.bank = 0;
        startedDigest = true;
      }
    } else {
      this.restTime = 0;
    }
    return { released, startedDigest };
  }
}
