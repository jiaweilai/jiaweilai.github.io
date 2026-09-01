import * as THREE from 'three';
import { Q } from './config.js';
import { uTime } from './city.js';

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(14, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

export function buildRain(scene) {
  const W = 140, H = 90;          // rain volume that follows the camera
  const uCenter = { value: new THREE.Vector3() };
  const uWind = { value: 0.18 };
  const uIntensity = { value: 1 };

  // ---- falling streaks ----
  const n = Q.rain;
  const pos = new Float32Array(n * 3);
  const spd = new Float32Array(n);
  const siz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = Math.random() * W;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = Math.random() * W;
    spd[i] = 34 + Math.random() * 30;
    siz[i] = 1.0 + Math.random() * 1.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // never culled
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uCenter, uWind, uIntensity, uBox: { value: new THREE.Vector2(W, H) }, tMap: { value: streakTexture() } },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: `
      attribute float aSpeed; attribute float aSize;
      uniform float uTime; uniform vec3 uCenter; uniform vec2 uBox; uniform float uWind; uniform float uIntensity;
      varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y - uTime * aSpeed, uBox.y);
        // tile the box around the camera
        p.x = mod(p.x - uCenter.x, uBox.x) + uCenter.x - uBox.x * 0.5;
        p.z = mod(p.z - uCenter.z, uBox.x) + uCenter.z - uBox.x * 0.5;
        p.x += (p.y - uBox.y * 0.5) * uWind;
        p.y += max(uCenter.y - uBox.y * 0.35, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (260.0 / dist);
        vA = smoothstep(3.0, 12.0, dist) * smoothstep(120.0, 40.0, dist) * uIntensity;
        // hide a fraction of drops when intensity is lowered
        vA *= step(1.0 - uIntensity, fract(aSpeed * 0.731));
      }`,
    fragmentShader: `
      uniform sampler2D tMap; varying float vA;
      void main(){
        float a = texture2D(tMap, gl_PointCoord).a * vA * 0.45;
        gl_FragColor = vec4(0.7, 0.82, 1.0, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // ---- splashes on the ground ----
  const m = Q.splashes;
  const spos = new Float32Array(m * 3);
  const sph = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    spos[i * 3] = Math.random() * W;
    spos[i * 3 + 1] = 0.06;
    spos[i * 3 + 2] = Math.random() * W;
    sph[i] = Math.random();
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sgeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  sgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const smat = new THREE.ShaderMaterial({
    uniforms: { uTime, uCenter, uIntensity, uBox: { value: new THREE.Vector2(W, H) }, tMap: { value: ringTexture() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      uniform float uTime; uniform vec3 uCenter; uniform vec2 uBox; uniform float uIntensity;
      varying float vA;
      void main(){
        vec3 p = position;
        float life = fract(uTime * 1.6 + aPhase * 9.0);
        // re-scatter each cycle so splashes do not repeat in place
        float cyc = floor(uTime * 1.6 + aPhase * 9.0);
        p.x += fract(sin(cyc * 12.9898 + aPhase) * 43758.5) * 20.0;
        p.z += fract(sin(cyc * 78.233 + aPhase) * 43758.5) * 20.0;
        p.x = mod(p.x - uCenter.x, uBox.x) + uCenter.x - uBox.x * 0.5;
        p.z = mod(p.z - uCenter.z, uBox.x) + uCenter.z - uBox.x * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = mix(0.25, 1.6, life) * (300.0 / dist);
        vA = (1.0 - life) * smoothstep(90.0, 20.0, dist) * uIntensity;
      }`,
    fragmentShader: `
      uniform sampler2D tMap; varying float vA;
      void main(){ float a = texture2D(tMap, gl_PointCoord).a * vA * 0.35; gl_FragColor = vec4(0.5, 0.8, 1.0, a); }`,
  });
  const splashes = new THREE.Points(sgeo, smat);
  splashes.frustumCulled = false;
  scene.add(splashes);

  return {
    points, splashes,
    setIntensity(v) { uIntensity.value = v; },
    update(camera) { uCenter.value.copy(camera.position); },
  };
}
