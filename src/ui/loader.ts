/**
 * The loading sheet. Progress reflects real work (fonts, world build, shader compilation,
 * first frame), never a fake timer. It wipes away like a sheet of tracing paper being lifted.
 */
export class Loader {
  private readonly el: HTMLElement | null = document.getElementById('loader');
  private readonly stepEl = this.el?.querySelector<HTMLElement>('[data-loader-step]') ?? null;
  private readonly pctEl = this.el?.querySelector<HTMLElement>('[data-loader-pct]') ?? null;

  step(label: string, percent: number): void {
    if (!this.el) return;
    if (this.stepEl) this.stepEl.textContent = label;
    if (this.pctEl) this.pctEl.textContent = `${Math.round(percent)}%`;
    this.el.style.setProperty('--p', String(percent / 100));
  }

  /** Lift the sheet. Resolves when the wipe has finished. */
  done(): Promise<void> {
    if (!this.el) return Promise.resolve();
    this.el.classList.add('is-done');
    this.el.setAttribute('aria-busy', 'false');
    return new Promise((resolve) => setTimeout(resolve, 720));
  }

  /** Remove immediately (plain view, or a failure). */
  hide(): void {
    this.el?.classList.add('is-done');
  }
}
