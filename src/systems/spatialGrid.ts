// A uniform grid of buckets for "who is near this point?" questions, rebuilt every frame.
// Fish look for prey, threats and school mates only in the cells their vision covers,
// instead of checking every creature in the sea (that cost grows with the square of the count).
// Pure and allocation-light: bucket arrays are reused from frame to frame.

export class SpatialGrid<T> {
  private cells = new Map<number, T[]>();
  private used: T[][] = [];
  private pool: T[][] = [];

  constructor(readonly cell: number) {}

  private key(cx: number, cy: number): number {
    // Cells are small integers around 0; pack both into one number (exact up to +-2^20 cells).
    return (cx + 1048576) * 2097152 + (cy + 1048576);
  }

  /** Empty every bucket (keeps the arrays for the next frame). */
  clear(): void {
    for (const a of this.used) {
      a.length = 0;
      this.pool.push(a);
    }
    this.used.length = 0;
    this.cells.clear();
  }

  insert(item: T, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let a = this.cells.get(k);
    if (!a) {
      a = this.pool.pop() ?? [];
      this.cells.set(k, a);
      this.used.push(a);
    }
    a.push(item);
  }

  /**
   * Every item in the cells that overlap the square around (x, y) with half size r, written into `out`
   * (cleared first). Items may be a little farther than r: callers still check the real distance.
   */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.cells.get(this.key(cx, cy));
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  }
}
