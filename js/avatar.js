// 3D-Avatar: parametrischer Körper aus den Körpermaßen + Kleidung/Schmuck als Meshes.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

let renderer, scene, camera, controls, avatarGroup, platform;
let currentProfile = null;
let currentItems = [];

const texLoader = new THREE.TextureLoader();

export function initStage(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = null; // transparent – der CSS-Hintergrund scheint durch

  camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 50);
  camera.position.set(0, 1.35, 3.4);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0);
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 2.2;

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2438, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2.5, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8b7cf6, 0.7);
  rim.position.set(-3, 2, -3);
  scene.add(rim);

  // Podest wie im Showroom
  platform = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.95, 0.06, 48),
    new THREE.MeshStandardMaterial({ color: 0x23253a, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0.85 })
  );
  platform.position.y = -0.03;
  platform.receiveShadow = true;
  scene.add(platform);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.012, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0x8b7cf6, transparent: true, opacity: 0.6 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);

  window.addEventListener('resize', () => resize(container));
  const ro = new ResizeObserver(() => resize(container));
  ro.observe(container);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

function resize(container) {
  if (!container.clientWidth) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

export function setAutoRotate(on) {
  controls.autoRotate = on;
}
export function toggleAutoRotate() {
  controls.autoRotate = !controls.autoRotate;
  return controls.autoRotate;
}

export function updateAvatar(profile, wornItems) {
  currentProfile = profile;
  currentItems = wornItems || [];
  rebuild();
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
}

function rebuild() {
  if (avatarGroup) {
    scene.remove(avatarGroup);
    disposeGroup(avatarGroup);
  }
  avatarGroup = buildAvatar(currentProfile, currentItems);
  scene.add(avatarGroup);
}

/* ---------- Hilfsfunktionen ---------- */

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });
}
function capsule(rx, len, mat, rz) {
  const geo = new THREE.CapsuleGeometry(rx, Math.max(len, 0.01), 6, 14);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(1, 1, (rz ?? rx) / rx);
  m.castShadow = true;
  return m;
}
const circ2r = (circCm) => circCm / (2 * Math.PI) / 100; // Umfang cm -> Radius m

/* ---------- Avatar ---------- */

function buildAvatar(p, items) {
  const g = new THREE.Group();
  if (!p) return g;

  const H = p.height / 100;
  const skin = stdMat(p.skin || '#e0b394');

  // Kernmaße
  const headR = H / 15.5;
  const headCY = H - headR;              // Kopf-Mittelpunkt
  const neckTop = H - 2 * headR + 0.01;
  const shoulderW = (p.shoulder || 44) / 100;
  const chestR = circ2r(p.chest || 96);
  const waistR = circ2r(p.waist || 82);
  const hipR = circ2r(p.hip || 96);
  const legLen = (p.inseam || 80) / 100;
  const armLen = (p.arm || 60) / 100;

  const hipY = legLen + 0.05;            // Oberkante Becken
  const shoulderY = neckTop - 0.055;
  const torsoH = Math.max(0.28, shoulderY - hipY);
  const depth = 0.72;                    // Körper ist vorn/hinten flacher als seitlich

  const parts = {};

  // --- Beine ---
  const thighR = hipR * 0.52;
  const calfR = thighR * 0.72;
  const legX = hipR * 0.52;
  for (const side of [-1, 1]) {
    const thigh = capsule(thighR, legLen * 0.48, skin, thighR * depth + 0.012);
    thigh.position.set(side * legX, hipY - legLen * 0.27, 0);
    g.add(thigh);
    const calf = capsule(calfR, legLen * 0.44, skin, calfR * depth + 0.012);
    calf.position.set(side * legX, legLen * 0.28, 0);
    g.add(calf);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(calfR * 1.9, 0.055, 0.24), skin.clone());
    foot.geometry.translate(0, 0, 0.06);
    foot.position.set(side * legX, 0.032, 0.01);
    foot.castShadow = true;
    g.add(foot);
    parts[side === -1 ? 'footL' : 'footR'] = foot;
  }

  // --- Becken ---
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), skin);
  pelvis.scale.set(hipR * 1.05, torsoH * 0.22, hipR * depth);
  pelvis.position.y = hipY;
  pelvis.castShadow = true;
  g.add(pelvis);

  // --- Torso (Taille -> Brust) ---
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 22, 6), skin);
  torso.castShadow = true;
  shapeTorso(torso.geometry, waistR, chestR, shoulderW / 2, depth);
  torso.scale.set(1, torsoH, 1);
  torso.position.y = hipY + torsoH / 2;
  g.add(torso);

  // --- Schultern ---
  const shoulders = capsule(chestR * 0.5, shoulderW - chestR, skin, chestR * 0.5 * depth);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = shoulderY;
  g.add(shoulders);

  // --- Hals & Kopf ---
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.42, headR * 0.5, 0.09, 16), skin);
  neck.position.y = neckTop + 0.02;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 20), skin);
  head.scale.set(0.82, 1, 0.9);
  head.position.y = headCY;
  head.castShadow = true;
  g.add(head);

  // Haare
  if (p.hairstyle !== 'glatze') {
    const hairMat = stdMat(p.hair || '#3b2a1e', { roughness: 0.9 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.06, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat);
    cap.scale.set(0.85, 1, 0.93);
    cap.position.set(0, headCY + headR * 0.08, -headR * 0.08);
    g.add(cap);
    if (p.hairstyle === 'mittel' || p.hairstyle === 'lang') {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.55, headR * 0.4, p.hairstyle === 'lang' ? 0.34 : 0.16, 14), hairMat);
      back.position.set(0, headCY - (p.hairstyle === 'lang' ? 0.17 : 0.08), -headR * 0.55);
      g.add(back);
    }
  }

  // Augen
  const eyeMat = stdMat(p.eyes || '#4a6b8a', { roughness: 0.3 });
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.16, 10, 8), stdMat('#f5f5f5', { roughness: 0.25 }));
    white.position.set(side * headR * 0.32, headCY + headR * 0.08, headR * 0.78);
    g.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.085, 10, 8), eyeMat);
    iris.position.set(side * headR * 0.32, headCY + headR * 0.08, headR * 0.9);
    g.add(iris);
  }

  // --- Arme ---
  const upperR = chestR * 0.3;
  const foreR = upperR * 0.8;
  const armX = shoulderW / 2 + upperR * 0.35;
  const tilt = 0.13;
  for (const side of [-1, 1]) {
    const armG = new THREE.Group();
    const upper = capsule(upperR, armLen * 0.42, skin, upperR * 0.9);
    upper.position.y = -armLen * 0.24;
    armG.add(upper);
    const fore = capsule(foreR, armLen * 0.4, skin, foreR * 0.9);
    fore.position.y = -armLen * 0.7;
    armG.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(foreR * 1.15, 12, 10), skin);
    hand.scale.set(0.8, 1.2, 0.9);
    hand.position.y = -armLen * 0.97;
    hand.castShadow = true;
    armG.add(hand);
    armG.position.set(side * armX, shoulderY, 0);
    armG.rotation.z = side * tilt;
    g.add(armG);
    parts[side === -1 ? 'armL' : 'armR'] = armG;
  }

  // Maße für Kleidungs-Layer
  const dims = { H, headR, headCY, neckTop, shoulderY, shoulderW, chestR, waistR, hipR, hipY, torsoH, legLen, legX, thighR, calfR, armLen, armX, upperR, foreR, depth, tilt };

  // --- Kleidung / Schmuck (Reihenfolge: unten -> oben) ---
  const order = ['schuhe', 'hose', 'shorts', 'rock', 'kleid', 'tshirt', 'longsleeve', 'jacke', 'kette', 'uhr'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  for (const item of sorted) {
    try { addClothing(g, item, dims, parts); } catch (e) { console.warn('Kleidung konnte nicht gerendert werden:', item.name, e); }
  }

  return g;
}

// Torso-Zylinder formen: unten Taille, oben Brust/Schulterbreite, elliptischer Querschnitt
function shapeTorso(geo, waistR, chestR, halfShoulder, depth) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y + 0.5; // 0 unten .. 1 oben
    const rSide = waistR * 1.02 + (Math.min(halfShoulder * 0.92, chestR * 1.25) - waistR * 1.02) * smooth(t);
    const rFront = (waistR + (chestR - waistR) * smooth(t)) * depth;
    v.x *= rSide;
    v.z *= rFront;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}
const smooth = (t) => t * t * (3 - 2 * t);

/* ---------- Kleidung ---------- */

function clothMat(item, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: item.color || '#cccccc', roughness: 0.85, metalness: 0.02, ...opts });
}

function addClothing(g, item, d, parts) {
  const c = clothMat(item);
  const off = 0.014; // Stoff liegt leicht über der Haut

  switch (item.type) {
    case 'tshirt':
    case 'longsleeve':
    case 'jacke': {
      const isJacket = item.type === 'jacke';
      const extra = isJacket ? 0.026 : off;
      // Rumpfteil
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 22, 6), c);
      shapeTorso(torso.geometry, d.waistR + extra, d.chestR + extra, d.shoulderW / 2 + extra, d.depth + 0.06);
      const topH = d.torsoH * (isJacket ? 1.16 : 1.06);
      torso.scale.set(1, topH, 1);
      torso.position.y = d.shoulderY + 0.03 - topH / 2;
      torso.castShadow = true;
      g.add(torso);
      // Schulterpartie
      const yoke = capsule(d.chestR * 0.5 + extra, d.shoulderW - d.chestR, c, (d.chestR * 0.5 + extra) * d.depth);
      yoke.rotation.z = Math.PI / 2;
      yoke.position.y = d.shoulderY;
      g.add(yoke);
      // Ärmel
      const longSleeve = item.type !== 'tshirt';
      const sleeveLen = longSleeve ? d.armLen * 0.86 : d.armLen * 0.3;
      for (const side of [-1, 1]) {
        const sleeve = capsule(d.upperR + extra, sleeveLen, c, d.upperR * 0.9 + extra);
        sleeve.position.set(0, -sleeveLen / 2 - 0.02, 0);
        parts[side === -1 ? 'armL' : 'armR'].add(sleeve);
      }
      addPrint(g, item, d, torso.position.y);
      break;
    }

    case 'kleid': {
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 22, 6), c);
      shapeTorso(torso.geometry, d.waistR + off, d.chestR + off, d.shoulderW / 2 + off, d.depth + 0.06);
      torso.scale.set(1, d.torsoH * 1.04, 1);
      torso.position.y = d.shoulderY + 0.02 - (d.torsoH * 1.04) / 2;
      torso.castShadow = true;
      g.add(torso);
      const yoke = capsule(d.chestR * 0.5 + off, d.shoulderW - d.chestR, c, (d.chestR * 0.5 + off) * d.depth);
      yoke.rotation.z = Math.PI / 2;
      yoke.position.y = d.shoulderY;
      g.add(yoke);
      addSkirt(g, c, d, d.hipY + 0.06, d.legLen * 0.5);
      addPrint(g, item, d, torso.position.y);
      break;
    }

    case 'rock':
      addSkirt(g, c, d, d.hipY + 0.08, d.legLen * 0.62);
      break;

    case 'hose':
    case 'shorts': {
      const long = item.type === 'hose';
      // Bund/Becken
      const waistband = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), c);
      waistband.scale.set(d.hipR * 1.05 + off, d.torsoH * 0.24, d.hipR * d.depth + off);
      waistband.position.y = d.hipY;
      waistband.castShadow = true;
      g.add(waistband);
      for (const side of [-1, 1]) {
        if (long) {
          const thigh = capsule(d.thighR + off, d.legLen * 0.48, c, d.thighR * d.depth + off + 0.012);
          thigh.position.set(side * d.legX, d.hipY - d.legLen * 0.27, 0);
          g.add(thigh);
          const calf = capsule(d.calfR + off, d.legLen * 0.46, c, d.calfR * d.depth + off + 0.012);
          calf.position.set(side * d.legX, d.legLen * 0.27, 0);
          g.add(calf);
        } else {
          const thigh = capsule(d.thighR + off, d.legLen * 0.22, c, d.thighR * d.depth + off + 0.012);
          thigh.position.set(side * d.legX, d.hipY - d.legLen * 0.16, 0);
          g.add(thigh);
        }
      }
      break;
    }

    case 'schuhe': {
      for (const key of ['footL', 'footR']) {
        const foot = parts[key];
        if (!foot) continue;
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(d.calfR * 2.2, 0.085, 0.28), c.clone());
        shoe.geometry.translate(0, 0.01, 0.055);
        shoe.position.copy(foot.position);
        shoe.position.y += 0.008;
        shoe.castShadow = true;
        g.add(shoe);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(d.calfR * 2.3, 0.025, 0.3), stdMat('#f4f2ee'));
        sole.geometry.translate(0, 0, 0.055);
        sole.position.set(foot.position.x, 0.012, foot.position.z);
        g.add(sole);
      }
      break;
    }

    case 'uhr': {
      const armL = parts.armL;
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(d.foreR * 1.05, 0.011, 10, 24),
        clothMat(item, { metalness: 0.4, roughness: 0.4 })
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = -d.armLen * 0.88;
      armL.add(band);
      const face = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.008, 20),
        stdMat('#e8e6e0', { metalness: 0.7, roughness: 0.25 })
      );
      face.rotation.x = Math.PI / 2;
      face.position.set(0, -d.armLen * 0.88, d.foreR * 1.05);
      armL.add(face);
      break;
    }

    case 'kette': {
      const chain = new THREE.Mesh(
        new THREE.TorusGeometry(d.headR * 0.62, 0.006, 8, 32),
        clothMat(item, { metalness: 0.85, roughness: 0.25 })
      );
      chain.rotation.x = Math.PI / 2 - 0.35;
      chain.position.set(0, d.neckTop + 0.005, 0.012);
      g.add(chain);
      const pendant = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 12, 10),
        clothMat(item, { metalness: 0.9, roughness: 0.2 })
      );
      pendant.position.set(0, d.neckTop - d.headR * 0.5, d.chestR * (d.depth) + 0.03);
      g.add(pendant);
      break;
    }
  }
}

function addSkirt(g, mat, d, topY, len) {
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(d.hipR * 1.08, d.hipR * 1.75, len, 26, 1, true),
    mat.clone()
  );
  skirt.material.side = THREE.DoubleSide;
  skirt.position.y = topY - len / 2;
  skirt.castShadow = true;
  g.add(skirt);
}

// Produktbild als "Print" vorn auf dem Oberteil
function addPrint(g, item, d, centerY) {
  if (!item.image) return;
  texLoader.load(item.image, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = d.chestR * 1.15;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 1.15),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85 })
    );
    plane.position.set(0, centerY + d.torsoH * 0.12, d.chestR * d.depth + 0.045);
    g.add(plane);
  });
}
