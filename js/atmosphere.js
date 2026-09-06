import * as THREE from 'three';
import { uTime, uFlash } from './city.js';

// A single sky draw: slow storm clouds and scattered city light at the horizon.
export function buildAtmosphere(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime, uFlash },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform float uTime, uFlash;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(vDirection);
        float horizon = exp(-abs(d.y) * 4.5);
        vec2 p = d.xz / (abs(d.y) + 0.3) * 2.5;
        p += vec2(uTime * 0.009, uTime * 0.004);
        float clouds = noise(p) * 0.6 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.1;
        float district = smoothstep(-0.7, 0.6, d.x);
        vec3 glow = mix(vec3(0.012,0.075,0.11), vec3(0.105,0.016,0.095), district);
        vec3 col = vec3(0.004,0.007,0.019) + glow * horizon * (0.35 + clouds * 0.9);
        col += vec3(0.035,0.045,0.085) * clouds * smoothstep(0.0,0.8,d.y);
        col += vec3(0.17,0.25,0.46) * uFlash * (0.4 + clouds);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}
