import { Color, Group, Mesh, MeshBasicMaterial } from 'three';
import { PALETTE } from '../config/palette';
import { Kit } from './kit';
import { furnishLevel, furnishRoof, type FloorActor, type FloorContext } from './floors';
import { FLOOR_H, LEVEL_COUNT, LIFT, MAST, ROOF_Y, SHAFT, SLAB_T, TOWER, floorY } from './layout';

/**
 * The cut-away tower. Each level is ONE merged mesh (structure + static furniture) plus ONE ink
 * line set, so the whole building costs ~2 draw calls per floor before animated props.
 * Faces lying on the cut plane (z = +4) are painted ink: the poché of a section drawing.
 */

export interface Tower {
  group: Group;
  /** Level groups bottom→top (lobby … lab, roof) — animated by the build-in. */
  levels: Group[];
  lift: Group;
  lampMaterial: MeshBasicMaterial;
  beacon: Mesh;
  actors: FloorActor[];
  update(ctx: FloorContext): void;
}

const FINISH = [PALETTE.cardWarm, PALETTE.paperDeep, PALETTE.cardShade, PALETTE.card, PALETTE.cardWarm];
const LAMP_OFF = new Color(PALETTE.cardShade);
const LAMP_ON = new Color(PALETTE.lamp);

/** A slab with the elevator shaft cut out of it. */
function slab(kit: Kit, yTop: number, color: number) {
  const y0 = yTop - SLAB_T;
  const o = { poche: true };
  kit.block(TOWER.x0, y0, TOWER.z0, SHAFT.x0, yTop, TOWER.z1, color, o);
  kit.block(SHAFT.x0, y0, SHAFT.z1, TOWER.x1, yTop, TOWER.z1, color, o);
  kit.block(SHAFT.x0, y0, TOWER.z0, TOWER.x1, yTop, SHAFT.z0, color, o);
}

function walls(kit: Kit, level: number) {
  const y0 = floorY(level);
  const y1 = y0 + FLOOR_H - SLAB_T;
  const w = TOWER.wall;
  const card = PALETTE.card;
  const ribbon = level === 3 || level === 4;

  // Back wall (a ribbon window on the studio and the lab).
  if (ribbon) {
    kit.block(TOWER.x0, y0, TOWER.z0, TOWER.x1, y0 + 1.1, TOWER.z0 + w, card);
    kit.block(TOWER.x0, y0 + 2.9, TOWER.z0, TOWER.x1, y1, TOWER.z0 + w, card);
    kit.block(TOWER.x0, y0 + 1.1, TOWER.z0, -6.0, y0 + 2.9, TOWER.z0 + w, card);
    kit.block(3.6, y0 + 1.1, TOWER.z0, TOWER.x1, y0 + 2.9, TOWER.z0 + w, card);
    for (let x = -4.4; x < 3.6; x += 1.6) kit.block(x - 0.05, y0 + 1.1, TOWER.z0, x + 0.05, y0 + 2.9, TOWER.z0 + w, card);
  } else {
    kit.block(TOWER.x0, y0, TOWER.z0, TOWER.x1, y1, TOWER.z0 + w, card);
  }

  // Left wall: window band above the lobby.
  const o = { poche: true };
  if (level === 0) {
    kit.block(TOWER.x0, y0, TOWER.z0, TOWER.x0 + w, y1, TOWER.z1, card, o);
  } else {
    kit.block(TOWER.x0, y0, TOWER.z0, TOWER.x0 + w, y1, -2.8, card);
    kit.block(TOWER.x0, y0, 2.6, TOWER.x0 + w, y1, TOWER.z1, card, o);
    kit.block(TOWER.x0, y0, -2.8, TOWER.x0 + w, y0 + 1.2, 2.6, card);
    kit.block(TOWER.x0, y0 + 2.8, -2.8, TOWER.x0 + w, y1, 2.6, card);
  }
  // Right wall (the shaft side) is solid.
  kit.block(TOWER.x1 - w, y0, TOWER.z0, TOWER.x1, y1, TOWER.z1, card, o);

  // Floor finish (each level gets its own tint) — stops short of the shaft.
  kit.block(TOWER.x0 + w, y0, TOWER.z0 + w, SHAFT.x0 - 0.1, y0 + 0.03, TOWER.z1 - 0.25, FINISH[level], { edges: false });
}

function shaftFrame(kit: Kit) {
  const top = ROOF_Y + 3.2;
  for (const [x, z] of [
    [SHAFT.x0, SHAFT.z0],
    [SHAFT.x0, SHAFT.z1],
    [SHAFT.x1 - 0.3, SHAFT.z0],
    [SHAFT.x1 - 0.3, SHAFT.z1],
  ]) {
    kit.block(x - 0.07, 0, z - 0.07, x + 0.07, top, z + 0.07, PALETTE.ink, { edges: false });
  }
  kit.block(SHAFT.x0 - 0.1, top, SHAFT.z0 - 0.1, TOWER.x1, top + 0.25, SHAFT.z1 + 0.1, PALETTE.card);
}

function pendantLamps(kit: Kit, level: number): Kit {
  const y = floorY(level) + FLOOR_H - SLAB_T - 0.45;
  for (const [x0, x1, z] of [
    [-5.6, -2.6, 1.0],
    [-1.6, 2.6, 1.0],
    [-5.6, -1.0, -1.8],
  ] as const) {
    kit.block(x0, y, z - 0.09, x1, y + 0.1, z + 0.09, PALETTE.card, { edges: false });
  }
  return kit;
}

export function buildTower(): Tower {
  const group = new Group();
  group.name = 'tower';
  const levels: Group[] = [];
  const actors: FloorActor[] = [];
  const lampMaterial = new MeshBasicMaterial({ color: LAMP_OFF.clone() });

  for (let level = 0; level < LEVEL_COUNT; level++) {
    const g = new Group();
    g.name = `level-${level}`;
    const kit = new Kit();
    if (level > 0) slab(kit, floorY(level), PALETTE.card);
    walls(kit, level);
    const actor = furnishLevel(level, kit);
    const { mesh, lines } = kit.build();
    g.add(mesh);
    if (lines) g.add(lines);
    // Pendants share one emissive material across the building (one material, one draw per level).
    g.add(pendantLamps(new Kit(), level).build(lampMaterial, false).mesh);
    if (actor) {
      g.add(actor.group);
      actors.push(actor);
    }
    levels.push(g);
    group.add(g);
  }

  // Roof level: slab, parapet, mast, shaft frame.
  const roof = new Group();
  roof.name = 'roof';
  const roofKit = new Kit();
  slab(roofKit, ROOF_Y, PALETTE.card);
  const p = 0.2;
  roofKit.block(TOWER.x0, ROOF_Y, TOWER.z0, TOWER.x1, ROOF_Y + 0.9, TOWER.z0 + p, PALETTE.card);
  roofKit.block(TOWER.x0, ROOF_Y, TOWER.z0, TOWER.x0 + p, ROOF_Y + 0.9, TOWER.z1, PALETTE.card, { poche: true });
  roofKit.block(TOWER.x1 - p, ROOF_Y, TOWER.z0, TOWER.x1, ROOF_Y + 0.9, TOWER.z1, PALETTE.card, { poche: true });
  // Front edge: a light railing rather than a solid parapet, so the roof reads from the street.
  roofKit.block(TOWER.x0, ROOF_Y + 0.92, TOWER.z1 - 0.08, TOWER.x1, ROOF_Y + 0.97, TOWER.z1, PALETTE.ink, { edges: false });
  for (let x = TOWER.x0 + 0.04; x <= TOWER.x1; x += 1.1) {
    roofKit.block(x, ROOF_Y, TOWER.z1 - 0.08, x + 0.04, ROOF_Y + 0.92, TOWER.z1 - 0.04, PALETTE.ink, { edges: false });
  }
  shaftFrame(roofKit);
  // Mast
  roofKit.block(MAST.x - 0.4, ROOF_Y, MAST.z - 0.4, MAST.x + 0.4, ROOF_Y + 0.35, MAST.z + 0.4, PALETTE.cardShade);
  roofKit.cylinder(MAST.x, ROOF_Y + MAST.h / 2, MAST.z, 0.06, 0.1, MAST.h, PALETTE.ink, { segments: 8, edges: false });
  for (const [h, w] of [
    [3.4, 1.4],
    [4.6, 0.9],
  ]) {
    roofKit.box(MAST.x, ROOF_Y + h, MAST.z, w, 0.06, 0.06, PALETTE.ink, { edges: false });
  }
  const roofActor = furnishRoof(roofKit);
  const built = roofKit.build();
  roof.add(built.mesh);
  if (built.lines) roof.add(built.lines);
  roof.add(roofActor.group);
  actors.push(roofActor);
  levels.push(roof);
  group.add(roof);

  // Beacon at the top of the mast.
  const beaconKit = new Kit().sphere(MAST.x, ROOF_Y + MAST.h + 0.12, MAST.z, 0.16, PALETTE.lamp);
  const beacon = beaconKit.build(lampMaterial, false).mesh;
  roof.add(beacon);

  // Lift platform (moves with the figure).
  const lift = new Group();
  const liftKit = new Kit()
    .box(0, -0.06, 0, LIFT.size, 0.12, LIFT.size, PALETTE.card)
    .box(0, 0.5, -LIFT.size / 2 + 0.04, LIFT.size, 0.05, 0.05, PALETTE.ink, { edges: false });
  const liftBuilt = liftKit.build();
  lift.add(liftBuilt.mesh);
  if (liftBuilt.lines) lift.add(liftBuilt.lines);
  lift.position.set(LIFT.x, 0, LIFT.z);
  group.add(lift);

  return {
    group,
    levels,
    lift,
    lampMaterial,
    beacon,
    actors,
    update(ctx) {
      lampMaterial.color.copy(LAMP_OFF).lerp(LAMP_ON, ctx.lamps);
      for (const a of actors) a.update(ctx);
    },
  };
}
