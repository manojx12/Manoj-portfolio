import type { Figure } from './figure';
import { JOINTS, type JointName } from './figure';
import { clamp, damp } from '../story/tracks';

/**
 * Procedural clips + a small blending mixer.
 *
 * A pose is a flat Float32Array: 3 Euler angles per joint, then hip bob (y) and hip sway (x).
 * Clips are pure functions that write a pose. The mixer blends the station GESTURE layer
 * (time-damped weights), the LOCOMOTION layer (weight and phase come from the path, so
 * scrubbing backwards un-walks him), a one-shot WAVE overlay, and an additive LOOK-AT.
 */

export type Gesture = 'idle' | 'wave' | 'think' | 'inspect' | 'point' | 'tinker' | 'ride' | 'lookout';
const GESTURES: Gesture[] = ['idle', 'wave', 'think', 'inspect', 'point', 'tinker', 'ride', 'lookout'];

const J = Object.fromEntries(JOINTS.map((n, i) => [n, i * 3])) as Record<JointName, number>;
const SIZE = JOINTS.length * 3 + 2;
const BOB = SIZE - 2;
const SWAY = SIZE - 1;
const TAU = Math.PI * 2;
const WAVE_JOINTS: readonly JointName[] = ['shR', 'elR', 'neck', 'head'];

type Pose = Float32Array;
const set = (p: Pose, j: JointName, x: number, y = 0, z = 0) => {
  const i = J[j];
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
};
const add = (p: Pose, j: JointName, x: number, y = 0, z = 0) => {
  const i = J[j];
  p[i] += x;
  p[i + 1] += y;
  p[i + 2] += z;
};

// ─── Clips ───────────────────────────────────────────────────────────────────────────────────

function idle(t: number, p: Pose) {
  p.fill(0);
  const breath = Math.sin(t * TAU * 0.25);
  const shift = Math.sin(t * 0.5);
  set(p, 'spine', 0.02, 0, 0);
  set(p, 'chest', 0.015 * breath, 0, 0);
  set(p, 'hips', 0, 0, 0.02 * shift);
  set(p, 'neck', 0, 0.05 * Math.sin(t * 0.31), 0);
  set(p, 'head', 0.02 * Math.sin(t * 0.23), 0, 0);
  set(p, 'shL', 0.03, 0, 0.12 + 0.01 * breath);
  set(p, 'shR', 0.03, 0, -0.12 - 0.01 * breath);
  set(p, 'elL', -0.14);
  set(p, 'elR', -0.14);
  set(p, 'thL', 0, 0, 0.025);
  set(p, 'thR', 0, 0, -0.025);
  p[SWAY] = 0.012 * shift;
}

function walk(phase: number, p: Pose) {
  p.fill(0);
  const ph = phase * TAU;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const swingL = Math.pow(Math.max(0, c), 1.5);
  const swingR = Math.pow(Math.max(0, -c), 1.5);
  set(p, 'thL', -0.42 * s, 0, 0.02);
  set(p, 'thR', 0.42 * s, 0, -0.02);
  set(p, 'knL', 0.08 + 0.78 * swingL);
  set(p, 'knR', 0.08 + 0.78 * swingR);
  set(p, 'ftL', -(-0.42 * s + 0.08 + 0.78 * swingL) * 0.55);
  set(p, 'ftR', -(0.42 * s + 0.08 + 0.78 * swingR) * 0.55);
  set(p, 'hips', 0, 0.13 * s, 0.03 * c);
  set(p, 'spine', 0.05);
  set(p, 'chest', 0, -0.16 * s, 0);
  set(p, 'shL', 0.38 * s, 0, 0.1);
  set(p, 'shR', -0.38 * s, 0, -0.1);
  set(p, 'elL', -0.22 - 0.3 * Math.max(0, -s));
  set(p, 'elR', -0.22 - 0.3 * Math.max(0, s));
  set(p, 'neck', 0, 0.06 * s, 0);
  set(p, 'head', -0.03);
  p[BOB] = 0.025 * Math.cos(2 * ph);
}

function wave(t: number, p: Pose) {
  idle(t, p);
  set(p, 'shR', -0.25, 0, -2.45);
  set(p, 'elR', 0, 0, -0.55 + 0.38 * Math.sin(t * TAU * 1.5));
  set(p, 'neck', 0, 0.1, 0);
  set(p, 'head', 0.02, 0, 0.08);
}

function think(t: number, p: Pose) {
  idle(t, p);
  set(p, 'shR', -0.6, 0.3, 0.32);
  set(p, 'elR', -2.05 + 0.04 * Math.sin(t * 0.8), 0, 0);
  set(p, 'shL', -0.42, 0, -0.32);
  set(p, 'elL', -1.45);
  set(p, 'neck', 0, -0.12, 0);
  set(p, 'head', 0.1, 0, 0.06 + 0.02 * Math.sin(t * 0.5));
}

function inspect(t: number, p: Pose) {
  idle(t, p);
  set(p, 'shL', 0.3, 0, 0.06);
  set(p, 'shR', 0.3, 0, -0.06);
  set(p, 'elL', -0.55, 0, -0.35);
  set(p, 'elR', -0.55, 0, 0.35);
  set(p, 'neck', 0, -0.3 + 0.32 * Math.sin(t * 0.45), 0);
  set(p, 'head', 0.07);
}

function point(t: number, p: Pose) {
  idle(t, p);
  set(p, 'shR', -0.55, 0, -1.15 + 0.04 * Math.sin(t * 1.2));
  set(p, 'elR', -0.15);
  set(p, 'neck', 0, -0.45, 0);
  set(p, 'head', 0.06);
}

function tinker(t: number, p: Pose) {
  idle(t, p);
  add(p, 'spine', 0.1);
  add(p, 'chest', 0.08);
  set(p, 'head', 0.35);
  set(p, 'shL', -0.78, 0, 0.18);
  set(p, 'elL', -0.85 + 0.12 * Math.sin(t * 3.1));
  set(p, 'shR', -0.82, 0, -0.18);
  set(p, 'elR', -0.8 + 0.12 * Math.sin(t * 2.7 + 1));
}

function lookout(t: number, p: Pose) {
  idle(t, p);
  set(p, 'head', -0.09);
  set(p, 'shL', 0.08, 0, 0.1);
  set(p, 'shR', 0.08, 0, -0.1);
}

const CLIPS: Record<Gesture, (t: number, p: Pose) => void> = {
  idle,
  wave,
  think,
  inspect,
  point,
  tinker,
  ride: idle,
  lookout,
};

// ─── Mixer ───────────────────────────────────────────────────────────────────────────────────

export interface AnimationInput {
  t: number;
  dt: number;
  gesture: Gesture;
  walkWeight: number;
  walkPhase: number;
  /** Look-at in figure-local angles (rad) and its weight. */
  lookYaw: number;
  lookPitch: number;
  lookWeight: number;
  /** 0 with reduced motion: gesture loops hold still. */
  motion: number;
}

export class FigureAnimator {
  private readonly weights = new Float32Array(GESTURES.length);
  private readonly scratch = new Float32Array(SIZE);
  private readonly blend = new Float32Array(SIZE);
  private readonly walkPose = new Float32Array(SIZE);
  private readonly wavePose = new Float32Array(SIZE);
  private waveTime = 0;
  private yaw = 0;
  private pitch = 0;
  private readonly baseHipY: number;

  constructor(private readonly figure: Figure) {
    this.weights[0] = 1;
    this.baseHipY = figure.joints.hips.position.y;
  }

  /** One-shot wave (click on the figure). */
  triggerWave(): void {
    this.waveTime = 1.9;
  }

  update(input: AnimationInput): void {
    const { dt } = input;
    const t = input.t * input.motion;

    // Gesture layer: damped weights → normalised blend.
    const target = GESTURES.indexOf(input.gesture);
    let total = 0;
    for (let g = 0; g < GESTURES.length; g++) {
      this.weights[g] = damp(this.weights[g], g === target ? 1 : 0, 5, dt);
      total += this.weights[g];
    }
    this.blend.fill(0);
    for (let g = 0; g < GESTURES.length; g++) {
      const w = this.weights[g] / total;
      if (w < 0.002) continue;
      CLIPS[GESTURES[g]](t, this.scratch);
      for (let i = 0; i < SIZE; i++) this.blend[i] += this.scratch[i] * w;
    }

    // Locomotion layer.
    const ww = clamp(input.walkWeight);
    if (ww > 0.001) {
      walk(input.walkPhase, this.walkPose);
      for (let i = 0; i < SIZE; i++) this.blend[i] += (this.walkPose[i] - this.blend[i]) * ww;
    }

    // One-shot wave overlay on the right arm and head (envelope in, hold, out).
    if (this.waveTime > 0) {
      this.waveTime = Math.max(0, this.waveTime - dt);
      const env = Math.min(1, this.waveTime / 0.3, (1.9 - this.waveTime) / 0.3) * (1 - ww);
      wave(input.t, this.wavePose);
      for (const j of WAVE_JOINTS) {
        for (let k = 0; k < 3; k++) this.blend[J[j] + k] += (this.wavePose[J[j] + k] - this.blend[J[j] + k]) * env;
      }
    }

    // Additive look-at, damped.
    const lw = clamp(input.lookWeight) * (1 - ww);
    this.yaw = damp(this.yaw, clamp(input.lookYaw, -0.65, 0.65) * lw, 4, dt);
    this.pitch = damp(this.pitch, clamp(input.lookPitch, -0.35, 0.3) * lw, 4, dt);
    this.blend[J.neck + 1] += this.yaw * 0.45;
    this.blend[J.head + 1] += this.yaw * 0.55;
    this.blend[J.head] -= this.pitch * 0.7;

    this.apply();
  }

  private apply(): void {
    const { joints } = this.figure;
    for (let i = 0; i < JOINTS.length; i++) {
      joints[JOINTS[i]].rotation.set(this.blend[i * 3], this.blend[i * 3 + 1], this.blend[i * 3 + 2]);
    }
    joints.hips.position.y = this.baseHipY + this.blend[BOB];
    joints.hips.position.x = this.blend[SWAY];
  }
}
