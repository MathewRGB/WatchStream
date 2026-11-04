/**
 * Lets at most `limit` events through in any `windowMs`. For what a viewer can send as often as it
 * likes: the host passes a chat message on to everyone and shows a report, so a viewer that
 * floods the data channel would flood all the others.
 */
export class RateLimit {
  private readonly times: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** Whether one more event is allowed now; if so, it is counted. */
  allow(): boolean {
    const now = this.clock();
    while (this.times.length > 0 && now - this.times[0]! >= this.windowMs) this.times.shift();
    if (this.times.length >= this.limit) return false;
    this.times.push(now);
    return true;
  }
}
