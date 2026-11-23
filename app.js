import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Fen's archive garden, Three.js edition: same layout/logic as the Godot
// hub, rebuilt as a plain web page. Works live on the Web; each work is a
// book here, and "open" launches it in a new tab.

const WORK = {
  id: 'tsunagaru',
  url: 'https://muse.ai/s/make-serusu-cs-rutogemu-os6xb2gxlxaxtxdo/2Mkm0NI3kPzRvkVxHGWBD7kD_76Hd_Cn0GUXOa_-V_g',
};
const BOOK_POS = new THREE.Vector3(0, 0, -7.6);
const PROMPT_RANGE = 2.6;
const SPEED = 6.0, JUMP_V = 8.5, GRAVITY = 20.0;
const MODEL_YAW = 0; // Godot's glTF export already puts her facing in glTF convention

// ---------- state ----------
let visited = {};
try { visited = JSON.parse(localStorage.getItem('fengarden_visited_v1') || '{}'); } catch (e) { visited = {}; }
let panelOpen = false;
let toastT = 0;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0.55, 0.75, 0.95);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);

const amb = new THREE.AmbientLight(new THREE.Color(0.6, 0.65, 0.75), 1.4);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 60;
scene.add(sun);

// ---------- helpers ----------
function mat(color, rough = 0.9, metal = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metallic: metal });
}
function box(w, h, d, color, x, y, z, parent = scene, rough = 0.9) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
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
const colliders = []; // {minX,maxX,minZ,maxZ} AABBs for circle push-out
function collide(aabb) { colliders.push(aabb); }

box(30, 1, 30, 0x528f4d, 0, -0.5, 0); // grass
const stone = 0x9e998c;
for (let i = 0; i < 7; i++) box(2.0, 0.05, 1.7, stone, 0, 0.025, 6.5 - i * 2.0);
// fence
const wood = 0x735233, darkWood = 0x594026, leaf = 0x387038, leaf2 = 0x478547;
for (let side = 0; side < 4; side++) {
  const rot = side * Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
  const place = (lx, lz) => [lx * c + lz * s, -lx * s + lz * c];
  for (let i = 0; i < 9; i++) {
    const [x, z] = place(-14 + i * 3.5, -14.6);
    box(0.18, 1.1, 0.18, wood, x, 0.55, z);
  }
  const [rx, rz] = place(0, -14.6);
  for (const ry of [0.85, 0.4]) {
    const rail = box(29, 0.12, 0.1, wood, rx, ry, rz);
    rail.rotation.y = rot;
  }
}
// trees
const treeSpots = [[-6, -2], [6, -3], [-9, 3], [9, 4], [-10, -8], [10, -9], [5, 10], [-7, 10]];
treeSpots.forEach(([x, z], i) => {
  box(0.35, 1.6, 0.35, darkWood, x, 0.8, z);
  sphere(1.5, i % 2 ? leaf2 : leaf, x, 2.4, z);
  sphere(1.0, i % 2 ? leaf : leaf2, x + 0.8, 1.8, z + 0.3);
  colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
});
// flowers
const flowerCols = [0xf28ca6, 0xfad94d, 0xf2f2f2, 0xbf99f2];
const flowerSpots = [[-2.5, 4], [2.8, 2], [-3.4, -3], [3.6, -4.5], [-5, 7], [5.5, 8], [-2.2, -5.5], [2.4, -5.8], [-8, -4], [8, 0], [-4.5, 0.5], [4.2, 6]];
flowerSpots.forEach(([x, z], i) => sphere(0.11, flowerCols[i % 4], x, 0.14, z));

// archive
const arch = new THREE.Group(); scene.add(arch);
box(9, 0.3, 5.5, stone, 0, 0.15, -8.2, arch);
box(9, 3.6, 0.4, wood, 0, 1.8, -10.6, arch);
box(0.5, 3.4, 0.5, darkWood, -4.2, 1.7, -6.2, arch);
box(0.5, 3.4, 0.5, darkWood, 4.2, 1.7, -6.2, arch);
box(9.6, 0.3, 6.0, darkWood, 0, 3.55, -8.2, arch);
collide({ minX: -4.5, maxX: 4.5, minZ: -10.85, maxZ: -10.35 });
collide({ minX: -4.45, maxX: -3.95, minZ: -6.45, maxZ: -5.95 });
collide({ minX: 3.95, maxX: 4.45, minZ: -6.45, maxZ: -5.95 });
const spineCols = [0x994040, 0x406699, 0x4d8c59, 0xbf9940, 0x80598c, 0xb3734d];
for (let shelf = 0; shelf < 2; shelf++) {
  const shelfY = 1.15 + shelf * 1.05;
  box(7.6, 0.09, 0.5, darkWood, 0, shelfY - 0.35, -10.3, arch);
  let x = -3.6, k = 0;
  while (x < 3.5) {
    const w = 0.22 + 0.07 * ((k * 7 + shelf * 3) % 3);
    const h = 0.62 + 0.06 * ((k * 5 + shelf) % 3);
    box(w, h, 0.34, spineCols[(k + shelf * 2) % 6], x + w / 2, shelfY + h / 2 - 0.3, -10.3, arch);
    x += w + 0.035; k++;
  }
}
// pedestal + book
box(1.2, 0.9, 1.2, stone, BOOK_POS.x, 0.45, BOOK_POS.z, arch);
const book = new THREE.Group();
book.position.set(BOOK_POS.x, 1.62, BOOK_POS.z);
book.rotation.x = -0.1;
arch.add(book);
box(0.95, 1.22, 0.28, 0xeee3c7, 0, 0, -0.02, book);
box(1.05, 1.35, 0.3, 0x8c2933, 0, 0, 0.02, book, 0.6);
const goldBand = box(1.06, 0.16, 0.31, 0xe6b840, 0, 0.3, 0.02, book, 0.3);
goldBand.material.metalness = 0.7;
// signs
const sign1 = textSprite('『つながる、工場。』', 128, '#ffffff', '#261a14', 0.85);
sign1.position.set(0, 2.7, -6.1); scene.add(sign1);
const sign2 = textSprite('ふぇんの書庫', 96, '#f2ebcc', '#261a14', 0.55);
sign2.position.set(0, 4.25, -8.2); scene.add(sign2);
// lamp
box(0.14, 1.9, 0.14, darkWood, 2.3, 0.95, -6.6, arch);
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
box(0.16, 1.0, 0.16, darkWood, -0.9, 0.5, 0, board);
box(0.16, 1.0, 0.16, darkWood, 0.9, 0.5, 0, board);
box(2.4, 1.3, 0.14, wood, 0, 1.55, 0, board);
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
function count() { return Object.keys(visited).length; }
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
  try { localStorage.setItem('fengarden_visited_v1', JSON.stringify(visited)); } catch (e) {}
  $('chime').play().catch(() => {});
  refreshVisit();
  closePanel();
  showToast('『つながる、工場。』をひらいた。本が1冊、あつまった');
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
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

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
