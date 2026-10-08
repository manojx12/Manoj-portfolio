import type { Gesture } from './animation';
import { END_HOLD, holdOf, projectHold } from '../story/chapters';
import { smoothstep } from '../story/tracks';
import { LIFT, LIFT_LANDING, SPOTS, floorY } from '../world/layout';

/**
 * Where Manoj is, as a pure function of story time.
 *
 * He rests at a STOP during each chapter's hold and travels a waypoint path during the move
 * between holds: walk to the lift, ride up, walk out. The walk phase is the horizontal distance
 * travelled divided by the stride, accumulated across the whole story, so the gait is locked to
 * the ground (no foot sliding) and scrolling backwards plays it backwards.
 */

const STRIDE = 1.3; // metres per full gait cycle
const RIDE_EFFORT = 0.5; // a metre of lift travel "costs" half a metre of walking

interface P {
  x: number;
  y: number;
  z: number;
}
interface WP extends P {
  /** The segment arriving at this waypoint is a lift ride. */
  ride?: boolean;
}
interface Spot extends P {
  yaw: number;
}
interface Stop {
  hold: readonly [number, number];
  spot: Spot;
  gesture: Gesture;
}
interface Seg {
  a: P;
  b: P;
  ride: boolean;
  horiz: number;
  effort: number;
  e0: number; // cumulative effort at segment start (leg-local)
  h0: number; // cumulative horizontal distance at segment start (leg-local)
  yaw: number;
  runStart: number; // horizontal distance where this walking run starts / ends (leg-local)
  runEnd: number;
  restStart: number; // yaw to settle into at the run's ends
  restEnd: number;
}
interface Leg {
  t0: number;
  t1: number;
  segs: Seg[];
  effort: number;
  horizBefore: number;
  horizEnd: number;
  liftFrom: number | null;
  liftTo: number | null;
  from: Stop;
  to: Stop;
}

const landing = (level: number, z: number = LIFT_LANDING.z): WP => ({ x: LIFT_LANDING.x, y: floorY(level), z });
const lift = (level: number, ride = false): WP => ({ x: LIFT.x, y: floorY(level), z: LIFT.z, ride });
/** Walk to the lift on `level`, ride to `level + 1`, step out towards `exitZ`. */
const ride = (level: number, exitZ?: number): WP[] => [landing(level), lift(level), lift(level + 1, true), landing(level + 1, exitZ)];

const STOPS: Stop[] = [
  { hold: holdOf(0), spot: SPOTS.plaza, gesture: 'idle' },
  { hold: holdOf(1), spot: SPOTS.lobby, gesture: 'wave' },
  { hold: holdOf(2), spot: SPOTS.foundations, gesture: 'think' },
  { hold: holdOf(3), spot: SPOTS.engine, gesture: 'inspect' },
  ...SPOTS.studio.map((spot, j): Stop => ({ hold: projectHold(j), spot, gesture: 'point' })),
  { hold: holdOf(5), spot: SPOTS.lab, gesture: 'tinker' },
  { hold: holdOf(6), spot: SPOTS.roof, gesture: 'lookout' },
  { hold: END_HOLD, spot: SPOTS.roof, gesture: 'wave' },
];

/** Intermediate waypoints for each leg (between STOPS[i] and STOPS[i + 1]). */
const VIA: WP[][] = [
  [{ x: -1.9, y: 0, z: 4.4 }],
  ride(0),
  ride(1),
  ride(2, 0.3),
  ...SPOTS.studio.slice(1).map((): WP[] => []),
  ride(3),
  ride(4, 0.2),
  [],
];

const flat = (a: P, b: P) => Math.hypot(b.x - a.x, b.z - a.z);
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function buildLegs(): Leg[] {
  const legs: Leg[] = [];
  let horizTotal = 0;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const from = STOPS[i];
    const to = STOPS[i + 1];
    const points: WP[] = [from.spot, ...VIA[i], to.spot];
    const segs: Seg[] = [];
    let e = 0;
    let h = 0;
    let liftFrom: number | null = null;
    let liftTo: number | null = null;
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k];
      const b = points[k + 1];
      const isRide = Boolean(b.ride);
      const horiz = isRide ? 0 : flat(a, b);
      const effort = isRide ? Math.abs(b.y - a.y) * RIDE_EFFORT : horiz;
      if (effort < 1e-4) continue;
      if (isRide) {
        liftFrom ??= a.y;
        liftTo = b.y;
      }
      segs.push({ a, b, ride: isRide, horiz, effort, e0: e, h0: h, yaw: Math.atan2(b.x - a.x, b.z - a.z), runStart: 0, runEnd: 0, restStart: 0, restEnd: 0 });
      e += effort;
      h += horiz;
    }
    // Group consecutive walking segments into runs; each run eases in and out of the walk.
    for (let k = 0; k < segs.length; k++) {
      if (segs[k].ride) continue;
      let first = k;
      while (first > 0 && !segs[first - 1].ride) first--;
      let last = k;
      while (last < segs.length - 1 && !segs[last + 1].ride) last++;
      segs[k].runStart = segs[first].h0;
      segs[k].runEnd = segs[last].h0 + segs[last].horiz;
      segs[k].restStart = first === 0 ? from.spot.yaw : 0;
      segs[k].restEnd = last === segs.length - 1 ? to.spot.yaw : 0;
    }
    legs.push({ t0: from.hold[1], t1: to.hold[0], segs, effort: e, horizBefore: horizTotal, horizEnd: horizTotal + h, liftFrom, liftTo, from, to });
    horizTotal += h;
  }
  return legs;
}

const LEGS = buildLegs();

export interface StationState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  walkWeight: number;
  walkPhase: number;
  gesture: Gesture;
  liftY: number;
}

function rest(stop: Stop, out: StationState, phase: number, liftY: number) {
  out.x = stop.spot.x;
  out.y = stop.spot.y;
  out.z = stop.spot.z;
  out.yaw = stop.spot.yaw;
  out.walkWeight = 0;
  out.walkPhase = phase;
  out.gesture = stop.gesture;
  out.liftY = liftY;
  return out;
}

export function stationAt(s: number, out: StationState): StationState {
  let liftY = 0;
  for (let i = 0; i < LEGS.length; i++) {
    const leg = LEGS[i];
    if (s <= leg.t0) return rest(leg.from, out, leg.horizBefore / STRIDE, liftY);
    if (s >= leg.t1) {
      if (leg.liftTo !== null) liftY = leg.liftTo;
      if (i === LEGS.length - 1) return rest(leg.to, out, leg.horizEnd / STRIDE, liftY);
      continue;
    }

    // Travelling along this leg.
    if (leg.segs.length === 0) return rest(s < (leg.t0 + leg.t1) / 2 ? leg.from : leg.to, out, leg.horizBefore / STRIDE, liftY);
    const e = smoothstep(leg.t0, leg.t1, s) * leg.effort;
    let k = 0;
    while (k < leg.segs.length - 1 && leg.segs[k].e0 + leg.segs[k].effort < e) k++;
    const seg = leg.segs[k];
    const f = Math.min(Math.max((e - seg.e0) / seg.effort, 0), 1);
    out.x = seg.a.x + (seg.b.x - seg.a.x) * f;
    out.y = seg.a.y + (seg.b.y - seg.a.y) * f;
    out.z = seg.a.z + (seg.b.z - seg.a.z) * f;

    // The lift sits wherever its last ride left it; during a ride it carries him.
    if (leg.liftFrom !== null) {
      const rideIndex = leg.segs.findIndex((g) => g.ride);
      liftY = k < rideIndex ? leg.liftFrom : k > rideIndex ? leg.liftTo! : out.y;
    }
    out.liftY = liftY;

    if (seg.ride) {
      out.yaw = 0;
      out.walkWeight = 0;
      out.walkPhase = (leg.horizBefore + seg.h0) / STRIDE;
      out.gesture = 'ride';
      return out;
    }

    const d = seg.h0 + seg.horiz * f; // leg-local horizontal distance
    out.walkPhase = (leg.horizBefore + d) / STRIDE;
    out.walkWeight = smoothstep(0, 0.55, d - seg.runStart) * smoothstep(0, 0.55, seg.runEnd - d);

    // Heading: segment direction, rounded off at corners.
    const local = d - seg.h0;
    let heading = seg.yaw;
    const prev = leg.segs[k - 1];
    const next = leg.segs[k + 1];
    if (local < 0.4 && prev && !prev.ride) heading = lerpAngle(prev.yaw, seg.yaw, 0.5 + 0.5 * (local / 0.4));
    else if (local > seg.horiz - 0.4 && next && !next.ride) heading = lerpAngle(seg.yaw, next.yaw, 0.5 * ((local - (seg.horiz - 0.4)) / 0.4));
    const restYaw = d - seg.runStart < seg.runEnd - d ? seg.restStart : seg.restEnd;
    out.yaw = lerpAngle(restYaw, heading, out.walkWeight);
    out.gesture = 'idle';
    return out;
  }
  return out;
}

export function createStationState(): StationState {
  return { x: 0, y: 0, z: 0, yaw: 0, walkWeight: 0, walkPhase: 0, gesture: 'idle', liftY: 0 };
}
