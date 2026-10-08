import { Color, SRGBColorSpace } from 'three';
import { Track, type Key } from './tracks';

/**
 * The building's day, keyed on story time: morning in the lobby, noon in the engine room,
 * golden hour in the lab, night on the roof. Light is narrative: the higher he climbs, the later it gets.
 */

export interface Environment {
  bg: Color;
  sunColor: Color;
  sky: Color;
  ground: Color;
  /** Sun azimuth (rad, 0 = from +Z) and elevation (rad). */
  sunAz: number;
  sunEl: number;
  sunIntensity: number;
  hemiIntensity: number;
  /** 0 … 1: window lamps and the floor light. */
  lamps: number;
  /** 0 … 1: how far into night we are (dark theme, dust fade, signal visibility). */
  night: number;
}

const rgb = (hex: number) => {
  const c = new Color().setHex(hex, SRGBColorSpace);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, SRGBColorSpace);
  return [out.r, out.g, out.b];
};

// [bg rgb, sun rgb, sky rgb, ground rgb, sunAz, sunEl, sunI, hemiI, lamps, night]
const env = (bg: number, sun: number, sky: number, ground: number, az: number, el: number, si: number, hi: number, lamps: number, night: number) => [
  ...rgb(bg),
  ...rgb(sun),
  ...rgb(sky),
  ...rgb(ground),
  az,
  el,
  si,
  hi,
  lamps,
  night,
];

const KEYS: Key[] = [
  { at: [0, 2.2], v: env(0xece6da, 0xfff3e2, 0xf7f2e8, 0xd8cdbb, 0.62, 0.8, 2.6, 1.45, 0, 0) },
  { at: [3.1, 4.2], v: env(0xebe5d8, 0xffffff, 0xf4f1ea, 0xd3c8b6, 0.25, 0.98, 2.7, 1.4, 0, 0) },
  { at: [4.85, 4.95], v: env(0xe8dccb, 0xffe3c2, 0xf2e6d4, 0xbfae96, -0.25, 0.6, 2.4, 1.2, 0.12, 0) },
  { at: [5.3, 5.52], v: env(0xdcc0a8, 0xffb072, 0xeccbb2, 0x7a6459, -0.62, 0.24, 2.0, 1.0, 0.55, 0.15) },
  { at: [6.02, 7], v: env(0x0e1120, 0x8e9cff, 0x2b3263, 0x0b0d16, 0.5, 0.75, 0.6, 0.55, 1, 1) },
];

const track = new Track(KEYS);
const scratch: number[] = new Array(track.dim).fill(0);

export function createEnvironment(): Environment {
  return {
    bg: new Color(),
    sunColor: new Color(),
    sky: new Color(),
    ground: new Color(),
    sunAz: 0,
    sunEl: 0,
    sunIntensity: 0,
    hemiIntensity: 0,
    lamps: 0,
    night: 0,
  };
}

/** Writes the environment at story time `s` into `out` (no allocation). */
export function environmentAt(s: number, out: Environment): Environment {
  const v = track.evaluate(s, scratch);
  out.bg.setRGB(v[0], v[1], v[2], SRGBColorSpace);
  out.sunColor.setRGB(v[3], v[4], v[5], SRGBColorSpace);
  out.sky.setRGB(v[6], v[7], v[8], SRGBColorSpace);
  out.ground.setRGB(v[9], v[10], v[11], SRGBColorSpace);
  out.sunAz = v[12];
  out.sunEl = v[13];
  out.sunIntensity = v[14];
  out.hemiIntensity = v[15];
  out.lamps = v[16];
  out.night = v[17];
  return out;
}
