/**
 * World layout: the single source of truth for coordinates shared by the tower geometry,
 * the character stations and the camera shots. Units ≈ metres; +Y up; the cut face looks to +Z.
 */

export const FLOOR_H = 4;
export const SLAB_T = 0.22;
export const LEVEL_COUNT = 5; // L0 lobby … L4 lab; the roof sits on top
export const ROOF_Y = LEVEL_COUNT * FLOOR_H; // 20
export const floorY = (level: number) => level * FLOOR_H;

export const TOWER = { x0: -7, x1: 7, z0: -4, z1: 4, wall: 0.25 } as const;

/** Elevator shaft opening through every slab, and the platform centre. */
export const SHAFT = { x0: 4.8, x1: 7, z0: -1.6, z1: 0.8 } as const;
export const LIFT = { x: 5.9, z: -0.4, size: 1.5 } as const;
/** Where the figure waits before stepping onto the platform. */
export const LIFT_LANDING = { x: 4.0, z: -0.4 } as const;

/** The paper plinth the model sits on (top surface at y = 0). */
export const PLINTH = { x0: -11, x1: 11, z0: -7, z1: 12, h: 0.6 } as const;

// Level-specific furniture anchors
export const DESK = { x: -5.3, z: 0.1 } as const; // L1 drafting desk
export const PLINTH_X = [-5.4, -3.0, -0.6, 1.8] as const; // L3 project plinths
export const PLINTH_Z = -0.9;
export const BENCH = { x0: -5.6, x1: -0.6, z: -3.25 } as const; // L4 workbench
export const MAST = { x: 3.0, z: -2.4, h: 6.5 } as const; // roof antenna

/** Character stations (feet position + facing yaw, 0 = facing +Z / the viewer). */
export const SPOTS = {
  plaza: { x: -1.4, y: 0, z: 7.4, yaw: 0.15 },
  lobby: { x: -2.6, y: 0, z: 1.4, yaw: 0.35 },
  foundations: { x: -3.4, y: floorY(1), z: 0.9, yaw: -0.85 },
  engine: { x: 1.6, y: floorY(2), z: 1.3, yaw: -0.6 },
  studio: PLINTH_X.map((x) => ({ x: x + 1.45, y: floorY(3), z: 0.2, yaw: -0.45 })),
  lab: { x: -2.4, y: floorY(4), z: -1.9, yaw: 2.75 },
  roof: { x: -2.6, y: ROOF_Y, z: 2.6, yaw: 0.25 },
} as const;
