import * as THREE from 'three';
import { Q, WORLD } from './config.js';

// Flying vehicles on fixed sky-lanes with light trails
export function buildTraffic(scene, half) {
  const B = WORLD.boulevard / 2;
  const lanes = [];
  const alts = [16, 24, 33, 42];
  // north-south lanes (along z) at several x offsets
  [-B + 3, B - 3, -46, 46, -78, 78].forEach((x, i) => {
    lanes.push({ axis: 'z', at: x, y: alts[i % alts.length] + (i % 2) * 3, dir: i % 2 ? 1 : -1 });
  });
  // east-west lanes (along x)
  [-30, -62, -96, 12, 40].forEach((z, i) => {
    lanes.push({ axis: 'x', at: z, y: alts[(i + 1) % alts.length] + 5, dir: i % 2 ? -1 : 1 });
  });
  const perLane = Q.vehiclesPerLane;
  const count = lanes.length * perLane;
  const L = half * 2 + 40;

  const bodyGeo = new THREE.BoxGeometry(2.6, 0.5, 1.1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.3, metalness: 0.8, emissive: 0x101a33, emissiveIntensity: 0.5 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);

  const trailGeo = new THREE.BoxGeometry(7, 0.16, 0.16);
  trailGeo.translate(-3.5 - 1.3, 0, 0); // trail extends behind the body
  const trailMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const trails = new THREE.InstancedMesh(trailGeo, trailMat, count * 2);

  const headGeo = new THREE.BoxGeometry(0.25, 0.25, 1.0);
  headGeo.translate(1.35, 0, 0);
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 3.0), toneMapped: false });
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);

  const cars = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s1 = new THREE.Vector3(1, 1, 1);
  const cRed = new THREE.Color(2.5, 0.15, 0.35);
  const cCyan = new THREE.Color(0.2, 1.8, 2.6);
  const cAmber = new THREE.Color(2.4, 1.2, 0.2);
  lanes.forEach((lane, li) => {
    for (let k = 0; k < perLane; k++) {
      const idx = li * perLane + k;
      const c = idx % 3 === 0 ? cCyan : (idx % 3 === 1 ? cRed : cAmber);
      cars.push({ lane, s: Math.random() * L, v: (18 + Math.random() * 16) * lane.dir, w: 0.6 + Math.random() * 0.6, idx });
      trails.setColorAt(idx * 2, c);
      trails.setColorAt(idx * 2 + 1, c);
      bodies.setColorAt(idx, new THREE.Color(0.6, 0.7, 0.9));
    }
  });
  scene.add(bodies, trails, heads);

  const tmpP = new THREE.Vector3();
  function update(t) {
    for (const c of cars) {
      const s = ((c.s + c.v * t) % L + L) % L - L / 2;
      const bob = Math.sin(t * 1.3 + c.idx) * 0.4;
      let heading;
      if (c.lane.axis === 'z') { tmpP.set(c.lane.at, c.lane.y + bob, s); heading = c.v > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { tmpP.set(s, c.lane.y + bob, c.lane.at); heading = c.v > 0 ? 0 : Math.PI; }
      q.setFromAxisAngle(up, heading);
      m4.compose(tmpP, q, s1);
      bodies.setMatrixAt(c.idx, m4);
      heads.setMatrixAt(c.idx, m4);
      // two trails, offset left/right, stretched by speed
      const stretch = 0.6 + Math.abs(c.v) / 22;
      for (let side = 0; side < 2; side++) {
        const off = (side ? 0.4 : -0.4);
        const p2 = tmpP.clone();
        if (c.lane.axis === 'z') p2.x += off; else p2.z += off;
        m4.compose(p2, q, new THREE.Vector3(stretch, 1, 1));
        trails.setMatrixAt(c.idx * 2 + side, m4);
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    trails.instanceMatrix.needsUpdate = true;
  }
  return { update };
}
