import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Q } from './config.js';

// Video / CRT style pass: chromatic aberration, scanlines, glitch blocks, grain, vignette, lens rain
export const CyberShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uAberration: { value: 0.00035 },
    uScan: { value: 0.06 },
    uGrain: { value: 0.02 },
    uVignette: { value: 0.75 },
    uLens: { value: 0.8 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uGlitch, uAberration, uScan, uGrain, uVignette, uLens; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    // drops of water running down the lens: small refraction blobs
    vec2 lensDrops(vec2 uv, float t){
      vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
      vec2 st = uv * aspect * 6.0;
      vec2 id = floor(st); vec2 f = fract(st) - 0.5;
      float s = hash21(id);
      float y = fract(t * (0.08 + s * 0.12) + s * 3.0);            // slide down
      vec2 c = vec2((hash21(id + 1.7) - 0.5) * 0.6, 0.5 - y);
      float d = length((f - c) * vec2(1.0, 0.8));
      float r = 0.05 + s * 0.05;
      float m = smoothstep(r, r * 0.4, d);
      return normalize(f - c + 1e-4) * m * 0.03 * step(0.55, s);
    }
    void main(){
      vec2 uv = vUv;
      float t = uTime;
      // glitch: horizontal slices jump sideways
      float g = uGlitch;
      if (g > 0.001) {
        float line = floor(uv.y * 28.0 + floor(t * 9.0));
        float r = hash(line * 7.13 + floor(t * 17.0));
        if (r < g * 0.6) uv.x += (hash(line * 3.1 + floor(t * 5.0)) - 0.5) * 0.12 * g;
        if (hash(floor(t * 30.0)) < g * 0.3) uv.y = fract(uv.y + hash(floor(t * 30.0) + 1.0) * 0.05 * g);
      }
      uv += lensDrops(uv, t) * uLens;
      // chromatic aberration, stronger near the edges and during glitches
      vec2 d = (uv - 0.5) * (uAberration * (1.0 + g * 24.0)) * (1.0 + length(uv - 0.5) * 2.0);
      float cr = texture2D(tDiffuse, uv + d).r;
      float cg = texture2D(tDiffuse, uv).g;
      float cb = texture2D(tDiffuse, uv - d).b;
      vec3 col = vec3(cr, cg, cb);
      // scanlines + rolling VHS band
      float scan = 1.0 - uScan * 0.5 * (0.5 + 0.5 * sin(uv.y * uRes.y * 0.5));
      float band = 1.0 + 0.05 * smoothstep(0.02, 0.0, abs(fract(uv.y + t * 0.05) - 0.5) - 0.02);
      col *= scan * band;
      // film grain
      col += (hash21(uv * 1000.0 + fract(t)) - 0.5) * uGrain;
      // vignette
      float v = smoothstep(1.05, 0.3, length((uv - 0.5) * vec2(1.15, 1.0)));
      col *= mix(1.0, v, uVignette);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function buildPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(size, Q.tier === 'high' ? 0.7 : 0.6, 0.5, 0.8);
  if (Q.bloom) composer.addPass(bloom);
  const cyber = new ShaderPass(CyberShader);
  if (new URLSearchParams(location.search).get('fx') !== '0') composer.addPass(cyber);
  composer.addPass(new OutputPass());

  function resize(w, h) {
    composer.setSize(w, h);
    cyber.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  }
  resize(size.x, size.y);
  return { composer, bloom, cyber, resize };
}
