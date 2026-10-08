import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../config/palette';
import { Kit } from './kit';
import { draftingGroundMaterial } from './fx';
import { PLINTH } from './layout';

/**
 * The model's context: the drafting table it stands on (with a pencil and a steel rule for scale),
 * its plinth and plaza, lollipop scale trees, and distant white-card blocks that dissolve in fog.
 * Depth layers: foreground (pencil/rule), midground (plinth, trees), background (blocks, fog).
 */
export function buildSite(): { group: Group } {
  const group = new Group();
  group.name = 'site';
  const tableY = -PLINTH.h;

  // Drafting table: paper with a fading grid.
  const ground = new Mesh(new PlaneGeometry(420, 420), draftingGroundMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = tableY;
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // Plinth and plaza.
  const kit = new Kit();
  kit.block(PLINTH.x0, tableY, PLINTH.z0, PLINTH.x1, 0, PLINTH.z1, PALETTE.paperDeep);
  kit.block(-3.0, 0, 4.0, 0.2, 0.02, PLINTH.z1 - 0.4, PALETTE.card, { edges: false }); // walkway
  for (let z = 5; z < PLINTH.z1 - 0.5; z += 1.2) kit.block(-3.0, 0.02, z, 0.2, 0.025, z + 0.03, PALETTE.cardShade, { edges: false });
  // Bollards along the walkway.
  for (let z = 5.2; z < 11.5; z += 2) {
    kit.cylinder(-3.4, 0.22, z, 0.07, 0.07, 0.44, PALETTE.card, { segments: 8 });
    kit.cylinder(0.6, 0.22, z, 0.07, 0.07, 0.44, PALETTE.card, { segments: 8 });
  }

  // A pencil lying on the table (hexagonal body, card-wood cone, graphite tip).
  const pencil = { x: -30, z: 18, rot: 0.3 };
  const dir = new Vector3(Math.cos(pencil.rot), 0, -Math.sin(pencil.rot));
  const along = (d: number) => [pencil.x + dir.x * d, tableY + 0.78, pencil.z + dir.z * d] as const;
  kit.cylinder(...along(0), 0.78, 0.78, 26, 0x2b2e35, { rot: [0, pencil.rot, Math.PI / 2], segments: 6, crease: 20 });
  kit.cylinder(...along(14.4), 0.0, 0.78, 2.8, PALETTE.cardWarm, { rot: [0, pencil.rot, -Math.PI / 2], segments: 6, crease: 20 });
  kit.cylinder(...along(15.45), 0.0, 0.26, 0.75, PALETTE.ink, { rot: [0, pencil.rot, -Math.PI / 2], segments: 6, edges: false });

  // Steel rule with millimetre ticks.
  const rule = { x: 18, z: -12, len: 34, rot: -0.32 };
  kit.box(rule.x, tableY + 0.06, rule.z, rule.len, 0.12, 2.6, PALETTE.cardShade, { rot: [0, rule.rot, 0] });
  const rdir = new Vector3(Math.cos(rule.rot), 0, -Math.sin(rule.rot));
  const rnorm = new Vector3(-rdir.z, 0, rdir.x);
  for (let i = 0; i <= 32; i++) {
    const d = -16 + i;
    const len = i % 5 === 0 ? 0.9 : 0.45;
    const cx = rule.x + rdir.x * d + rnorm.x * (1.3 - len / 2);
    const cz = rule.z + rdir.z * d + rnorm.z * (1.3 - len / 2);
    kit.box(cx, tableY + 0.125, cz, 0.05, 0.01, len, PALETTE.ink, { rot: [0, rule.rot, 0], edges: false });
  }

  const built = kit.build();
  group.add(built.mesh);
  if (built.lines) group.add(built.lines);

  // Lollipop scale trees on the plinth (instanced: 2 draw calls for all of them).
  // The plaza in front of the lobby and the lift is kept clear: that's where the camera flies.
  const treeSpots: [number, number, number][] = [
    [-9.6, 5.2, 1], [-8.2, 7.4, 0.85], [-9.8, 9.6, 1.1], [-7.0, 11.0, 0.9],
    [10.0, 7.4, 1.1], [9.4, 4.6, 0.8], [10.2, 10.6, 0.95],
    [-9.4, -5.6, 1], [9.4, -5.2, 0.95], [-8.6, -1.2, 0.8], [9.0, 1.4, 0.9],
  ];
  const canopy = new InstancedMesh(new SphereGeometry(0.75, 14, 10), new MeshLambertMaterial({ color: PALETTE.card }), treeSpots.length);
  const trunk = new InstancedMesh(new CylinderGeometry(0.06, 0.08, 1.4, 6), new MeshLambertMaterial({ color: PALETTE.cardShade }), treeSpots.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  treeSpots.forEach(([x, z, k], i) => {
    canopy.setMatrixAt(i, m.compose(p.set(x, 1.4 * k + 0.6 * k, z), q, s.setScalar(k)));
    trunk.setMatrixAt(i, m.compose(p.set(x, 0.7 * k, z), q, s.set(k, k, k)));
  });
  for (const mesh of [canopy, trunk]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Distant white-card context: other models on the table, fading into fog.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blocks: Matrix4[] = [];
  while (blocks.length < 46) {
    const a = rand() * Math.PI * 2;
    const r = 26 + rand() * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (z > 8 && Math.abs(x) < 50) continue; // keep the camera's side clear
    const w = 3 + rand() * 7;
    const d = 3 + rand() * 7;
    const h = 2 + rand() * 13;
    blocks.push(new Matrix4().compose(new Vector3(x, tableY + h / 2, z), q.setFromAxisAngle(new Vector3(0, 1, 0), rand() * 0.6 - 0.3).clone(), new Vector3(w, h, d)));
  }
  const context = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: PALETTE.card }), blocks.length);
  blocks.forEach((b, i) => context.setMatrixAt(i, b));
  context.receiveShadow = true;
  group.add(context);

  return { group };
}
