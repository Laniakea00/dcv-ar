// Долина ЦОД · 3D-макет (qTwin): приветствие → свободный осмотр GLB → сценарии (scenarios.html?s=…)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const $ = id => document.getElementById(id);
const MODEL = "DolinaCOD_GRES2.glb", MODEL_BYTES = 14098716;
const SCENARIOS = [
  { k: "tour_min", n: 1, title: "Экспликация", text: "Объекты 1 → 11: камера летит к объекту, данные табличек", meta: "по шагам", pic: "img/preview_tour_min.jpg" },
  { k: "4d_min", n: 2, title: "4D-строительство", text: "Площадка, каркас, стены, кровля, краны — по порядку номеров", meta: "≈ 80 с", pic: "img/preview_4d_min.jpg" },
  { k: "inside_min", n: 3, title: "Внутри ЦОД №1", text: "Машинный зал и стойки NVIDIA GB300 NVL72", meta: "≈ 80 с", pic: "img/preview_inside_min.jpg" },
];
const mobile = matchMedia("(max-width: 860px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const narrow = () => matchMedia("(max-width: 760px)").matches;
const pad2 = n => String(n).padStart(2, "0");
const ARROW = `<svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`;
const ARROW_UR = `<svg viewBox="0 0 16 16"><path d="M4 12L12 4M12 4H4M12 4V12"/></svg>`;

// ---------------------------------------------------------------- title words, scenario reel and dock
$("title").querySelectorAll(".w").forEach(w => { w.innerHTML = `<span>${w.textContent}</span>`; });
const openScenario = k => { $("wait").hidden = false; setTimeout(() => { location.href = "scenarios.html?s=" + encodeURIComponent(k); }, 40); };
$("reel").innerHTML = SCENARIOS.map(s => `<button class="sc" data-k="${s.k}"><span class="pv" style="background-image:url(${s.pic})"></span>
  <span class="tx"><small>/SC_0${pad2(s.n)} · ${s.meta}</small><b>${s.title}</b><span>${s.text}</span></span><span class="ar">${ARROW}</span></button>`).join("");
$("dock").innerHTML = SCENARIOS.map(s => `<button class="dk" data-k="${s.k}" title="${s.text}"><span class="pv" style="background-image:url(${s.pic})"></span>
  <span><small>/SC_0${pad2(s.n)}</small><b>${s.title}</b></span>${ARROW_UR}</button>`).join("");
document.querySelectorAll(".sc, .dk").forEach(b => b.onclick = () => openScenario(b.dataset.k));
addEventListener("pageshow", e => { if (e.persisted) $("wait").hidden = true; });

// metric counters
function countUp() {
  document.querySelectorAll(".metrics b[data-to]").forEach((b, i) => {
    const to = +b.dataset.to, t0 = performance.now() + i * 160;
    const step = now => { const k = Math.min(1, Math.max(0, (now - t0) / 1400)), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
countUp();
const scan = () => { const s = $("scanline"); s.classList.remove("run"); void s.offsetWidth; s.classList.add("run"); };

// ---------------------------------------------------------------- renderer, scene, camera
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.85;
const sun = new THREE.DirectionalLight(0xfff3e2, 1.6); sun.position.set(-1.6, 3.2, -1.2);
sun.castShadow = !mobile; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002;
Object.assign(sun.shadow.camera, { left: -1.4, right: 1.4, top: 1.0, bottom: -1.0, near: 0.5, far: 7 });
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x22272e, 0.35); scene.add(sun, sun.target, hemi);
// a faint floor grid under the table — the «digital twin» stage
const grid = new THREE.GridHelper(12, 60, 0x2a2a2a, 0x151515); grid.position.y = -0.72; grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 0.25, maxDistance: 12, maxPolarAngle: 1.47, autoRotate: true, autoRotateSpeed: 0.35,
  screenSpacePanning: false, zoomToCursor: true, enabled: false });

const homeView = () => {
  const portrait = camera.aspect < 0.85;
  camera.fov = portrait ? 50 : 38; camera.updateProjectionMatrix();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), aspect = camera.aspect;
  const el = THREE.MathUtils.degToRad(portrait ? 52 : 36);
  const d = portrait ? Math.max(0.8 / (t * aspect), (1.25 * Math.sin(el) + 0.1) / t) * 1.06 : Math.max(1.35 / (t * aspect), 0.95 / t) * 1.08;
  const dir = portrait ? new THREE.Vector3(-1, 0, -0.18).normalize() : new THREE.Vector3(0.08, 0, -1).normalize();
  const pos = dir.multiplyScalar(Math.cos(el) * d); pos.y = Math.sin(el) * d;
  return { pos, target: new THREE.Vector3(0, -0.04, 0.0) };
};
{ const h = homeView(); camera.position.copy(h.pos).multiplyScalar(1.35); controls.target.copy(h.target); }

// ---------------------------------------------------------------- camera flights
let flight = null;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function flyTo(pos, target, ms = 1400) { flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), ms }; }
function stepFlight(now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.start) / flight.ms), e = ease(k);
  camera.position.lerpVectors(flight.p0, flight.p1, e); controls.target.lerpVectors(flight.t0, flight.t1, e);
  if (k >= 1) flight = null;
}
// touch: one finger turns, two fingers zoom and move; the auto-spin stops as soon as the person takes over
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
if (mobile) Object.assign(controls, { rotateSpeed: 0.75, zoomSpeed: 1.1, panSpeed: 0.9 });
controls.addEventListener("start", () => { flight = null; userTouched(); if (controls.autoRotate) { controls.autoRotate = false; $("spin").classList.remove("on"); } });
document.addEventListener("gesturestart", e => e.preventDefault());   // iOS: no page zoom on pinch

// tap / click on a building opens it (a press that did not move = a tap)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitBox = new THREE.Box3(), hitPt = new THREE.Vector3();
let press = null;
canvas.addEventListener("pointerdown", e => { press = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, n: (press && press.n || 0) + 1 }; });
canvas.addEventListener("pointerup", e => {
  if (!press || e.pointerId !== press.id || $("view").hidden) { press = null; return; }
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y), quick = performance.now() - press.t < 450; press = null;
  if (moved > 8 || !quick || !STOPS.length) return;
  tapStop(pickStop(e.clientX, e.clientY));
});
// a tap opens a building; a tap on the same building again (or on empty ground) flies back out
function tapStop(i) {
  if (i >= 0 && i !== selected) select(i);
  else if (selected >= 0) back();
}
function pickStop(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  let best = -1, bestD = Infinity, bestA = Infinity;
  STOPS.forEach((s, i) => {
    for (const r of s.rects || []) {
      hitBox.min.set(r.x0 - 0.004, 0, r.z0 - 0.004); hitBox.max.set(r.x1 + 0.004, r.top + 0.004, r.z1 + 0.004);
      if (!ray.ray.intersectBox(hitBox, hitPt)) continue;
      const d = hitPt.distanceTo(ray.ray.origin), area = (r.x1 - r.x0) * (r.z1 - r.z0);
      // nearest box wins; among overlapping ones (a small building inside a big plot) the smaller one
      if (d < bestD - 0.01 || (Math.abs(d - bestD) <= 0.01 && area < bestA)) { best = i; bestD = d; bestA = area; }
    }
  });
  return best;
}
// the cursor shows a hand over a building (desktop)
let hoverT = 0;
canvas.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse" || $("view").hidden || e.buttons) return;
  const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
  const i = pickStop(e.clientX, e.clientY), tip = $("tip");
  canvas.style.cursor = i >= 0 ? "pointer" : "";
  if (i >= 0) {
    const s = STOPS[i], st = STAT[s.status];
    tip.innerHTML = `<i>/${pad2(s.num)}</i>${s.legend}${st ? `<em>${st.label}</em>` : ""}`;
    tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.hidden = false;
  } else tip.hidden = true;
});
canvas.addEventListener("pointerleave", () => { $("tip").hidden = true; });
canvas.addEventListener("pointerdown", () => { $("tip").hidden = true; });

// ---------------------------------------------------------------- the maket's objects (экспликация 1–11)
let STOPS = [], OX = 0, OY = 0, model = null, selected = -1;
const W3 = (x, y, h = 0) => new THREE.Vector3(x - OX, h, -(y - OY));
const hl = new THREE.Group(); scene.add(hl);
const hlMat = new THREE.LineBasicMaterial({ color: 0xff3939, transparent: true, opacity: 1, depthTest: false });
const fillMat = new THREE.MeshBasicMaterial({ color: 0xda0a1a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

let FLOWS = [];
async function loadStops() { const d = await (await fetch("stops.json")).json(); [OX, OY] = d.origin; STOPS = d.stops; FLOWS = d.flows || []; }
function measureStops() {
  const meshes = []; model.traverse(o => { if (o.isMesh) meshes.push(new THREE.Box3().setFromObject(o)); });
  for (const s of STOPS) {
    s.rects = s.boxes.map(([x0, x1, y0, y1]) => {
      const a = W3(x0, y0), b = W3(x1, y1);
      const r = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), top: 0.012 };
      for (const m of meshes) {
        const cx = (m.min.x + m.max.x) / 2, cz = (m.min.z + m.max.z) / 2, sx = m.max.x - m.min.x, sz = m.max.z - m.min.z;
        if (cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1 && sx < 0.6 && sz < 0.6 && m.max.y < 0.6) r.top = Math.max(r.top, m.max.y);
      }
      r.top = Math.max(r.top, s.num === "9" ? 0.26 : 0.034);
      return r;
    });
    const all = s.rects;
    s.box = { x0: Math.min(...all.map(r => r.x0)), x1: Math.max(...all.map(r => r.x1)), z0: Math.min(...all.map(r => r.z0)), z1: Math.max(...all.map(r => r.z1)), top: Math.max(...all.map(r => r.top)) };
    const big = all.slice().sort((p, q) => (q.x1 - q.x0) * (q.z1 - q.z0) - (p.x1 - p.x0) * (p.z1 - p.z0))[0];
    s.pinAt = new THREE.Vector3((big.x0 + big.x1) / 2, big.top + 0.02, (big.z0 + big.z1) / 2);
  }
}
function buildUI() {
  $("rail").innerHTML = `<div class="r-h">№</div>` + STOPS.map((s, i) => `<button data-i="${i}" aria-label="${s.legend}">${pad2(s.num)}<span class="nm">${s.legend}</span></button>`).join("");
  $("rail").querySelectorAll("button").forEach(b => b.onclick = () => tapStop(+b.dataset.i));
  $("pins").innerHTML = STOPS.map((s, i) => `<div class="pin" data-i="${i}" title="${s.short || s.legend}"><span class="n">${s.num}</span></div>`).join("");
  $("pins").querySelectorAll(".pin").forEach(p => p.onclick = () => tapStop(+p.dataset.i));
  const items = STOPS.map(s => `<span><i>/${pad2(s.num)}</i> <b>${s.legend}</b>${s.value ? " — " + s.value : ""}</span>`).join("");
  $("ticker").innerHTML = items + items;
}
function highlight(s) {
  hl.traverse(o => o.geometry?.dispose()); hl.clear();
  if (!s) return;
  for (const r of s.rects) {
    const pad = 0.008, w = r.x1 - r.x0 + 2 * pad, d = r.z1 - r.z0 + 2 * pad, h = r.top + 0.008;
    const geo = new THREE.BoxGeometry(w, h, d);
    const vol = new THREE.Mesh(geo, fillMat); vol.position.set((r.x0 + r.x1) / 2, h / 2, (r.z0 + r.z1) / 2); vol.renderOrder = 4; hl.add(vol);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), hlMat); e.position.copy(vol.position); e.renderOrder = 5; hl.add(e);
  }
}
const splitVal = v => { const m = /^([\d\s.,]+)\s*(.*)$/.exec(v || ""); return m ? [m[1].trim(), m[2]] : ["", v || ""]; };
function select(i) {
  if (i < 0 || i >= STOPS.length) return;
  if (selected < 0) before = { pos: camera.position.clone(), target: controls.target.clone() };
  selected = i; const s = STOPS[i];
  controls.autoRotate = false; $("spin").classList.remove("on");
  highlight(s);
  $("rail").querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
  $("rail").querySelectorAll("button")[i]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  document.querySelectorAll(".pin").forEach((p, k) => p.classList.toggle("on", k === i));
  $("cIdx").textContent = "/" + pad2(s.num); $("cPos").textContent = `${pad2(i + 1)} / ${pad2(STOPS.length)}`;
  $("cKind").textContent = s.kind || ""; $("cTitle").textContent = s.title || s.legend;
  const [num, unit] = splitVal(s.value); $("cVal").textContent = num; $("cUnit").textContent = num ? unit : (s.value || "");
  $("cSub").textContent = s.sub || "";
  const st = STAT[s.status]; $("cStat").textContent = st ? st.label : ""; $("cStat").className = "stat " + (s.status || "");
  $("cFeed").innerHTML = FEED[s.num] ? `<small>/Питание</small>${FEED[s.num]}` : "";
  focusFlows(s.num);
  if (s.logo) $("cLogo").src = `img/logo_${s.logo}.png`; else $("cLogo").removeAttribute("src");
  $("card").hidden = false; $("card").style.animation = "none"; void $("card").offsetWidth; $("card").style.animation = "";
  const b = s.box, c = new THREE.Vector3((b.x0 + b.x1) / 2, b.top * 0.5, (b.z0 + b.z1) / 2);
  const size = Math.max(b.x1 - b.x0, b.z1 - b.z0, b.top * 1.6);
  const dist = Math.max(0.3, (size * 0.75) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.min(1, camera.aspect * 0.9) + 0.12);
  const dir = camera.position.clone().sub(controls.target); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
  const el = THREE.MathUtils.degToRad(46);
  const pos = c.clone().addScaledVector(dir, Math.cos(el) * dist); pos.y = c.y + Math.sin(el) * dist;
  flyTo(pos, c, 1300);
}
let before = null;   // the camera before the first object was opened: «back» returns there
function back() {
  deselect();
  if (before) flyTo(before.pos, before.target, 1200); else goHome(1200);
  before = null;
}
function deselect() {
  selected = -1; highlight(null); $("card").hidden = true; focusFlows(null);
  document.querySelectorAll(".rail button.on, .pin.on").forEach(e => e.classList.remove("on"));
}
$("cardClose").onclick = back;
$("prev").onclick = () => select((selected - 1 + STOPS.length) % STOPS.length);
$("next").onclick = () => select((selected + 1) % STOPS.length);

// ---------------------------------------------------------------- tools
const goHome = (ms = 1400) => { const h = homeView(); flyTo(h.pos, h.target, ms); };
$("reset").onclick = () => { deselect(); before = null; goHome(); };
$("spin").onclick = () => { controls.autoRotate = !controls.autoRotate; $("spin").classList.toggle("on", controls.autoRotate); };
$("fs").onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
$("home").onclick = () => showWelcome();
let hintTimer = 0;
function userTouched() { $("hint").classList.add("out"); }
addEventListener("keydown", e => {
  if ($("view").hidden) { const i = +e.key; if (i >= 1 && i <= SCENARIOS.length) openScenario(SCENARIOS[i - 1].k); if (e.key === "Enter") enter(); return; }
  if (e.key === "ArrowRight") select((selected + 1) % STOPS.length);
  else if (e.key === "ArrowLeft") select((selected - 1 + STOPS.length) % STOPS.length);
  else if (e.key === "Escape") { if (selected >= 0) back(); else showWelcome(); }
  else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") { deselect(); before = null; goHome(); }
  else { const l = { e: "energy", у: "energy", s: "status", ы: "status", n: "night", т: "night", l: "labels", д: "labels" }[e.key.toLowerCase()]; if (l) setLayer(l, !layers[l]); }
});

// ---------------------------------------------------------------- welcome ↔ 3D
let offTarget = new URLSearchParams(location.search).get("view") === "3d" ? 0 : 1, off = 1;
function enter() {
  if ($("enter").disabled) return;
  document.body.classList.replace("at-welcome", "at-view"); offTarget = 0; $("crumb2").textContent = "/ Живой двойник";
  $("welcome").classList.add("out"); setTimeout(() => { if (offTarget === 0) $("welcome").hidden = true; }, 700);
  $("view").hidden = false; controls.enabled = true; controls.autoRotate = true; $("spin").classList.add("on");
  goHome(1800); scan();
  history.replaceState(null, "", "?view=3d");
  clearTimeout(hintTimer); $("hint").classList.remove("out"); hintTimer = setTimeout(userTouched, 7000);
}
function showWelcome() {
  document.body.classList.replace("at-view", "at-welcome"); offTarget = 1; $("crumb2").textContent = "/ Цифровой двойник";
  deselect(); before = null; $("view").hidden = true; controls.enabled = false; controls.autoRotate = true;
  $("welcome").hidden = false; requestAnimationFrame(() => $("welcome").classList.remove("out"));
  const h = homeView(); flyTo(h.pos.clone().multiplyScalar(1.35), h.target, 1200);
  history.replaceState(null, "", location.pathname);
}
$("enter").onclick = enter;

// ---------------------------------------------------------------- loading
const setProgress = f => { $("loadBar").style.width = (f * 100).toFixed(0) + "%"; $("loadPct").textContent = `${(f * 100).toFixed(0)}%`; };
Promise.all([
  loadStops(),
  new Promise((res, rej) => new GLTFLoader().load(MODEL, res, x => setProgress(Math.min(0.99, x.loaded / (x.lengthComputable && x.total ? x.total : MODEL_BYTES))), rej)),
]).then(([, gltf]) => {
  model = gltf.scene;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = !mobile;
    const m = o.material; if (m && m.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  });
  scene.add(model);
  measureStops(); buildUI(); buildPlantLife(); buildTwin();
  $("enter").disabled = false; $("enter").classList.add("ready"); $("enterLabel").textContent = "Открыть живой 3D-двойник";
  scan();
  if (offTarget === 0) { offTarget = 1; enter(); }
}).catch(err => { console.error(err); $("enterLabel").textContent = "Не удалось загрузить — обновите страницу"; $("loadPct").textContent = ""; });

// ---------------------------------------------------------------- frame loop
const v = new THREE.Vector3();
function placePins() {
  if ($("view").hidden || !STOPS.length) return;
  const w = innerWidth, h = innerHeight;
  $("pins").querySelectorAll(".pin").forEach((p, i) => {
    const s = STOPS[i]; if (!s.pinAt) return;
    v.copy(s.pinAt).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    p.style.visibility = vis ? "visible" : "hidden";
    if (vis) { s.sx = (v.x + 1) / 2 * w; s.sy = (1 - v.y) / 2 * h; p.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px) translate(-50%, -100%)`; }
    else s.sx = undefined;
  });
  // leader line: from the selected pin to the card
  const line = $("leaderLine"), dot = $("leaderDot"), s = STOPS[selected];
  if (selected >= 0 && s && s.sx !== undefined && !$("card").hidden && !narrow()) {
    const r = $("card").getBoundingClientRect(), x2 = r.left, y2 = Math.min(Math.max(s.sy - 34, r.top + 24), r.bottom - 24);
    line.setAttribute("x1", s.sx); line.setAttribute("y1", s.sy - 34); line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    dot.setAttribute("cx", x2); dot.setAttribute("cy", y2); line.style.display = dot.style.display = "";
  } else line.style.display = dot.style.display = "none";
}
let lift = 0, side = 0;   // phone, 3D view, an object open: the maket moves up out from under the card; desktop: clear of the twin panel
function applyOffset() {
  const w = innerWidth, h = innerHeight, wide = w / h > 1.1;
  lift += ((narrow() && selected >= 0 && offTarget === 0 ? 0.24 : 0) - lift) * 0.08;
  side += ((!narrow() && wide && selected < 0 && offTarget === 0 ? 1 : 0) - side) * 0.06;
  const ox = (wide ? -0.16 * w : 0) * off - side * Math.min(150, w * 0.1), oy = (wide ? 0.06 * h : 0.2 * h) * off + lift * h;
  if (Math.abs(ox) + Math.abs(oy) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(w, h, ox, oy, w, h);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.85 ? 50 : 38; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
// the readout follows the camera (azimuth / elevation / distance) in the 3D view; the compass needle points north
const sph = new THREE.Spherical(), tmp = new THREE.Vector3();
let lastReadout = 0;
// ---------------------------------------------------------------- ГРЭС-1 works: smoke from the stacks, aviation lights
const plant = { puffs: [], lights: [], t: 0 };
function buildPlantLife() {
  const ch = model.getObjectByName("chimney"); if (!ch) return;
  ch.updateWorldMatrix(true, false);
  const pos = ch.geometry.attributes.position, v = new THREE.Vector3(), pts = [];
  for (let i = 0; i < pos.count; i += 3) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(ch.matrixWorld).clone());
  // two stacks in one mesh: split along the axis they stand on
  const bb = new THREE.Box3().setFromPoints(pts), ax = bb.max.x - bb.min.x > bb.max.z - bb.min.z ? "x" : "z", mid = (bb.min[ax] + bb.max[ax]) / 2;
  const tex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(.45, "rgba(235,236,238,.45)"); gr.addColorStop(1, "rgba(220,222,225,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  for (const side of [0, 1]) {
    const sp = pts.filter(p => side ? p[ax] >= mid : p[ax] < mid); if (!sp.length) continue;
    const b = new THREE.Box3().setFromPoints(sp), top = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2), r = (b.max.x - b.min.x) / 2;
    const N = mobile ? 16 : 26;
    for (let k = 0; k < N; k++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xeef0f2 });
      const s = new THREE.Sprite(m); s.renderOrder = 3; scene.add(s);
      plant.puffs.push({ s, top, r, life: 9 + Math.random() * 4, age: (k / N) * 11, sway: Math.random() * 6.28 });
    }
    // red aviation light on the rim, blinking
    const l = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * .18, .0025), 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, toneMapped: false }));
    l.position.copy(top).add(new THREE.Vector3(0, .002, 0)); scene.add(l); plant.lights.push(l);
  }
}
function tickPlant(dt) {
  plant.t += dt;
  const wind = new THREE.Vector3(0.010, 0, -0.006);   // m/s on the maket scale
  for (const p of plant.puffs) {
    p.age += dt; if (p.age > p.life) p.age -= p.life;
    const k = p.age / p.life;
    p.s.position.set(p.top.x, p.top.y + 0.004 + k * 0.10, p.top.z).addScaledVector(wind, p.age).add(new THREE.Vector3(Math.sin(p.sway + p.age * .7) * .004, 0, Math.cos(p.sway + p.age * .5) * .004));
    const size = p.r * 2.2 + k * 0.07; p.s.scale.set(size, size, 1);
    p.s.material.opacity = Math.min(1, k * 8) * (1 - k) * 0.55;
  }
  const on = (plant.t % 1.6) < 0.25;
  for (const l of plant.lights) l.material.opacity = on ? 1 : 0.15;
}
// ---------------------------------------------------------------- the live twin: status of every object, power lines, night, layers
const STAT = {
  work: { label: "Работает", col: 0xfdfcfc },
  q1: { label: "I очередь", col: 0xff3939 },
  plan: { label: "Перспектива", col: 0x9a9a9a },
  infra: { label: "Инфраструктура", col: 0x6a6a6a },
};
const FEED = {
  "9": "Источник энергии долины: линия 500 кВ на подстанцию 500/35 кВ",
  "4": "ГРЭС-1 → <b>ПС 500/35 кВ</b> → ПС 35/10 кВ → ЦОД I очереди",
  "5": "ГРЭС-1 → <b>ПС 500/35 кВ</b> (перспектива) → ПС 35/10 кВ → ЦОДы",
  "6": "ГРЭС-1 → <b>ПС 500/35 кВ</b> (перспектива) → ПС 35/10 кВ → ЦОДы",
  "7": "ПС 500/35 кВ → <b>ПС 35/10 кВ</b> → ЦОДы, по площадке у каждой группы",
  "1": "ГРЭС-1 → ПС 500/35 кВ (215 МВт) → ПС 35/10 кВ → <b>ЦОД</b>",
  "2": "ГРЭС-1 → ПС 500/35 кВ (215 МВт) → ПС 35/10 кВ → <b>ЦОД</b>",
  "3": "ГРЭС-1 → ПС 500/35 кВ (перспектива) → ПС 35/10 кВ → <b>ЦОДы</b>",
};
const layers = { energy: true, status: true, night: false, labels: false };
const twin = { status: new THREE.Group(), flows: new THREE.Group(), lines: [], mats: [], night: 0 };
scene.add(twin.status, twin.flows);
function buildTwin() {
  // status: a wire box around each object (solid — works, red — first phase, dashed — prospect) and a tinted roof cap:
  // the prospect is shaded like a ghost (not built yet), the first phase glows red, what works stays as it is
  for (const s of STOPS) {
    const st = STAT[s.status]; if (!st) continue;
    for (const r of s.rects) {
      const pad = 0.005, w = r.x1 - r.x0 + 2 * pad, d = r.z1 - r.z0 + 2 * pad, h = Math.min(r.top, 0.075) + 0.004;
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const dashed = s.status === "plan";
      const lm = dashed ? new THREE.LineDashedMaterial({ color: st.col, dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.8 })
                        : new THREE.LineBasicMaterial({ color: st.col, transparent: true, opacity: s.status === "infra" ? 0.45 : 0.85 });
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), lm);
      e.position.set(cx, h / 2, cz); if (dashed) e.computeLineDistances(); e.renderOrder = 2;
      const capCol = { q1: 0xff2a2a, plan: 0x000000, work: 0xffffff, infra: 0x7a8a99 }[s.status];
      const fm = new THREE.MeshBasicMaterial({ color: capCol, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fm); f.rotation.x = -Math.PI / 2; f.position.set(cx, h + 0.001, cz); f.renderOrder = 1;
      twin.status.add(e, f);
      twin.lines.push({ e, f, s, base: lm.opacity, fill: { q1: 0.2, plan: 0.42, work: 0.0, infra: 0.12 }[s.status] });
    }
  }
  // power lines along the roads (the same routes as the scenario): live — red pulses, planned — grey dashes
  for (const f of FLOWS) {
    const live = f.kind === "existing";
    const pts = f.path.map(p => W3(p[0], p[1], 0.0058));
    const { g, len } = ribbon(pts, live ? 0.016 : 0.010);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      uniforms: { t: { value: 0 }, len: { value: len }, a: { value: 1 }, col: { value: new THREE.Color(live ? 0xff2020 : 0x2c2c2c) }, dash: { value: live ? 0 : 1 } },
      vertexShader: `attribute float s; attribute float side; varying float vS; varying float vSide; void main(){ vS = s; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float t, len, a, dash; uniform vec3 col; varying float vS; varying float vSide;
        void main(){ float core = smoothstep(0.0, .7, 1.0 - abs(vSide));
          float k = fract(vS * 26.0 - t * 1.5);
          float p = dash > .5 ? step(.45, fract(vS * 40.0 - t * .5)) * .85 : (.55 + .45 * smoothstep(.0, .2, k) * (1.0 - smoothstep(.2, .55, k)));
          vec3 c = dash > .5 ? col : mix(col, vec3(1.0, .85, .85), smoothstep(.15, .2, k) * (1.0 - smoothstep(.2, .3, k)));
          gl_FragColor = vec4(c, clamp(core * p * a, 0.0, 1.0)); }` });
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 6; twin.flows.add(mesh);
    const node = new THREE.Mesh(new THREE.CircleGeometry(live ? 0.011 : 0.007, 20), new THREE.MeshBasicMaterial({ color: live ? 0xff2020 : 0x2c2c2c, transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
    node.rotation.x = -Math.PI / 2; node.position.copy(pts[pts.length - 1]).setY(0.006); twin.flows.add(node);
    twin.mats.push({ m, node, f, a: 1, goal: 1 });
  }
  $("layers").querySelectorAll("button").forEach(b => b.onclick = () => setLayer(b.dataset.l, !layers[b.dataset.l]));
  for (const k in layers) setLayer(k, layers[k]);
}
function ribbon(points, width) {
  const pos = [], s = [], side = [], idx = []; let acc = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const d = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(width / 2);
    if (i > 0) acc += p.distanceTo(points[i - 1]);
    pos.push(p.x + n.x, p.y, p.z + n.z, p.x - n.x, p.y, p.z - n.z); s.push(acc, acc); side.push(1, -1);
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("s", new THREE.Float32BufferAttribute(s, 1)); g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1)); g.setIndex(idx);
  return { g, len: acc };
}
function setLayer(k, on) {
  layers[k] = on;
  $("layers").querySelector(`[data-l="${k}"]`)?.classList.toggle("on", on);
  if (k === "labels") $("pins").classList.toggle("off", !on);
  if (k === "status") $("twin").classList.toggle("no-status", !on);
  if (k === "energy") $("twin").classList.toggle("no-energy", !on);
  if (k === "night") document.body.classList.toggle("night", on);
}
// an open object: its own lines stay bright, the rest of the network steps back
function focusFlows(num) {
  for (const t of twin.mats) t.goal = !num ? 1 : t.f.to.includes(num) ? 1.35 : 0.18;
}
const DAY = { exp: 1.05, env: 0.85, sun: 1.6, hemi: 0.35 }, NIGHT = { exp: 0.9, env: 0.06, sun: 0.1, hemi: 0.05 };
const sunDay = new THREE.Color(0xfff3e2), sunNight = new THREE.Color(0x8fa6ff);
function tickTwin(dt, t) {
  const n = twin.night += ((layers.night ? 1 : 0) - twin.night) * (1 - Math.exp(-dt * 3));
  renderer.toneMappingExposure = THREE.MathUtils.lerp(DAY.exp, NIGHT.exp, n);
  scene.environmentIntensity = THREE.MathUtils.lerp(DAY.env, NIGHT.env, n);
  sun.intensity = THREE.MathUtils.lerp(DAY.sun, NIGHT.sun, n); sun.color.lerpColors(sunDay, sunNight, n);
  hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, n);
  twin.status.visible = layers.status; twin.flows.visible = layers.energy;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  for (const l of twin.lines) {
    const dim = selected >= 0 && STOPS[selected] !== l.s ? 0.35 : 1;
    l.e.material.opacity = l.base * dim * (l.s.status === "q1" ? 0.7 + 0.3 * pulse : 1);
    l.f.material.opacity = l.fill * (l.s.status === "plan" ? 1 : dim) * (l.s.status === "q1" ? (1 + n * 1.5) * (0.75 + 0.25 * pulse) : 1);
  }
  for (const m of twin.mats) {
    m.a += (m.goal - m.a) * (1 - Math.exp(-dt * 4));
    m.m.uniforms.t.value = t; m.m.uniforms.a.value = m.a * (1 + n * 0.6); m.node.material.opacity = 0.9 * Math.min(1, m.a);
  }
}

let lastT = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now; tickPlant(dt); tickTwin(dt, now / 1000);
  stepFlight(now);
  off += (offTarget - off) * 0.06; applyOffset();
  controls.update();
  const pulse = 0.5 + 0.5 * Math.sin(now / 300); hlMat.opacity = 0.6 + 0.4 * pulse; fillMat.opacity = 0.1 + 0.14 * pulse;
  renderer.render(scene, camera);
  placePins();
  sph.setFromVector3(tmp.copy(camera.position).sub(controls.target));
  const az = THREE.MathUtils.radToDeg(sph.theta);
  $("needle").style.transform = `rotate(${(az + 180).toFixed(1)}deg)`;
  if (now - lastReadout > 120) {
    lastReadout = now;
    $("coords").textContent = offTarget === 0
      ? `AZ ${String(Math.round((az + 360) % 360)).padStart(3, "0")}° · EL ${Math.round(90 - THREE.MathUtils.radToDeg(sph.phi))}° · R ${sph.radius.toFixed(2)} м`
      : "51.72° N · 75.32° E";
  }
});
