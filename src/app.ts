import { ACESFilmicToneMapping, Raycaster, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three';
import { QualityGovernor, type Tier } from './config/quality';
import { CameraRig } from './camera/rig';
import { buildFigure, type Figure } from './character/figure';
import { FigureAnimator } from './character/animation';
import { createStationState, stationAt } from './character/stations';
import { holdOf, projectBand, PROJECT_COUNT } from './story/chapters';
import { createEnvironment, environmentAt } from './story/environment';
import { ScrollTimeline } from './story/timeline';
import { damp, smoothstep } from './story/tracks';
import { World } from './world/world';
import type { FloorContext } from './world/floors';
import type { Loader } from './ui/loader';
import { StoryUI } from './ui/story-ui';
import { Cursor, supportsCursor } from './ui/cursor';

export interface AppOptions {
  canvas: HTMLCanvasElement;
  tier: Tier;
  reduced: boolean;
  loader: Loader;
  /** Called when the 3D can't continue (context lost); the host switches to plain view. */
  onFatal: (reason: string) => void;
}

const BUILD_SECONDS = 1.7;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

// Scratch objects reused every frame (no allocation in the loop).
const _head = new Vector3();
const _look = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _ndc = new Vector2();

/**
 * Composition root. Owns the renderer and the ONE requestAnimationFrame loop; every system is
 * updated from here, in a fixed order, from the same story time.
 */
export class App {
  private readonly env = createEnvironment();
  private readonly station = createStationState();
  private readonly projectWeights = new Array<number>(PROJECT_COUNT).fill(0);
  private readonly raycaster = new Raycaster();
  private readonly pointer = { x: 0, y: 0, moved: false, active: false };
  private readonly ctx: FloorContext;
  private readonly governor: QualityGovernor;
  private readonly cursor: Cursor | null;
  private readonly fineInput = matchMedia('(hover: hover) and (pointer: fine)').matches;
  /** `?quality=<tier>` pins the tier (for measurement); otherwise the governor adapts it. */
  private readonly pinnedTier = new URLSearchParams(location.search).has('quality');

  private raf = 0;
  private last = 0;
  private time = 0;
  private buildStart = -1;
  private focusY = 2;
  private signalTarget = 1;
  private snapIndex = -1;
  private snapCenter = 0;
  private cutUntil = 0;
  private hud: { update(): void; dispose(): void } | null = null;

  private constructor(
    private readonly opts: AppOptions,
    private readonly renderer: WebGLRenderer,
    private readonly world: World,
    private readonly figure: Figure,
    private readonly animator: FigureAnimator,
    private readonly rig: CameraRig,
    private readonly ui: StoryUI,
    private readonly timeline: ScrollTimeline,
  ) {
    this.ctx = {
      t: 0,
      dt: 0,
      graph: 0,
      projects: this.projectWeights,
      lamps: 0,
      night: 0,
      signalSpeed: 1,
      motion: opts.reduced ? 0 : 1,
      pixelRatio: renderer.getPixelRatio(),
      camera: rig.camera,
    };
    this.governor = new QualityGovernor(opts.tier, (tier) => this.applyTier(tier));
    this.cursor = supportsCursor() ? new Cursor(opts.reduced) : null;
    ui.bindNavigation(timeline);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('click', this.onClick);
    document.addEventListener('visibilitychange', this.onVisibility);
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    document.querySelectorAll<HTMLElement>('[data-signal]').forEach((el) => {
      el.addEventListener('pointerenter', this.signalOn);
      el.addEventListener('pointerleave', this.signalOff);
      el.addEventListener('focus', this.signalOn);
      el.addEventListener('blur', this.signalOff);
    });
    this.onResize();

    if (new URLSearchParams(location.search).has('debug')) {
      import('./perf/hud').then(({ mountHud }) => {
        this.hud = mountHud(renderer, () => this.governor.tier);
      });
      // Debug-only handle for scripted checks (camera determinism, story time).
      (window as unknown as { __manoj: object }).__manoj = { camera: rig.camera, timeline, figure: figure.root };
    }
  }

  static async create(opts: AppOptions): Promise<App> {
    const { loader, tier, canvas } = opts;
    loader.step('Unrolling the paper', 6);

    const renderer = new WebGLRenderer({
      canvas,
      antialias: tier.antialias,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier.dprCap));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    loader.step('Setting the type', 18);
    await withTimeout(document.fonts.ready, 2500);

    // Switch the document into its immersive layout before anything measures it.
    document.documentElement.classList.add('is-3d');
    const ui = new StoryUI(opts.reduced);
    const timeline = new ScrollTimeline(ui.sections);

    loader.step('Cutting the card', 34);
    await nextFrame();
    const world = new World(renderer, tier);

    loader.step('Placing the figure', 58);
    await nextFrame();
    const figure = buildFigure();
    world.scene.add(figure.root);
    const animator = new FigureAnimator(figure);
    const rig = new CameraRig();

    const app = new App(opts, renderer, world, figure, animator, rig, ui, timeline);

    loader.step('Mixing the light', 76);
    app.renderFrame(1 / 60);
    // Warm every shader while everything is visible (compile skips hidden objects).
    world.buildIn(1);
    figure.root.visible = true;
    await withTimeout(renderer.compileAsync(world.scene, rig.camera), 4000);
    renderer.render(world.scene, rig.camera);

    loader.step('Ready', 100);
    await nextFrame();
    return app;
  }

  start(): void {
    this.buildStart = this.opts.reduced ? -BUILD_SECONDS : this.time;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** The chapter the reader is in — used to keep their place when switching views. */
  currentChapter(): number {
    return Math.floor(this.timeline.sTarget);
  }

  /** Land on a chapter's hold without travelling there (used when entering from plain view). */
  jumpToChapter(index: number): void {
    if (index <= 0) return;
    const [a, b] = holdOf(index);
    window.scrollTo(0, this.timeline.scrollYFor((a + b) / 2));
    this.timeline.update(0, true);
  }

  private readonly frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 1 / 20);
    this.last = now;
    this.renderFrame(dt);
    if (!this.pinnedTier) this.governor.sample(dt);
    this.hud?.update();
  };

  private renderFrame(dt: number): void {
    this.time += dt;
    const { reduced } = this.opts;
    this.timeline.update(dt, reduced);

    // Story time for the world. Reduced motion: hold on the nearest shot, cut between shots.
    let s = this.timeline.s;
    if (reduced) {
      const snap = this.rig.snap(s);
      if (snap.index !== this.snapIndex) {
        if (this.snapIndex === -1) {
          this.snapIndex = snap.index;
          this.snapCenter = snap.center;
        } else if (this.cutUntil === 0) {
          this.cutUntil = this.time + 0.22;
          this.renderer.domElement.parentElement?.classList.add('is-cutting');
        } else if (this.time >= this.cutUntil) {
          this.snapIndex = snap.index;
          this.snapCenter = snap.center;
          this.cutUntil = 0;
          this.renderer.domElement.parentElement?.classList.remove('is-cutting');
        }
      }
      s = this.snapCenter;
    }

    const env = environmentAt(s, this.env);
    const st = stationAt(s, this.station);

    // Build-in: floors are set down one after another, then the figure.
    const build = this.buildStart < 0 && !reduced ? 0 : Math.min((this.time - this.buildStart) / BUILD_SECONDS, 1);
    this.world.buildIn(build);
    const drop = smoothstep(0.62, 1, build);
    this.figure.root.visible = drop > 0;
    this.figure.root.position.set(st.x, st.y + (1 - drop) * (1 - drop) * 4, st.z);
    this.figure.root.rotation.y = st.yaw;
    this.world.tower.lift.position.y = st.liftY;

    // Look-at: towards the pointer on desktop, towards the lens otherwise.
    const cam = this.rig.camera;
    _head.set(st.x, st.y + 1.62, st.z);
    _look.copy(cam.position);
    if (this.fineInput && this.pointer.active && !reduced) {
      _right.setFromMatrixColumn(cam.matrixWorld, 0);
      _up.setFromMatrixColumn(cam.matrixWorld, 1);
      const reach = cam.position.distanceTo(_head) * 0.45;
      _look.addScaledVector(_right, this.pointer.x * reach).addScaledVector(_up, this.pointer.y * reach * 0.6);
    }
    _look.sub(_head);
    const sinY = Math.sin(st.yaw);
    const cosY = Math.cos(st.yaw);
    const fwd = _look.x * sinY + _look.z * cosY;
    const side = _look.x * cosY - _look.z * sinY;
    const lookYaw = Math.atan2(side, fwd);
    const lookPitch = Math.atan2(_look.y, Math.hypot(side, fwd));
    this.animator.update({
      t: this.time,
      dt,
      gesture: st.gesture,
      walkWeight: st.walkWeight,
      walkPhase: st.walkPhase,
      lookYaw,
      lookPitch,
      lookWeight: reduced || Math.abs(lookYaw) > 1.4 ? 0 : 1,
      motion: reduced ? 0 : 1,
    });

    // Floor activity.
    const ctx = this.ctx;
    ctx.t = this.time;
    ctx.dt = dt;
    const [g0, g1] = holdOf(2);
    ctx.graph = smoothstep(g0 - 0.14, g1 - 0.04, s);
    for (let j = 0; j < PROJECT_COUNT; j++) {
      const [a, b] = projectBand(j);
      const on = s >= a && s <= b ? 1 : 0;
      this.projectWeights[j] = reduced ? on : damp(this.projectWeights[j], on, 4, dt);
    }
    ctx.lamps = env.lamps;
    ctx.night = env.night;
    ctx.signalSpeed = damp(ctx.signalSpeed, this.signalTarget, 3, dt);
    this.focusY = damp(this.focusY, st.y + 2, 3, dt);
    this.world.update(env, this.focusY, ctx);

    this.rig.update(s, dt, this.pointer.x, this.pointer.y, this.fineInput && !reduced && this.pointer.active);
    this.ui.update(this.timeline.sTarget, env.night);

    if (this.pointer.moved && this.cursor) {
      this.pointer.moved = false;
      this.cursor.setFigureHover(this.hitFigure(this.pointer.x, this.pointer.y));
    }
    this.cursor?.update(dt);

    this.renderer.render(this.world.scene, cam);
  }

  private hitFigure(x: number, y: number): boolean {
    if (!this.figure.root.visible) return false;
    this.raycaster.setFromCamera(_ndc.set(x, y), this.rig.camera);
    return this.raycaster.intersectObject(this.figure.hit, false).length > 0;
  }

  private applyTier(tier: Tier): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, tier.dprCap));
    this.ctx.pixelRatio = this.renderer.getPixelRatio();
    this.world.setQuality(tier, this.ctx.pixelRatio);
    this.onResize();
  }

  private readonly onResize = () => {
    const stage = this.renderer.domElement.parentElement;
    const w = stage?.clientWidth || innerWidth;
    const h = stage?.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
    this.timeline.measure();
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    this.pointer.moved = true;
    this.pointer.active = e.pointerType === 'mouse' || e.pointerType === 'pen';
  };

  private readonly onPointerLeave = () => {
    this.pointer.active = false;
    this.cursor?.setFigureHover(false);
  };

  /** Click (or tap) on the figure: he waves back. Ignores clicks on real controls. */
  private readonly onClick = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest('a, button, input, select, textarea, summary, label')) return;
    const x = (e.clientX / innerWidth) * 2 - 1;
    const y = -(e.clientY / innerHeight) * 2 + 1;
    if (this.hitFigure(x, y)) this.animator.triggerWave();
  };

  private readonly signalOn = () => (this.signalTarget = 2.4);
  private readonly signalOff = () => (this.signalTarget = 1);

  private readonly onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.opts.onFatal('webgl-context-lost');
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('click', this.onClick);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    document.querySelectorAll<HTMLElement>('[data-signal]').forEach((el) => {
      el.removeEventListener('pointerenter', this.signalOn);
      el.removeEventListener('pointerleave', this.signalOff);
      el.removeEventListener('focus', this.signalOn);
      el.removeEventListener('blur', this.signalOff);
    });
    this.hud?.dispose();
    this.cursor?.dispose();
    this.ui.dispose();
    this.timeline.dispose();
    this.figure.dispose();
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    document.documentElement.classList.remove('is-3d');
  }
}
