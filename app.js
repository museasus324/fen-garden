import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Fen's archive garden, Three.js edition. Visual pass 2: gradient sky,
// drifting clouds, canvas textures (grass / wood / stone), jittered
// low-poly canopies, ground detail scatter, a titled book cover, and
// floating petal/dust particles — presentable enough to show people.

const WORK = {
  id: 'yukemuri',
  url: 'https://muse.ai/s/asitanotang-kemuri-qian-bian-xqw6xbxz2txtaxmy/pEIxZ7vbU-vNpw3nFBZTnmY8BVL8Fzm-H-Wfj2vIrrI',
};
const BOOK_POS = new THREE.Vector3(0, 0, -7.6);
const PROMPT_RANGE = 2.6;
const SPEED = 6.0, JUMP_V = 8.5, GRAVITY = 20.0;
const MODEL_YAW = 0; // Godot's glTF export already puts her facing in glTF convention

// ---------- state ----------
let visited = {};
try { visited = JSON.parse(localStorage.getItem('fengarden_visited_v2') || '{}'); } catch (e) { visited = {}; }
let panelOpen = false;
let toastT = 0;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa8cdf0, 34, 88);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 220);

// gradient sky dome
{
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5f9fdf'); g.addColorStop(0.55, '#93c4ee'); g.addColorStop(1, '#dceefb');
  c.fillStyle = g; c.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(100, 24, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  scene.add(dome);
}

const hemi = new THREE.HemisphereLight(0xbdd8ff, 0x6a8f5f, 0.85);
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
sun.position.set(14, 22, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 70;
sun.shadow.radius = 4;
sun.shadow.bias = -0.0004;
scene.add(sun);

// drifting clouds (flat white blobs)
const clouds = [];
{
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, fog: false });
  const spots = [[-18, 15, -20], [10, 17, -26], [22, 14, 6], [-24, 16, 10], [2, 18, -34], [-8, 14, 22]];
  for (const [x, y, z] of spots) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random() * 1.4, 14, 10), cm);
      s.position.set(i * 1.9 - n, Math.random() * 0.5, Math.random() * 0.8);
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push(g);
  }
}

// ---------- canvas textures ----------
function canvasTex(size, draw, repeat) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 4;
  return tex;
}
let seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const grassTex = canvasTex(256, (c, s) => {
  c.fillStyle = '#5da257'; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 5200; i++) {
    const sh = 0.82 + rnd() * 0.4;
    c.fillStyle = `rgb(${Math.floor(84 * sh)},${Math.floor(158 * sh)},${Math.floor(80 * sh)})`;
    c.fillRect(rnd() * s, rnd() * s, 2, 2 + rnd() * 3);
  }
}, 9);
const woodTex = canvasTex(256, (c, s) => {
  c.fillStyle = '#7a5a36'; c.fillRect(0, 0, s, s);
  for (let p = 0; p < 4; p++) {
    c.fillStyle = 'rgba(40,24,10,0.55)';
    c.fillRect(0, p * 64, s, 3);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = `rgba(52,34,14,${0.10 + rnd() * 0.16})`;
      c.lineWidth = 1 + rnd() * 1.5;
      c.beginPath();
      const y = p * 64 + 6 + rnd() * 52;
      c.moveTo(0, y);
      c.bezierCurveTo(s * 0.3, y + rnd() * 4 - 2, s * 0.7, y + rnd() * 4 - 2, s, y);
      c.stroke();
    }
  }
}, 1);
const stoneTex = canvasTex(128, (c, s) => {
  c.fillStyle = '#a49e90'; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const sh = 0.8 + rnd() * 0.45;
    c.fillStyle = `rgb(${Math.floor(164 * sh)},${Math.floor(158 * sh)},${Math.floor(144 * sh)})`;
    c.fillRect(rnd() * s, rnd() * s, 2, 2);
  }
}, 1);

// ---------- helpers ----------
function mat(color, rough = 0.9, metal = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metallic: metal });
}
function box(w, h, d, materialOrColor, x, y, z, parent = scene) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    typeof materialOrColor === 'number' ? mat(materialOrColor) : materialOrColor);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(r, color, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function textSprite(text, px, color, outline, worldH) {
  const pad = px * 0.35;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  cx.font = `600 ${px}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
  const w = Math.ceil(cx.measureText(text).width) + pad * 2;
  cv.width = w; cv.height = px + pad * 2;
  const c2 = cv.getContext('2d');
  c2.font = `600 ${px}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  if (outline) { c2.lineWidth = px * 0.14; c2.strokeStyle = outline; c2.lineJoin = 'round'; c2.strokeText(text, w / 2, cv.height / 2); }
  c2.fillStyle = color; c2.fillText(text, w / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(worldH * (w / cv.height), worldH, 1);
  return sp;
}

// ---------- world ----------
const colliders = [];
function collide(aabb) { colliders.push(aabb); }

// ground island: grass top, soil sides, darker apron beneath
{
  const top = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
  const soil = mat(0x6b4a2f, 1);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 30), [soil, soil, top, soil, soil, soil]);
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(36, 0.6, 36), mat(0x4c7a45, 1));
  apron.position.y = -1.05;
  scene.add(apron);
}
const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
for (let i = 0; i < 7; i++) {
  const slab = box(2.0, 0.05, 1.7, stoneMat, 0, 0.025, 6.5 - i * 2.0);
  slab.rotation.y = (rnd() - 0.5) * 0.05;
}
// fence (wood texture)
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });
const darkWood = 0x594026, leaf = 0x407d40, leaf2 = 0x4a8a48;
for (let side = 0; side < 4; side++) {
  const rot = side * Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
  const place = (lx, lz) => [lx * c + lz * s, -lx * s + lz * c];
  for (let i = 0; i < 9; i++) {
    const [x, z] = place(-14 + i * 3.5, -14.6);
    box(0.18, 1.1, 0.18, woodMat, x, 0.55, z);
  }
  const [rx, rz] = place(0, -14.6);
  for (const ry of [0.85, 0.4]) {
    const rail = box(29, 0.12, 0.1, woodMat, rx, ry, rz);
    rail.rotation.y = rot;
  }
}
// trees: tapered trunks + soft, rounded canopy blobs
// v2 pass 2 (softening): the old detail-1 icosahedron jittered every
// duplicated face vertex independently with flat shading, which tore the
// surface into sharp spikes. Now: detail-2 geometry, displacement only
// along the vertex normal, keyed by the rounded original position so
// vertices that share a place move together (no cracks / spikes), a much
// smaller jitter amount, and smooth (non-flat) shading.
function canopyBlob(r, color, x, y, z, parent) {
  let geo = new THREE.IcosahedronGeometry(r, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    // deterministic hash of the rounded position -> same place, same offset
    const hx = Math.round(v.x * 57.3), hy = Math.round(v.y * 57.3), hz = Math.round(v.z * 57.3);
    let h = Math.sin(hx * 12.9898 + hy * 78.233 + hz * 37.719) * 43758.5453;
    h = h - Math.floor(h); // 0..1
    const amp = (h - 0.5) * r * 0.11; // gentle radial bump, was 0.22 XYZ jitter
    const n = v.clone().normalize();
    v.addScaledVector(n, amp);
    pos.setXYZ(i, v.x, v.y * 0.9, v.z); // slight squash -> rounder, softer silhouette
  }
  // weld the duplicated polyhedron vertices, then normals become truly
  // smooth across faces instead of per-face flat facets
  geo = mergeVertices(geo, 1e-3);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1.0, flatShading: false }));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const treeSpots = [[-6, -2], [6, -3], [-9, 3], [9, 4], [-10, -8], [10, -9], [5, 10], [-7, 10]];
treeSpots.forEach(([x, z], i) => {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.7, 6), mat(darkWood));
  trunk.position.set(x, 0.85, z);
  trunk.castShadow = true; trunk.receiveShadow = true;
  scene.add(trunk);
  canopyBlob(1.55, i % 2 ? leaf2 : leaf, x, 2.5, z, scene);
  canopyBlob(1.05, i % 2 ? leaf : leaf2, x + 0.85, 1.95, z + 0.3, scene);
  canopyBlob(0.9, i % 2 ? leaf2 : leaf, x - 0.8, 2.0, z - 0.4, scene);
  canopyBlob(0.95, i % 2 ? leaf : leaf2, x + 0.1, 3.15, z - 0.1, scene);
  colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
});
// grass tufts + pebbles + flowers scattered (kept off the path and archive)
function clearOfPath(x, z) {
  if (Math.abs(x) < 1.6 && z > -6.5 && z < 8.5) return false;
  if (Math.abs(x) < 5.2 && z < -4.8) return false;
  if (Math.hypot(x - BOOK_POS.x, z - BOOK_POS.z) < 1.6) return false;
  return true;
}
{
  const tuftMat = mat(0x4c8f47, 1);
  const tuftGeo = new THREE.ConeGeometry(0.16, 0.42, 5);
  for (let i = 0; i < 90; i++) {
    const x = (rnd() * 2 - 1) * 13.5, z = (rnd() * 2 - 1) * 13.5;
    if (!clearOfPath(x, z)) continue;
    const t = new THREE.Mesh(tuftGeo, tuftMat);
    t.position.set(x, 0.2, z);
    t.rotation.set((rnd() - 0.5) * 0.35, rnd() * Math.PI, (rnd() - 0.5) * 0.35);
    const sc = 0.7 + rnd() * 0.9;
    t.scale.set(sc, sc, sc);
    scene.add(t);
  }
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1) * 13.5, z = (rnd() * 2 - 1) * 13.5;
    if (!clearOfPath(x, z)) continue;
    const p = sphere(0.09 + rnd() * 0.08, 0x9a958a, x, 0.05, z);
    p.scale.y = 0.6;
  }
}
const flowerCols = [0xf28ca6, 0xfad94d, 0xf2f2f2, 0xbf99f2];
const flowerSpots = [[-2.5, 4], [2.8, 2], [-3.4, -3], [3.6, -4.5], [-5, 7], [5.5, 8], [-2.2, -5.5], [2.4, -5.8], [-8, -4], [8, 0], [-4.5, 0.5], [4.2, 6]];
flowerSpots.forEach(([x, z], i) => {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 5), mat(0x3c7a3c));
  stem.position.set(x, 0.13, z);
  scene.add(stem);
  sphere(0.11, flowerCols[i % 4], x, 0.3, z);
});

// archive
const arch = new THREE.Group(); scene.add(arch);
box(9, 0.3, 5.5, stoneMat, 0, 0.15, -8.2, arch);
box(9, 3.6, 0.4, woodMat, 0, 1.8, -10.6, arch);
box(0.5, 3.4, 0.5, woodMat, -4.2, 1.7, -6.2, arch);
box(0.5, 3.4, 0.5, woodMat, 4.2, 1.7, -6.2, arch);
box(9.6, 0.3, 6.0, mat(0x4a3823), 0, 3.55, -8.2, arch);
collide({ minX: -4.5, maxX: 4.5, minZ: -10.85, maxZ: -10.35 });
collide({ minX: -4.45, maxX: -3.95, minZ: -6.45, maxZ: -5.95 });
collide({ minX: 3.95, maxX: 4.45, minZ: -6.45, maxZ: -5.95 });
// warm interior glow so the shelves read as a place, not a wall
const innerGlow = new THREE.PointLight(0xffd9a0, 14, 9, 1.6);
innerGlow.position.set(0, 2.2, -8.6);
arch.add(innerGlow);
const spineCols = [0x994040, 0x406699, 0x4d8c59, 0xbf9940, 0x80598c, 0xb3734d];
for (let shelf = 0; shelf < 2; shelf++) {
  const shelfY = 1.15 + shelf * 1.05;
  box(7.6, 0.09, 0.5, woodMat, 0, shelfY - 0.35, -10.3, arch);
  let x = -3.6, k = 0;
  while (x < 3.5) {
    const w = 0.22 + 0.07 * ((k * 7 + shelf * 3) % 3);
    const h = 0.62 + 0.06 * ((k * 5 + shelf) % 3);
    box(w, h, 0.34, spineCols[(k + shelf * 2) % 6], x + w / 2, shelfY + h / 2 - 0.3, -10.3, arch);
    x += w + 0.035; k++;
  }
}
// pedestal + the featured book, with a proper titled cover
box(1.2, 0.9, 1.2, stoneMat, BOOK_POS.x, 0.45, BOOK_POS.z, arch);
const book = new THREE.Group();
book.position.set(BOOK_POS.x, 1.62, BOOK_POS.z);
book.rotation.x = -0.1;
arch.add(book);
box(0.95, 1.22, 0.28, 0xeee3c7, 0, 0, -0.02, book);
const coverTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 660;
  const c = cv.getContext('2d');
  c.fillStyle = '#2f5d8a'; c.fillRect(0, 0, 512, 660);
  const g = c.createLinearGradient(0, 0, 512, 660);
  g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,20,0.18)');
  c.fillStyle = g; c.fillRect(0, 0, 512, 660);
  c.strokeStyle = '#e6c86e'; c.lineWidth = 5; c.strokeRect(26, 26, 460, 608);
  c.lineWidth = 1.5; c.strokeRect(42, 42, 428, 576);
  // steam wisps
  c.strokeStyle = 'rgba(235,245,255,0.75)'; c.lineWidth = 7; c.lineCap = 'round';
  for (const sx of [150, 256, 362]) {
    c.beginPath();
    c.moveTo(sx, 560);
    c.bezierCurveTo(sx - 26, 505, sx + 26, 470, sx, 415);
    c.bezierCurveTo(sx - 22, 368, sx + 20, 345, sx, 305);
    c.stroke();
  }
  // vertical title
  c.fillStyle = '#ffffff';
  c.font = '600 64px "Hiragino Mincho ProN","Yu Mincho",serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const title = 'あしたの湯けむり';
  let ty = 96;
  for (const ch of title) {
    if (ch === 'の') { c.font = '600 46px "Hiragino Mincho ProN","Yu Mincho",serif'; }
    c.fillText(ch, 256, ty);
    if (ch === 'の') { c.font = '600 64px "Hiragino Mincho ProN","Yu Mincho",serif'; ty += 62; }
    else ty += 72;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
})();
{
  const coverSide = new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.55 });
  const coverFace = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.55 });
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.35, 0.3),
    [coverSide, coverSide, coverSide, coverSide, coverFace, coverSide]);
  cover.position.set(0, 0, 0.02);
  cover.castShadow = true; cover.receiveShadow = true;
  book.add(cover);
  const goldBand = box(1.06, 0.16, 0.31, 0xe6b840, 0, 0.3, 0.02, book, 0.3);
  goldBand.material.metalness = 0.7;
}
// signs
const sign1 = textSprite('『あしたの湯けむり』', 128, '#ffffff', '#261a14', 0.85);
sign1.position.set(0, 2.7, -6.1); scene.add(sign1);
const sign2 = textSprite('ふぇんの書庫', 96, '#f2ebcc', '#261a14', 0.55);
sign2.position.set(0, 4.25, -8.2); scene.add(sign2);
// lamp
box(0.14, 1.9, 0.14, woodMat, 2.3, 0.95, -6.6, arch);
collide({ minX: 2.05, maxX: 2.55, minZ: -6.85, maxZ: -6.35 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0x8c8c80, roughness: 0.6 });
const lampBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), lampMat);
lampBall.position.set(2.3, 2.05, -6.6); arch.add(lampBall);
const lampLight = new THREE.PointLight(0xffcc80, 0, 7);
lampLight.position.copy(lampBall.position); arch.add(lampLight);
// stamp board
const board = new THREE.Group();
board.position.set(-3.4, 0, 6.2); board.rotation.y = 0.5;
scene.add(board);
box(0.16, 1.0, 0.16, woodMat, -0.9, 0.5, 0, board);
box(0.16, 1.0, 0.16, woodMat, 0.9, 0.5, 0, board);
box(2.4, 1.3, 0.14, woodMat, 0, 1.55, 0, board);
const boardCv = document.createElement('canvas');
boardCv.width = 512; boardCv.height = 288;
const boardTex = new THREE.CanvasTexture(boardCv);
boardTex.colorSpace = THREE.SRGBColorSpace;
const boardFace = new THREE.Mesh(
  new THREE.PlaneGeometry(2.3, 1.24),
  new THREE.MeshBasicMaterial({ map: boardTex, transparent: true }));
boardFace.position.set(0, 1.55, 0.08);
board.add(boardFace);
function drawBoard() {
  const c = boardCv.getContext('2d');
  c.clearRect(0, 0, 512, 288);
  c.font = '600 64px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  c.textAlign = 'center'; c.fillStyle = '#faf2d9';
  c.fillText('あつめた本', 256, 110);
  c.font = '600 84px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  c.fillText(`${count()} / 1`, 256, 225);
  boardTex.needsUpdate = true;
}
// floating petals / dust motes
let petalGeo, petalBase, petalPhase;
{
  const N = 130;
  petalBase = new Float32Array(N * 3);
  petalPhase = new Float32Array(N);
  const cols = new Float32Array(N * 3);
  const pink = new THREE.Color(0xffc7dd), white = new THREE.Color(0xffffff);
  for (let i = 0; i < N; i++) {
    petalBase[i * 3] = (rnd() * 2 - 1) * 15;
    petalBase[i * 3 + 1] = 0.4 + rnd() * 5.5;
    petalBase[i * 3 + 2] = (rnd() * 2 - 1) * 15;
    petalPhase[i] = rnd() * Math.PI * 2;
    const col = rnd() < 0.45 ? pink : white;
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalBase.slice(), 3));
  petalGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const points = new THREE.Points(petalGeo, new THREE.PointsMaterial({
    size: 0.14, map: tex, transparent: true, opacity: 0.75,
    vertexColors: true, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(points);
}

// ---------- player ----------
const player = new THREE.Group();
player.position.set(0, 0.1, 8);
scene.add(player);
const vel = new THREE.Vector3();
let yaw = Math.PI, onFloor = true, wasOnFloor = true;
let mixer = null, actions = {}, currentAction = null;

function playAnim(name, fade = 0.12) {
  const a = actions[name];
  if (!a || currentAction === a) return;
  if (currentAction) currentAction.fadeOut(fade);
  a.reset().fadeIn(fade).play();
  currentAction = a;
}
new GLTFLoader().load('akane.glb', (gltf) => {
  const model = gltf.scene;
  model.rotation.y = MODEL_YAW;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  player.add(model);
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  playAnim('Idle', 0);
  document.getElementById('loading').style.display = 'none';
}, undefined, (err) => {
  document.getElementById('loading').textContent = '読み込みに失敗しました';
  console.error(err);
});

function groundHeight(x, z, y) {
  let h = 0;
  if (x >= -4.5 && x <= 4.5 && z >= -10.95 && z <= -5.45) h = Math.max(h, 0.3);
  if (Math.abs(x - BOOK_POS.x) <= 0.6 && Math.abs(z - BOOK_POS.z) <= 0.6 && y >= 0.55) h = Math.max(h, 0.9);
  return h;
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; onKey(e, true); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
let stickVec = { x: 0, y: 0 }, stickJump = false;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + 80), dy = e.clientY - (r.top + 80);
  const len = Math.hypot(dx, dy);
  if (len > 52) { dx = dx / len * 52; dy = dy / len * 52; }
  knob.style.left = (48 + dx) + 'px'; knob.style.top = (48 + dy) + 'px';
  stickVec = { x: dx / 52, y: dy / 52 };
}
stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(stickId); stickMove(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId === stickId) { stickId = null; stickVec = { x: 0, y: 0 }; knob.style.left = '48px'; knob.style.top = '48px'; } };
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
const jumpBtn = document.getElementById('jumpBtn');
jumpBtn.addEventListener('pointerdown', () => { stickJump = true; });
jumpBtn.addEventListener('pointerup', () => { stickJump = false; });
jumpBtn.addEventListener('pointercancel', () => { stickJump = false; });
document.getElementById('openBtn').addEventListener('click', () => { if (!panelOpen && nearBook()) openPanel(); });

// ---------- UI / work flow ----------
const $ = (id) => document.getElementById(id);
function count() { return visited[WORK.id] ? 1 : 0; }
function nearBook() {
  return Math.hypot(player.position.x - BOOK_POS.x, player.position.z - BOOK_POS.z) < PROMPT_RANGE;
}
function refreshVisit() {
  $('hudCount').textContent = `あつめた本: ${count()} / 1`;
  drawBoard();
  if (visited[WORK.id]) {
    lampMat.emissive = new THREE.Color(1.0, 0.78, 0.42);
    lampMat.emissiveIntensity = 2.2;
    lampMat.color = new THREE.Color(1.0, 0.9, 0.65);
    lampLight.intensity = 30;
  }
}
function showToast(text) {
  const t = $('toast');
  t.textContent = text; t.style.display = 'block'; toastT = 3.5;
}
function openPanel() {
  panelOpen = true;
  $('detail').style.display = 'block';
  $('prompt').style.display = 'none';
  $('openBtn').style.display = 'none';
}
function closePanel() {
  panelOpen = false;
  $('detail').style.display = 'none';
}
$('closeDetail').addEventListener('click', closePanel);
$('openWork').addEventListener('click', () => {
  window.open(WORK.url, '_blank');
  visited[WORK.id] = true;
  try { localStorage.setItem('fengarden_visited_v2', JSON.stringify(visited)); } catch (e) {}
  $('chime').play().catch(() => {});
  refreshVisit();
  closePanel();
  showToast('『あしたの湯けむり』をひらいた。本が1冊、あつまった');
});
function onKey(e, down) {
  if (!down || e.repeat) return;
  if (panelOpen) {
    if (e.code === 'KeyX' || e.code === 'Escape') closePanel();
    else if (e.code === 'KeyZ' || e.code === 'Enter') $('openWork').click();
  } else {
    if ((e.code === 'KeyZ' || e.code === 'Enter') && nearBook()) openPanel();
    else if (e.code === 'KeyR') { player.position.set(0, 0.1, 8); vel.set(0, 0, 0); }
  }
}
// BGM starts on the first interaction (browser autoplay policy)
addEventListener('pointerdown', () => { $('bgm').play().catch(() => {}); }, { once: true });

// ---------- camera ----------
let camOffset = new THREE.Vector3(0, 6.5, 8.5);
function layout() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camOffset = camera.aspect >= 1 ? new THREE.Vector3(0, 6.5, 8.5) : new THREE.Vector3(0, 10.5, 13.5);
}
addEventListener('resize', layout);
layout();
camera.position.copy(player.position).add(camOffset);

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // ambient motion: clouds drift, petals float
  for (const cl of clouds) {
    cl.position.x += dt * 0.35;
    if (cl.position.x > 34) cl.position.x = -34;
  }
  {
    const pos = petalGeo.attributes.position;
    for (let i = 0; i < petalPhase.length; i++) {
      const ph = petalPhase[i];
      pos.array[i * 3] = petalBase[i * 3] + Math.sin(elapsed * 0.4 + ph) * 0.8;
      pos.array[i * 3 + 1] = petalBase[i * 3 + 1] + Math.sin(elapsed * 0.6 + ph * 1.7) * 0.45;
      pos.array[i * 3 + 2] = petalBase[i * 3 + 2] + Math.cos(elapsed * 0.3 + ph) * 0.8;
    }
    pos.needsUpdate = true;
  }

  // input direction
  let ix = 0, iz = 0;
  if (!panelOpen) {
    if (keys.KeyW || keys.ArrowUp) iz -= 1;
    if (keys.KeyS || keys.ArrowDown) iz += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (stickVec.x || stickVec.y) { ix = stickVec.x; iz = stickVec.y; }
  }
  const jump = !panelOpen && (keys.Space || stickJump);
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }

  // physics (same numbers as the Godot hub)
  if (!onFloor) vel.y -= GRAVITY * dt;
  else if (jump) vel.y = JUMP_V;
  if (ix || iz) {
    vel.x = ix * SPEED; vel.z = iz * SPEED;
    const targetYaw = Math.atan2(ix, iz);
    let d = targetYaw - yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    yaw += d * 0.25;
  } else {
    vel.x = THREE.MathUtils.damp(vel.x, 0, 18, dt);
    vel.z = THREE.MathUtils.damp(vel.z, 0, 18, dt);
  }
  player.position.x += vel.x * dt;
  player.position.z += vel.z * dt;
  player.position.y += vel.y * dt;
  // collisions: fence clamp + AABB push-out
  player.position.x = THREE.MathUtils.clamp(player.position.x, -14.1, 14.1);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -14.1, 14.1);
  for (const c of colliders) {
    const nx = THREE.MathUtils.clamp(player.position.x, c.minX, c.maxX);
    const nz = THREE.MathUtils.clamp(player.position.z, c.minZ, c.maxZ);
    const dx = player.position.x - nx, dz = player.position.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.16) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        player.position.x = nx + dx / d * 0.4;
        player.position.z = nz + dz / d * 0.4;
      } else {
        player.position.z = c.maxZ + 0.4;
      }
    }
  }
  const gh = groundHeight(player.position.x, player.position.z, player.position.y);
  if (player.position.y <= gh) {
    player.position.y = gh;
    vel.y = 0;
    onFloor = true;
  } else if (player.position.y > gh + 0.02) {
    onFloor = false;
  }
  if (player.position.y < -5) { player.position.set(0, 0.1, 8); vel.set(0, 0, 0); }
  player.rotation.y = yaw;

  // animation
  if (mixer) {
    if (!onFloor) { if (wasOnFloor) { currentAction && currentAction.stop(); currentAction = null; playAnim('Jump', 0.05); } }
    else if (ix || iz) playAnim('Jog_Fwd');
    else playAnim('Idle');
    mixer.update(dt);
  }
  wasOnFloor = onFloor;

  // prompt
  const near = nearBook() && !panelOpen;
  $('prompt').style.display = near && !isTouch ? 'block' : 'none';
  $('openBtn').style.display = near && isTouch ? 'block' : 'none';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.display = 'none'; }

  // camera follow
  const target = player.position.clone().add(camOffset);
  camera.position.lerp(target, 1 - Math.exp(-dt * 7.5));
  camera.lookAt(player.position.x, player.position.y + 1.0, player.position.z);

  renderer.render(scene, camera);
}
refreshVisit();
tick();

// hooks for automated verification
window.__hub = { player, actions, get visited() { return visited; }, nearBook, openPanel };
