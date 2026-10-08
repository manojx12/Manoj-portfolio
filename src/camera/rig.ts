import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { shotTrack } from '../story/shots';
import { damp, lerp, smoothstep } from '../story/tracks';

const UP = new Vector3(0, 1, 0);
const _focus = new Vector3();
const _dir = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();
const _shift = new Vector3();
const _target = new Vector3();

/**
 * Turns a subject-relative shot into a camera transform for the current screen.
 *
 * - Portrait screens: wider lens, a little more distance, subject moved to the upper area
 *   (the copy becomes a bottom sheet). Landscape: subject on the right third, copy on the left.
 * - `fitWidth` shots back off until the whole model fits, whatever the aspect ratio.
 * - Framing offsets PAN the camera (position and target move together), so the subject lands
 *   exactly where the layout needs it without changing the viewing angle.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(30, 1, 0.1, 420);
  private readonly v: number[] = new Array(shotTrack.dim).fill(0);
  private aspect = 1;
  private portrait = 0;
  private px = 0;
  private py = 0;

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.portrait = smoothstep(1.15, 0.7, this.aspect);
    this.camera.aspect = this.aspect;
    this.camera.fov = lerp(30, 40, this.portrait);
    this.camera.updateProjectionMatrix();
  }

  /** Reduced motion: story time snapped to the centre of the nearest camera hold. */
  snap(s: number): { index: number; center: number } {
    return shotTrack.nearestHold(s);
  }

  update(s: number, dt: number, pointerX: number, pointerY: number, parallax: boolean): void {
    const v = shotTrack.evaluate(s, this.v);
    const [fx, fy, fz, yaw, pitch, dist, fit, frameX, framePortraitY] = v;

    const tanV = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * this.aspect;
    const fitDist = fit > 0 ? fit / 2 / tanH : 0;
    const d = Math.max(dist * lerp(1, 1.28, this.portrait), fitDist);

    _focus.set(fx, fy, fz);
    _dir.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    _fwd.copy(_dir).negate();
    _right.crossVectors(_fwd, UP).normalize();
    _up.crossVectors(_right, _fwd).normalize();

    // Place the focus at (ndcX, ndcY) by panning.
    const ndcX = frameX * (1 - this.portrait);
    const ndcY = framePortraitY * this.portrait;
    _shift.copy(_right).multiplyScalar(-ndcX * d * tanH).addScaledVector(_up, -ndcY * d * tanV);

    this.px = damp(this.px, parallax ? pointerX : 0, 2.5, dt);
    this.py = damp(this.py, parallax ? pointerY : 0, 2.5, dt);

    this.camera.position.copy(_focus).addScaledVector(_dir, d).add(_shift);
    this.camera.position.addScaledVector(_right, this.px * 0.016 * d).addScaledVector(_up, this.py * 0.01 * d);
    _target.copy(_focus).add(_shift);
    this.camera.lookAt(_target);
  }
}
