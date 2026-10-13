// Límite simple por clave (IP) en ventana fija, en memoria. Frena abusos obvios; con
// varias instancias de Cloud Run cada una cuenta por su lado, y eso alcanza para esto.

export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  allowed(key: string): boolean {
    const entry = this.current(key);
    return entry === undefined || entry.count < this.max;
  }

  record(key: string): void {
    const entry = this.current(key) ?? { start: this.now(), count: 0 };
    entry.count += 1;
    this.hits.set(key, entry);
    if (this.hits.size > 10_000) this.prune();
  }

  private current(key: string): { start: number; count: number } | undefined {
    const entry = this.hits.get(key);
    if (entry !== undefined && this.now() - entry.start >= this.windowMs) {
      this.hits.delete(key);
      return undefined;
    }
    return entry;
  }

  private prune(): void {
    for (const key of [...this.hits.keys()]) this.current(key);
  }
}
