const LABELS: Record<string, string> = { open: 'open', mail: 'write', top: 'top' };

/**
 * A drafting crosshair that trails the native cursor (which stays visible) and grows into a
 * labelled ring over things you can act on — including the figure ("say hi").
 * Only mounted for fine pointers; positioned from the app's render loop (no second rAF).
 */
export class Cursor {
  private readonly el = document.querySelector<HTMLElement>('.cursor');
  private readonly label = this.el?.querySelector<HTMLElement>('.cursor__label') ?? null;
  private x = -100;
  private y = -100;
  private tx = -100;
  private ty = -100;
  private domLabel: string | null = null;
  private figure = false;
  private shown: string | null = null;

  constructor(private readonly reduced: boolean) {
    document.documentElement.classList.add('has-cursor');
    window.addEventListener('pointermove', this.onMove, { passive: true });
    document.addEventListener('pointerover', this.onOver);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
  }

  setFigureHover(on: boolean): void {
    this.figure = on;
  }

  update(dt: number): void {
    if (!this.el) return;
    const k = this.reduced ? 1 : 1 - Math.exp(-18 * dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;

    const next = this.domLabel ?? (this.figure ? 'say hi' : null);
    if (next !== this.shown) {
      this.shown = next;
      this.el.dataset.state = next ? 'hover' : 'idle';
      if (this.label) this.label.textContent = next ?? '';
    }
  }

  private readonly onMove = (e: PointerEvent) => {
    this.tx = e.clientX;
    this.ty = e.clientY;
    if (this.x < -50) {
      this.x = this.tx;
      this.y = this.ty;
    }
  };

  private readonly onOver = (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('a, button, [data-cursor]');
    if (!target) {
      this.domLabel = null;
      return;
    }
    const key = target.dataset.cursor;
    this.domLabel = key ? (LABELS[key] ?? key) : target.tagName === 'BUTTON' ? 'toggle' : 'open';
  };

  private readonly onDown = () => this.el?.classList.add('is-pressed');
  private readonly onUp = () => this.el?.classList.remove('is-pressed');

  dispose(): void {
    document.documentElement.classList.remove('has-cursor');
    window.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerover', this.onOver);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
  }
}

/** Fine pointer with hover — the only place a custom cursor adds anything. */
export const supportsCursor = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
