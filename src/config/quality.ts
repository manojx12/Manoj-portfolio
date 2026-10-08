/**
 * Device capability probe + quality tiers + an adaptive governor that only ever steps DOWN.
 * Tiers change the knobs that actually cost frame time on integrated GPUs:
 * pixel ratio (fill rate), shadow map size, particle count and MSAA.
 */

export type TierName =
  | 'ultra'
  | 'high'
  | 'medium'
  | 'low'
  | 'mobile-high'
  | 'mobile-medium'
  | 'mobile-low';

export interface Tier {
  name: TierName;
  dprCap: number;
  shadowMap: 0 | 1024 | 2048;
  dust: number;
  antialias: boolean;
}

const TIERS: Record<TierName, Tier> = {
  ultra: { name: 'ultra', dprCap: 2, shadowMap: 2048, dust: 900, antialias: true },
  high: { name: 'high', dprCap: 1.75, shadowMap: 2048, dust: 700, antialias: true },
  medium: { name: 'medium', dprCap: 1.25, shadowMap: 1024, dust: 450, antialias: true },
  low: { name: 'low', dprCap: 1, shadowMap: 0, dust: 200, antialias: false },
  'mobile-high': { name: 'mobile-high', dprCap: 1.5, shadowMap: 1024, dust: 260, antialias: true },
  'mobile-medium': { name: 'mobile-medium', dprCap: 1.25, shadowMap: 0, dust: 180, antialias: false },
  'mobile-low': { name: 'mobile-low', dprCap: 1, shadowMap: 0, dust: 120, antialias: false },
};

const DESKTOP_LADDER: TierName[] = ['ultra', 'high', 'medium', 'low'];
const MOBILE_LADDER: TierName[] = ['mobile-high', 'mobile-medium', 'mobile-low'];

export interface Capabilities {
  webgl: boolean;
  gpu: string;
  coarse: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  cores: number;
  memory: number;
}

export function probeCapabilities(): Capabilities {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  let webgl = false;
  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    // three.js r163+ renders through WebGL 2 only; anything less gets the plain document.
    const gl = canvas.getContext('webgl2');
    if (gl) {
      webgl = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl = false;
  }
  return {
    webgl,
    gpu,
    coarse: matchMedia('(pointer: coarse)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(nav.connection?.saveData),
    cores: nav.hardwareConcurrency || 4,
    memory: nav.deviceMemory ?? 8,
  };
}

const SOFTWARE = /swiftshader|llvmpipe|software|microsoft basic/i;
const WEAK_DESKTOP = /intel|hd graphics|uhd|iris/i;
const STRONG_DESKTOP = /nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|apple m\d (pro|max|ultra)/i;
const WEAK_MOBILE = /mali-[gt]?[1-5]\d\b|adreno \(tm\) [3-5]\d\d|powervr/i;
const STRONG_MOBILE = /apple gpu|adreno \(tm\) [7-9]\d\d|mali-g7[1-9]|immortalis/i;

export function pickTier(c: Capabilities): TierName {
  const forced = new URLSearchParams(location.search).get('quality') as TierName | null;
  if (forced && forced in TIERS) return forced;

  if (c.coarse) {
    if (c.memory <= 3 || c.cores <= 4 || WEAK_MOBILE.test(c.gpu)) return 'mobile-low';
    if (STRONG_MOBILE.test(c.gpu) && innerWidth >= 390) return 'mobile-high';
    return 'mobile-medium';
  }
  if (SOFTWARE.test(c.gpu)) return 'low';
  // Measured: an Intel HD 620 holds 60 fps at `medium` (1024 shadows). The governor still
  // steps down if a particular machine can't.
  if (WEAK_DESKTOP.test(c.gpu)) return 'medium';
  if (STRONG_DESKTOP.test(c.gpu) && c.cores >= 8) return 'ultra';
  return 'high';
}

export function tierSettings(name: TierName): Tier {
  return TIERS[name];
}

/**
 * Watches real frame time and steps the tier down when it is sustained above budget.
 * Never steps up (avoids oscillation), never more than two steps, ignores the first seconds
 * (shader warm-up and the build-in animation are not representative).
 */
export class QualityGovernor {
  private acc = 0;
  private frames = 0;
  private elapsed = 0;
  private steps = 0;
  private readonly ladder: TierName[];

  constructor(
    public tier: Tier,
    private readonly onChange: (tier: Tier) => void,
    private readonly budget = 1 / 40,
  ) {
    this.ladder = tier.name.startsWith('mobile') ? MOBILE_LADDER : DESKTOP_LADDER;
  }

  sample(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed < 4) return;
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    const index = this.ladder.indexOf(this.tier.name);
    if (avg > this.budget && this.steps < 2 && index < this.ladder.length - 1) {
      this.steps++;
      this.tier = TIERS[this.ladder[index + 1]];
      this.onChange(this.tier);
    }
  }
}
