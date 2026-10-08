import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Camera,
} from 'three';
import { PALETTE } from '../config/palette';
import { Kit, materials } from './kit';
import { createLeds, createSignal } from './fx';
import { BENCH, DESK, MAST, PLINTH_X, PLINTH_Z, ROOF_Y, TOWER, floorY } from './layout';

/** Everything an animated floor prop may react to. Written once per frame by the world. */
export interface FloorContext {
  t: number;
  dt: number;
  /** 0 … 1 progress of the foundations chapter (drives the problem graph). */
  graph: number;
  /** Activation weight per project plinth (0 … 1). */
  projects: readonly number[];
  lamps: number;
  night: number;
  /** 1 normally, ~2.2 while the contact link is hovered or focused. */
  signalSpeed: number;
  /** 0 with reduced motion: ambient loops freeze, state changes still apply. */
  motion: number;
  pixelRatio: number;
  camera: Camera;
}

export interface FloorActor {
  group: Group;
  update(ctx: FloorContext): void;
}

const CARD = new Color(PALETTE.card);
const ULTRA = new Color(PALETTE.ultra);
const propMaterial = new MeshLambertMaterial({ color: PALETTE.card });
const darkMaterial = new MeshLambertMaterial({ color: PALETTE.graphite });

function shadowed<T extends Object3D>(o: T): T {
  o.traverse((c) => {
    c.castShadow = true;
    c.receiveShadow = true;
  });
  return o;
}

// ─── L0 · Lobby ──────────────────────────────────────────────────────────────────────────────

function lobby(kit: Kit): null {
  const ink = { edges: false };
  // Reception desk and bench.
  kit.block(-5.8, 0, -1.3, -3.4, 1.05, -0.5, PALETTE.cardWarm);
  kit.block(-5.9, 1.05, -1.4, -3.3, 1.12, -0.4, PALETTE.card);
  kit.block(0.6, 0, 1.8, 2.8, 0.45, 2.4, PALETTE.cardShade);
  // Plant.
  kit.cylinder(-6.1, 0.3, 2.9, 0.32, 0.26, 0.6, PALETTE.cardShade);
  kit.sphere(-6.1, 1.15, 2.9, 0.55, PALETTE.card, { segments: 10 });
  // The monogram on the back wall, above the reception desk.
  const z0 = TOWER.z0 + TOWER.wall;
  const mx = -4.6;
  kit.block(mx - 0.62, 1.9, z0, mx - 0.5, 2.95, z0 + 0.1, PALETTE.ink, ink);
  kit.block(mx + 0.5, 1.9, z0, mx + 0.62, 2.95, z0 + 0.1, PALETTE.ink, ink);
  kit.box(mx - 0.27, 2.62, z0 + 0.05, 0.82, 0.12, 0.1, PALETTE.ink, { ...ink, rot: [0, 0, -0.84] });
  kit.box(mx + 0.27, 2.62, z0 + 0.05, 0.82, 0.12, 0.1, PALETTE.ink, { ...ink, rot: [0, 0, 0.84] });
  // Entrance canopy and mat.
  kit.block(-3.4, 3.2, 4.0, 0.0, 3.3, 4.9, PALETTE.card);
  kit.block(-2.6, 0, 3.0, -0.8, 0.025, 3.85, PALETTE.graphite, ink);
  return null;
}

// ─── L1 · Foundations — the problem graph ────────────────────────────────────────────────────

const NODES: readonly [number, number][] = [
  [-2.0, 0.8],
  [-0.9, 0.95],
  [-0.9, 0.05],
  [-0.9, -0.8],
  [0.3, 1.0],
  [0.3, 0.35],
  [0.3, -0.35],
  [0.3, -0.9],
  [1.7, 0.1],
];
const EDGES: readonly [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 5], [2, 6], [3, 7], [4, 8], [5, 8], [6, 8], [7, 8],
];

function foundations(kit: Kit): FloorActor {
  const y0 = floorY(1);
  // Drafting desk: legs, tilted board, stool, plan chest.
  for (const dx of [-0.85, 0.85]) kit.block(DESK.x + dx - 0.05, y0, DESK.z - 0.5, DESK.x + dx + 0.05, y0 + 0.9, DESK.z + 0.5, PALETTE.ink, { edges: false });
  kit.box(DESK.x, y0 + 1.0, DESK.z, 2.0, 0.06, 1.2, PALETTE.card, { rot: [0.32, 0, 0] });
  kit.cylinder(DESK.x + 0.2, y0 + 0.35, DESK.z - 1.2, 0.22, 0.22, 0.7, PALETTE.cardShade);
  kit.block(-2.8, y0, -3.7, -0.4, y0 + 1.0, -2.85, PALETTE.cardWarm);
  for (let i = 1; i < 4; i++) kit.block(-2.8, y0 + i * 0.25, -2.86, -0.4, y0 + i * 0.25 + 0.02, -2.84, PALETTE.ink, { edges: false });

  // Pin board on the back wall.
  const zb = TOWER.z0 + TOWER.wall;
  kit.block(-6.4, y0 + 0.85, zb, -1.2, y0 + 3.35, zb + 0.06, PALETTE.paperDeep);
  const cx = -3.8;
  const cy = y0 + 2.1;
  const cz = zb + 0.12;

  const group = new Group();
  const nodeMat = new MeshLambertMaterial({ color: 0xffffff });
  const nodes = new InstancedMesh(new SphereGeometry(0.14, 14, 10), nodeMat, NODES.length);
  const edges = new InstancedMesh(new BoxGeometry(1, 0.04, 0.04), nodeMat, EDGES.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const v = new Vector3();
  const sc = new Vector3();
  const at = (i: number) => new Vector3(cx + NODES[i][0] * 1.25, cy + NODES[i][1], cz);
  NODES.forEach((_, i) => {
    nodes.setMatrixAt(i, m.makeTranslation(at(i)));
    nodes.setColorAt(i, CARD);
  });
  EDGES.forEach(([a, b], i) => {
    const pa = at(a);
    const pb = at(b);
    v.addVectors(pa, pb).multiplyScalar(0.5);
    q.setFromAxisAngle(new Vector3(0, 0, 1), Math.atan2(pb.y - pa.y, pb.x - pa.x));
    sc.set(pa.distanceTo(pb), 1, 1);
    edges.setMatrixAt(i, m.compose(v, q, sc));
    edges.setColorAt(i, new Color(PALETTE.cardShade));
  });
  group.add(shadowed(nodes), edges);

  let shown = -1;
  const inactiveEdge = new Color(PALETTE.graphite);
  return {
    group,
    update(ctx) {
      const active = Math.min(NODES.length, Math.floor(ctx.graph * (NODES.length + 1)));
      if (active === shown) return;
      shown = active;
      NODES.forEach((_, i) => nodes.setColorAt(i, i < active ? ULTRA : CARD));
      EDGES.forEach(([a, b], i) => edges.setColorAt(i, a < active && b < active ? ULTRA : inactiveEdge));
      nodes.instanceColor!.needsUpdate = true;
      edges.instanceColor!.needsUpdate = true;
    },
  };
}

// ─── L2 · Engine room — racks, pipes, LEDs ───────────────────────────────────────────────────

function engineRoom(kit: Kit): FloorActor {
  const y0 = floorY(2);
  const leds: number[] = [];
  const rows: { z: number; xs: number[] }[] = [
    { z: -3.1, xs: [-5.7, -4.4, -3.1, -1.8, -0.5, 0.8, 2.1] },
    { z: -1.35, xs: [-5.7, -4.4, -3.1, -1.8] },
  ];
  for (const row of rows) {
    for (const x of row.xs) {
      kit.block(x - 0.57, y0, row.z - 0.45, x + 0.57, y0 + 2.5, row.z + 0.45, PALETTE.cardShade);
      kit.block(x - 0.5, y0 + 0.12, row.z + 0.45, x + 0.5, y0 + 2.38, row.z + 0.47, PALETTE.ink, { edges: false });
      for (let j = 0; j < 11; j++) {
        for (const dx of [-0.36, -0.24]) leds.push(x + dx, y0 + 0.32 + j * 0.19, row.z + 0.49);
      }
    }
  }
  // Service pipes along the back, kept high and pale so they don't cut across the frame.
  const top = y0 + 3.35;
  kit.cylinder(-0.5, top, -3.3, 0.1, 0.1, 13, PALETTE.cardWarm, { rot: [0, 0, Math.PI / 2], segments: 10 });
  kit.cylinder(-0.5, top - 0.24, -3.05, 0.06, 0.06, 13, PALETTE.cardShade, { rot: [0, 0, Math.PI / 2], segments: 8 });
  // Console.
  kit.block(2.9, y0, -3.7, 4.3, y0 + 1.0, -2.9, PALETTE.cardWarm);
  kit.box(3.6, y0 + 1.25, -3.45, 0.9, 0.5, 0.05, PALETTE.ink, { rot: [-0.25, 0, 0], edges: false });

  const group = new Group();
  const points = createLeds(leds, 1);
  group.add(points);
  return {
    group,
    update(ctx) {
      points.material.uniforms.uTime.value = ctx.t * ctx.motion;
      points.material.uniforms.uPixelRatio.value = ctx.pixelRatio;
    },
  };
}

// ─── L3 · Studio — four projects as physical models on plinths ──────────────────────────────

interface ProjectModel {
  root: Group;
  material: MeshStandardMaterial;
  animate(t: number, dt: number, w: number): void;
}

function projectMaterial() {
  return new MeshStandardMaterial({ color: PALETTE.card, roughness: 0.65 });
}

/** Showroom — a product on a turntable under a light ring. */
function showroomModel(): ProjectModel {
  const material = projectMaterial();
  const root = new Group();
  const table = new Mesh(new CylinderGeometry(0.42, 0.45, 0.07, 32), material);
  table.position.y = 0.035;
  const product = new Mesh(new BoxGeometry(0.28, 0.4, 0.28), material);
  product.position.y = 0.27;
  const ring = new Mesh(new TorusGeometry(0.5, 0.016, 6, 48), material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.86;
  root.add(table, product, ring);
  let spin = 0;
  return {
    root,
    material,
    animate(_t, dt, w) {
      spin += dt * (0.12 + 0.8 * w);
      table.rotation.y = spin;
      product.rotation.y = spin;
      ring.position.y = 0.86 + Math.sin(spin * 1.3) * 0.03 * w;
    },
  };
}

/** Iron Beast — a squat rack; the loaded barbell is unracked for slow reps while in focus. */
function rackModel(): ProjectModel {
  const material = projectMaterial();
  const root = new Group();
  const base = new Mesh(new BoxGeometry(0.8, 0.03, 0.42), material);
  base.position.y = 0.015;
  root.add(base);
  for (const x of [-0.28, 0.28]) {
    const upright = new Mesh(new BoxGeometry(0.04, 0.95, 0.04), material);
    upright.position.set(x, 0.5, -0.08);
    const hook = new Mesh(new BoxGeometry(0.04, 0.03, 0.09), material);
    hook.position.set(x, 0.62, -0.02);
    root.add(upright, hook);
  }
  const barbell = new Group();
  barbell.add(new Mesh(new CylinderGeometry(0.012, 0.012, 0.98, 8).rotateZ(Math.PI / 2), material));
  const plateGeo = new CylinderGeometry(0.13, 0.13, 0.035, 24).rotateZ(Math.PI / 2);
  for (const x of [-0.4, -0.355, 0.355, 0.4]) {
    const plate = new Mesh(plateGeo, material);
    plate.position.x = x;
    barbell.add(plate);
  }
  root.add(barbell);
  const RACKED = 0.655;
  let phase = 0;
  let lift = 0;
  return {
    root,
    material,
    animate(_t, dt, w) {
      phase += dt * 1.6;
      lift += (w - lift) * Math.min(1, dt * 3);
      // Off the hooks, then a held rep rhythm rather than a constant bob.
      const rep = Math.max(0, Math.sin(phase)) ** 2;
      barbell.position.set(0, RACKED + lift * (0.06 + 0.2 * rep), 0.05 * lift);
    },
  };
}

/** Oryn — a round dining table set for four, under a slowly swaying Shanghai lantern. */
function lanternModel(): ProjectModel {
  const material = projectMaterial();
  const root = new Group();
  const top = new Mesh(new CylinderGeometry(0.3, 0.3, 0.025, 32), material);
  top.position.y = 0.32;
  const stem = new Mesh(new CylinderGeometry(0.03, 0.07, 0.31, 12), material);
  stem.position.y = 0.155;
  root.add(top, stem);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const stool = new Mesh(new CylinderGeometry(0.075, 0.06, 0.2, 14), material);
    stool.position.set(Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.42);
    root.add(stool);
  }
  const post = new Mesh(new BoxGeometry(0.025, 1.15, 0.025), material);
  post.position.set(-0.42, 0.575, -0.3);
  const arm = new Mesh(new BoxGeometry(0.45, 0.025, 0.025), material);
  arm.position.set(-0.2, 1.15, -0.3);
  root.add(post, arm);
  // The lantern swings from the end of the arm.
  const pivot = new Group();
  pivot.position.set(0, 1.14, -0.3);
  const cord = new Mesh(new CylinderGeometry(0.004, 0.004, 0.22, 4), material);
  cord.position.y = -0.11;
  const lantern = new Group();
  lantern.position.y = -0.36;
  const capGeo = new CylinderGeometry(0.06, 0.06, 0.025, 16);
  const capTop = new Mesh(capGeo, material);
  capTop.position.y = 0.15;
  const capBottom = new Mesh(capGeo, material);
  capBottom.position.y = -0.15;
  lantern.add(new Mesh(new SphereGeometry(0.13, 16, 12).scale(1, 1.15, 1), material), capTop, capBottom);
  pivot.add(cord, lantern);
  root.add(pivot);
  let phase = 0;
  return {
    root,
    material,
    animate(_t, dt, w) {
      phase += dt * (0.5 + 0.6 * w);
      pivot.rotation.z = Math.sin(phase * 1.3) * (0.03 + 0.07 * w);
      pivot.rotation.x = Math.sin(phase * 0.9 + 1) * 0.03 * w;
      lantern.rotation.y += dt * 0.25 * w;
    },
  };
}

/** Lead finder — leads spiral down through a funnel of rings. */
function funnelModel(): ProjectModel {
  const material = projectMaterial();
  const root = new Group();
  const radii = [0.42, 0.34, 0.26, 0.19, 0.13];
  radii.forEach((r, i) => {
    const ring = new Mesh(new TorusGeometry(r, 0.016, 6, 40), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.82 - i * 0.15;
    root.add(ring);
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const post = new Mesh(new CylinderGeometry(0.012, 0.012, 0.85, 6), material);
    post.position.set(Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3);
    post.rotation.z = Math.cos(a) * 0.32;
    post.rotation.x = -Math.sin(a) * 0.32;
    root.add(post);
  }
  const leads: Mesh[] = [];
  const leadGeo = new SphereGeometry(0.045, 10, 8);
  for (let i = 0; i < 6; i++) {
    const s = new Mesh(leadGeo, material);
    leads.push(s);
    root.add(s);
  }
  let clock = 0;
  return {
    root,
    material,
    animate(_t, dt, w) {
      clock += dt * (0.08 + 0.32 * w);
      leads.forEach((s, i) => {
        const p = (clock + i / leads.length) % 1;
        const r = 0.4 - p * 0.32;
        const a = p * 9 + i;
        s.position.set(Math.cos(a) * r, 1.05 - p * 0.95, Math.sin(a) * r);
        s.scale.setScalar(0.4 + 0.6 * Math.sin(p * Math.PI));
      });
    },
  };
}

function studio(kit: Kit): FloorActor {
  const y0 = floorY(3);
  // Plain plinths: a dark label plate here pulled the eye off the model and showed through the copy.
  PLINTH_X.forEach((x) => kit.block(x - 0.55, y0, PLINTH_Z - 0.55, x + 0.55, y0 + 1.0, PLINTH_Z + 0.55, PALETTE.card));
  const group = new Group();
  const models = [rackModel(), lanternModel(), showroomModel(), funnelModel()];
  models.forEach((model, j) => {
    model.root.position.set(PLINTH_X[j], y0 + 1.0, PLINTH_Z);
    group.add(shadowed(model.root));
  });
  return {
    group,
    update(ctx) {
      models.forEach((model, j) => {
        const w = ctx.projects[j];
        model.material.color.lerpColors(CARD, ULTRA, w);
        model.animate(ctx.t, ctx.dt * ctx.motion, w);
      });
    },
  };
}

// ─── L4 · Lab — prototypes on the bench ──────────────────────────────────────────────────────

function lab(kit: Kit): FloorActor {
  const y0 = floorY(4);
  const top = y0 + 0.95;
  const z = BENCH.z;
  kit.block(BENCH.x0, y0, z - 0.45, BENCH.x1, top - 0.06, z + 0.45, PALETTE.cardWarm);
  kit.block(BENCH.x0 - 0.05, top - 0.06, z - 0.5, BENCH.x1 + 0.05, top, z + 0.5, PALETTE.card);
  kit.block(BENCH.x0, y0 + 2.25, TOWER.z0 + TOWER.wall, BENCH.x1, y0 + 2.31, TOWER.z0 + 0.7, PALETTE.card);
  for (const [x, w, h] of [
    [-5.2, 0.5, 0.35],
    [-4.5, 0.3, 0.5],
    [-1.4, 0.6, 0.3],
  ]) {
    kit.block(x, y0 + 2.31, TOWER.z0 + 0.32, x + w, y0 + 2.31 + h, TOWER.z0 + 0.62, PALETTE.cardShade);
  }
  kit.cylinder(0.4, y0 + 0.35, -2.1, 0.24, 0.24, 0.7, PALETTE.cardShade);
  // Pendulum frame.
  for (const dx of [-0.3, 0.3]) kit.block(-3.2 + dx - 0.02, top, z - 0.02, -3.2 + dx + 0.02, top + 0.92, z + 0.02, PALETTE.ink, { edges: false });
  kit.block(-3.55, top + 0.9, z - 0.025, -2.85, top + 0.94, z + 0.025, PALETTE.ink, { edges: false });

  const group = new Group();

  // Gyroscope.
  const gyro = new Group();
  gyro.position.set(-4.6, top + 0.42, z);
  const rings = [0.3, 0.23, 0.16].map((r) => new Mesh(new TorusGeometry(r, 0.016, 6, 40), darkMaterial));
  rings.forEach((r) => gyro.add(r));
  gyro.add(new Mesh(new SphereGeometry(0.06, 12, 8), propMaterial));
  const base = new Mesh(new CylinderGeometry(0.08, 0.14, 0.12, 12), propMaterial);
  base.position.set(-4.6, top + 0.06, z);

  // Pendulum.
  const pivot = new Group();
  pivot.position.set(-3.2, top + 0.9, z);
  const rod = new Mesh(new BoxGeometry(0.015, 0.68, 0.015).translate(0, -0.34, 0), darkMaterial);
  const bob = new Mesh(new SphereGeometry(0.07, 14, 10), propMaterial);
  bob.position.y = -0.72;
  pivot.add(rod, bob);

  // Turntable with a tiny maquette of the figure: the figure working on the figure.
  const turntable = new Group();
  turntable.position.set(-1.6, top, z);
  const disc = new Mesh(new CylinderGeometry(0.28, 0.3, 0.05, 28), propMaterial);
  disc.position.y = 0.025;
  const mini = new Group();
  const body = new Mesh(new CylinderGeometry(0.05, 0.06, 0.2, 10), materials.accent);
  body.position.y = 0.17;
  const head = new Mesh(new SphereGeometry(0.045, 12, 8), propMaterial);
  head.position.y = 0.32;
  mini.add(body, head);
  turntable.add(disc, mini);

  group.add(shadowed(gyro), shadowed(base), shadowed(pivot), shadowed(turntable));
  return {
    group,
    update(ctx) {
      const dt = ctx.dt * ctx.motion;
      rings[0].rotation.x += dt * 0.9;
      rings[1].rotation.y += dt * 1.3;
      rings[2].rotation.x -= dt * 1.7;
      rings[2].rotation.z += dt * 0.6;
      pivot.rotation.z = 0.45 * Math.sin(ctx.t * 2.1 * ctx.motion);
      turntable.rotation.y += dt * 0.5;
    },
  };
}

// ─── Roof — planters, bench, the signal ──────────────────────────────────────────────────────

export function furnishRoof(kit: Kit): FloorActor {
  const y0 = ROOF_Y;
  for (const [x, z] of [
    [-5.6, -2.6],
    [-0.4, -2.8],
  ]) {
    kit.block(x - 0.7, y0, z - 0.45, x + 0.7, y0 + 0.5, z + 0.45, PALETTE.cardWarm);
    kit.sphere(x - 0.3, y0 + 0.95, z, 0.42, PALETTE.card, { segments: 10 });
    kit.sphere(x + 0.35, y0 + 0.85, z + 0.05, 0.34, PALETTE.card, { segments: 10 });
  }
  kit.block(-6.2, y0, 0.6, -4.4, y0 + 0.42, 1.1, PALETTE.cardShade);
  kit.block(0.6, y0, -1.2, 2.0, y0 + 0.7, 0.4, PALETTE.card); // skylight

  const group = new Group();
  const signal = createSignal(9);
  signal.position.set(MAST.x, y0 + MAST.h + 0.12, MAST.z);
  group.add(signal);
  return {
    group,
    update(ctx) {
      signal.quaternion.copy(ctx.camera.quaternion);
      const u = signal.material.uniforms;
      u.uTime.value += ctx.dt * ctx.motion * ctx.signalSpeed;
      u.uSpeed.value = 1;
      u.uOpacity.value = 0.08 + ctx.night * 0.95;
    },
  };
}

export function furnishLevel(level: number, kit: Kit): FloorActor | null {
  switch (level) {
    case 0:
      return lobby(kit);
    case 1:
      return foundations(kit);
    case 2:
      return engineRoom(kit);
    case 3:
      return studio(kit);
    case 4:
      return lab(kit);
    default:
      return null;
  }
}
