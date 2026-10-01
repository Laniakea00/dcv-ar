// Долина ЦОД · 3D-макет: приветствие → свободный осмотр GLB → сценарии (scenarios.html?s=…)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const $ = id => document.getElementById(id);
const MODEL = "DolinaCOD_GRES2.glb", MODEL_BYTES = 14289388;
const SCENARIOS = [
  { k: "tour_min", n: 1, title: "Экспликация", text: "Объекты макета по порядку 1 → 11: камера летит к объекту, он подсвечивается, справа — данные табличек", meta: "по шагам · → / ←", pic: "img/preview_tour_min.jpg" },
  { k: "4d_min", n: 2, title: "4D-строительство", text: "Объекты строятся по порядку номеров: площадка, каркас, стены, кровля, краны", meta: "≈ 80 с · пробел — пауза", pic: "img/preview_4d_min.jpg" },
  { k: "inside_min", n: 3, title: "Внутри ЦОД №1", text: "Машинный зал со стойками NVIDIA GB300 NVL72, вычислительный лоток разбирается и собирается", meta: "≈ 80 с · пробел — пауза", pic: "img/preview_inside_min.jpg" },
];
const mobile = matchMedia("(max-width: 860px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const narrow = () => matchMedia("(max-width: 760px)").matches;
const pad2 = n => String(n).padStart(2, "0");
const ARROW = `<svg viewBox="0 0 16 16"><path d="M4 12L12 4M12 4H4M12 4V12"/></svg>`;

// ---------------------------------------------------------------- scenarios: tabs + card on the welcome, segmented bar in 3D
const openScenario = k => { $("wait").hidden = false; setTimeout(() => { location.href = "scenarios.html?s=" + encodeURIComponent(k); }, 40); };
let scenIdx = 0;
$("tabs").innerHTML = SCENARIOS.map((s, i) => `<button class="tab${i ? "" : " on"}" data-i="${i}"><small>/SC_00${s.n}</small><span>${s.title}</span></button>`).join("");
function showScen(i) {
  scenIdx = i; const s = SCENARIOS[i];
  document.querySelectorAll(".tab").forEach((t, k) => t.classList.toggle("on", k === i));
  $("sLabel").textContent = `/SC_00${s.n}`; $("sTitle").textContent = s.title; $("sText").textContent = s.text; $("sMeta").textContent = s.meta;
  $("sPic").style.backgroundImage = `url(${s.pic})`;
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => showScen(+t.dataset.i));
$("sGo").onclick = () => openScenario(SCENARIOS[scenIdx].k);
showScen(0);
$("dockBtns").innerHTML = SCENARIOS.map(s => `<button class="dbtn" data-k="${s.k}" title="${s.text}"><small>/SC_00${s.n}</small><span>${s.title}${ARROW}</span></button>`).join("");
document.querySelectorAll(".dbtn").forEach(b => b.onclick = () => openScenario(b.dataset.k));
addEventListener("pageshow", e => { if (e.persisted) $("wait").hidden = true; });
const toScenarios = () => $("scenarios").scrollIntoView({ behavior: "smooth" });
$("toScen").onclick = toScenarios; $("scrollHint").onclick = toScenarios;
document.querySelectorAll(".qbar .nav button").forEach(b => b.onclick = () => {
  const go = b.dataset.go;
  if (go === "view") { if (!$("enter").disabled) enter(); }
  else { if (!$("view").hidden) showWelcome(); setTimeout(() => go === "scenarios" ? toScenarios() : $("welcome").scrollTo({ top: 0, behavior: "smooth" }), 60); }
});

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
scene.add(sun, sun.target, new THREE.HemisphereLight(0xdfe8ff, 0x22272e, 0.35));
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 0.25, maxDistance: 12, maxPolarAngle: 1.47, autoRotate: true, autoRotateSpeed: 0.35,
  screenSpacePanning: false, zoomToCursor: true, enabled: false });
controls.target.set(0, 0, 0);

// home view: from the logo side of the table (north, -z), the whole maket in frame whatever the aspect
const homeView = () => {
  const portrait = camera.aspect < 0.85;
  camera.fov = portrait ? 50 : 38; camera.updateProjectionMatrix();
  const vfov = THREE.MathUtils.degToRad(camera.fov), t = Math.tan(vfov / 2), aspect = camera.aspect;
  // portrait: look along the long side of the maket (from the west), landscape: from the logo side (north)
  const halfW = portrait ? 0.8 : 1.3, halfD = portrait ? 1.25 : 0.8;
  const el = THREE.MathUtils.degToRad(portrait ? 52 : 38);
  const d = portrait ? Math.max(halfW / (t * aspect), (halfD * Math.sin(el) + 0.1) / t) * 1.06 : Math.max(1.35 / (t * aspect), 0.95 / t) * 1.08;
  const dir = portrait ? new THREE.Vector3(-1, 0, -0.18).normalize() : new THREE.Vector3(0.08, 0, -1).normalize();
  const pos = dir.multiplyScalar(Math.cos(el) * d); pos.y = Math.sin(el) * d;
  return { pos, target: new THREE.Vector3(0, -0.04, 0.0) };
};
{ const h = homeView(); camera.position.copy(h.pos).multiplyScalar(1.6); controls.target.copy(h.target); }

// ---------------------------------------------------------------- camera flights
let flight = null;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function flyTo(pos, target, ms = 1400) {
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), ms };
}
function stepFlight(now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.start) / flight.ms), e = ease(k);
  camera.position.lerpVectors(flight.p0, flight.p1, e); controls.target.lerpVectors(flight.t0, flight.t1, e);
  if (k >= 1) flight = null;
}
controls.addEventListener("start", () => { flight = null; userTouched(); });

// ---------------------------------------------------------------- the maket's objects (экспликация 1–11)
let STOPS = [], OX = 0, OY = 0, model = null, selected = -1;
const W3 = (x, y, h = 0) => new THREE.Vector3(x - OX, h, -(y - OY));   // maket metres (X east, Y north) → scene
const hl = new THREE.Group(); scene.add(hl);
const hlMat = new THREE.LineBasicMaterial({ color: 0xff3939, transparent: true, opacity: 1, depthTest: false });
const fillMat = new THREE.MeshBasicMaterial({ color: 0xda0a1a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

async function loadStops() {
  const d = await (await fetch("stops.json")).json();
  [OX, OY] = d.origin; STOPS = d.stops;
}
function measureStops() {
  const meshes = []; model.traverse(o => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); meshes.push(b); } });
  for (const s of STOPS) {
    s.rects = s.boxes.map(([x0, x1, y0, y1]) => {
      const a = W3(x0, y0), b = W3(x1, y1);
      const r = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), top: 0.012 };
      for (const m of meshes) {
        const cx = (m.min.x + m.max.x) / 2, cz = (m.min.z + m.max.z) / 2, sx = m.max.x - m.min.x, sz = m.max.z - m.min.z;
        if (cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1 && sx < 0.6 && sz < 0.6 && m.max.y < 0.6) r.top = Math.max(r.top, m.max.y);
      }
      r.top = Math.max(r.top, s.num === "9" ? 0.26 : 0.034);   // over the roofs (the buildings are merged meshes)
      return r;
    });
    const all = s.rects;
    s.box = { x0: Math.min(...all.map(r => r.x0)), x1: Math.max(...all.map(r => r.x1)), z0: Math.min(...all.map(r => r.z0)), z1: Math.max(...all.map(r => r.z1)), top: Math.max(...all.map(r => r.top)) };
    // the pin stands over the biggest part
    const big = all.slice().sort((p, q) => (q.x1 - q.x0) * (q.z1 - q.z0) - (p.x1 - p.x0) * (p.z1 - p.z0))[0];
    s.pinAt = new THREE.Vector3((big.x0 + big.x1) / 2, big.top + 0.02, (big.z0 + big.z1) / 2);
  }
}
function buildUI() {
  $("objList").innerHTML = STOPS.map((s, i) => `<li data-i="${i}"><span class="n">/${pad2(s.num)}</span><span>${s.legend}</span></li>`).join("");
  $("objList").querySelectorAll("li").forEach(li => li.onclick = () => { select(+li.dataset.i); if (narrow()) $("objects").classList.remove("open"); });
  $("pins").innerHTML = STOPS.map((s, i) => `<div class="pin" data-i="${i}"><span class="tip">${s.short || s.legend}</span><span class="n">${s.num}</span></div>`).join("");
  $("chips").innerHTML = [[0, "ЦОД «Казахтелеком»", "50 МВт"], [1, "ЦОД «Firebird»", "136 МВт"], [3, "Подстанция", "500/35 кВ"], [8, "ГРЭС-1", ""], [9, "Водопровод", ""], [10, "Очистные", ""]]
    .map(([i, t, v]) => `<button class="chip" data-i="${i}">${t}${v ? `<b>${v}</b>` : ""}</button>`).join("");
  document.querySelectorAll(".chip").forEach(c => c.onclick = () => { enter(); setTimeout(() => select(+c.dataset.i), 500); });
  $("pins").querySelectorAll(".pin").forEach(p => p.onclick = () => select(+p.dataset.i));
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
function select(i) {
  if (i < 0 || i >= STOPS.length) return;
  selected = i; const s = STOPS[i];
  controls.autoRotate = false; $("spin").classList.remove("on");
  highlight(s);
  document.querySelectorAll("#objList li").forEach((li, k) => li.classList.toggle("on", k === i));
  document.querySelectorAll(".pin").forEach((p, k) => p.classList.toggle("on", k === i));
  $("objList").children[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  $("cLabel").textContent = "/" + pad2(s.num); $("cPos").textContent = `${i + 1} / ${STOPS.length}`; $("cKind").textContent = s.kind || ""; $("cTitle").textContent = s.title || s.legend;
  $("cVal").textContent = s.value || ""; $("cSub").textContent = s.sub || "";
  if (s.logo) $("cLogo").src = `img/logo_${s.logo}.png`; else $("cLogo").removeAttribute("src");
  $("card").hidden = false;
  // fly: keep the current direction around the object, look from ~45°
  const b = s.box, c = new THREE.Vector3((b.x0 + b.x1) / 2, b.top * 0.5, (b.z0 + b.z1) / 2);
  const size = Math.max(b.x1 - b.x0, b.z1 - b.z0, b.top * 1.6);
  const vfov = THREE.MathUtils.degToRad(camera.fov), dist = Math.max(0.3, (size * 0.75) / Math.tan(vfov / 2) / Math.min(1, camera.aspect * 0.9) + 0.12);
  const dir = camera.position.clone().sub(controls.target); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
  const el = THREE.MathUtils.degToRad(46);
  const pos = c.clone().addScaledVector(dir, Math.cos(el) * dist); pos.y = c.y + Math.sin(el) * dist;
  flyTo(pos, c, 1300);
}
function deselect() {
  selected = -1; highlight(null); $("card").hidden = true;
  document.querySelectorAll("#objList li.on, .pin.on").forEach(e => e.classList.remove("on"));
}
$("cardClose").onclick = deselect;
$("prev").onclick = () => select((selected - 1 + STOPS.length) % STOPS.length);
$("next").onclick = () => select((selected + 1) % STOPS.length);
$("objToggle").onclick = () => $("objects").classList.toggle("open");

// ---------------------------------------------------------------- tools
const goHome = (ms = 1400) => { const h = homeView(); flyTo(h.pos, h.target, ms); };
$("reset").onclick = () => { deselect(); goHome(); };
$("spin").onclick = () => { controls.autoRotate = !controls.autoRotate; $("spin").classList.toggle("on", controls.autoRotate); };
$("labels").onclick = () => { const off = $("pins").classList.toggle("off"); $("labels").classList.toggle("on", !off); };
$("fs").onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
$("home").onclick = () => showWelcome();
let hintTimer = 0;
function userTouched() { $("hint").classList.add("out"); }
addEventListener("keydown", e => {
  if ($("view").hidden) { const i = +e.key; if (i >= 1 && i <= SCENARIOS.length) openScenario(SCENARIOS[i - 1].k); if (e.key === "Enter" && !$("enter").disabled) enter(); return; }
  if (e.key === "ArrowRight") select((selected + 1) % STOPS.length);
  else if (e.key === "ArrowLeft") select((selected - 1 + STOPS.length) % STOPS.length);
  else if (e.key === "Escape") deselect();
  else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") { deselect(); goHome(); }
});

// ---------------------------------------------------------------- welcome ↔ 3D
let offTarget = 0;
function setNav(go) { document.querySelectorAll(".qbar .nav button").forEach(b => b.classList.toggle("on", b.dataset.go === go)); }
function enter() {
  if ($("enter").disabled) return;
  document.body.classList.replace("at-welcome", "at-view"); setNav("view"); offTarget = 0;
  $("welcome").classList.add("out");
  setTimeout(() => { $("welcome").hidden = true; }, 700);
  $("view").hidden = false; controls.enabled = true; controls.autoRotate = true; $("spin").classList.add("on");
  goHome(1800);
  history.replaceState(null, "", "?view=3d");
  clearTimeout(hintTimer); $("hint").classList.remove("out"); hintTimer = setTimeout(userTouched, 7000);
}
function showWelcome() {
  document.body.classList.replace("at-view", "at-welcome"); setNav("welcome"); offTarget = 1; $("objects").classList.remove("open");
  deselect(); $("view").hidden = true; controls.enabled = false; controls.autoRotate = true;
  $("welcome").hidden = false; requestAnimationFrame(() => $("welcome").classList.remove("out"));
  const h = homeView(); flyTo(h.pos.clone().multiplyScalar(1.6), h.target, 1200);
  history.replaceState(null, "", location.pathname);
}
$("enter").onclick = enter; $("headCta").onclick = enter; $("headCta").disabled = true;

// ---------------------------------------------------------------- loading
const setProgress = f => { $("loadBar").style.width = (f * 100).toFixed(0) + "%"; $("loadPct").textContent = `${(f * 100).toFixed(0)} %`; };
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
  measureStops(); buildUI();
  $("enter").disabled = false; $("enter").classList.add("ready"); $("headCta").disabled = false;
  $("enterLabel").innerHTML = `Смотреть в 3D`; $("enter").insertAdjacentHTML("beforeend", ARROW);
  if (new URLSearchParams(location.search).get("view") === "3d") enter();
}).catch(err => {
  console.error(err); $("enterLabel").textContent = "Не удалось загрузить — обновите страницу"; $("loadPct").textContent = "";
});

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
    if (vis) p.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
  });
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.85 ? 50 : 38; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
let off = 1; offTarget = new URLSearchParams(location.search).get("view") === "3d" ? 0 : 1;
function applyOffset() {
  const w = innerWidth, h = innerHeight, bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 80;
  const wide = w / h > 1.1;
  const ox = (wide ? -0.17 * w : 0) * off, oy = (wide ? -0.02 * h : -0.12 * h) * off - (bar / 2) * (1 - off);
  if (Math.abs(ox) + Math.abs(oy) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(w, h, ox, oy, w, h);
}
renderer.setAnimationLoop(now => {
  stepFlight(now);
  off += (offTarget - off) * 0.06; applyOffset();
  if (!$("view").hidden || !controls.enabled) { if (!flight) controls.update(); else controls.update(); }
  const pulse = 0.5 + 0.5 * Math.sin(now / 300); hlMat.opacity = 0.6 + 0.4 * pulse; fillMat.opacity = 0.1 + 0.14 * pulse;
  renderer.render(scene, camera);
  placePins();
});
