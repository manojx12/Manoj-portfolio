import { Track, type Key } from './tracks';
import { END_HOLD, holdOf, projectHold, PROJECT_COUNT } from './chapters';
import { floorY, LIFT, PLINTH_X, ROOF_Y, SPOTS } from '../world/layout';

/**
 * Camera choreography as subject-relative shots (see docs/06_MANOJ_CAMERA_CHOREOGRAPHY.md).
 *
 * Each key is [focusX, focusY, focusZ, yaw, pitch, dist, fitWidth, frameX, framePortraitY]
 *   focus     the point the shot is about (usually the figure's chest)
 *   yaw/pitch camera direction around the focus (yaw 0 = straight in front, from +Z)
 *   dist      camera distance on landscape screens
 *   fitWidth  world width that must stay visible (wide shots); the rig backs off on narrow screens
 *   frameX    where the focus sits horizontally on landscape screens (NDC, +right) → copy on the left
 *   frameY    where the focus sits vertically on portrait screens (NDC, +up) → copy sheet below
 *
 * Interpolating these parameters (not raw positions) makes every move an arc around its subject:
 * the camera never cuts through the building.
 */

type Shot = [number, number, number, number, number, number, number, number, number];

const shot = (at: Key['at'], v: Shot): Key => ({ at, v });
const mid = (a: [number, number], b: [number, number]) => (a[1] + b[0]) / 2;

/**
 * A crane shot past the elevator, halfway through a ride from `level` to `level + 1`.
 * Kept shallow in yaw so the line of sight enters through the cut face (not the side wall),
 * and pitched down enough to clear the plaza trees and see slab edges obliquely.
 */
const riding = (level: number): Shot => [LIFT.x - 1.4, floorY(level) + 3.0, LIFT.z + 0.2, 0.19, 0.17, 22, 0, 0.2, 0.42];

const studioHolds = Array.from({ length: PROJECT_COUNT }, (_, j) => projectHold(j));

export const SHOT_KEYS: Key[] = [
  // 00 · Site — establishing: the whole model on the drafting table, morning.
  shot(holdOf(0), [0.6, 10.6, 0, 0.62, 0.34, 68, 36, 0.32, 0.34]),
  // Descend towards the plaza as he walks in.
  shot(0.62, [SPOTS.plaza.x - 0.2, 2.6, 4.6, 0.44, 0.2, 21, 0, 0.26, 0.42]),
  // 01 · Lobby — human scale.
  shot(holdOf(1), [SPOTS.lobby.x, 1.05, SPOTS.lobby.z, 0.34, 0.07, 7.8, 0, 0.32, 0.5]),
  shot(mid(holdOf(1), holdOf(2)), riding(0)),
  // 02 · Foundations — figure and drafting desk with the problem graph.
  shot(holdOf(2), [-3.9, floorY(1) + 1.0, 0.5, 0.22, 0.12, 9.4, 0, 0.28, 0.5]),
  shot(mid(holdOf(2), holdOf(3)), riding(1)),
  // 03 · Engine room — racks behind, figure on the right.
  shot(holdOf(3), [0.8, floorY(2) + 1.0, 0.0, 0.12, 0.2, 11.5, 0, 0.28, 0.48]),
  shot(mid(holdOf(3), studioHolds[0]), riding(2)),
  // 04 · Studio — truck from plinth to plinth.
  ...studioHolds.map((h, j) => shot(h, [PLINTH_X[j] + 0.7, floorY(3) + 1.0, -0.3, 0.26, 0.1, 8.6, 0, 0.22, 0.48])),
  shot(mid(studioHolds[PROJECT_COUNT - 1], holdOf(5)), riding(3)),
  // 05 · Lab — over the shoulder onto the workbench, dusk arriving.
  shot(holdOf(5), [-2.8, floorY(4) + 1.0, -2.2, 0.48, 0.16, 8.4, 0, 0.26, 0.48]),
  shot(mid(holdOf(5), holdOf(6)), riding(4)),
  // 06 · Roof — at the parapet, night.
  shot(holdOf(6), [SPOTS.roof.x + 0.2, ROOF_Y + 1.0, SPOTS.roof.z - 0.2, 0.3, 0.13, 8.8, 0, 0.3, 0.5]),
  // Closing — pull back to the whole lit building: bookends the opening shot.
  shot(END_HOLD, [0, 11.5, 0, -0.5, 0.2, 70, 36, 0.32, 0.34]),
];

export const shotTrack = new Track(SHOT_KEYS);
