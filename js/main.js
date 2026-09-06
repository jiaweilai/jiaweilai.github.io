import * as THREE from 'three';
import { Q } from './config.js';
import { buildCity, uTime, uFlash } from './city.js';
import { buildRain } from './rain.js';
import { buildTraffic } from './traffic.js';
import { buildPost } from './post.js';
import { createAudio } from './audio.js';
import { buildAtmosphere } from './atmosphere.js';

// ------------------------------------------------------------------ boot screen
const $ = (s) => document.querySelector(s);
const term = $('#term'), bar = $('#bar'), loader = $('#loader');
const bootLines = [
  ['> init renderer', 'WebGL2'],
  ['> compiling shaders', 'facade / wet-street / hologram / crt'],
  ['> generating skyline', `${Q.gridN}×${Q.gridN} blocks · seed 1989.05`],
  ['> seeding rain', `${Q.rain.toLocaleString()} drops`],
  ['> quality tier', Q.tier.toUpperCase()],
  ['> resident', 'DR JIAWEI LAI · 赖嘉伟'],
];
let bootIdx = 0;
function bootStep() {
  if (bootIdx < bootLines.length) {
    const [a, b] = bootLines[bootIdx++];
    term.innerHTML += `${a} <b>${b}</b><br>`;
    bar.style.width = `${(bootIdx / bootLines.length) * 100}%`;
    setTimeout(bootStep, 140 + Math.random() * 160);
  } else {
    term.innerHTML += `> <b>READY</b> — click to enter, sound optional<br>`;
    loader.classList.add('ready');
  }
}
bootStep();

// ------------------------------------------------------------------ renderer
const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  // No WebGL: drop the boot screen and leave the plain page readable
  term.innerHTML += `> <b>WebGL unavailable</b> — showing the static page<br>`;
  setTimeout(() => loader.classList.add('hide'), 1200);
  document.querySelectorAll('section[data-sec]').forEach((sec) => sec.classList.add('in'));
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // static city: only re-render shadow maps while lightning moves

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x05070f);
scene.background = SKY.clone();
scene.fog = new THREE.FogExp2(SKY.clone(), 0.0062);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 700);

// ------------------------------------------------------------------ world
const atmosphere = buildAtmosphere(scene);
const city = buildCity(scene, renderer);
const rain = buildRain(scene);
const traffic = buildTraffic(scene, city.half);
const post = buildPost(renderer, scene, camera);
const audio = createAudio();

// ------------------------------------------------------------------ camera path (scroll-driven)
const camPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-34, 44, 178),   // 0.00 hero: skyline approach, boulevard to the right
  new THREE.Vector3(6, 12, 16),      // 0.25 identity: street level, hologram ahead-left
  new THREE.Vector3(0, 10, -44),     // 0.50 work: gliding down the boulevard
  new THREE.Vector3(-22, 62, -78),   // 0.75 scenarios: climbing between towers
  new THREE.Vector3(0, 130, -70),    // 1.00 uplink: above the city
], false, 'catmullrom', 0.4);
const lookPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(14, 16, -10),
  new THREE.Vector3(4, 18, -40),
  new THREE.Vector3(-2, 10, -140),
  new THREE.Vector3(12, 22, -150),
  new THREE.Vector3(0, 0, -112),
], false, 'catmullrom', 0.4);

let scrollT = 0, smoothT = 0;
const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollT = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
addEventListener('scroll', readScroll, { passive: true });

// ------------------------------------------------------------------ HUD + sections
const sections = [...document.querySelectorAll('section[data-sec]')];
const navLinks = [...document.querySelectorAll('#nav a[data-sec]')];
const labels = { hero: '00 / HOME', about: '01 / IDENTITY', work: '02 / WORK', scenarios: '03 / SCENARIOS', contact: '04 / UPLINK' };
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) {
      en.target.classList.add('in');
      const id = en.target.dataset.sec;
      $('#teleSec').textContent = labels[id];
      navLinks.forEach((a) => a.classList.toggle('active', a.dataset.sec === id));
      if (en.target !== sections[0]) glitchBurst(0.35);
    }
  });
}, { threshold: 0.08 });
sections.forEach((s) => io.observe(s));
$('#teleTier').textContent = Q.tier.toUpperCase();

// City view keeps the original scroll journey, with an unobstructed panorama.
const cityView = $('#cityView');
const profile = $('#profile');
function setCityView(on) {
  document.body.classList.toggle('city-only', on);
  profile.inert = on;
  cityView.setAttribute('aria-pressed', String(on));
  cityView.textContent = on ? 'SHOW PROFILE ◇' : 'VIEW CITY ◇';
}
cityView.addEventListener('click', () => setCityView(!document.body.classList.contains('city-only')));
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('city-only')) {
    setCityView(false);
    cityView.focus();
  }
});

// WeChat modal
const qr = $('#qr');
$('#wechatBtn').addEventListener('click', () => qr.classList.add('open'));
qr.addEventListener('click', () => qr.classList.remove('open'));
addEventListener('keydown', (e) => { if (e.key === 'Escape') qr.classList.remove('open'); });

// sound toggle
const soundBtn = $('#sound');
function setSound(on) {
  if (on) audio.start(); else audio.stop();
  soundBtn.classList.toggle('on', on);
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? '♪ SOUND ON' : '♪ SOUND OFF';
}
soundBtn.addEventListener('click', () => setSound(!audio.enabled));

// rain toggle
let rainOn = true;
const rainBtn = $('#rainTog');
rainBtn.addEventListener('click', () => {
  rainOn = !rainOn;
  rainBtn.classList.toggle('on', !rainOn);
  rainBtn.setAttribute('aria-pressed', String(rainOn));
  rainBtn.textContent = rainOn ? '☂ RAIN ON' : '☂ RAIN OFF';
  $('#telePrecip').textContent = rainOn ? '100%' : '0%';
  audio.setRainLevel(rainOn ? 1 : 0.15);
});

// enter
let started = false;
$('#enter').addEventListener('click', () => {
  loader.classList.add('hide');
  started = true;
  $('#brand').focus({ preventScroll: true });
  glitchBurst(0.9);
});
// also allow entering by clicking anywhere on the loader once ready
loader.addEventListener('click', (e) => { if (loader.classList.contains('ready') && e.target.id !== 'enter') $('#enter').click(); });

// ------------------------------------------------------------------ lightning + glitch
let glitch = 0;
function glitchBurst(v) { if (!Q.reducedMotion) glitch = Math.max(glitch, v); }
const flashEl = $('#flash');
let nextBolt = 4 + Math.random() * 6;
let boltT = -1, boltStrength = 1, shadowsPrimed = false;
function lightning(t, dt) {
  nextBolt -= dt;
  if (nextBolt <= 0 && boltT < 0) {
    boltT = 0;
    boltStrength = 0.5 + Math.random() * 0.8;
    nextBolt = 5 + Math.random() * 11;
    city.lightning.position.set((Math.random() - 0.5) * 240, 160, -60 + (Math.random() - 0.5) * 160);
    audio.thunder(0.4 + Math.random() * 1.4, boltStrength);
    if (Math.random() < 0.5) glitchBurst(0.5 * boltStrength);
  }
  let f = 0;
  if (boltT >= 0) {
    boltT += dt;
    // double strike envelope
    const a = Math.exp(-boltT * 14) + 0.7 * Math.exp(-Math.pow((boltT - 0.18) * 16, 2)) + 0.4 * Math.exp(-Math.pow((boltT - 0.32) * 20, 2));
    f = Math.min(1, a) * boltStrength;
    if (boltT > 0.9) boltT = -1;
  }
  if (Q.reducedMotion) f *= 0.35;
  uFlash.value = f;
  city.lightning.intensity = f * 5.5;
  if (Q.shadows && (boltT >= 0 || !shadowsPrimed)) { renderer.shadowMap.needsUpdate = true; shadowsPrimed = true; }
  const skyMix = f * 0.55;
  scene.background.copy(SKY).lerp(new THREE.Color(0x2b3f74), skyMix);
  scene.fog.color.copy(scene.background);
  flashEl.style.opacity = (f * 0.18).toFixed(3);
}

// ------------------------------------------------------------------ resize
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize(innerWidth, innerHeight);
  readScroll();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, fpsTimer = 0;
let timeAcc = 0;
const teleTime = $('#teleTime');

function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) { clock.getDelta(); return; }
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = Q.reducedMotion ? 0 : clock.elapsedTime;
  uTime.value = t;

  // camera: scroll spline + mouse parallax + idle drift
  smoothT += (scrollT - smoothT) * (1 - Math.exp(-dt * 2.2));
  mouseS.lerp(mouse, 1 - Math.exp(-dt * 3));
  if (Q.reducedMotion) { smoothT = scrollT; mouseS.set(0, 0); }
  camPath.getPoint(smoothT, tmpPos);
  lookPath.getPoint(smoothT, tmpLook);
  const drift = Q.reducedMotion ? 0 : 1;
  tmpPos.x += Math.sin(t * 0.21) * 1.2 * drift + mouseS.x * 3;
  tmpPos.y += Math.sin(t * 0.17) * 0.6 * drift - mouseS.y * 1.6;
  tmpLook.x += mouseS.x * 8;
  tmpLook.y -= mouseS.y * 5;
  camera.position.copy(tmpPos);
  camera.lookAt(tmpLook);
  camera.rotation.z += Math.sin(t * 0.13) * 0.008 * drift;

  // world updates
  rain.update(camera);
  traffic.update(t);
  if (!Q.reducedMotion) lightning(t, dt);
  atmosphere.position.copy(camera.position);
  city.pointLights.forEach((l, i) => { l.intensity = l.userData.base ??= l.intensity; l.intensity = l.userData.base * (0.85 + 0.15 * Math.sin(t * (2.3 + i) + i * 1.7)); });
  city.holo.material.uniforms.uTime.value = t;

  // post
  glitch = Math.max(0, glitch - dt * 1.6);
  post.cyber.uniforms.uTime.value = t;
  post.cyber.uniforms.uGlitch.value = glitch;
  post.cyber.uniforms.uLens.value = rainOn ? 0.8 : 0;
  post.composer.render();

  // HUD
  const p = Math.round(smoothT * 100);
  $('#progBar').style.height = `${p}%`;
  $('#progTxt').textContent = `${String(p).padStart(2, '0')}%`;
  fpsAcc += dt; fpsN++; fpsTimer += dt;
  if (fpsTimer > 0.5) { $('#teleFps').textContent = Math.round(fpsN / fpsAcc); fpsAcc = fpsN = fpsTimer = 0; }
  timeAcc += dt;
  if (timeAcc > 1) { timeAcc = 0; teleTime.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Europe/London' }); }
}

// rain intensity follows toggle (fade)
let rainLevel = 1;
setInterval(() => {
  const target = rainOn ? 1 : 0;
  rainLevel += (target - rainLevel) * 0.15;
  rain.setIntensity(rainLevel);
}, 50);

window.__neon = { renderer, scene, camera, Q, city, set glitch(v) { glitch = v; }, get scrollT() { return scrollT; }, get smoothT() { return smoothT; }, set smoothT(v) { smoothT = v; }, get frames() { return renderer.info.render.frame; } };
frame();
$('#year').textContent = new Date().getFullYear();
