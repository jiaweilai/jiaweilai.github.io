import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Q, WORLD } from './config.js';

// ---------- deterministic PRNG so the skyline is stable between visits ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(19890512);
const R = (a, b) => a + rnd() * (b - a);

export const uTime = { value: 0 };
export const uFlash = { value: 0 }; // lightning intensity 0..1, shared with shaders

// ---------- canvas texture helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function neonTexture(text, { vertical = false, color = '#19e6ff', w = 128, h = 512, font = 'bold 84px "Noto Sans SC", "Noto Sans TC", "PingFang SC", "Microsoft YaHei", Orbitron, sans-serif' } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, w, h);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = color;
  if (vertical) {
    const chars = [...text];
    const step = (h - 40) / chars.length;
    chars.forEach((ch, i) => {
      const y = 20 + step * (i + 0.5);
      g.fillText(ch, w / 2, y);
      g.fillText(ch, w / 2, y); // double pass = stronger glow core
    });
  } else {
    g.fillText(text, w / 2, h / 2);
    g.fillText(text, w / 2, h / 2);
  }
  // thin frame
  g.shadowBlur = 12;
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(6, 6, w - 12, h - 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function billboardTexture(lines, color, accent) {
  const w = 1024, h = 512;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#05070f';
  g.fillRect(0, 0, w, h);
  // grid backdrop
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 30;
  g.fillStyle = color;
  g.font = 'bold 120px Orbitron, "Noto Sans SC", sans-serif';
  g.fillText(lines[0], w / 2, h * 0.38);
  g.fillText(lines[0], w / 2, h * 0.38);
  if (lines[1]) {
    g.shadowColor = accent;
    g.fillStyle = accent;
    g.font = '600 56px "Share Tech Mono", "Noto Sans SC", monospace';
    g.fillText(lines[1], w / 2, h * 0.72);
  }
  g.shadowBlur = 0;
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(12, 12, w - 24, h - 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- building material: MeshStandard + procedural emissive windows ----------
function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0b1020,
    roughness: 0.55,
    metalness: 0.35,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uFlash = uFlash;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSeed;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vLocal = position * sc + vec3(0.0, sc.y * 0.5, 0.0);
        vLocalN = normal;
        vSeed = aSeed;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uFlash;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying float vSeed;
        float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 n = abs(vLocalN);
          // the seed is constant per instance; round it so varying interpolation jitter cannot feed the hash
          float seed = floor(vSeed + 0.5);
          if (n.y < 0.5) {
            vec2 wc = (n.x > 0.5) ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
            vec2 cellSize = vec2(1.3, 1.6);
            vec2 cc = wc / cellSize;
            vec2 cell = floor(cc);
            vec2 f = fract(cc);
            // how many cells per pixel: fade the pattern to its average when far away
            float aa = smoothstep(0.25, 0.9, max(fwidth(cc.x), fwidth(cc.y)));
            float inWin = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
            inWin = mix(inWin, 0.3, aa);
            float floorIdx = cell.y;
            // ground floor is shopfront - lit with a neon band instead of windows
            float h1 = hash21(cell + seed * 17.0);
            float h2 = hash21(cell * 1.7 + seed * 3.0);
            float litFrac = 0.25 + 0.35 * hash21(vec2(seed, 2.0));
            float lit = mix(step(h1, litFrac), litFrac, aa);
            // slow flicker on a few windows
            float flick = 1.0;
            if (h2 > 0.93) flick = 0.5 + 0.5 * step(0.5, fract(sin(uTime * (2.0 + h2 * 6.0) + h1 * 40.0) * 3.0));
            vec3 warm = vec3(1.0, 0.78, 0.5);
            vec3 cool = vec3(0.55, 0.85, 1.0);
            vec3 pink = vec3(1.0, 0.4, 0.85);
            // one dominant tint per building, subtle per-window variation
            float bt = hash21(vec2(seed, 5.0));
            vec3 wcol = mix(warm, cool, step(0.55, bt));
            wcol = mix(wcol, pink, step(0.93, bt));
            wcol = mix(wcol, vec3(1.0), 0.25 * h2);
            float bright = 0.16 + 0.34 * hash21(cell * 3.3 + seed);
            vec3 win = wcol * inWin * lit * flick * bright;
            if (floorIdx < 1.0) {
              float band = step(0.35, f.y) * step(f.y, 0.5);
              vec3 nc = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.15, 0.7), step(0.5, hash21(vec2(seed, 9.0))));
              win = nc * band * 1.1;
            }
            totalEmissiveRadiance += win;
          }
          // lightning washes the facades
          totalEmissiveRadiance += vec3(0.6, 0.7, 1.0) * uFlash * 0.25;
        }`);
  };
  return mat;
}

// ---------- ground: wet-street reflector ----------
function makeGround(scene, renderer, size) {
  const geo = new THREE.PlaneGeometry(size, size);
  if (!Q.reflector) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x070a14, roughness: 0.25, metalness: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  const shader = {
    name: 'WetStreet',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uTime: { value: 0 },
        uFlash: { value: 0 },
      },
    ]),
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUvP;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUvP = textureMatrix * vec4(position, 1.0);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uFlash;
      varying vec4 vUvP;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
      }
      // expanding rain ripple rings
      float ripples(vec2 p, float t){
        float acc = 0.0;
        for (int k = 0; k < 3; k++) {
          vec2 q = p * (0.9 + float(k) * 0.37) + float(k) * 13.7;
          vec2 cell = floor(q); vec2 f = fract(q) - 0.5;
          float seed = hash21(cell + float(k));
          float life = fract(t * (0.6 + seed * 0.5) + seed * 7.0);
          float r = length(f + (vec2(hash21(cell + 3.1), hash21(cell + 5.7)) - 0.5) * 0.6);
          float ring = sin((r - life * 0.8) * 60.0) * exp(-r * 6.0) * (1.0 - life) * step(r, life * 0.9);
          acc += ring;
        }
        return acc;
      }
      void main() {
        vec2 sp = vWorld.xz;
        float n = noise(sp * 0.35 + uTime * 0.05) - 0.5;
        float rp = ripples(sp * 0.5, uTime);
        vec4 uv = vUvP;
        uv.xy += (vec2(n, n * 0.6) * 0.012 + rp * 0.02) * uv.w;
        vec4 refl = texture2DProj(tDiffuse, uv);
        // puddle mask: reflective in puddles, dull asphalt elsewhere
        float puddle = smoothstep(0.35, 0.75, noise(sp * 0.12) * 0.7 + noise(sp * 0.5) * 0.3);
        float reflStrength = mix(0.25, 0.85, puddle);
        vec3 asphalt = color * (0.6 + 0.4 * noise(sp * 2.0));
        vec3 col = asphalt + refl.rgb * reflStrength;
        col += vec3(0.35, 0.45, 0.7) * uFlash * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  };
  const ref = new Reflector(geo, {
    clipBias: 0.003,
    textureWidth: Q.reflector,
    textureHeight: Q.reflector,
    color: 0x0a0d18,
    shader,
  });
  ref.material.fog = true;
  ref.material.uniforms.uTime = uTime;
  ref.material.uniforms.uFlash = uFlash;
  ref.rotation.x = -Math.PI / 2;
  ref.position.y = 0.0;
  scene.add(ref);
  return ref;
}

// ---------- hologram portrait ----------
function makeHologram(texture) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: texture },
      uTime: uTime,
      uFlash: uFlash,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tMap; uniform float uTime; uniform float uFlash;
      varying vec2 vUv;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        // vertical roll + glitch bands
        float t = uTime;
        float band = step(0.985, hash(floor(t * 8.0) + floor(uv.y * 30.0)));
        uv.x += band * (hash(floor(t * 20.0)) - 0.5) * 0.08;
        float shift = 0.004 + band * 0.02;
        float r = texture2D(tMap, uv + vec2(shift, 0.0)).r;
        float g = texture2D(tMap, uv).g;
        float b = texture2D(tMap, uv - vec2(shift, 0.0)).b;
        float lum = dot(vec3(r, g, b), vec3(0.3, 0.59, 0.11));
        vec3 tint = mix(vec3(0.05, 0.35, 0.7), vec3(0.4, 1.0, 1.0), lum);
        tint = mix(tint, vec3(1.0, 0.45, 0.9), pow(lum, 3.0) * 0.4);
        // scanlines + rolling bar
        float scan = 0.75 + 0.25 * sin(uv.y * 380.0 - t * 12.0);
        float roll = 0.85 + 0.15 * smoothstep(0.0, 0.08, abs(fract(uv.y + t * 0.12) - 0.5));
        float flick = 0.9 + 0.1 * sin(t * 47.0) * sin(t * 13.0);
        // soft edges
        float edge = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.9, uv.y);
        float a = (0.25 + lum * 1.0) * scan * roll * flick * edge;
        gl_FragColor = vec4(tint * a * (1.05 - uFlash * 0.3), a);
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
}

// ---------- main builder ----------
export function buildCity(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  const N = Q.gridN;                 // blocks per side
  const C = WORLD.cell;
  const half = (N * C) / 2;
  const B = WORLD.boulevard / 2;

  // --- buildings ---
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const bMat = buildingMaterial();
  const specs = [];
  const signSpots = [];      // candidate wall spots for neon signs
  const roofSpots = [];      // tall roofs for billboards / antennas
  const HOLO = { x: -C, z: -2 * C }; // block that carries the hologram tower
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const bx = -half + i * C;
      const bz = -half + j * C;
      const blockW = C - WORLD.street;
      // keep the central boulevard clear
      if (Math.abs(bx) < B + blockW / 2) continue;
      const forced = bx === HOLO.x && bz === HOLO.z;
      const d = Math.hypot(bx, bz) / half; // 0 centre .. ~1.4 corner
      const count = forced ? 1 : rnd() < 0.5 ? 1 : (rnd() < 0.6 ? 2 : 4);
      const sub = count === 1 ? [[0, 0, blockW, blockW]]
        : count === 2 ? (rnd() < 0.5 ? [[-blockW / 4, 0, blockW / 2, blockW], [blockW / 4, 0, blockW / 2, blockW]]
          : [[0, -blockW / 4, blockW, blockW / 2], [0, blockW / 4, blockW, blockW / 2]])
          : [[-blockW / 4, -blockW / 4, blockW / 2, blockW / 2], [blockW / 4, -blockW / 4, blockW / 2, blockW / 2],
          [-blockW / 4, blockW / 4, blockW / 2, blockW / 2], [blockW / 4, blockW / 4, blockW / 2, blockW / 2]];
      for (const [ox, oz, w, dpt] of sub) {
        const gap = 1.2;
        const ww = w - gap, dd = dpt - gap;
        const tall = Math.pow(1 - Math.min(d, 1), 1.6);
        let h = R(6, 16) + tall * R(28, 88);
        if (rnd() < 0.06 * (1 + tall)) h *= 1.5; // occasional landmark
        if (forced) h = 48;
        const x = bx + ox, z = bz + oz;
        specs.push({ x, z, w: ww, d: dd, h });
        // stacked tower top
        if (h > 40 && rnd() < 0.6) specs.push({ x, z, w: ww * 0.6, d: dd * 0.6, h: h + R(6, 18) });
        if (h > 30) roofSpots.push({ x, z, w: ww, d: dd, h });
        signSpots.push({ x, z, w: ww, d: dd, h });
      }
    }
  }
  const bMesh = new THREE.InstancedMesh(boxGeo, bMat, specs.length);
  const seeds = new Float32Array(specs.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  specs.forEach((s, k) => {
    m4.makeScale(s.w, s.h, s.d);
    m4.setPosition(s.x, s.h / 2, s.z);
    bMesh.setMatrixAt(k, m4);
    // facade tints: cold steel, indigo, near-black, occasional rust
    const pick = rnd();
    col.setHSL(pick < 0.7 ? 0.62 + rnd() * 0.06 : (pick < 0.9 ? 0.75 : 0.05), 0.35, 0.05 + rnd() * 0.06);
    bMesh.setColorAt(k, col);
    seeds[k] = Math.floor(rnd() * 200);
  });
  boxGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  bMesh.castShadow = Q.shadows;
  bMesh.receiveShadow = Q.shadows;
  group.add(bMesh);

  // --- kerb neon strips along every block edge (great in reflections) ---
  const edgeGeo = new THREE.BoxGeometry(1, 0.12, 0.12);
  const edgeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const edges = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const bx = -half + i * C, bz = -half + j * C;
    const bw = C - WORLD.street + 0.6;
    if (Math.abs(bx) < B + bw / 2) continue;
    const c = rnd() < 0.5 ? new THREE.Color(0.1, 1.2, 1.4) : new THREE.Color(1.5, 0.15, 0.9);
    edges.push({ x: bx, z: bz - bw / 2, len: bw, rot: 0, c }, { x: bx, z: bz + bw / 2, len: bw, rot: 0, c },
      { x: bx - bw / 2, z: bz, len: bw, rot: Math.PI / 2, c }, { x: bx + bw / 2, z: bz, len: bw, rot: Math.PI / 2, c });
  }
  // boulevard guide lines
  for (let s = -1; s <= 1; s += 2) {
    edges.push({ x: s * (B - 0.5), z: 0, len: N * C, rot: Math.PI / 2, c: new THREE.Color(0.2, 1.6, 2.0) });
    edges.push({ x: s * 2.5, z: 0, len: N * C, rot: Math.PI / 2, c: new THREE.Color(1.8, 0.7, 0.2) });
  }
  const eMesh = new THREE.InstancedMesh(edgeGeo, edgeMat, edges.length);
  edges.forEach((e, k) => {
    m4.makeRotationY(e.rot);
    m4.scale(new THREE.Vector3(e.len, 1, 1));
    m4.setPosition(e.x, 0.08, e.z);
    eMesh.setMatrixAt(k, m4);
    eMesh.setColorAt(k, e.c);
  });
  group.add(eMesh);

  // --- vertical neon signs on facades ---
  const signDefs = [
    ['賴嘉偉', '#ff2bd6'], ['劍橋', '#19e6ff'], ['歷史', '#ffb347'], ['工程', '#19e6ff'],
    ['科學', '#ff2bd6'], ['雨夜', '#7cf2ff'], ['知識圖譜', '#b26bff'], ['模擬', '#ffb347'],
    ['牛津街', '#ff2bd6'], ['數據', '#19e6ff'],
  ];
  const signGeo = new THREE.PlaneGeometry(1, 4);
  const signMeshes = [];
  signDefs.forEach(([txt, colr]) => {
    const tex = neonTexture(txt, { vertical: true, color: colr });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
    mat.color.setScalar(1.7);
    const placements = [];
    // choose facades along streets, low on the wall
    for (let tries = 0; tries < 40 && placements.length < 5; tries++) {
      const s = signSpots[Math.floor(rnd() * signSpots.length)];
      if (s.h < 10) continue;
      const side = Math.floor(rnd() * 4);
      const y = R(4, Math.min(s.h - 3, 14));
      let x = s.x, z = s.z, rot = 0;
      const off = 0.55;
      if (side === 0) { x = s.x + s.w / 2 + off; rot = Math.PI / 2; z += R(-s.d / 3, s.d / 3); }
      if (side === 1) { x = s.x - s.w / 2 - off; rot = -Math.PI / 2; z += R(-s.d / 3, s.d / 3); }
      if (side === 2) { z = s.z + s.d / 2 + off; rot = 0; x += R(-s.w / 3, s.w / 3); }
      if (side === 3) { z = s.z - s.d / 2 - off; rot = Math.PI; x += R(-s.w / 3, s.w / 3); }
      placements.push({ x, y, z, rot });
    }
    const im = new THREE.InstancedMesh(signGeo, mat, placements.length);
    placements.forEach((p, k) => {
      m4.makeRotationY(p.rot);
      m4.setPosition(p.x, p.y, p.z);
      im.setMatrixAt(k, m4);
    });
    group.add(im);
    signMeshes.push(im);
  });

  // --- rooftop billboards ---
  const bbDefs = [
    [['CMCL', 'DIGITAL ENGINEERING · CAMBRIDGE'], '#19e6ff', '#ffb347'],
    [['賴嘉偉', 'JIAWEI LAI · CEng MIMechE'], '#ff2bd6', '#7cf2ff'],
    [['NEWCASTLE → CAMBRIDGE', 'PhD ENGINEERING · MSt HISTORY'], '#ffb347', '#19e6ff'],
    [['KNOWLEDGE GRAPH', 'AI · ML · SIMULATION'], '#b26bff', '#19e6ff'],
    [['NEON RAIN', '雨 · 100% PRECIPITATION'], '#7cf2ff', '#ff2bd6'],
  ];
  const bbGeo = new THREE.PlaneGeometry(14, 7);
  const usedRoofs = new Set();
  const facingRoofs = roofSpots.filter(r => Math.abs(r.x) < 60 && r.z < 40 && r.z > -140);
  bbDefs.forEach(([lines, c1, c2], k) => {
    const tex = billboardTexture(lines, c1, c2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
    mat.color.setScalar(1.35);
    let r = null;
    for (let t = 0; t < 30 && !r; t++) {
      const cand = facingRoofs[Math.floor(rnd() * facingRoofs.length)];
      if (cand && !usedRoofs.has(cand)) r = cand;
    }
    if (!r) return;
    usedRoofs.add(r);
    const mesh = new THREE.Mesh(bbGeo, mat);
    mesh.position.set(r.x, r.h + 4.5, r.z);
    mesh.rotation.y = r.x < 0 ? Math.PI / 2 + R(-0.4, 0.4) : -Math.PI / 2 + R(-0.4, 0.4);
    group.add(mesh);
    // support struts
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), new THREE.MeshStandardMaterial({ color: 0x222833 }));
    strut.position.set(r.x, r.h + 1.5, r.z);
    group.add(strut);
  });

  // --- antennas + red beacons on tall roofs ---
  const antGeo = new THREE.CylinderGeometry(0.08, 0.15, 1, 6);
  const antMat = new THREE.MeshStandardMaterial({ color: 0x334, roughness: 0.6 });
  const beacons = [];
  const antSpots = roofSpots.filter(r => rnd() < 0.7);
  const aMesh = new THREE.InstancedMesh(antGeo, antMat, antSpots.length);
  antSpots.forEach((r, k) => {
    const ah = R(3, 9);
    m4.makeScale(1, ah, 1);
    const ax = r.x + R(-r.w / 3, r.w / 3), az = r.z + R(-r.d / 3, r.d / 3);
    m4.setPosition(ax, r.h + ah / 2, az);
    aMesh.setMatrixAt(k, m4);
    beacons.push(ax, r.h + ah + 0.2, az);
  });
  group.add(aMesh);
  const beaconGeo = new THREE.BufferGeometry();
  beaconGeo.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  const phases = new Float32Array(beacons.length / 3).map(() => rnd() * 6.28);
  beaconGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const beaconMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aPhase; varying float vA; uniform float uTime;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        vA = 0.5 + 0.5 * sin(uTime * 3.0 + aPhase); vA = pow(vA, 6.0);
        gl_PointSize = (6.0 + 10.0 * vA) * (120.0 / -mv.z); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA;
      gl_FragColor = vec4(2.0, 0.2, 0.2, a); }`,
  });
  group.add(new THREE.Points(beaconGeo, beaconMat));

  // --- street lamps along the boulevard ---
  const lampGeo = new THREE.SphereGeometry(0.25, 8, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.35, 1.0), toneMapped: false });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a });
  const lampCount = Math.floor((N * C) / 14);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount * 2);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampCount * 2);
  for (let k = 0; k < lampCount; k++) {
    const z = -half + k * 14 + 7;
    for (let s = 0; s < 2; s++) {
      const x = (s ? 1 : -1) * (B - 1.2);
      m4.identity(); m4.setPosition(x, 3, z); poles.setMatrixAt(k * 2 + s, m4);
      m4.identity(); m4.setPosition(x, 6.1, z); lamps.setMatrixAt(k * 2 + s, m4);
    }
  }
  group.add(lamps, poles);

  // --- hologram billboard of the resident ---
  const holoTex = new THREE.TextureLoader().load('images/dp.jpg');
  holoTex.colorSpace = THREE.SRGBColorSpace;
  const holo = makeHologram(holoTex);
  holo.scale.set(16, 16, 1);
  // floats off the corner of the hologram tower, angled towards the street-level camera stop
  holo.position.set(-B + 5, 24, -2 * C + 2);
  holo.rotation.y = 0.5;
  group.add(holo);
  const holoLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 2.6),
    new THREE.MeshBasicMaterial({
      map: neonTexture('DR JIAWEI LAI  //  賴嘉偉', { w: 1024, h: 160, color: '#7cf2ff', font: 'bold 92px Orbitron, "Noto Sans SC", sans-serif' }),
      transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  holoLabel.material.color.setScalar(1.6);
  holoLabel.position.copy(holo.position).add(new THREE.Vector3(0, -9.8, 0));
  holoLabel.rotation.copy(holo.rotation);
  group.add(holoLabel);
  // hologram projector light beam (cheap volumetric cone)
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 18, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.set(holo.position.x, 13, holo.position.z);
  beam.rotation.z = Math.PI;
  group.add(beam);

  // --- ground ---
  const ground = makeGround(scene, renderer, N * C + 200);

  // --- lights ---
  const hemi = new THREE.HemisphereLight(0x2a3d6b, 0x05060c, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x6f86c9, 0.35);
  moon.position.set(-60, 120, -40);
  scene.add(moon);
  const lightning = new THREE.DirectionalLight(0xcfe0ff, 0);
  lightning.position.set(40, 160, -80);
  if (Q.shadows) {
    lightning.castShadow = true;
    lightning.shadow.mapSize.set(2048, 2048);
    lightning.shadow.camera.left = -120; lightning.shadow.camera.right = 120;
    lightning.shadow.camera.top = 120; lightning.shadow.camera.bottom = -120;
    lightning.shadow.camera.near = 20; lightning.shadow.camera.far = 400;
    lightning.shadow.bias = -0.0015;
  }
  scene.add(lightning);
  // key spot over the boulevard that throws real shadows off the towers
  const key = new THREE.SpotLight(0x8fb7ff, 900, 260, Math.PI / 5, 0.5, 1.4);
  key.position.set(30, 90, 10);
  key.target.position.set(-10, 0, -40);
  scene.add(key, key.target);
  if (Q.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0008;
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 300;
  }
  // coloured street-level point lights near the camera path
  const pl = [
    [0xff2bd6, -B + 1, 5, -30, 260], [0x19e6ff, B - 1, 5, -70, 260], [0xffb347, -B + 1, 4, -110, 200],
    [0x19e6ff, -B + 4, 14, -32, 360], [0xff2bd6, B - 3, 6, 10, 200], [0xb26bff, 0, 9, -160, 260],
  ];
  const pointLights = pl.map(([c, x, y, z, i]) => {
    const l = new THREE.PointLight(c, i, 80, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  });

  return { group, ground, buildings: bMesh, lightning, key, pointLights, hemi, holo, half };
}
