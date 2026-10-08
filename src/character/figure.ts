import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { PALETTE } from '../config/palette';

/**
 * Manoj as an architectural scale figure: ultramarine hoodie, navy trousers, round glasses,
 * a quiff of dark hair, white-soled sneakers; head and hands in unpainted card like a real
 * maquette figure. ~1.8 units tall. Built from primitives on a 15-joint hierarchy.
 */

export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'thL', 'knL', 'thR', 'knR', 'ftL', 'ftR'] as const;
export type JointName = (typeof JOINTS)[number];

export interface Figure {
  root: Group;
  joints: Record<JointName, Object3D>;
  /** Invisible capsule used for pointer hit-testing (cheaper and friendlier than the real mesh). */
  hit: Mesh;
  dispose(): void;
}

function contactShadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(22,24,29,0.55)');
  grad.addColorStop(1, 'rgba(22,24,29,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export function buildFigure(): Figure {
  const mats = {
    hoodie: new MeshStandardMaterial({ color: PALETTE.ultra, roughness: 0.82 }),
    trousers: new MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.85 }),
    skin: new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.9 }),
    ink: new MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.6 }),
    sole: new MeshStandardMaterial({ color: PALETTE.card, roughness: 0.9 }),
  };
  const geometries: BufferGeometry[] = [];
  const track = <G extends BufferGeometry>(g: G) => (geometries.push(g), g);

  const joint = (name: JointName, parent: Object3D, x: number, y: number, z: number) => {
    const o = new Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const part = (parent: Object3D, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new Mesh(track(geo), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const root = new Group();
  root.name = 'manoj';

  const hips = joint('hips', root, 0, 0.94, 0);
  const spine = joint('spine', hips, 0, 0.06, 0);
  const chest = joint('chest', spine, 0, 0.24, 0);
  const neck = joint('neck', chest, 0, 0.24, 0);
  const head = joint('head', neck, 0, 0.09, 0);
  const shL = joint('shL', chest, 0.2, 0.2, 0);
  const elL = joint('elL', shL, 0, -0.28, 0);
  const shR = joint('shR', chest, -0.2, 0.2, 0);
  const elR = joint('elR', shR, 0, -0.28, 0);
  const thL = joint('thL', hips, 0.1, -0.02, 0);
  const knL = joint('knL', thL, 0, -0.44, 0);
  const ftL = joint('ftL', knL, 0, -0.43, 0);
  const thR = joint('thR', hips, -0.1, -0.02, 0);
  const knR = joint('knR', thR, 0, -0.44, 0);
  const ftR = joint('ftR', knR, 0, -0.43, 0);

  // Torso: hoodie in two parts so the chest can twist against the hips; hood ring at the back.
  part(hips, new CapsuleGeometry(0.14, 0.08, 4, 12), mats.trousers, 0, 0.02, 0, 1.15, 1, 0.85);
  part(spine, new CapsuleGeometry(0.155, 0.12, 4, 14), mats.hoodie, 0, 0.08, 0, 1.12, 1, 0.82);
  part(chest, new CapsuleGeometry(0.172, 0.16, 4, 14), mats.hoodie, 0, 0.1, 0, 1.16, 1, 0.8);
  const hood = part(chest, new TorusGeometry(0.1, 0.045, 8, 18), mats.hoodie, 0, 0.25, -0.075);
  hood.rotation.x = 1.15;
  // Drawstrings: a tiny detail that reads at close range.
  part(chest, new CylinderGeometry(0.006, 0.006, 0.12, 4), mats.sole, 0.035, 0.17, 0.125);
  part(chest, new CylinderGeometry(0.006, 0.006, 0.1, 4), mats.sole, -0.035, 0.18, 0.125);

  // Neck and head.
  part(neck, new CylinderGeometry(0.045, 0.05, 0.1, 10), mats.skin, 0, 0.0, 0);
  part(head, new SphereGeometry(0.118, 20, 16), mats.skin, 0, 0.1, 0, 0.95, 1.06, 1);
  part(head, new SphereGeometry(0.022, 8, 6), mats.skin, 0, 0.085, 0.115); // nose
  for (const x of [-0.113, 0.113]) part(head, new SphereGeometry(0.026, 8, 6), mats.skin, x, 0.09, -0.005, 0.6, 1, 1);
  // Hair: a cap with a lifted quiff at the front.
  const hair = part(head, new SphereGeometry(0.126, 18, 12, 0, Math.PI * 2, 0, 1.7), mats.ink, 0, 0.112, -0.01, 0.97, 1.0, 1.04);
  hair.rotation.x = -0.32;
  part(head, new SphereGeometry(0.06, 10, 8), mats.ink, 0.01, 0.215, 0.06, 1.5, 0.55, 1);
  // Round glasses.
  for (const x of [-0.044, 0.044]) {
    part(head, new TorusGeometry(0.032, 0.0065, 6, 20), mats.ink, x, 0.105, 0.112);
  }
  part(head, new BoxGeometry(0.03, 0.006, 0.006), mats.ink, 0, 0.11, 0.118);

  // Arms: sleeves to the wrist, card hands.
  for (const [sh, el] of [
    [shL, elL],
    [shR, elR],
  ]) {
    part(sh, new CapsuleGeometry(0.054, 0.17, 4, 10), mats.hoodie, 0, -0.13, 0);
    part(el, new CapsuleGeometry(0.047, 0.15, 4, 10), mats.hoodie, 0, -0.11, 0);
    part(el, new SphereGeometry(0.047, 10, 8), mats.skin, 0, -0.245, 0.005, 0.85, 1.15, 0.9);
  }

  // Legs and sneakers.
  for (const [th, kn, ft] of [
    [thL, knL, ftL],
    [thR, knR, ftR],
  ]) {
    part(th, new CapsuleGeometry(0.074, 0.3, 4, 10), mats.trousers, 0, -0.21, 0);
    part(kn, new CapsuleGeometry(0.06, 0.3, 4, 10), mats.trousers, 0, -0.21, 0);
    const shoe = part(ft, new CapsuleGeometry(0.056, 0.15, 4, 10), mats.ink, 0, -0.02, 0.05);
    shoe.rotation.x = Math.PI / 2;
    part(ft, new BoxGeometry(0.11, 0.026, 0.27), mats.sole, 0, -0.065, 0.05);
  }

  // Soft contact shadow: keeps him grounded on tiers without shadow maps.
  const blobTexture = contactShadowTexture();
  const blobMaterial = new MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
  const blob = new Mesh(track(new PlaneGeometry(0.9, 0.9)), blobMaterial);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.035;
  blob.renderOrder = 1;
  root.add(blob);

  const hit = new Mesh(track(new CapsuleGeometry(0.34, 1.1, 2, 8)), new MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.9;
  root.add(hit);

  const joints = { hips, spine, chest, neck, head, shL, elL, shR, elR, thL, knL, thR, knR, ftL, ftR };

  return {
    root,
    joints,
    hit,
    dispose() {
      geometries.forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      blobMaterial.dispose();
      blobTexture.dispose();
      (hit.material as Material).dispose();
    },
  };
}
