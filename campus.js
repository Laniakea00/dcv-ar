// "Кампус 500 МВт": a concept of how ten 50 MW modules like ЦОД-1 could share one site (the master plan is not fixed).
// ЦОД-1 stays exactly as it is, with all its layers and stories. Modules 2–10 are light copies of the same module
// (model/campus_module.glb: buildings, energy blocks at the long edges, roads, the 35 kV switchyard), two rows of five
// along a central avenue; the right row is mirrored so every switchyard faces the avenue, where the utility corridor
// brings power from the shared main substation (ГПП, model/campus_gpp.glb) at the head of the avenue. ЦОД-1 keeps its
// own substation. All coordinates are the module frame of the Unity export (metres, glTF: x = -Unity x).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { tubeMaterial } from './story.js';

const TILE_HALF_D = 346, AVE = 180, AX = 550 + AVE / 2, GAP = 70, PITCH = 692 + GAP;
const GPP_Z = TILE_HALF_D + GAP + 150;
const PAD = { x0: -364, x1: 514, x2: 236, z0: -154, z1: 190 }; // buildings + pads of one module (x2: without the substation yard)
const RU = { x: 198, z: 104 };                                // its 35 kV switchyard (Распределительное устройство)
// phase order: 1 = ЦОД-1 (left row, first), then alternating across the avenue, away from the substation
export const TILES = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, row: i >> 1, mirror: i % 2 === 1 }));
TILES.forEach(t => { t.dz = -t.row * PITCH; });
const Z_MIN = -4 * PITCH - TILE_HALF_D, Z_MAX = GPP_Z + 150, X_MIN = -500, X_MAX = 2 * AX + 500;
export const CAMPUS = { center: new THREE.Vector3((X_MIN + X_MAX) / 2, 0, (Z_MIN + Z_MAX) / 2), length: Z_MAX - Z_MIN, width: X_MAX - X_MIN };

const tileX = (t, x) => (t.mirror ? 2 * AX - x : x);
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));

export class Campus {
  constructor({ model, labels, grass, pad }) {
    this.model = model; this.labels = labels; this.grass = grass || new THREE.Color(0x7fae55); this.pad = pad || new THREE.Color(0xdfe3e6);
    this.root = new THREE.Group(); this.root.name = 'Campus concept'; this.root.visible = false; model.add(this.root);
    this.f = 0; this.target = 0; this.time = 0;
    this.built = 1; this.state = { built: 1, gpp: false, lines: false, plots: false };
    this.mods = []; this.tags = []; this.ready = null;
  }

  // module frame -> mat: the campus lies across the mat (long axis = mat x), centred, ground at y = 0
  fitFor(width) {
    const s = width / CAMPUS.length, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const pos = CAMPUS.center.clone().multiplyScalar(-s).applyQuaternion(q); pos.y = 0.5 * s;
    return { pos, quat: q, scale: s };
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const [mod, gpp] = await Promise.all([load('model/campus_module.glb'), load('model/campus_gpp.glb')]);
      this.buildGround();
      for (const t of TILES) {
        if (t.n === 1) { this.mods.push(null); continue; }            // ЦОД-1 is the real, detailed model
        const g = new THREE.Group(); g.name = `ЦОД-${t.n}`;
        const m = mod.clone(true);
        m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x49d6ff); o.material.emissiveIntensity = 0; o.castShadow = o.receiveShadow = true; } });
        g.add(m);
        // the module's building pad, without the big substation yard (the campus has one shared ГПП)
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD.x2 - PAD.x0, PAD.z1 - PAD.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: this.pad, roughness: 0.9 }));
        pad.position.set((PAD.x0 + PAD.x2) / 2, 0.3, (PAD.z0 + PAD.z1) / 2); pad.receiveShadow = true; g.add(pad);
        g.position.set(t.mirror ? 2 * AX : 0, 0, t.dz); g.scale.set(t.mirror ? -1 : 1, 0.001, 1);
        g.visible = false; this.root.add(g);
        this.mods.push({ t, g, a: 0, mats: (() => { const a = []; m.traverse(o => { if (o.isMesh) a.push(o.material); }); return a; })() });
      }
      // shared main substation: the module's substation twice, mirrored, at the head of the avenue
      const bb = new THREE.Box3().setFromObject(gpp), c = bb.getCenter(new THREE.Vector3());
      this.gpp = new THREE.Group(); this.gpp.name = 'ГПП 500 кВ';
      for (const side of [-1, 1]) {
        const k = gpp.clone(true); const h = new THREE.Group(); h.add(k);
        k.position.set(-c.x, 0, -c.z); h.scale.set(side, 1, 1); h.position.set(AX + side * 175, 0, GPP_Z);
        this.gpp.add(h);
      }
      this.gpp.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      this.gpp.scale.y = 0.001; this.gpp.visible = false; this.root.add(this.gpp);
      this.buildLines(); this.buildPlots(); this.buildTags();
    })();
    return this.ready;
  }

  buildGround() {
    const add = (w, d, x, z, y, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      m.position.set(x, y, z); m.receiveShadow = true; this.root.add(m); return m;
    };
    const M = 160;
    add(X_MAX - X_MIN + 2 * M, Z_MAX - Z_MIN + 2 * M, CAMPUS.center.x, CAMPUS.center.z, -0.6, this.grass);        // grass (the module's lawn colour)
    add(40, Z_MAX - Z_MIN + M, AX, CAMPUS.center.z - M / 2, -0.3, 0x8d949b);                                     // avenue
    add(14, Z_MAX - Z_MIN + M, AX + 42, CAMPUS.center.z - M / 2, -0.35, 0xb9b3a6);                               // utility corridor
    for (let k = 0; k < 4; k++) add(X_MAX - X_MIN + M, 22, CAMPUS.center.x, -TILE_HALF_D - GAP / 2 - k * PITCH, -0.3, 0x8d949b); // cross roads
    add(X_MAX - X_MIN + M, 22, CAMPUS.center.x, TILE_HALF_D + GAP / 2, -0.3, 0x8d949b);
    add(700, 330, AX, GPP_Z, -0.25, 0xc7c9c4);                                                                   // ГПП pad
    // perimeter fence
    const P = [[X_MIN - M * 0.6, Z_MIN - M * 0.6], [X_MAX + M * 0.6, Z_MIN - M * 0.6], [X_MAX + M * 0.6, Z_MAX + M * 0.6], [X_MIN - M * 0.6, Z_MAX + M * 0.6]];
    const fence = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P.map(([x, z]) => new THREE.Vector3(x, 1, z))), new THREE.LineBasicMaterial({ color: 0xe8eef2 }));
    this.root.add(fence);
    // tree lines along the avenue and the fence (instanced low-poly trees)
    const pts = [];
    for (let z = Z_MIN - 40; z < Z_MAX; z += 38) { pts.push([AX - 62, z], [AX + 70, z]); }
    for (let x = X_MIN - M * 0.45; x < X_MAX + M * 0.45; x += 55) { pts.push([x, Z_MIN - M * 0.45], [x, Z_MAX + M * 0.45]); }
    for (let z = Z_MIN - M * 0.45; z < Z_MAX + M * 0.45; z += 55) { pts.push([X_MIN - M * 0.45, z], [X_MAX + M * 0.45, z]); }
    const crown = new THREE.ConeGeometry(7, 18, 7).translate(0, 16, 0), trunk = new THREE.CylinderGeometry(1, 1.3, 8, 5).translate(0, 4, 0);
    const trees = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9 }), pts.length);
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x6b5238 }), pts.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const s = 0.8 + ((i * 7919) % 100) / 250; m.makeScale(s, s, s).setPosition(x, 0, z);
      trees.setMatrixAt(i, m); trunks.setMatrixAt(i, m); trees.setColorAt(i, col.setHSL(0.28 + ((i * 31) % 10) / 150, 0.45, 0.28 + ((i * 17) % 10) / 90));
    });
    trees.castShadow = trunks.castShadow = true;
    this.root.add(trees, trunks);
  }

  buildLines() {
    this.lines = new THREE.Group(); this.lines.visible = false; this.root.add(this.lines);
    const y = 16, spineX = AX + 42;
    const tube = (pts, color) => {
      const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const mat = tubeMaterial(new THREE.Color(color), false, false);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(24, pts.length * 30), 3.2, 6, false), mat);
      mesh.frustumCulled = false; this.lines.add(mesh); return mat;
    };
    this.lineMats = [];
    this.lineMats.push(tube([new THREE.Vector3(spineX, y, GPP_Z - 120), new THREE.Vector3(spineX, y, Z_MIN + 120)], '#62b8ff'));
    for (const t of TILES) {
      const z = t.dz + RU.z, x = tileX(t, RU.x);
      this.lineMats.push(tube([new THREE.Vector3(spineX, y, z), new THREE.Vector3(x, y, z), new THREE.Vector3(x, 8, z)], '#62b8ff'));
    }
  }

  buildPlots() { // footprints of the ten modules (shown while the plan is laid out, and under a rising module)
    this.plots = [];
    for (const t of TILES) {
      const c = [[PAD.x0, PAD.z0], [PAD.x2, PAD.z0], [PAD.x2, PAD.z1], [PAD.x0, PAD.z1]].map(([x, z]) => new THREE.Vector3(tileX(t, x), 2, t.dz + z));
      const mat = new THREE.LineBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0, depthWrite: false });
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c), mat); this.root.add(l);
      this.plots.push({ t, mat });
    }
  }

  buildTags() {
    const tag = (text, pos, cls = '') => { const el = document.createElement('div'); el.className = 'tag campus ' + cls; el.textContent = text; el.style.opacity = 0; this.labels.appendChild(el); this.tags.push({ el, pos }); return el; };
    for (const t of TILES) tag(t.n === 1 ? 'ЦОД-1 · 50 МВт' : `ЦОД-${t.n}`, new THREE.Vector3(tileX(t, 0), 60, t.dz), t.n === 1 ? 'first' : '');
    this.gppTag = tag('ГПП 500 кВ', new THREE.Vector3(AX, 60, GPP_Z));
  }

  // story / mode control: how many modules stand, substation, lines, footprints
  apply(st) { Object.assign(this.state, st); }
  enter() { this.target = 1; this.root.visible = true; return this.init(); }
  exit() { this.target = 0; }
  get mw() { return 50 * Math.round(this.built); }

  tick(dt) {
    this.time += dt;
    this.f += Math.sign(this.target - this.f) * Math.min(Math.abs(this.target - this.f), dt / 1.6);
    this.root.visible = this.f > 0.001;
    if (!this.mods.length) return;
    // modules rise one after another (0.55 s apart), glow while they rise
    this.built += Math.sign(this.state.built - this.built) * Math.min(Math.abs(this.state.built - this.built), dt / 0.55);
    for (const m of this.mods) {
      if (!m) continue;
      const want = this.built >= m.t.n - 0.02 ? 1 : Math.max(0, this.built - (m.t.n - 1));
      m.a += Math.sign(want - m.a) * Math.min(Math.abs(want - m.a), dt / 0.9);
      m.g.visible = m.a > 0.002; m.g.scale.y = Math.max(0.001, ease(m.a));
      const glow = m.a > 0 && m.a < 1 ? 0.9 * (1 - m.a) : 0;
      for (const mat of m.mats) mat.emissiveIntensity = glow;
    }
    for (const p of this.plots) {
      const m = this.mods[p.t.n - 1], rising = m && m.a > 0 && m.a < 1;
      p.mat.opacity = (this.state.plots || rising ? 0.55 + 0.3 * Math.sin(this.time * 3) : 0) * this.f;
    }
    const g = this.state.gpp ? 1 : 0;
    this.gppA = (this.gppA || 0) + Math.sign(g - (this.gppA || 0)) * Math.min(Math.abs(g - (this.gppA || 0)), dt / 1.2);
    this.gpp.visible = this.gppA > 0.002; this.gpp.scale.y = Math.max(0.001, ease(this.gppA));
    this.lines.visible = this.state.lines;
    this.lineGrow = this.state.lines ? Math.min(1, (this.lineGrow || 0) + dt / 2.5) : 0;
    for (const mat of this.lineMats) { mat.uniforms.time.value = this.time; mat.uniforms.grow.value = this.lineGrow; mat.uniforms.fade.value = this.f; }
  }

  // HTML captions of the modules (cam = the rendering camera)
  drawTags(cam) {
    const v = new THREE.Vector3();
    this.tags.forEach((t, i) => {
      let show = this.f > 0.95;
      if (show && i < 10) show = i === 0 || (this.mods[i] && this.mods[i].a > 0.9);
      if (show && t.el === this.gppTag) show = this.gppA > 0.9;
      if (show) { v.copy(t.pos); this.model.localToWorld(v).project(cam); show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; }
      t.el.style.opacity = show ? 1 : 0;
      if (show) { t.el.style.left = (v.x + 1) / 2 * innerWidth + 'px'; t.el.style.top = (1 - v.y) / 2 * innerHeight + 'px'; }
    });
  }
}
