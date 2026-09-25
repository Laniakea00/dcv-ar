// ЦОД web-AR prototype: the phone camera looks at the printed A4 or A3 mat (tools/make_board.py), tracker.js finds its ArUco
// markers and the DCV model (model/dcv_web.glb) is drawn on the 3D-printed maket that stands on the mat's outline.
// Without a camera (or on a desktop) the same model is shown in a plain 3D viewer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MarkerTracker, estimatePose, focalFromH } from './tracker.js';

const $ = s => document.querySelector(s);
const PROC = 640;            // long side of the image the tracker works on, px
const DEFAULT_FOV = 65;      // typical phone main camera, along the long side of the frame, degrees
const LOST_MS = 700;         // keep the model this long after the mat is lost

// DcvStand.cs: building-shell bbox in the glb (glTF frame) and the maket.obj bbox (metres); the fit maps one onto the other
const GLB_MIN = [74.90, 0.15, -404.63], GLB_MAX = [469.10, 30.75, -155.88];
const MAKET_MIN = [-0.09107, 0, -0.05726], MAKET_MAX = [0.09107, 0.0134, 0.05726];

const SITE = ['Грунт', 'Газон', 'Асфальт', 'Тротуар', 'Бетон площадка', 'Ограждение'];
const KINDS = [ // first match wins, the rest is shell (DcvStand.Kinds)
  ['racks', 0x4dd966, ['Стойка']],
  ['cooling', 0x3d9bff, ['CDU', 'CRAH', 'Pipes', 'Насос', 'ПТО', 'Чиллер']],
  ['power', 0xff9a2e, ['RPP', 'DRUPS', 'Трансформатор', 'КРУ', 'UPS', 'MSB', 'ГРЩ', 'Switchgear', 'Бак_топлива']],
  ['cables', 0xff4d4d, ['Cable']],
  ['structure', 0x9aa4ad, ['Фальшпол', 'Колонна', 'Контейнер', 'LED']],
];
const kindOf = name => {
  if (SITE.some(s => name.includes(s))) return ['site', 0];
  for (const [k, c, subs] of KINDS) if (subs.some(s => name.includes(s))) return [k, c];
  return ['shell', 0];
};

// ------------------------------------------------------------------ settings (per phone)
const DEF = { dx: 0, dz: 0, dy: 0, rot: 0, scale: 100, fov: 0, showBoard: false, debug: false };
const KEY = 'dcvAr.calib.v1';
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* private mode */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

// ------------------------------------------------------------------ three.js scene
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const anchor = new THREE.Group();          // = the mat / maket frame (glTF frame, metres, Y up)
anchor.matrixAutoUpdate = false;
scene.add(anchor);
const calib = new THREE.Group();           // user fine-tuning
anchor.add(calib);
const fit = new THREE.Group();             // glb -> maket
calib.add(fit);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-0.3, 0.8, 0.5);
anchor.add(sun, sun.target);
anchor.add(new THREE.HemisphereLight(0xdfeaff, 0x404040, 0.5));

{
  const s = MAKET_MAX.map((v, i) => (v - MAKET_MIN[i]) / (GLB_MAX[i] - GLB_MIN[i]));
  fit.scale.set(...s);
  fit.position.set(...MAKET_MIN.map((v, i) => v - GLB_MIN[i] * s[i]));
}

const arCam = new THREE.Camera();          // AR: fixed at the origin, projection from the phone camera intrinsics
const viewCam = new THREE.PerspectiveCamera(40, 1, 0.005, 20); // 3D mode
viewCam.position.set(0.22, 0.28, 0.42);
let controls = null;
let mode = null;                           // 'ar' | '3d'

// ------------------------------------------------------------------ model
const parts = [];                          // {mesh, kind, color, mat0}
let model = null;
const loadFill = $('#loadFill'), loadText = $('#loadText');
const modelReady = new Promise((resolve, reject) => {
  new GLTFLoader().load('model/dcv_web.glb', gltf => {
    model = gltf.scene;
    model.traverse(o => {
      if (!o.isMesh) return;
      const name = o.name + ' ' + (o.parent ? o.parent.name : '');
      const [kind, color] = kindOf(name);
      o.material = o.material.clone();
      parts.push({ mesh: o, kind, color, mat0: { opacity: o.material.opacity, transparent: o.material.transparent,
        depthWrite: o.material.depthWrite, emissive: o.material.emissive ? o.material.emissive.clone() : null,
        emissiveIntensity: o.material.emissiveIntensity } });
    });
    fit.add(model);
    loadFill.style.width = '100%';
    loadText.textContent = 'Модель загружена';
    resolve();
  }, e => {
    if (e.total) { loadFill.style.width = (100 * e.loaded / e.total).toFixed(0) + '%'; loadText.textContent = `Загрузка модели… ${(e.loaded / 1e6).toFixed(1)} / ${(e.total / 1e6).toFixed(1)} МБ`; }
  }, err => { loadText.textContent = 'Не удалось загрузить модель'; reject(err); });
});

const toggles = { site: true, xray: false };
function applyLook() {
  for (const p of parts) {
    const m = p.mesh.material;
    p.mesh.visible = p.kind !== 'site' || toggles.site;
    const x = toggles.xray;
    if (p.kind === 'shell' || p.kind === 'site') {
      m.transparent = x ? true : p.mat0.transparent;
      m.opacity = x ? (p.kind === 'site' ? 0.35 : 0.1) : p.mat0.opacity;
      m.depthWrite = x ? false : p.mat0.depthWrite;
    } else if (m.emissive && p.color) {
      if (x) { m.emissive.setHex(p.color); m.emissiveIntensity = 0.35; } else { m.emissive.copy(p.mat0.emissive); m.emissiveIntensity = p.mat0.emissiveIntensity; }
    }
    m.needsUpdate = true;
  }
}

// mat outline (to check the fit)
const boardLines = new Map(); // board name -> LineSegments
function buildBoardLines(board) {
  const pts = [], y = 0.0005, hw = board.sheet.w / 2, hh = board.sheet.h / 2;
  const quad = c => { for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; pts.push(a[0], y, a[1], b[0], y, b[1]); } };
  quad([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]);
  for (const m of board.markers) quad(m.corners.map(c => [c[0], c[2]]));
  const p = board.print; quad([[p.min[0], p.min[2]], [p.max[0], p.min[2]], [p.max[0], p.max[2]], [p.min[0], p.max[2]]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x36c2a8, depthTest: false }));
  l.renderOrder = 10;
  l.visible = false;
  boardLines.set(board.name, l);
  anchor.add(l);
}

function applyCalib() {
  calib.position.set(S.dx / 1000, S.dy / 1000, S.dz / 1000);
  calib.rotation.set(0, THREE.MathUtils.degToRad(S.rot), 0);
  calib.scale.setScalar(S.scale / 100);
  for (const [n, l] of boardLines) l.visible = S.showBoard && n === (board ? board.name : 'A4');
  dbg.style.display = S.debug ? 'block' : 'none';
}

// ------------------------------------------------------------------ AR
const video = $('#cam'), dbg = $('#dbg'), dctx = dbg.getContext('2d');
const proc = document.createElement('canvas'), pctx = proc.getContext('2d', { willReadFrequently: true });
let boards, board = null, tracker, gray = null;   // board = the mat seen last
let vw = 0, vh = 0, pw = 0, ph = 0, sp = 1;       // video size, processing size, processing scale
const focalSamples = [];                          // auto focal, processing px
let pose = null, lastSeen = 0, filtered = null;   // filtered = {p: Vector3, q: Quaternion}
let frames = 0, fps = 0, fpsT = performance.now(), detMs = 0, lastDets = [], lastErr = 0;

function focalProc() {
  if (S.fov > 0) return (Math.max(pw, ph) / 2) / Math.tan(THREE.MathUtils.degToRad(S.fov) / 2);
  if (focalSamples.length >= 8) { const s = [...focalSamples].sort((a, b) => a - b); return s[s.length >> 1]; }
  return (Math.max(pw, ph) / 2) / Math.tan(THREE.MathUtils.degToRad(DEFAULT_FOV) / 2);
}
const fovOf = f => 2 * THREE.MathUtils.radToDeg(Math.atan((Math.max(pw, ph) / 2) / f));

function layout() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  dbg.width = W * devicePixelRatio; dbg.height = H * devicePixelRatio;
  viewCam.aspect = W / H;
  viewCam.fov = W < H ? Math.min(75, 44 / viewCam.aspect) : 40; // portrait phone: keep the whole site in view
  viewCam.updateProjectionMatrix();
}
addEventListener('resize', layout);

// screen mapping of the video (object-fit: cover)
function screenMap() {
  const W = innerWidth, H = innerHeight, sc = Math.max(W / vw, H / vh);
  return { W, H, sc, ox: (W - vw * sc) / 2, oy: (H - vh * sc) / 2 };
}

function updateProjection() {
  const { W, H, sc } = screenMap();
  const f = focalProc() / sp * sc, n = 0.02, fa = 5; // f in CSS px; principal point = centre
  arCam.projectionMatrix.set(
    2 * f / W, 0, 0, 0,
    0, 2 * f / H, 0, 0,
    0, 0, -(fa + n) / (fa - n), -2 * fa * n / (fa - n),
    0, 0, -1, 0);
  arCam.projectionMatrixInverse.copy(arCam.projectionMatrix).invert();
}

function track() {
  if (video.readyState < 2 || !video.videoWidth) return;
  if (video.videoWidth !== vw || video.videoHeight !== vh) {
    vw = video.videoWidth; vh = video.videoHeight;
    sp = PROC / Math.max(vw, vh);
    pw = Math.round(vw * sp); ph = Math.round(vh * sp);
    proc.width = pw; proc.height = ph;
    gray = new Uint8Array(pw * ph);
    focalSamples.length = 0;
  }
  const t0 = performance.now();
  pctx.drawImage(video, 0, 0, pw, ph);
  const rgba = pctx.getImageData(0, 0, pw, ph).data;
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  const dets = tracker.detect(gray, pw, ph);
  lastDets = dets;
  const K = { f: focalProc(), cx: pw / 2, cy: ph / 2 };
  // the mat with most markers in view (A4 and A3 use different ids)
  let p = null;
  if (dets.length) {
    let best = null, nb = 0;
    for (const b of boards) { const n = dets.filter(d => b.markers.some(m => m.id === d.id)).length; if (n > nb) { nb = n; best = b; } }
    if (best !== board) { board = best; pose = null; applyCalib(); }
    p = estimatePose(dets, board, K, pose);
  }
  detMs = detMs * 0.9 + (performance.now() - t0) * 0.1;
  if (p && p.err < 4) {
    pose = p; lastSeen = performance.now(); lastErr = p.err;
    // auto focal: only from clearly tilted views with several markers
    const tilt = Math.acos(Math.min(1, Math.abs(p.R[2][1]))) * 180 / Math.PI;
    if (S.fov === 0 && dets.length >= 3 && tilt > 25 && tilt < 75) {
      const fe = focalFromH(p.H, pw / 2, ph / 2);
      if (fe && fe.f > 0.4 * Math.max(pw, ph) && fe.f < 3 * Math.max(pw, ph)) {
        focalSamples.push(fe.f); if (focalSamples.length > 60) focalSamples.shift();
      }
    }
    // board -> three camera: flip OpenCV (y down, z forward) to three (y up, z back)
    const R = p.R, t = p.t, M = new THREE.Matrix4().set(
      R[0][0], R[0][1], R[0][2], t[0],
      -R[1][0], -R[1][1], -R[1][2], -t[1],
      -R[2][0], -R[2][1], -R[2][2], -t[2],
      0, 0, 0, 1);
    const np = new THREE.Vector3(), nq = new THREE.Quaternion(), ns = new THREE.Vector3();
    M.decompose(np, nq, ns);
    if (!filtered) filtered = { p: np.clone(), q: nq.clone() };
    else {
      const jump = filtered.p.distanceTo(np) > 0.03 || filtered.q.angleTo(nq) > 0.1;
      const a = jump ? 1 : 0.45;
      filtered.p.lerp(np, a); filtered.q.slerp(nq, a);
    }
  }
}

function drawDebug() {
  dctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  dctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!S.debug || mode !== 'ar' || !vw) return;
  const { sc, ox, oy } = screenMap(), P = c => [c[0] / sp * sc + ox, c[1] / sp * sc + oy];
  dctx.lineWidth = 2; dctx.font = '14px system-ui';
  for (const d of lastDets) {
    const c = d.corners.map(P);
    dctx.strokeStyle = '#36c2a8'; dctx.beginPath(); c.forEach((q, i) => (i ? dctx.lineTo(...q) : dctx.moveTo(...q))); dctx.closePath(); dctx.stroke();
    dctx.fillStyle = '#ff4d4d'; dctx.fillRect(c[0][0] - 3, c[0][1] - 3, 6, 6);
    dctx.fillStyle = '#fff'; dctx.fillText('id ' + d.id, c[0][0] + 6, c[0][1] - 6);
  }
}

const statusEl = $('#status');
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  frames++;
  if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  if (mode === 'ar') {
    track();
    updateProjection();
    const seen = filtered && now - lastSeen < LOST_MS;
    anchor.visible = !!seen;
    if (seen) {
      anchor.matrix.compose(filtered.p, filtered.q, new THREE.Vector3(1, 1, 1));
      anchor.matrixWorldNeedsUpdate = true;
      scene.environmentRotation.setFromQuaternion(filtered.q);
    }
    statusEl.textContent = !vw ? 'Запуск камеры…'
      : now - lastSeen < LOST_MS ? `${board.name} · метки: ${lastDets.length} из ${board.markers.length} · ${fps.toFixed(0)} к/с`
        : 'Наведите камеру на коврик с макетом';
    $('#stats').textContent = `трекинг ${detMs.toFixed(0)} мс · ошибка ${lastErr.toFixed(2)} пикс · ${pw}×${ph}`;
    $('#fovNow').textContent = vw ? `${fovOf(focalProc()).toFixed(1)}° ${S.fov > 0 ? '(вручную)' : focalSamples.length >= 8 ? '(авто)' : '(по умолчанию)'}` : '—';
    drawDebug();
    renderer.render(scene, arCam);
  } else if (mode === '3d') {
    controls.update();
    renderer.render(scene, viewCam);
  }
}

async function startAR() {
  $('#startErr').textContent = '';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    $('#startErr').textContent = 'Камера доступна только по HTTPS. Откройте страницу по https:// ссылке.';
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    $('#startErr').textContent = 'Нет доступа к камере: ' + (e.message || e.name) + '. Можно смотреть в 3D без камеры.';
    return;
  }
  video.srcObject = stream;
  video.style.display = 'block';
  try { await video.play(); } catch (e) { /* autoplay muted — plays anyway */ }
  mode = 'ar';
  enterHud();
}

function start3D() {
  mode = '3d';
  anchor.matrix.identity(); anchor.visible = true;
  scene.environmentRotation.set(0, 0, 0);
  scene.background = new THREE.Color(0x0e141b);
  controls = new OrbitControls(viewCam, canvas);
  controls.target.set(0, 0.01, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.08; controls.maxDistance = 2;
  enterHud();
}

function enterHud() {
  $('#start').hidden = true;
  $('#hud').hidden = false;
  statusEl.hidden = mode !== 'ar';
}

// ------------------------------------------------------------------ UI
function initUI() {
  $('#btnAr').onclick = startAR;
  $('#btn3d').onclick = start3D;
  for (const b of document.querySelectorAll('#bar button')) b.onclick = () => {
    const t = b.dataset.t;
    if (t === 'settings') { $('#settings').hidden = !$('#settings').hidden; return; }
    toggles[t] = !toggles[t]; b.classList.toggle('on', toggles[t]); applyLook();
  };
  $('#close').onclick = () => { $('#settings').hidden = true; };
  const inputs = document.querySelectorAll('#settings input');
  const show = () => inputs.forEach(i => {
    if (i.type === 'checkbox') i.checked = !!S[i.dataset.k];
    else { i.value = S[i.dataset.k]; i.parentElement.querySelector('output').textContent = S[i.dataset.k] === 0 && i.dataset.k === 'fov' ? 'авто' : S[i.dataset.k]; }
  });
  inputs.forEach(i => i.oninput = () => {
    S[i.dataset.k] = i.type === 'checkbox' ? i.checked : parseFloat(i.value);
    if (i.dataset.k === 'fov' && S.fov > 0 && S.fov < 30) S.fov = 30;
    save(); show(); applyCalib();
  });
  $('#reset').onclick = () => { S = { ...DEF }; save(); show(); applyCalib(); focalSamples.length = 0; };
  show();
}

async function main() {
  layout();
  initUI();
  applyCalib();
  $('#btnAr').disabled = $('#btn3d').disabled = true;
  boards = await (await fetch('boards.json')).json();
  tracker = new MarkerTracker({ bits: boards[0].bits, markers: boards.flatMap(b => b.markers) });
  boards.forEach(buildBoardLines);
  applyCalib();
  loop();
  try { await modelReady; } catch (e) { $('#startErr').textContent = 'Ошибка загрузки модели.'; return; }
  applyLook();
  $('#btnAr').disabled = $('#btn3d').disabled = false;
  // ?mode=3d / ?mode=ar for kiosks and tests
  const m = new URLSearchParams(location.search).get('mode');
  if (m === '3d') start3D(); else if (m === 'ar') startAR();
}
main();

// for debugging from the console / tests
window.__ar = { get pose() { return pose; }, get dets() { return lastDets; }, get fps() { return fps; }, S, focalProc: () => focalProc(), fovOf: f => fovOf(f) };
