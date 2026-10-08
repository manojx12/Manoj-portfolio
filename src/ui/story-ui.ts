import { CHAPTERS, LAST, PROJECT_COUNT, STUDIO, copyBand, holdOf, projectBand, projectHold } from '../story/chapters';
import type { ScrollTimeline } from '../story/timeline';

/**
 * DOM side of the story: copy reveals, the level rail, the title block and the day/night theme.
 * Driven by story time from the render loop; it only writes to the DOM when a state changes.
 */
export class StoryUI {
  readonly sections: HTMLElement[];
  private readonly projects: HTMLElement[];
  private readonly links: HTMLAnchorElement[];
  private readonly sectionIn: boolean[];
  private readonly projectIn: boolean[];
  private readonly tb: { sheet: HTMLElement | null; name: HTMLElement | null; level: HTMLElement | null; progress: HTMLElement | null };
  private chapter = -1;
  private progress = -1;
  private night = false;
  private timeline: ScrollTimeline | null = null;

  constructor(private readonly reduced: boolean) {
    this.sections = [...document.querySelectorAll<HTMLElement>('[data-chapter]')];
    this.projects = [...document.querySelectorAll<HTMLElement>('[data-project]')];
    this.links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    this.sections.forEach((el, i) => el.style.setProperty('--len', String(CHAPTERS[i].len)));
    this.sectionIn = this.sections.map(() => false);
    this.projectIn = this.projects.map(() => false);
    const q = (k: string) => document.querySelector<HTMLElement>(`[data-tb="${k}"]`);
    this.tb = { sheet: q('sheet'), name: q('name'), level: q('level'), progress: q('progress') };
    document.addEventListener('click', this.onClick);
    document.addEventListener('focusin', this.onFocusIn);
  }

  bindNavigation(timeline: ScrollTimeline): void {
    this.timeline = timeline;
  }

  /** In 3D mode an anchor lands on the chapter's camera hold, not on the section's top edge. */
  private readonly onClick = (e: MouseEvent) => {
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link || !this.timeline || !this.links.includes(link)) return;
    const id = link.hash.slice(1);
    const index = this.sections.findIndex((s) => s.id === id);
    if (index < 0) return;
    e.preventDefault();
    const hold = index === STUDIO ? projectHold(0) : holdOf(index);
    const s = index === 0 ? 0 : (hold[0] + hold[1]) / 2;
    window.scrollTo({ top: this.timeline.scrollYFor(s), behavior: this.reduced ? 'auto' : 'smooth' });
    const heading = this.sections[index].querySelector<HTMLElement>('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    history.replaceState(null, '', `#${id}`);
  };

  /** Tabbing to a project's link brings its plinth into the shot, as scrolling there would. */
  private readonly onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element;
    const j = this.projects.findIndex((p) => p.contains(target));
    if (j < 0 || !this.timeline || !target.matches(':focus-visible')) return;
    // In the stacked phone layout the browser's own focus scrolling is already right.
    const panel = this.projects[j].closest('.chapter__panel');
    if (!panel || getComputedStyle(panel).position !== 'sticky') return;
    const [a, b] = projectHold(j);
    window.scrollTo({ top: this.timeline.scrollYFor((a + b) / 2), behavior: this.reduced ? 'auto' : 'smooth' });
  };

  update(s: number, night: number): void {
    for (let i = 0; i < this.sections.length; i++) {
      const [a, b] = copyBand(i);
      const on = s >= a && s <= b;
      if (on !== this.sectionIn[i]) {
        this.sectionIn[i] = on;
        this.sections[i].classList.toggle('is-in', on);
      }
    }
    for (let j = 0; j < Math.min(this.projects.length, PROJECT_COUNT); j++) {
      const [a, b] = projectBand(j);
      const on = s >= a + 0.012 && s <= b - 0.012;
      if (on !== this.projectIn[j]) {
        this.projectIn[j] = on;
        this.projects[j].classList.toggle('is-in', on);
      }
    }

    const chapter = Math.max(0, Math.min(LAST, Math.floor(s)));
    if (chapter !== this.chapter) {
      this.chapter = chapter;
      const c = CHAPTERS[chapter];
      if (this.tb.sheet) this.tb.sheet.textContent = `${String(chapter).padStart(2, '0')} / ${String(LAST).padStart(2, '0')}`;
      if (this.tb.name) this.tb.name.textContent = c.name;
      if (this.tb.level) this.tb.level.textContent = c.level;
      this.links.forEach((l) => {
        if (l.dataset.chapterLink === undefined) return;
        if (Number(l.dataset.chapterLink) === chapter) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
    }

    const p = Math.round((s / CHAPTERS.length) * 400) / 400;
    if (p !== this.progress && this.tb.progress) {
      this.progress = p;
      this.tb.progress.style.transform = `scaleX(${p})`;
    }

    const isNight = night > 0.5;
    if (isNight !== this.night) {
      this.night = isNight;
      document.documentElement.dataset.theme = isNight ? 'night' : 'day';
    }
  }

  dispose(): void {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('focusin', this.onFocusIn);
    this.sections.forEach((el) => {
      el.classList.remove('is-in');
      el.style.removeProperty('--len');
    });
    this.projects.forEach((el) => el.classList.remove('is-in'));
    document.documentElement.dataset.theme = 'day';
  }
}
