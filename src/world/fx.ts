import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import { PALETTE } from '../config/palette';

/**
 * The four custom shaders (docs/05 §9). Each one replaces something that would otherwise cost
 * many draw calls or a texture download; each has a trivial fallback.
 */

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ─── Dust: air in a studio, visible near the lens ────────────────────────────────────────────

export function createDust(count: number, pixelRatio: number): Points<BufferGeometry, ShaderMaterial> {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  let r = 1337;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -9 + rand() * 18;
    positions[i * 3 + 1] = -0.5 + rand() * 25;
    positions[i * 3 + 2] = -3 + rand() * 14;
    seeds[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 9 },
      uPixelRatio: { value: pixelRatio },
      uColor: { value: new Color(0xfff6e6) },
      uOpacity: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uSize, uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * (0.06 + aSeed * 0.05);
        p.x += sin(t + aSeed * 31.0) * 0.7;
        p.y += sin(t * 0.7 + aSeed * 13.0) * 0.6;
        p.z += cos(t * 0.8 + aSeed * 17.0) * 0.7;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depth = -mv.z;
        gl_PointSize = uSize * uPixelRatio * (0.5 + aSeed) / max(depth, 0.5);
        vAlpha = smoothstep(26.0, 7.0, depth) * smoothstep(0.8, 2.5, depth);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vAlpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        ${OUTPUT}
      }`,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'dust';
  return points;
}

// ─── Rack LEDs: hundreds of status lights in one draw call ───────────────────────────────────

export function createLeds(positions: number[], pixelRatio: number): Points<BufferGeometry, ShaderMaterial> {
  const count = positions.length / 3;
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uOn: { value: new Color(PALETTE.ultraSoft) },
      uWarm: { value: new Color(PALETTE.lamp) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPixelRatio;
      varying float vOn;
      varying float vWarm;
      void main() {
        float s = abs(aSeed);
        float rate = 0.35 + s * 2.2;
        vOn = step(0.32, fract(uTime * rate + s * 9.0));
        vWarm = step(0.86, s);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.11 * uPixelRatio * 900.0 / max(-mv.z, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uOn, uWarm;
      varying float vOn;
      varying float vWarm;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 c = mix(uOn, uWarm, vWarm);
        gl_FragColor = vec4(c * (0.35 + vOn * 0.9), smoothstep(0.5, 0.2, d));
        ${OUTPUT}
      }`,
  });
  const points = new Points(geometry, material);
  points.name = 'rack-leds';
  return points;
}

// ─── Signal: concentric rings from the mast, the "send a signal" CTA made visible ────────────

export function createSignal(size: number): Mesh<PlaneGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1 },
      uOpacity: { value: 0 },
      uColor: { value: new Color(PALETTE.ultraSoft) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = 0.0;
        for (int i = 0; i < 3; i++) {
          float ph = fract(uTime * 0.22 * uSpeed + float(i) / 3.0);
          float w = 0.012 + ph * 0.02;
          a += smoothstep(w, 0.0, abs(r - ph)) * (1.0 - ph);
        }
        a *= smoothstep(1.0, 0.8, r);
        gl_FragColor = vec4(uColor, a * uOpacity);
        ${OUTPUT}
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  mesh.name = 'signal';
  mesh.renderOrder = 2;
  return mesh;
}

// ─── Drafting ground: paper with a 1 m / 5 m grid that fades out, lit & shadowed like card ───

export function draftingGroundMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: PALETTE.paper });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLine = { value: new Color(PALETTE.ink) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGridPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGridPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vGridPos;
        uniform vec3 uLine;
        float gridLine(vec2 p, float s) {
          vec2 q = p / s;
          vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float fade = 1.0 - smoothstep(16.0, 64.0, length(vGridPos.xz));
        float grid = gridLine(vGridPos.xz, 1.0) * 0.06 + gridLine(vGridPos.xz, 5.0) * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, uLine, grid * fade);`,
      );
  };
  return material;
}
