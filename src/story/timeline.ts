import { damp } from './tracks';

/**
 * The only place that reads the scroll position.
 *
 *   scrollY ─► chapter-anchored story time sTarget = i + local_i ─► s (damped)
 *
 * Chapter boundaries are the measured tops of the DOM sections (and the max scroll for the
 * end), so story time is always aligned with the copy, whatever the viewport or font metrics.
 */
export class ScrollTimeline {
  sTarget = 0;
  s = 0;
  private bounds: number[] = [];
  private readonly observer: ResizeObserver;

  constructor(private readonly sections: HTMLElement[]) {
    this.measure();
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(document.body);
    this.s = this.sTarget = this.storyTimeAt(scrollY);
  }

  measure(): void {
    const y = scrollY;
    this.bounds = this.sections.map((el) => el.getBoundingClientRect().top + y);
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    this.bounds.push(Math.max(max, this.bounds[this.bounds.length - 1] + 1));
  }

  storyTimeAt(y: number): number {
    const b = this.bounds;
    const n = b.length - 1;
    if (y <= b[0]) return 0;
    for (let i = 0; i < n; i++) {
      if (y < b[i + 1]) return i + (y - b[i]) / Math.max(b[i + 1] - b[i], 1);
    }
    return n;
  }

  /** Inverse mapping, used by navigation to land exactly on a chapter's hold. */
  scrollYFor(s: number): number {
    const n = this.bounds.length - 1;
    const i = Math.min(Math.max(Math.floor(s), 0), n - 1);
    const local = Math.min(Math.max(s - i, 0), 1);
    return this.bounds[i] + local * (this.bounds[i + 1] - this.bounds[i]);
  }

  update(dt: number, immediate: boolean): void {
    this.sTarget = this.storyTimeAt(scrollY);
    if (immediate) {
      this.s = this.sTarget;
      return;
    }
    this.s = damp(this.s, this.sTarget, 5.5, dt);
    if (Math.abs(this.s - this.sTarget) < 1e-5) this.s = this.sTarget;
  }

  dispose(): void {
    this.observer.disconnect();
  }
}
