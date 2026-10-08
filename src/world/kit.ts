import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Euler,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/palette';

/**
 * Shared materials. The whole white-card world uses ONE Lambert material with vertex colours,
 * so each merged kit is a single draw call, plus one for its ink line-work.
 */
export const materials = {
  card: new MeshLambertMaterial({
    vertexColors: true,
    emissive: PALETTE.lamp,
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  }),
  ink: new LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.5, depthWrite: false }),
  accent: new MeshStandardMaterial({ color: PALETTE.ultra, roughness: 0.55, metalness: 0 }),
};

// Night glow is tinted by the vertex colour, so ink poché stays ink while card glows.
materials.card.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif',
  );
};

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _c = new Color();
const _ink = new Color(PALETTE.ink);

export interface PieceOptions {
  /** Euler rotation in radians (XYZ). */
  rot?: readonly [number, number, number];
  /** Paint faces pointing at the viewer (+Z) ink: the "poché" of a section drawing. */
  poche?: boolean;
  /** Draw ink edges for this piece (default true). */
  edges?: boolean;
  /** Edge crease threshold in degrees. */
  crease?: number;
}

/**
 * Accumulates primitive pieces in world space, then merges them into one mesh + one line set.
 * Used for everything static: structure, furniture, plinth.
 */
export class Kit {
  private readonly pieces: BufferGeometry[] = [];
  private readonly lines: number[] = [];

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, o: PieceOptions = {}): this {
    return this.add(new BoxGeometry(sx, sy, sz), x, y, z, color, o);
  }

  /** Axis-aligned box from two corners — the natural unit for architecture. */
  block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o: PieceOptions = {}): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color, o);
  }

  cylinder(x: number, y: number, z: number, rTop: number, rBottom: number, h: number, color: number, o: PieceOptions & { segments?: number } = {}): this {
    return this.add(new CylinderGeometry(rTop, rBottom, h, o.segments ?? 14), x, y, z, color, { crease: 40, ...o });
  }

  sphere(x: number, y: number, z: number, r: number, color: number, o: PieceOptions & { segments?: number } = {}): this {
    const seg = o.segments ?? 12;
    return this.add(new SphereGeometry(r, seg, Math.max(6, seg - 4)), x, y, z, color, { edges: false, ...o });
  }

  torus(x: number, y: number, z: number, r: number, tube: number, color: number, o: PieceOptions = {}): this {
    return this.add(new TorusGeometry(r, tube, 6, 28), x, y, z, color, { edges: false, ...o });
  }

  get isEmpty(): boolean {
    return this.pieces.length === 0;
  }

  private add(g: BufferGeometry, x: number, y: number, z: number, color: number, o: PieceOptions): this {
    g.deleteAttribute('uv');
    const r = o.rot ?? [0, 0, 0];
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s);
    g.applyMatrix4(_m);

    const normals = g.getAttribute('normal');
    const colors = new Float32Array(normals.count * 3);
    _c.setHex(color);
    for (let i = 0; i < normals.count; i++) {
      const c = o.poche && normals.getZ(i) > 0.9 ? _ink : _c;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.pieces.push(g);

    if (o.edges !== false) {
      const edges = new EdgesGeometry(g, o.crease ?? 25);
      const pos = edges.getAttribute('position').array;
      for (let i = 0; i < pos.length; i++) this.lines.push(pos[i]);
      edges.dispose();
    }
    return this;
  }

  /** Merge into a mesh (+ ink lines). Source geometries are disposed. */
  build(material: Material = materials.card, shadows = true): { mesh: Mesh; lines: LineSegments | null } {
    const merged = mergeGeometries(this.pieces, false);
    if (!merged) throw new Error('Kit merge failed (attribute mismatch)');
    this.pieces.forEach((g) => g.dispose());
    this.pieces.length = 0;
    const mesh = new Mesh(merged, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false;

    let lines: LineSegments | null = null;
    if (this.lines.length) {
      const lg = new BufferGeometry();
      lg.setAttribute('position', new Float32BufferAttribute(this.lines, 3));
      lines = new LineSegments(lg, materials.ink);
      lines.matrixAutoUpdate = false;
      this.lines.length = 0;
    }
    return { mesh, lines };
  }
}
