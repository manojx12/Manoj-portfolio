import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Material,
  Mesh,
  PCFSoftShadowMap,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { PALETTE } from '../config/palette';
import type { Tier } from '../config/quality';
import type { Environment } from '../story/environment';
import { buildSite } from './site';
import { buildTower, type Tower } from './tower';
import { createDust } from './fx';
import { materials } from './kit';
import type { FloorContext } from './floors';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Scene root, lights and atmosphere. Lighting budget: 1 directional (the only shadow caster),
 * 1 hemisphere, 1 point light that follows the active floor after dusk. Everything else that
 * "glows" is an emissive material.
 */
export class World {
  readonly scene = new Scene();
  readonly tower: Tower;
  private readonly sun = new DirectionalLight(0xffffff, 2.6);
  private readonly hemi = new HemisphereLight(0xffffff, 0xcccccc, 1.3);
  private readonly floorLamp = new PointLight(PALETTE.lamp, 0, 16, 2);
  private readonly background = new Color(PALETTE.paper);
  private dust: Points<BufferGeometry, ShaderMaterial> | null = null;

  constructor(private readonly renderer: WebGLRenderer, tier: Tier) {
    this.scene.background = this.background;
    this.scene.fog = new Fog(this.background.clone(), 70, 190);

    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -17;
    cam.right = 17;
    cam.top = 17;
    cam.bottom = -17;
    cam.near = 1;
    cam.far = 110;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.floorLamp);

    this.scene.add(buildSite().group);
    this.tower = buildTower();
    this.scene.add(this.tower.group);

    this.setQuality(tier, renderer.getPixelRatio());
  }

  setQuality(tier: Tier, pixelRatio: number): void {
    const shadows = tier.shadowMap > 0;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== tier.shadowMap) {
      this.sun.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    // Materials compiled with/without shadow support must recompile.
    this.scene.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });

    if (this.dust) {
      this.scene.remove(this.dust);
      this.dust.geometry.dispose();
      this.dust.material.dispose();
    }
    this.dust = createDust(tier.dust, pixelRatio);
    this.scene.add(this.dust);
  }

  /** 0 → 1: levels are placed onto the plinth one after another, like a model being assembled. */
  buildIn(progress: number): void {
    const levels = this.tower.levels;
    levels.forEach((g, i) => {
      const start = i * 0.11;
      const local = Math.min(Math.max((progress - start) / 0.45, 0), 1);
      g.position.y = (1 - easeOutCubic(local)) * 9;
      g.visible = local > 0;
    });
  }

  update(env: Environment, focusY: number, ctx: FloorContext): void {
    this.background.copy(env.bg);
    (this.scene.fog as Fog).color.copy(env.bg);

    const cosEl = Math.cos(env.sunEl);
    this.sun.target.position.set(0, focusY, 0);
    this.sun.position.set(Math.sin(env.sunAz) * cosEl * 45, focusY + Math.sin(env.sunEl) * 45, Math.cos(env.sunAz) * cosEl * 45);
    this.sun.color.copy(env.sunColor);
    this.sun.intensity = env.sunIntensity;

    this.hemi.color.copy(env.sky);
    this.hemi.groundColor.copy(env.ground);
    this.hemi.intensity = env.hemiIntensity;

    this.floorLamp.position.set(-1.2, focusY + 3.0, 1.0);
    this.floorLamp.intensity = env.lamps * 28;
    // After dusk the card itself glows faintly warm: the model reads like a paper lantern.
    materials.card.emissiveIntensity = env.lamps * 0.16;

    this.tower.update(ctx);

    if (this.dust) {
      const u = this.dust.material.uniforms;
      u.uTime.value = ctx.t * ctx.motion;
      u.uPixelRatio.value = ctx.pixelRatio;
      u.uOpacity.value = 0.5 * (1 - env.night * 0.6);
    }
  }

  /** Releases every GPU resource owned by the scene graph. */
  dispose(): void {
    this.scene.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as Material | Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
    });
    this.sun.shadow.map?.dispose();
  }
}
