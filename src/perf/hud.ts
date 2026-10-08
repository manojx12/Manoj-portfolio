import type { WebGLRenderer } from 'three';
import type { Tier } from '../config/quality';

/**
 * Development instrumentation (append ?debug to the URL). Lives in its own chunk, so it costs
 * nothing unless asked for. Reports FPS, frame time (avg / worst), draw calls, triangles,
 * geometries, textures, programs, tier and pixel ratio. Exposes the last sample on
 * window.__manojPerf for automated checks.
 */
export function mountHud(renderer: WebGLRenderer, getTier: () => Tier) {
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:90;margin:0;padding:8px 10px;font:11px/1.45 "IBM Plex Mono",monospace;' +
    'background:rgba(22,24,29,.86);color:#ece6da;pointer-events:none;white-space:pre';
  document.body.appendChild(el);

  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let windowStart = last;

  return {
    update() {
      const now = performance.now();
      const ft = now - last;
      last = now;
      frames++;
      worst = Math.max(worst, ft);
      if (now - windowStart < 500) return;
      const span = now - windowStart;
      const info = renderer.info;
      const sample = {
        fps: Math.round((frames * 1000) / span),
        avgMs: +(span / frames).toFixed(1),
        worstMs: +worst.toFixed(1),
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        tier: getTier().name,
        dpr: renderer.getPixelRatio(),
      };
      (window as unknown as { __manojPerf: typeof sample }).__manojPerf = sample;
      el.textContent =
        `fps ${sample.fps}  ${sample.avgMs} ms (worst ${sample.worstMs})\n` +
        `draws ${sample.calls}  tris ${sample.triangles.toLocaleString()}\n` +
        `geo ${sample.geometries}  tex ${sample.textures}  prog ${sample.programs}\n` +
        `tier ${sample.tier}  dpr ${sample.dpr}`;
      frames = 0;
      worst = 0;
      windowStart = now;
    },
    dispose() {
      el.remove();
    },
  };
}
