import './styles/main.css';
import { pickTier, probeCapabilities, tierSettings } from './config/quality';
import { Loader } from './ui/loader';
import type { App } from './app';

/**
 * Bootstrap: decide between the immersive building and the plain document, and switch between
 * them on request. three.js is only downloaded when the 3D view is actually used.
 */

const STORAGE_KEY = 'manoj:view';
const INIT_TIMEOUT = 9000;

const root = document.documentElement;
let canvas = document.getElementById('world') as HTMLCanvasElement;
const toggle = document.querySelector<HTMLButtonElement>('[data-view-toggle]');
const loader = new Loader();
const caps = probeCapabilities();

let app: App | null = null;
let starting = false;

const remember = (view: 'plain' | '3d') => {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
};

const setToggle = (plain: boolean) => toggle?.setAttribute('aria-pressed', String(plain));

/** The chapter currently on screen in the plain layout. */
function plainChapter(): number {
  const sections = document.querySelectorAll<HTMLElement>('[data-chapter]');
  let index = 0;
  sections.forEach((el, i) => {
    if (el.getBoundingClientRect().top < innerHeight * 0.4) index = i;
  });
  return index;
}

/** A disposed renderer force-loses its context; the canvas can't host a new one, so swap it. */
function freshCanvas(): void {
  const next = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.replaceWith(next);
  canvas = next;
}

function enterPlain(reason: string, persist = false): void {
  const chapter = app ? app.currentChapter() : plainChapter();
  if (app) {
    app.dispose();
    freshCanvas();
  }
  app = null;
  root.classList.remove('is-3d');
  root.classList.add('is-plain');
  root.dataset.theme = 'day';
  root.dataset.view = reason;
  loader.hide();
  setToggle(true);
  if (persist) remember('plain');
  document.querySelectorAll<HTMLElement>('[data-chapter]')[chapter]?.scrollIntoView({ block: 'start' });
}

async function enter3D(persist = false): Promise<void> {
  if (app || starting) return;
  if (!caps.webgl) {
    enterPlain('no-webgl2');
    return;
  }
  starting = true;
  const chapter = plainChapter();
  root.classList.remove('is-plain');
  root.dataset.view = '3d';
  setToggle(false);
  if (persist) remember('3d');
  document.getElementById('loader')?.classList.remove('is-done');

  let timedOut = false;
  try {
    const { App } = await import('./app');
    const tier = tierSettings(pickTier(caps));
    const creating = App.create({
      canvas,
      tier,
      reduced: caps.reducedMotion,
      loader,
      onFatal: (reason) => enterPlain(reason),
    });
    // A background tab gets no animation frames, so only count time the page is actually visible.
    const visible = new Promise<void>((resolve) => {
      if (!document.hidden) return resolve();
      const onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      };
      document.addEventListener('visibilitychange', onVisible);
    });
    const timer = visible.then(
      () =>
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            timedOut = true;
            reject(new Error('init-timeout'));
          }, INIT_TIMEOUT),
        ),
    );
    // A late success after a timeout must not leak a renderer.
    creating
      .then((late) => {
        if (!timedOut) return;
        late.dispose();
        freshCanvas();
      })
      .catch(() => undefined);
    app = await Promise.race([creating, timer]);
    app.jumpToChapter(chapter);
    app.start();
    await loader.done();
  } catch (error) {
    console.warn('[manoj] 3D view unavailable, showing the plain document.', error);
    enterPlain(timedOut ? 'init-timeout' : 'init-failed');
  } finally {
    starting = false;
  }
}

toggle?.addEventListener('click', () => {
  if (app || starting) enterPlain('user', true);
  else void enter3D(true);
});

if (root.classList.contains('is-plain')) {
  setToggle(true);
  root.dataset.view = 'user';
} else if (!caps.webgl || caps.saveData) {
  enterPlain(caps.webgl ? 'save-data' : 'no-webgl2');
} else {
  void enter3D();
}
