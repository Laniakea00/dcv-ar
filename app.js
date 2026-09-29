// Долина ЦОД · 50 МВт — web-AR. The phone camera looks at the printed A4 or A3 mat (tools/make_board.py), tracker.js finds
// its ArUco markers and the COD_AR_Hologram model of the Unity app (model/hologram_web.glb, exported from Unity with
// PumpAR > Web > Export hologram for web, compressed by tools/make_hologram_glb.mjs) stands on the mat as a hologram.
// The layers of the Unity app are ported: Макет / Серверы / Энергия / Охлаждение / Сеть / Защита / Все системы lift the
// installed equipment out of the opened buildings (MaketLayerMotion + MaketArchitectureReveal), with hall decks, captions,
// the project summary card (QtwinModelSummary) and the equipment inspector (inspect.js: MaketHologramInspector —
// the unit rises and turns to the viewer, comes apart; NVL72: a compute tray slides out and opens).
// Without a camera (or on a desktop) the same scene is a plain 3D viewer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MarkerTracker, estimatePose, focalFromH } from './tracker.js';
import { Inspector } from './inspect.js';
import { StoryPlayer, STORIES, LAYER_STORIES, SHOW } from './story.js';
import { Campus } from './campus.js';
import { Build4D } from './build4d.js';

const $ = s => document.querySelector(s);
const PROC = 640;            // long side of the image the tracker works on, px
const DEFAULT_FOV = 65;      // typical phone main camera, along the long side of the frame, degrees
const LOST_MS = 700;         // keep the model this long after the mat is lost
const MODEL = 'model/hologram_web.glb', META = 'model/hologram_web.json';
const clean = n => THREE.PropertyBinding.sanitizeNodeName(n || '');

// ------------------------------------------------------------------ layers (MaketDirector / MaketLayerMotion)
const MODES = [
  ['overview', 'Макет'], ['compute', 'Серверы'], ['power', 'Энергия'], ['cooling', 'Охлаждение'],
  ['network', 'Сеть'], ['continuity', 'Защита'], ['construction', 'Все системы'], ['campus', 'Кампус'],
];
const LAYER = {
  compute: ['Rack', 'StandardRack'], power: ['DRUPS', 'Transformer', 'Switchgear'],
  cooling: ['CDU', 'DryCooler', 'CRAH', 'Chiller'], network: ['Network'], continuity: ['Fire', 'Operations'],
};
const inLayer = (kind, mode) => mode === 'construction' || !!LAYER[mode]?.includes(kind);
const SUMMARY = { // QtwinModelSummary
  overview: ['Долина ЦОД', '50 МВт', 'Проектная очередь · выберите систему'],
  compute: ['Серверы · центральный корпус', '608 стоек', '308 AI + 300 обычных · расчёт'],
  cooling: ['Охлаждение · два уровня', '260 единиц оборудования', '66 CDU · 78 CRAH · 36 охладителей\n80 чиллеров · расчётная комплектация'],
  power: ['Два энергоблока', '24 DRUPS · линии A / B / C / D', 'Количество по схеме проекта'],
  network: ['Сеть', 'Два направления связи', '14 шкафов · принятая компоновка'],
  continuity: ['Безопасность', '6 зон защиты', 'По одной на каждый серверный зал'],
  construction: ['Все системы', '978 единиц оборудования', 'Расчётная очередь 50 МВт'],
  campus: ['Кампус · по макету', '50 МВт', '10 модулей × 50 МВт + 2 полумодуля · раскладка нового макета'],
  '4d': ['4D · строительство', 'Месяц 1 из 24', 'Схема последовательности · не график работ'],
};
const TINT = { power: new THREE.Color(0.9, 0.66, 0.31), cooling: new THREE.Color(0.30, 0.68, 1) }, TINT0 = new THREE.Color(0.34, 0.84, 0.93);
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = t => Math.min(1, Math.max(0, t));
const smoothstep = (a, b, t) => { t = clamp01(t); return a + (b - a) * t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ settings (per phone)
const DEF = { dx: 0, dz: 0, dy: 0, rot: 0, scale: 100, lift: 100, fov: 0, shadows: true, showBoard: false, debug: false };
const KEY = 'dcvAr.hologram.v1';
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* private mode */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

// ------------------------------------------------------------------ three.js scene
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;       // «4D · строительство»: the rising cut
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const anchor = new THREE.Group();          // = the mat frame (glTF frame, metres, Y up, +Z to the mat's FRONT edge)
anchor.matrixAutoUpdate = false;
scene.add(anchor);
const calib = new THREE.Group();           // user fine-tuning
anchor.add(calib);
const fit = new THREE.Group();             // model (sourceFrame, metres of the site) -> mat
calib.add(fit);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);   // "Maket daylight"
sun.position.set(-0.25, 0.6, 0.35);
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.25, right: 0.25, top: 0.25, bottom: -0.25, near: 0.05, far: 1.5 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002;
anchor.add(sun, sun.target);
anchor.add(new THREE.HemisphereLight(0xe4efff, 0x3a4048, 0.8));

let meta = null;                           // model/hologram_web.json
let modelWidth = 0.3328;                   // MaketDirector.printWidth; A4 mat: fitted to the sheet
const moduleFit = { pos: new THREE.Vector3(), scale: 1 }, IDQ = new THREE.Quaternion();
// fit = the module on the print, or (Кампус) the whole campus across the mat, blended while the view changes
function blendFit() {
  const k = campus ? campus.f * campus.f * (3 - 2 * campus.f) : 0;
  if (k <= 0) { fit.position.copy(moduleFit.pos); fit.quaternion.identity(); fit.scale.setScalar(moduleFit.scale); return; }
  const cf = board && mode === 'ar' ? campus.fitFor(board.sheet.w * 0.95, board.sheet.h * 0.95) : campus.fitFor(0.4, 0.34);
  fit.position.lerpVectors(moduleFit.pos, cf.pos, k); fit.quaternion.slerpQuaternions(IDQ, cf.quat, k);
  fit.scale.setScalar(THREE.MathUtils.lerp(moduleFit.scale, cf.scale, k));
}
function applyFit() {
  if (!meta) return;
  const s = modelWidth / meta.site.size[0];
  // MaketDirector.FitModel: the site centre (x, z) and the bottom of the site go to the mat origin
  moduleFit.scale = s; moduleFit.pos.set(-meta.site.center[0] * s, -meta.site.min[1] * s, -meta.site.center[2] * s);
  blendFit();
}

const arCam = new THREE.Camera();          // AR: fixed at the origin, projection from the phone camera intrinsics
const viewCam = new THREE.PerspectiveCamera(38, 1, 0.005, 20); // 3D mode
let controls = null;
let mode = null;                           // 'ar' | '3d'

// ------------------------------------------------------------------ model
const loadFill = $('#loadFill'), loadText = $('#loadText');
const eq = [];            // installed equipment: {name, kind, room, floor, sub, base, pos, y, start, end, delay, amount, parts: [{im, i}]}
const eqByName = new Map();
const groups = [];        // InstancedMesh per (geometry, material), with its kind
const shell = [];         // {mesh, orig, relevant(name)}
const roofs = [];         // {obj, home, k (parent scale)}
const context = [];       // floor slabs etc. in the equipment root (Unity: only in "Все системы")
let interior = null;      // "50 MW installed equipment — single source"
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.13, depthWrite: false,
  roughness: 0.3, metalness: 0, emissive: 0x5fb7cc, emissiveIntensity: 0.25, side: THREE.DoubleSide });

const modelReady = (async () => {
  meta = await (await fetch(META)).json();
  applyFit();
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(MODEL, resolve, e => {
    if (e.total) { loadFill.style.width = (100 * e.loaded / e.total).toFixed(0) + '%'; loadText.textContent = `Загрузка модели… ${(e.loaded / 1e6).toFixed(1)} / ${(e.total / 1e6).toFixed(1)} МБ`; }
  }, reject));
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const nodeInfo = new Map(Object.entries(meta.nodes).map(([n, v]) => [clean(n), v]));
  const shellNames = new Set(meta.shell.map(clean)), roofNames = new Set(meta.roofs.map(clean));
  const sym = clean(' · симметрия');
  const base = n => n.endsWith(sym) ? n.slice(0, -sym.length) : n;
  interior = model.getObjectByName(clean('50 MW installed equipment — single source'));

  // equipment -> instanced batches (Unity draws them with DrawMeshInstanced too)
  const batch = new Map();
  const equipmentObjs = [];
  model.traverse(o => { if (nodeInfo.has(o.name) && !eqByName.has(o.name)) { eqByName.set(o.name, null); equipmentObjs.push(o); } });
  for (const o of equipmentObjs) {
    const [k, room, floor, reserve, ...trs] = nodeInfo.get(o.name);
    const e = { name: o.name, kind: meta.kinds[k], room, floor, reserve: !!reserve, trs, hidden: false, sub: o.name.startsWith('SUB-TX-'), parts: [],
      pos: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), y: 0, start: 0, end: 0, delay: 0, amount: 0, radius: 2 };
    const box = new THREE.Box3().setFromObject(o); e.radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 2; e.height = box.max.y - box.min.y;
    const meshes = []; o.traverse(m => { if (m.isMesh) meshes.push(m); });
    for (const m of meshes) {
      const key = m.geometry.uuid + '|' + m.material.uuid;
      let b = batch.get(key);
      if (!b) { b = { geometry: m.geometry, material: m.material, kind: e.kind, list: [] }; batch.set(key, b); }
      b.list.push({ e, matrix: m.matrixWorld.clone() });
      m.visible = false;
    }
    eq.push(e); eqByName.set(o.name, e);
  }
  for (const b of batch.values()) {
    const mat = b.material.clone();
    const im = new THREE.InstancedMesh(b.geometry, mat, b.list.length);
    im.frustumCulled = false; im.castShadow = im.receiveShadow = true;
    im.userData = { kind: b.kind, base: b.list.map(x => x.matrix), owners: b.list.map(x => x.e), vis: new Array(b.list.length),
      em0: mat.emissive ? mat.emissive.clone() : null, ei0: mat.emissiveIntensity ?? 1 };
    b.list.forEach((x, i) => x.e.parts.push({ im, i }));
    groups.push(im); model.add(im);
  }
  for (const o of equipmentObjs) o.removeFromParent();

  // shell parts (turn into an x-ray ghost when a layer opens) and roof sections (lift by 10 m): MaketArchitectureReveal
  const isShell = n => shellNames.has(base(n)) || roofNames.has(base(n));
  const seen = new Set();
  model.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || seen.has(o)) return;
    o.castShadow = o.receiveShadow = true;
    const n = isShell(o.name) ? o.name : o.parent && isShell(o.parent.name) ? o.parent.name : null;
    if (n) { shell.push({ mesh: o, orig: o.material, name: base(n) }); seen.add(o); }
  });
  const roofNodes = [];
  model.traverse(o => { if (roofNames.has(base(o.name)) && !roofNodes.some(r => r.getObjectById(o.id))) roofNodes.push(o); });
  for (const o of roofNodes) roofs.push({ obj: o, name: base(o.name), home: o.position.y, k: o.parent.getWorldScale(new THREE.Vector3()).y });
  if (interior) context.push(...interior.children); // floor slabs: what is left in the equipment root

  buildStages();
  fit.add(model);
  loadFill.style.width = '100%';
  loadText.textContent = 'Модель загружена';
})();

// hall decks, outlines and captions (MaketLayerMotion.AddStage), in the glb frame (x = -Unity x)
const stages = [];
const labelsEl = $('#labels');
function buildStages() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0x55c0f2, transparent: true, opacity: 0.8, depthWrite: false });
  const quietMat = new THREE.LineBasicMaterial({ color: 0x4d91a8, transparent: true, opacity: 0.35, depthWrite: false });
  const scanMat = new THREE.LineBasicMaterial({ color: 0x7de8ff, transparent: true, opacity: 0.95, depthWrite: false });
  const deckMat = new THREE.MeshBasicMaterial({ color: 0x5fd0ee, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const add = (cx, cy, cz, sx, sz, stageMode, room, title, floor = 0) => {
    const root = new THREE.Group(); root.visible = false;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), deckMat); deck.position.set(cx, -0.3, cz); root.add(deck);
    const c = [[cx - sx / 2, cz - sz / 2], [cx + sx / 2, cz - sz / 2], [cx + sx / 2, cz + sz / 2], [cx - sx / 2, cz + sz / 2]];
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map(([x, z]) => new THREE.Vector3(x, 0, z))), lineMat);
    root.add(outline);
    const scan = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c[0][0], 0.4, 0), new THREE.Vector3(c[1][0], 0.4, 0)]), scanMat);
    root.add(scan);
    const tetherGeo = new THREE.BufferGeometry(); tetherGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24), 3));
    const tethers = new THREE.LineSegments(tetherGeo, quietMat); tethers.frustumCulled = false; tethers.visible = false;
    const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = title; tag.style.opacity = 0; labelsEl.appendChild(tag);
    const members = eq.filter(e => stageMode === 'power'
      ? inLayer(e.kind, 'power') && !e.sub && Math.abs(e.pos.z - cz) < 32
      : e.room === room && inLayer(e.kind, stageMode) && e.floor === floor);
    const s = { root, scan, tethers, tag, corners: c, home: cy, mode: stageMode, room, members, amount: 0, cz, sz, label: new THREE.Vector3(cx, 3, cz + sz / 2 + 3) };
    stages.push(s);
    return s;
  };
  meta.rooms.forEach((r, h) => {
    const x = r.center[0], n = String(h + 1).padStart(2, '0');
    add(x, 7, 18, 60, 77, 'compute', h, `ЗАЛ ${n}`);
    add(x, 7, 18, 60, 77, 'cooling', h, `ЗАЛ ${n} · CDU / CRAH`, 0);
    add(x, 24.6, 18, 60, 77, 'cooling', h, `ЭТАЖ 2 · ТЕПЛООТВОД ${n}`, 1);
  });
  add(-53, 5.2, 146, 397, 55, 'power', -1, 'Энергоблок A / B');
  add(-53, 5.2, -119.6, 397, 55, 'power', -1, 'Энергоблок C / D');
}
function attachStages(model) { for (const s of stages) { model.add(s.root); model.add(s.tethers); } }

// ------------------------------------------------------------------ layer state machine
let layer = 'overview', phase = 99, reveal = 0, clock = 0;
function liftOf(e) {
  const h = S.lift / 100;
  if (layer === 'construction') return (e.kind === 'Rack' || e.kind === 'StandardRack' ? 66 : e.floor === 1 ? 123 : inLayer(e.kind, 'power') ? 50 : 85) * h;
  return (layer === 'cooling' ? 88 : layer === 'power' ? 76 : 96) * h;
}
const duration = e => (e.end > 0.1 ? 1.85 : 1.25);
function setLayer(m) {
  const was = layer;
  layer = m; phase = 0; if (inspector) inspector.close();
  // 4D: the camera comes a bit closer to the building site, and goes back after
  if (mode === '3d' && controls && m !== 'campus') { if (m === '4d') camCampus = 0.4 * THREE.MathUtils.clamp(0.6 / viewCam.aspect, 1, 1.35); else if (was === '4d') camCampus = 0.515; }
  for (const e of eq) {
    const active = inLayer(e.kind, m);
    e.start = e.y; e.end = active ? liftOf(e) : 0;
    e.delay = active ? 0.25 + Math.max(0, e.room) * 0.065 + clamp01((e.pos.z + 24) / 82) * 0.2 : 0;
  }
  const [t, v, n] = SUMMARY[m];
  $('#sumTitle').textContent = t; $('#sumValue').textContent = v; $('#sumNote').textContent = n;
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.m === m);
  buildChips(m);
  if (campus) {
    if (m === 'campus') { campus.enter(); campus.apply({ built: 12, gpp: true, lines: true, plots: false, infra: true }); frameCampus(true); }
    else if (campus.target) { campus.exit(); frameCampus(false); }
  }
}

const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
function tickLayers(dt) {
  if (!eq.length) return;
  phase += dt; clock += dt;
  const closed = layer === 'overview' || layer === 'campus';
  const b4 = !!(build && build.active);
  reveal = closed ? Math.max(0, reveal - dt * 0.85) : Math.min(1, reveal + dt * 0.85);
  const open = reveal > 0.015;
  if (interior) interior.visible = open;
  for (const e of eq) {
    const t = ease(clamp01((phase - e.delay) / duration(e)));
    e.y = e.start + (e.end - e.start) * t;
    e.amount = clamp01(e.y / Math.max(1, liftOf(e)));
    e.show = e.sub || inLayer(e.kind, layer) || e.amount > 0.001 || (layer === 'construction');
    if (!open && !e.sub) e.show = false;
    if (e.pinned && !e.hidden) e.show = true; // units a story route or ring points at
    if (e.hidden) e.show = false;
    if (e.sub && campusAway) e.show = false; // ЦОД-1's substation equipment: the campus has «Станция понижения»
    if (b4) build.eqState(e);                // 4D: the unit comes down into place when its system is built
  }
  for (const im of groups) {
    // only the visible instances are drawn: packed to the front, im.count = how many (vis[] maps back for picking)
    const { base, owners, vis } = im.userData;
    let k = 0;
    for (let i = 0; i < owners.length; i++) {
      const e = owners[i];
      if (!e.show) continue;
      tmpM.makeTranslation(0, e.y + (b4 ? e.drop : 0), 0).multiply(base[i]);
      im.setMatrixAt(k, tmpM); vis[k++] = e;
    }
    im.count = k; im.visible = k > 0;
    im.instanceMatrix.needsUpdate = true; im.boundingSphere = null;
    const glow = inLayer(im.userData.kind, layer) && layer !== 'overview';
    const g4 = b4 ? build.groupGlow(im.userData.kind) : null;
    const strength = g4 ? g4[1] : glow ? (phase > 3.2 ? 0.12 : 0.52) : 0;
    const m = im.material;
    if (m.emissive) {
      if (strength > 0) { m.emissive.copy(g4 ? g4[0] : TINT[layer] || TINT0); m.emissiveIntensity = strength; }
      else { m.emissive.copy(im.userData.em0); m.emissiveIntensity = im.userData.ei0; }
    }
  }
  if (!b4) for (const s of shell) { // (4D gives the shell its own materials)
    const want = open && relevant(s.name) ? ghostMat : s.orig;
    if (s.mesh.material !== want) { s.mesh.material = want; s.mesh.castShadow = want === s.orig; }
  }
  const lift = b4 ? 0 : smoothstep(0, 10, reveal);
  for (const r of roofs) r.obj.position.y = r.home + (relevant(r.name) ? lift / r.k : 0);
  for (const o of context) o.visible = b4 ? build.slabs : layer === 'construction';
  // decks follow their members
  for (const s of stages) {
    const n = s.members.length;
    let lift = 0, amount = 0;
    for (const e of s.members) { lift += e.y; amount += e.amount; }
    lift = n ? lift / n : 0; s.amount = n ? amount / n : 0;
    s.root.position.y = s.home + lift - 0.2;
    s.root.visible = s.tethers.visible = s.amount > 0.006;
    const scanning = phase > 0.2 && phase < 2.8 && s.amount > 0.02;
    s.scan.visible = scanning;
    if (scanning) s.scan.position.z = s.cz - s.sz / 2 + s.sz * clamp01((phase - 0.2) / 2.45);
    const p = s.tethers.geometry.attributes.position;
    s.corners.forEach(([x, z], i) => { p.setXYZ(2 * i, x, s.home, z); p.setXYZ(2 * i + 1, x, s.root.position.y, z); });
    p.needsUpdate = true;
  }
}
function relevant(name) {
  if (layer === 'construction' || layer === 'overview' || layer === 'campus') return true;
  const side = name.startsWith(clean('Западный корпус')) || name.startsWith(clean('Восточный корпус'));
  return layer === 'power' ? side : !side;
}

// captions: projected HTML tags, at most 4, no overlaps (MaketLayerMotion caption rules)
function drawLabels(cam) {
  const W = innerWidth, H = innerHeight, used = [];
  const sum = $('#summary').getBoundingClientRect();
  for (const s of stages) {
    let show = s.root.visible && s.amount > 0.8 && anchor.visible && !(inspector && inspector.open) && used.length < 4;
    if (show) {
      tmpV.copy(s.label); tmpV.y += s.root.position.y;
      tmpV.applyMatrix4(s.root.parent.matrixWorld).project(cam);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 0.95 || Math.abs(tmpV.y) > 0.95) show = false;
      else {
        const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H, w = s.tag.offsetWidth || 90, h = 24;
        const r = { l: x - w / 2 - 6, r: x + w / 2 + 6, t: y - h - 6, b: y + 6 };
        const hit = q => !(r.r < q.l || r.l > q.r || r.b < q.t || r.t > q.b);
        if (hit({ l: sum.left, r: sum.right, t: sum.top, b: sum.bottom }) || used.some(hit)) show = false;
        else { used.push(r); s.tag.style.left = x + 'px'; s.tag.style.top = y + 'px'; }
      }
    }
    s.tag.style.opacity = show ? 1 : 0;
  }
}

// ------------------------------------------------------------------ tap to inspect (inspect.js)
let inspector = null;
const ray = new THREE.Raycaster();
function inspectAt(cx, cy) {
  if (!inspector) return;
  const cam = mode === 'ar' ? arCam : viewCam;
  ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), cam);
  const own = ray.intersectObjects(inspector.pickables(), true).filter(h => h.object.visible && h.object.isMesh && h.object.material.opacity > 0.5);
  if (own.length && inspector.tap(own[0].object)) { updateCard(); return; }
  const hits = ray.intersectObjects(groups.filter(g => g.visible), false).map(h => h.object.userData.vis[h.instanceId]).filter(e => e && e.show);
  let pick = hits[0];
  if (!pick) { // small units on a phone: the nearest one within ~28 px of the finger
    const cam2 = mode === 'ar' ? arCam : viewCam, model = fit.children[0], v = new THREE.Vector3();
    let best = 28 * 28;
    for (const e of eq) {
      if (!e.show) continue;
      v.set(e.pos.x, e.pos.y + e.y + e.height * 0.5, e.pos.z); model.localToWorld(v).project(cam2);
      if (v.z > 1) continue;
      const dx = (v.x + 1) / 2 * innerWidth - cx, dy = (1 - v.y) / 2 * innerHeight - cy, d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; pick = e; }
    }
  }
  if (player && player.active && !player.paused) player.toggle(); // a tap takes over: the story waits
  if (pick) { inspector.openUnit(pick); frameInspector(true); }
  else if (inspector.open) { inspector.close(); frameInspector(false); }
}
function updateCard() {
  const c = inspector && inspector.card();
  $('#inspect').hidden = !c || (player && player.active && !player.paused);
  if (!c) return;
  $('#insTitle').textContent = c.title; $('#insMetric').textContent = c.metric;
  $('#insBody').textContent = c.body; $('#insNote').textContent = c.note;
  const lv = $('#insLevel');
  lv.hidden = !c.canExplode || c.level < 0;
  lv.textContent = c.level ? 'Собрать' : 'Раскрыть';
}
// 3D mode on a phone: a card at the bottom covers the model, so the picture slides up above it
let viewOffY = 0;
function tickViewOffset(dt) {
  let target = 0;
  if (innerWidth < 900) for (const id of ['#story', '#inspect']) { const el = $(id); if (!el.hidden) target = Math.max(target, el.offsetHeight * 0.5); }
  viewOffY += (target - viewOffY) * (1 - Math.exp(-dt * 4));
  if (Math.abs(viewOffY) > 0.5) viewCam.setViewOffset(innerWidth, innerHeight, 0, viewOffY, innerWidth, innerHeight);
  else if (viewCam.view) viewCam.clearViewOffset();
}
// 3D mode: fly the orbit camera to the opened unit and back
let camGoal = null, camHome = null, camCampus = null;
// the site is almost square: on a portrait phone the camera steps back further so it fits the width
function frameCampus(on) { if (mode === '3d' && controls) camCampus = on ? 0.66 * THREE.MathUtils.clamp(0.6 / viewCam.aspect, 1, 1.6) : 0.515; }
function frameInspector(on) {
  if (mode !== '3d' || !controls) return;
  if (on) { if (!camHome) camHome = { target: controls.target.clone(), pos: viewCam.position.clone() }; camGoal = 'unit'; }
  else if (camHome) camGoal = 'home';
}
function tickCamera(dt) {
  if (camCampus && mode === '3d' && !camGoal) { // step back for the campus, forward again for the module
    const a = 1 - Math.exp(-dt * 2.5), dir = viewCam.position.clone().sub(controls.target).normalize();
    controls.target.lerp(new THREE.Vector3(0, camCampus > 0.6 ? 0.004 : 0.01, 0), a);
    viewCam.position.lerp(controls.target.clone().addScaledVector(dir, camCampus), a);
    if (Math.abs(viewCam.position.distanceTo(controls.target) - camCampus) < 1e-3) camCampus = null;
  }
  if (!camGoal || mode !== '3d') return;
  const a = 1 - Math.exp(-dt * 2.5);
  if (camGoal === 'home') {
    controls.target.lerp(camHome.target, a); viewCam.position.lerp(camHome.pos, a);
    if (viewCam.position.distanceTo(camHome.pos) < 1e-4) { camGoal = null; camHome = null; }
    return;
  }
  const f = inspector.focus(); if (!f) return;
  const model = fit.children[0], c = model.localToWorld(f.center.clone());
  const h = f.height * model.getWorldScale(new THREE.Vector3()).x;
  const dir = viewCam.position.clone().sub(controls.target).normalize();
  controls.target.lerp(c, a);
  viewCam.position.lerp(c.clone().addScaledVector(dir, h * 2.6), a);
}

// ------------------------------------------------------------------ mat outline (to check the fit)
const boardLines = new Map();
function buildBoardLines(board) {
  const pts = [], y = 0.0005, hw = board.sheet.w / 2, hh = board.sheet.h / 2;
  const quad = c => { for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; pts.push(a[0], y, a[1], b[0], y, b[1]); } };
  quad([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]);
  for (const m of board.markers) quad(m.corners.map(c => [c[0], c[2]]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x36c2a8, depthTest: false }));
  l.renderOrder = 10; l.visible = false;
  boardLines.set(board.name, l);
  anchor.add(l);
}

function applyCalib() {
  calib.position.set(S.dx / 1000, S.dy / 1000, S.dz / 1000);
  calib.rotation.set(0, THREE.MathUtils.degToRad(S.rot), 0);
  calib.scale.setScalar(S.scale / 100);
  for (const [n, l] of boardLines) l.visible = S.showBoard && n === (board ? board.name : 'A4');
  dbg.style.display = S.debug ? 'block' : 'none';
  if (renderer.shadowMap.enabled !== !!S.shadows) {
    renderer.shadowMap.enabled = sun.castShadow = !!S.shadows;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
}
// the site is 1050 x 692 m: on A3 it gets the project's print width (MaketDirector.printWidth = 332.8 mm), on A4 the sheet
function sizeForBoard(b) {
  modelWidth = !b ? (meta?.printWidth || 0.3328) : Math.min(meta?.printWidth || 0.3328, b.sheet.w * 0.95);
  applyFit();
}

// ------------------------------------------------------------------ AR
const video = $('#cam'), dbg = $('#dbg'), dctx = dbg.getContext('2d');
const proc = document.createElement('canvas'), pctx = proc.getContext('2d', { willReadFrequently: true });
let boards, board = null, tracker, gray = null;
let vw = 0, vh = 0, pw = 0, ph = 0, sp = 1;
const focalSamples = [];
let pose = null, lastSeen = 0, filtered = null;
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
  viewCam.fov = W < H ? Math.min(75, 42 / viewCam.aspect) : 38;
  viewCam.updateProjectionMatrix();
}
addEventListener('resize', layout);

function screenMap() {
  const W = innerWidth, H = innerHeight, sc = Math.max(W / vw, H / vh);
  return { W, H, sc, ox: (W - vw * sc) / 2, oy: (H - vh * sc) / 2 };
}

function updateProjection() {
  const { W, H, sc } = screenMap();
  const f = focalProc() / sp * sc, n = 0.02, fa = 5;
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
  let p = null;
  if (dets.length) {
    let best = null, nb = 0;
    for (const b of boards) { const n = dets.filter(d => b.markers.some(m => m.id === d.id)).length; if (n > nb) { nb = n; best = b; } }
    if (best !== board) { board = best; pose = null; sizeForBoard(board); applyCalib(); }
    p = estimatePose(dets, board, K, pose);
  }
  detMs = detMs * 0.9 + (performance.now() - t0) * 0.1;
  if (p && p.err < 4) {
    pose = p; lastSeen = performance.now(); lastErr = p.err;
    const tilt = Math.acos(Math.min(1, Math.abs(p.R[2][1]))) * 180 / Math.PI;
    if (S.fov === 0 && dets.length >= 3 && tilt > 25 && tilt < 75) {
      const fe = focalFromH(p.H, pw / 2, ph / 2);
      if (fe && fe.f > 0.4 * Math.max(pw, ph) && fe.f < 3 * Math.max(pw, ph)) {
        focalSamples.push(fe.f); if (focalSamples.length > 60) focalSamples.shift();
      }
    }
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

// ------------------------------------------------------------------ tour ("Показ")
// ------------------------------------------------------------------ stories (story.js): "Как устроено" + ▶ Показ
let player = null, campus = null, build = null;
const campusHide = []; // parts of ЦОД-1's maket the campus replaces (see main)
const campusShow = []; // ... and what stands in for them there
let campusAway = false;
function setTour(on) { if (!player) return; if (on) player.play(SHOW[0], SHOW.slice(1)); else if (player.queue.length || player.active) player.stop(); }
function buildChips(m) {
  const el = $('#chips'); el.innerHTML = '';
  for (const id of LAYER_STORIES[m] || []) {
    const b = document.createElement('button'); b.className = 'chip'; b.innerHTML = `<span>▶</span> ${STORIES[id].name}`;
    b.onclick = () => { if (inspector) inspector.close(); player.play(id); };
    el.appendChild(b);
  }
}
const storyUI = {
  show(p) { $('#story').hidden = false; $('#chips').hidden = true; $('#inspect').hidden = true; this.update(p); },
  hide() { $('#story').hidden = true; $('#chips').hidden = false; $('#tour').classList.remove('on'); updateCard(); },
  update(p) {
    const st = p.story; if (!st) return;
    const step = st.steps[p.i];
    $('#stName').textContent = st.name + (p.queue.length ? ` · дальше: ${STORIES[p.queue[0]].name}` : '');
    $('#stCount').textContent = `${p.i + 1} / ${st.steps.length}`;
    $('#stTitle').textContent = step.t; $('#stText').textContent = step.x; $('#stResult').textContent = step.r;
    $('#stPlay').textContent = p.paused ? '▶' : '❚❚';
    const bar = $('#stBar');
    if (bar.children.length !== st.steps.length) { bar.innerHTML = ''; st.steps.forEach(() => { const d = document.createElement('i'); d.appendChild(document.createElement('b')); bar.appendChild(d); }); }
    [...bar.children].forEach((d, k) => { d.firstChild.style.width = k < p.i ? '100%' : '0%'; });
    $('#tour').classList.toggle('on', p.queue.length > 0);
    $('#story').classList.remove('fresh'); void $('#story').offsetWidth; $('#story').classList.add('fresh');
  },
  progress(p, f) { const d = $('#stBar').children[p.i]; if (d) d.firstChild.style.width = (f * 100).toFixed(1) + '%'; },
};

const statusEl = $('#status');
let lastT = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  frames++;
  if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  if (player) player.tick(dt);
  if (build) { build.tick(dt); if (build.label && layer === '4d') $('#sumValue').textContent = build.label; }
  if (campus) {
    campus.tick(dt); blendFit();
    const away = campus.f >= 0.02;
    if (away !== campusAway) { campusAway = away; for (const o of campusHide) o.visible = !away; for (const o of campusShow) o.visible = away; }
    if (layer === 'campus') $('#sumValue').textContent = build && build.phase === 'campus' ? `${campus.mw} МВт · строится` : `${campus.mw} МВт`;
  }
  tickLayers(dt);
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
        : 'Наведите камеру на коврик';
    $('#stats').textContent = `трекинг ${detMs.toFixed(0)} мс · ошибка ${lastErr.toFixed(2)} пикс · ${pw}×${ph}`;
    $('#fovNow').textContent = vw ? `${fovOf(focalProc()).toFixed(1)}° ${S.fov > 0 ? '(вручную)' : focalSamples.length >= 8 ? '(авто)' : '(по умолчанию)'}` : '—';
    drawDebug();
    scene.updateMatrixWorld();
    if (build) build.prerender(); if (campus) campus.prerender();
    if (inspector) { inspector.tick(dt, fit.children[0].worldToLocal(new THREE.Vector3())); inspector.drawLabels(arCam); }
    if (player) player.drawTags(arCam);
    if (campus) campus.drawTags(arCam);
    drawLabels(arCam);
    renderer.render(scene, arCam);
  } else if (mode === '3d') {
    tickCamera(dt);
    tickViewOffset(dt);
    controls.update();
    scene.updateMatrixWorld();
    if (build) build.prerender(); if (campus) campus.prerender();
    if (inspector) { inspector.tick(dt, fit.children[0].worldToLocal(viewCam.position.clone())); inspector.drawLabels(viewCam); }
    if (player) player.drawTags(viewCam);
    if (campus) campus.drawTags(viewCam);
    drawLabels(viewCam);
    renderer.render(scene, viewCam);
    $('#stats').textContent = `${fps.toFixed(0)} к/с · ${renderer.info.render.calls} вызовов · ${(renderer.info.render.triangles / 1e6).toFixed(2)} M треуг.`;
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
  sizeForBoard(null);
  // MaketDirector.ResetView for the print size: 0.515 m away, 49° down, 28° to the side
  const d = 0.515, pitch = THREE.MathUtils.degToRad(49), yaw = THREE.MathUtils.degToRad(28);
  viewCam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  controls = new OrbitControls(viewCam, canvas);
  controls.target.set(0, 0.01, 0);
  controls.enableDamping = true;
  controls.addEventListener('start', () => { camGoal = null; });
  controls.minDistance = 0.05; controls.maxDistance = 2;
  controls.maxPolarAngle = Math.PI * 0.49;
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
  const modesEl = $('#modes');
  for (const [m, name] of MODES) {
    const b = document.createElement('button'); b.dataset.m = m; b.textContent = name;
    b.onclick = () => { if (player) player.stop(); setLayer(m); };
    modesEl.appendChild(b);
  }
  $('#tour').onclick = () => setTour(!(player && player.queue.length));
  $('#stPrev').onclick = () => player.prev(); $('#stNext').onclick = () => player.next();
  $('#stPlay').onclick = () => player.toggle(); $('#stClose').onclick = () => player.stop();
  document.querySelector('#bar [data-t=settings]').onclick = () => { $('#settings').hidden = !$('#settings').hidden; };
  $('#close').onclick = () => { $('#settings').hidden = true; };
  $('#insClose').onclick = () => { if (inspector) { inspector.close(); frameInspector(false); } };
  $('#insLevel').onclick = () => { if (inspector && inspector.s) { inspector.setLevel(inspector.s.level ? 0 : 1); updateCard(); } };
  // tap (not drag) on the model = inspect
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 700 && mode) inspectAt(e.clientX, e.clientY);
    down = null;
  });
  const inputs = document.querySelectorAll('#settings input');
  const show = () => inputs.forEach(i => {
    if (i.type === 'checkbox') i.checked = !!S[i.dataset.k];
    else { i.value = S[i.dataset.k]; i.parentElement.querySelector('output').textContent = S[i.dataset.k] === 0 && i.dataset.k === 'fov' ? 'авто' : S[i.dataset.k]; }
  });
  inputs.forEach(i => i.oninput = () => {
    S[i.dataset.k] = i.type === 'checkbox' ? i.checked : parseFloat(i.value);
    if (i.dataset.k === 'fov' && S.fov > 0 && S.fov < 30) S.fov = 30;
    save(); show(); applyCalib();
    if (i.dataset.k === 'lift') setLayer(layer);
  });
  $('#reset').onclick = () => { S = { ...DEF }; save(); show(); applyCalib(); focalSamples.length = 0; setLayer(layer); };
  show();
}

async function main() {
  layout();
  initUI();
  $('#btnAr').disabled = $('#btn3d').disabled = true;
  boards = await (await fetch('boards.json')).json();
  tracker = new MarkerTracker({ bits: boards[0].bits, markers: boards.flatMap(b => b.markers) });
  boards.forEach(buildBoardLines);
  applyCalib();
  loop();
  try { await modelReady; } catch (e) { console.error(e); $('#startErr').textContent = 'Ошибка загрузки модели.'; return; }
  const model = fit.children[0];
  attachStages(model);
  inspector = new Inspector({ model, labels: labelsEl, onChange: updateCard });
  player = new StoryPlayer({ model, eqByName, inspector, setLayer: m => setLayer(m), labels: labelsEl, ui: storyUI,
    onFrame: e => frameInspector(!!e) });
  let lawn = null; model.getObjectByName(clean('Газон | сплошная основа'))?.traverse(o => { if (!lawn && o.isMesh) lawn = o.material.color.clone(); });
  let padC = null; model.getObjectByName(clean('Площадки корпусов и подстанции'))?.traverse(o => { if (!padC && o.isMesh) padC = o.material.color.clone(); });
  let roadC = null; model.getObjectByName(clean('Дороги | ровное асфальтовое покрытие'))?.traverse(o => { if (!roadC && o.isMesh) roadC = o.material.color.clone(); });
  campus = new Campus({ model, labels: labelsEl, grass: lawn, pad: padC, road: roadC }); player.campus = campus;
  build = new Build4D({ model, eq, groups, context, campus }); player.build = build;
  // in the campus ЦОД-1 stands on module B1 of the new maket like the other modules: its buildings, the admin building and
  // the galleries only (no base slab, rim, lawn, roads, pads, trees, lamps or substation yard of the ЦОД-1 maket)
  const ext = model.getObjectByName(clean('Maket Clean exterior'));
  const keep = /^(Восточный_корпус|Западный_корпус|Задний_корпус|Северный_переход|Эстакада)/;
  for (const o of ext ? ext.children : []) if (o.name && !keep.test(o.name)) campusHide.push(o);
  setLayer('overview'); reveal = 0;
  applyCalib();
  $('#btnAr').disabled = $('#btn3d').disabled = false;
  const q = new URLSearchParams(location.search);
  if (q.get('layer')) setLayer(q.get('layer'));
  if (q.get('mode') === '3d') start3D(); else if (q.get('mode') === 'ar') startAR();
}
main();

// for debugging from the console / tests
window.__ar = { get pose() { return pose; }, get dets() { return lastDets; }, get fps() { return fps; }, S, setLayer,
  get layer() { return layer; }, get player() { return player; }, get campus() { return campus; }, get build() { return build; }, inspectAt, get inspector() { return inspector; }, viewCam, get controls() { return controls; }, skip() { phase = 99; reveal = layer === 'overview' ? 0 : 1; }, eq, stages, renderer, focalProc: () => focalProc(), fovOf: f => fovOf(f) };
