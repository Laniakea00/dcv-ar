// «Кампус» as on the new maket of the campus (SketchUp «maket для работы.skp», 2.34 × 1.44 m plate): ten data-center
// modules in four rows, two half modules at the east end of the first and third rows, the water works and ЛОС in the
// west, the energy centre with its two stacks in the east. ЦОД-1 stays the full model with all its layers and stories and
// stands on the maket's module B1 (the one with the admin building). Modules 2–10 and the half modules are light copies
// of its buildings (model/campus_bldg.glb), fitted to the modules of the maket; the water works, ЛОС and the energy centre
// are the maket's own shapes (model/campus_site.glb, tools/make_maket_site.mjs). Roads, lawn and trees are added here.
// All coordinates are the module frame of the Unity export (metres, glTF: x = -Unity x); north of the maket = -z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { tubeMaterial } from './story.js';
import { withCutGlow } from './build4d.js';

// maket → model: mm on the plate from its north-west corner, K mm of the maket per model metre (the maket's buildings are
// 31 mm tall, ours 42 m; module B1's buildings centre = ЦОД-1's buildings centre)
export const MAKET = { w: 2336, d: 1436, K: 0.738, B1: [402, 568], C1: [-53, 13] };
const M = (X, Z) => [(X - MAKET.B1[0]) / MAKET.K + MAKET.C1[0], (Z - MAKET.B1[1]) / MAKET.K + MAKET.C1[1]];
const BLD = { x0: -257, x1: 151, z0: -150, z1: 176 };            // the two energy blocks of a module: their outer edges
// the modules of the maket: the outer edges of their energy-block rows, mm [x0, x1, z0, z1] (measured on the maket's
// height map); phase order: ЦОД-1, ЦОД-2 next to it, then south, then north; ½ = half module (two roof sections)
const SLOTS = [
  ['B1', 251, 553, 448, 688], ['B2', 578, 865, 450, 687], ['C1', 250, 553, 785, 1024], ['C2', 577, 865, 785, 1024],
  ['D1', 251, 553, 1119, 1356], ['D2', 578, 865, 1120, 1356], ['C3', 910, 1210, 783, 1021], ['D3', 907, 1210, 1089, 1305],
  ['A1', 450, 852, 111, 354], ['A2', 911, 1210, 112, 352], ['A3', 1245, 1391, 120, 355, true], ['C4', 1245, 1391, 788, 1023, true],
];
export const TILES = SLOTS.map(([id, X0, X1, Z0, Z1, half], i) => {
  const [x0, z0] = M(X0, Z0), [x1, z1] = M(X1, Z1);
  const sx = (x1 - x0) / (BLD.x1 - BLD.x0), sz = (z1 - z0) / (BLD.z1 - BLD.z0);
  return { n: i + 1, id, half: !!half, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, sx, sz,
    px: (x0 + x1) / 2 - sx * (BLD.x0 + BLD.x1) / 2, pz: (z0 + z1) / 2 - sz * (BLD.z0 + BLD.z1) / 2 };
});
const box = (X0, X1, Z0, Z1) => { const [x0, z0] = M(X0, Z0), [x1, z1] = M(X1, Z1); return { x0, x1, z0, z1 }; };
const PLATE = box(0, MAKET.w, 0, MAKET.d);
const SITE = { 'Водопроводные сооружения': box(55, 240, 815, 1005), 'ЛОС': box(35, 240, 1060, 1315), 'Энергоцентр': box(1990, 2260, 320, 900) };
const ROADS_Z = [60, 402, 736, 1062, 1395].map(Z => M(0, Z)[1]);  // east-west roads, between the rows
const ROADS_X = [886, 1225, 1420].map(X => M(X, 0)[0]);         // north-south roads, in the gaps between the columns
const WEST = M(238, 0)[0], EAST = M(2290, 0)[0], NORTH = ROADS_Z[0], SOUTH = ROADS_Z[4];
const EC = M(2100, 736);                                          // the energy centre's feeder point, on the middle road

export const CAMPUS = { center: new THREE.Vector3((PLATE.x0 + PLATE.x1) / 2, 0, (PLATE.z0 + PLATE.z1) / 2), width: PLATE.x1 - PLATE.x0, depth: PLATE.z1 - PLATE.z0,
  maketScale: MAKET.K / 1000 };                                   // physical maket: metres per model metre

const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;

export class Campus {
  constructor({ model, labels, grass, pad, road }) {
    this.model = model; this.labels = labels;
    this.grass = grass || new THREE.Color(0x7fae55); this.pad = pad || new THREE.Color(0xdfe3e6); this.road = road || new THREE.Color(0x8d949b);
    this.root = new THREE.Group(); this.root.name = 'Campus (maket)'; this.root.visible = false; model.add(this.root);
    this.f = 0; this.target = 0; this.time = 0;
    this.built = 1; this.state = { built: 1, gpp: false, lines: false, plots: false, infra: false };
    this.mods = []; this.tags = []; this.ready = null; this.gppA = 0; this.infraA = 0; this.lineGrow = 0;
  }

  // module frame -> mat: the whole maket inside w x h (m), same orientation as the module, ground at y = 0
  fitFor(w, h = w) {
    const s = Math.min(w / CAMPUS.width, h / CAMPUS.depth);
    const pos = CAMPUS.center.clone().multiplyScalar(-s); pos.y = 0.5 * s;
    return { pos, quat: new THREE.Quaternion(), scale: s };
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const [bldg, site] = await Promise.all([load('model/campus_bldg.glb'), load('model/campus_site.glb')]);
      this.buildGround(); this.buildRoads();
      for (const t of TILES) {
        if (t.n === 1) { this.mods.push(null); continue; }            // ЦОД-1 is the real, detailed model
        const g = new THREE.Group(); g.name = t.half ? `Модуль ½ (${t.id})` : `ЦОД-${t.n}`;
        const m = bldg.clone(true);
        m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x49d6ff); o.material.emissiveIntensity = 0; o.castShadow = o.receiveShadow = true; } });
        g.add(m); g.position.set(t.px, 0, t.pz); g.scale.set(t.sx, 0.001, t.sz); g.visible = false; this.root.add(g);
        this.mods.push({ t, g, a: 0, mats: (() => { const a = []; m.traverse(o => { if (o.isMesh) a.push(o.material); }); return a; })() });
      }
      // the maket's own structures: the energy centre (rises with the «gpp» state), the water works and ЛОС («infra»)
      const white = new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.8, flatShading: true });
      const stack = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.6, flatShading: true });
      this.gpp = new THREE.Group(); this.gpp.name = 'Энергоцентр'; this.infra = new THREE.Group(); this.infra.name = 'Водопровод и ЛОС';
      for (const n of [...site.children]) {
        n.traverse(o => { if (o.isMesh) { o.material = /Дымовые/.test(o.material.name) ? stack : white; o.castShadow = o.receiveShadow = true; } });
        (n.name.startsWith('Энергоцентр') ? this.gpp : this.infra).add(n);
      }
      for (const g of [this.gpp, this.infra]) { g.scale.y = 0.001; g.visible = false; this.root.add(g); }
      this.buildLines(); this.buildPlots(); this.buildTrees(); this.buildTags();
    })();
    return this.ready;
  }

  mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o }); }
  plane(b, y, color, parent = this.root, m = 0) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0 + 2 * m, b.z1 - b.z0 + 2 * m).rotateX(-Math.PI / 2), color.isMaterial ? color : this.mat(color));
    p.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); p.receiveShadow = true; parent.add(p); return p;
  }

  buildGround() { // the plate of the maket: lawn, a white rim, the slab under it
    const P = PLATE, w = P.x1 - P.x0, d = P.z1 - P.z0, rim = 18;
    this.plane(P, -0.6, this.grass);
    const white = this.mat(0xf2f4f5);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * rim, 22, d + 2 * rim), white); slab.position.set((P.x0 + P.x1) / 2, -11.8, (P.z0 + P.z1) / 2); slab.receiveShadow = true; this.root.add(slab);
    for (const [x, z, sx, sz] of [[(P.x0 + P.x1) / 2, P.z0 - rim / 2, w + 2 * rim, rim], [(P.x0 + P.x1) / 2, P.z1 + rim / 2, w + 2 * rim, rim], [P.x0 - rim / 2, (P.z0 + P.z1) / 2, rim, d], [P.x1 + rim / 2, (P.z0 + P.z1) / 2, rim, d]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(sx, 5, sz), white); r.position.set(x, 1.5, z); r.castShadow = r.receiveShadow = true; this.root.add(r);
    }
  }

  // asphalt ribbons (one mesh): the rows' roads, the column gaps, the loop round the modules, the road to the energy centre
  ribbonGeo(list, y) {
    const pos = [];
    for (const [a, b, w] of list) {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      const p = [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
      for (const i of [0, 1, 2, 0, 2, 3]) pos.push(p[i][0], y, p[i][1]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }
  buildRoads() {
    const W = 16, list = [];
    for (const z of ROADS_Z) list.push([[WEST, z], [z === ROADS_Z[2] ? EAST : ROADS_X[2], z], W]);
    for (const x of [WEST, ...ROADS_X]) list.push([[x, NORTH], [x, SOUTH], W]);
    this.roadSegs = list.map(([a, b]) => [a, b]);
    const m = new THREE.Mesh(this.ribbonGeo(list, 0.5), this.mat(this.road, { side: THREE.DoubleSide })); m.receiveShadow = true; this.root.add(m);
  }

  buildLines() { // feeders: the energy centre -> along the middle road -> the north-south road -> each row's road -> each module
    this.lines = new THREE.Group(); this.lines.visible = false; this.root.add(this.lines);
    const y = 16, V = (x, z, h = y) => new THREE.Vector3(x, h, z), X2 = ROADS_X[2];
    this.lineMats = [];
    const tube = (pts, r) => {
      const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const mat = tubeMaterial(new THREE.Color('#62b8ff'), false, false);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(24, pts.length * 40), r, 6, false), mat);
      mesh.frustumCulled = false; this.lines.add(mesh); this.lineMats.push(mat);
    };
    const [ex, ez] = EC, zMid = ROADS_Z[2];
    tube([V(ex, ez, 8), V(ex, zMid), V(X2, zMid), V(X2, ROADS_Z[1]), V(WEST, ROADS_Z[1])], 4.5);
    tube([V(X2, zMid), V(WEST, zMid)], 4.5);
    tube([V(X2, zMid), V(X2, ROADS_Z[3]), V(WEST, ROADS_Z[3])], 4.5);
    for (const t of TILES) {
      const road = t.id[0] === 'A' || t.id[0] === 'B' ? ROADS_Z[1] : t.id[0] === 'C' ? ROADS_Z[2] : ROADS_Z[3];
      const xe = t.x1 + 7;                                         // along the module's east end, into its middle
      tube([V(xe, road), V(xe, t.cz), V(t.x1 - 6, t.cz), V(t.x1 - 6, t.cz, 8)], 3);
    }
  }

  buildPlots() { // footprints of the modules (while the plan is laid out, and under a rising module)
    this.plots = [];
    for (const t of TILES) {
      const d = 10, c = [[t.x0 - d, t.z0 - d], [t.x1 + d, t.z0 - d], [t.x1 + d, t.z1 + d], [t.x0 - d, t.z1 + d]];
      const mat = new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0, depthWrite: false });
      this.root.add(new THREE.Mesh(this.ribbonGeo(c.map((p, i) => [p, c[(i + 1) % 4], 6]), 3), mat));
      this.plane({ x0: c[0][0], x1: c[1][0], z0: c[0][1], z1: c[2][1] }, 2.5, fill);
      this.plots.push({ t, mat, fill });
    }
  }

  buildTrees() { // tree lines along the rim and the roads' ends, groves on the free lawn (never on roads, modules, structures)
    const busy = [...TILES.map(t => ({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 })), { x0: M(160, 0)[0], x1: TILES[0].x0, z0: TILES[0].z0, z1: TILES[0].z1 }, ...Object.values(SITE)];
    const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
    const P = PLATE, ok = (x, z, c) => inBox(P, x, z, -30) && !busy.some(b => inBox(b, x, z, 22)) && !this.roadSegs.some(s => segDist(x, z, ...s) < c);
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = [];
    for (let x = P.x0 + 40; x < P.x1 - 30; x += 44) for (const z of [P.z0 + 38, P.z1 - 38]) if (ok(x, z, 14)) pts.push([x, z]);
    for (let z = P.z0 + 80; z < P.z1 - 60; z += 44) for (const x of [P.x0 + 38, P.x1 - 38]) if (ok(x, z, 14)) pts.push([x, z]);
    for (let x = P.x0; x < P.x1; x += 58) for (let z = P.z0; z < P.z1; z += 58) {
      const px = x + (rnd() - 0.5) * 40, pz = z + (rnd() - 0.5) * 40;
      if (rnd() < 0.5 && ok(px, pz, 20)) pts.push([px, pz]);
    }
    const crown = new THREE.ConeGeometry(8, 20, 7).translate(0, 18, 0), trunk = new THREE.CylinderGeometry(1.2, 1.5, 9, 5).translate(0, 4.5, 0);
    const trees = new THREE.InstancedMesh(crown, this.mat(0x3f7d3a), pts.length), trunks = new THREE.InstancedMesh(trunk, this.mat(0x6b5238), pts.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const s = 0.8 + rnd() * 0.5; m.makeScale(s, s, s).setPosition(x, 0, z);
      trees.setMatrixAt(i, m); trunks.setMatrixAt(i, m); trees.setColorAt(i, col.setHSL(0.26 + rnd() * 0.07, 0.42, 0.26 + rnd() * 0.12));
    });
    trees.castShadow = trunks.castShadow = true;
    this.root.add(trees, trunks);
  }

  buildTags() {
    const tag = (text, pos, cls = '') => { const el = document.createElement('div'); el.className = 'tag campus ' + cls; el.textContent = text; el.style.opacity = 0; this.labels.appendChild(el); const t = { el, pos }; this.tags.push(t); return t; };
    for (const t of TILES) tag(t.n === 1 ? 'ЦОД-1 · 50 МВт' : t.half ? 'Модуль ½' : `ЦОД-${t.n}`, new THREE.Vector3(t.cx, 60, t.cz), t.n === 1 ? 'first' : '');
    const mid = b => new THREE.Vector3((b.x0 + b.x1) / 2, 40, (b.z0 + b.z1) / 2);
    this.gppTag = tag('Энергоцентр', mid(SITE['Энергоцентр']), 'infra');
    this.infraTags = [tag('Водопровод', mid(SITE['Водопроводные сооружения']), 'infra'), tag('ЛОС', mid(SITE['ЛОС']), 'infra')];
  }

  // «4D · строительство» (build4d.js): modules 2–10 are built one after another like ЦОД-1, faster: a see-through shell
  // rising under a glowing cut, the equipment glowing inside, then the shell closes. b4t = seconds since the start.
  start4d(eq) { this.style4d = true; this.b4t = 0; this.b4eq = eq; }
  end4d(keepBuilt) {
    if (this.b4ready) for (const m of this.mods) if (m) {
      for (const mat of m.mats) { mat.clippingPlanes = null; mat.transparent = false; mat.depthWrite = true; mat.opacity = 1; mat.emissiveIntensity = 0; mat.needsUpdate = true; }
      m.inner.visible = false; m.g.visible = m.a > 0.002;
      if (keepBuilt) { m.a = 1; m.g.visible = true; m.g.scale.y = 1; }
    }
    if (keepBuilt && this.style4d) this.built = this.state.built;
    this.style4d = false; this.b4ready = false;
  }
  setup4d() {
    this.glow4 = { color: { value: new THREE.Color(0.45, 0.95, 1).multiplyScalar(2.2) }, band: { value: 0.001 } };
    const COL = { Rack: 0x5fdcf5, StandardRack: 0x5fdcf5, CDU: 0x4d9dff, CRAH: 0x4d9dff, DryCooler: 0x4d9dff, Chiller: 0x4d9dff, DRUPS: 0xffa033, Transformer: 0xffa033, Switchgear: 0xffa033, Network: 0x4be08a, Fire: 0xff6a5a, Operations: 0x4be08a };
    const units = (this.b4eq || []).filter(e => !e.sub), cube = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const Mx = new THREE.Matrix4(), col = new THREE.Color();
    for (const m of this.mods) {
      if (!m) continue;
      m.lplane = new THREE.Plane(); m.wplane = new THREE.Plane();
      for (const mat of m.mats) { mat.clippingPlanes = [m.wplane]; withCutGlow(mat, this.glow4); mat.needsUpdate = true; }
      if (!m.inner) {
        const im = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), units.length);
        units.forEach((e, i) => {
          const w = Math.max(1.2, (e.radius - 2) * 1.6);
          Mx.makeScale(w, Math.max(2, e.height), w).setPosition(e.pos.x, e.pos.y, e.pos.z); im.setMatrixAt(i, Mx); im.setColorAt(i, col.set(COL[e.kind] || 0x5fdcf5));
        });
        im.frustumCulled = false; im.visible = false; m.g.add(im); m.inner = im;
      }
    }
    this.b4ready = true;
  }
  tick4d() {
    const PER = 1.3, BUILD = 1.2, CLOSE = 0.7, H = 50, W = 0.5, span = BLD.x1 - BLD.x0;
    let done = 1;
    for (const m of this.mods) {
      if (!m) continue;
      const s0 = (m.t.n - 2) * PER, p = Math.min(1, Math.max(0, (this.b4t - s0) / BUILD)), c = Math.min(1, Math.max(0, (this.b4t - s0 - BUILD) / CLOSE));
      const k = c * c * (3 - 2 * c);
      m.g.visible = this.b4t > s0; m.g.scale.y = 1; m.a = c >= 1 ? 1 : p > 0 ? 0.5 : 0; if (c >= 1 && !m.t.half) done++;
      const a = H * p * (1 + W) + H * W * BLD.x0 / span, b = H * W / span, len = Math.hypot(b, 1);
      m.lplane.set(new THREE.Vector3(-b / len, -1 / len, 0), a / len);
      const solid = c >= 1;
      for (const mat of m.mats) {
        mat.opacity = 0.2 + 0.8 * k; mat.emissiveIntensity = 0.4 * (1 - k);
        if (mat.transparent === solid) { mat.transparent = !solid; mat.depthWrite = solid; mat.needsUpdate = true; }
      }
      m.inner.visible = p > 0.05 && c < 1;
      m.inner.material.opacity = Math.min(1, (p - 0.05) * 3) * (1 - k) * 0.85;
      m.inner.scale.y = Math.max(0.01, Math.min(1, (p - 0.2) / 0.6));
    }
    this.built = done;
    this.glow4.color.value.setRGB(0.45, 0.95, 1).multiplyScalar(2.2);
  }
  prerender() {
    if (!this.style4d || !this.b4ready || !this.root.visible) return;
    this.glow4.band.value = 3 * this.model.matrixWorld.getMaxScaleOnAxis();
    for (const m of this.mods) if (m) m.wplane.copy(m.lplane).applyMatrix4(m.g.matrixWorld);
  }

  // story / mode control: how many modules stand, the energy centre, the feeders, the plots, water works and ЛОС
  apply(st) { Object.assign(this.state, st); }
  enter() { this.target = 1; this.root.visible = true; return this.init(); }
  exit() { this.target = 0; }
  get mw() { return 50 * Math.min(10, Math.round(this.built)); }   // the half modules are not counted

  tick(dt) {
    this.time += dt;
    this.f += Math.sign(this.target - this.f) * Math.min(Math.abs(this.target - this.f), dt / 1.6);
    this.root.visible = this.f > 0.001;
    if (!this.mods.length) return;
    const step = (v, want, T) => v + Math.sign(want - v) * Math.min(Math.abs(want - v), dt / T);
    if (this.style4d) { if (!this.b4ready) this.setup4d(); this.tick4d(); }
    // modules rise one after another (0.55 s apart), glow while they rise
    else {
      this.built = step(this.built, this.state.built, 0.55);
      for (const m of this.mods) {
        if (!m) continue;
        m.a = step(m.a, this.built >= m.t.n - 0.02 ? 1 : Math.max(0, this.built - (m.t.n - 1)), 0.9);
        m.g.visible = m.a > 0.002; m.g.scale.y = Math.max(0.001, ease(m.a));
        const glow = m.a > 0 && m.a < 1 ? 0.9 * (1 - m.a) : 0;
        for (const mat of m.mats) mat.emissiveIntensity = glow;
      }
    }
    for (const p of this.plots) {
      const m = this.mods[p.t.n - 1], rising = m && m.a > 0 && m.a < 1;
      const built = p.t.n === 1 || (m && m.a >= 1);
      const a = (this.state.plots || rising) && !built ? (0.6 + 0.3 * Math.sin(this.time * 3)) * this.f : 0;
      p.mat.opacity = a; p.fill.opacity = 0.14 * a; p.mat.visible = p.fill.visible = a > 0.01;
    }
    this.gppA = step(this.gppA, this.state.gpp ? 1 : 0, 1.2);
    this.gpp.visible = this.gppA > 0.002; this.gpp.scale.y = Math.max(0.001, ease(this.gppA));
    this.infraA = step(this.infraA, this.state.infra ? 1 : 0, 1.2);
    this.infra.visible = this.infraA > 0.002; this.infra.scale.y = Math.max(0.001, ease(this.infraA));
    this.lines.visible = this.state.lines;
    this.lineGrow = this.state.lines ? Math.min(1, this.lineGrow + dt / 2.5) : 0;
    for (const mat of this.lineMats) { mat.uniforms.time.value = this.time; mat.uniforms.grow.value = this.lineGrow; mat.uniforms.fade.value = this.f; }
  }

  // HTML captions (cam = the rendering camera); on a small screen tags that would overlap give way: ЦОД-1 and the energy centre first
  drawTags(cam) {
    if (!this.gppTag) return;
    const v = new THREE.Vector3(), used = [];
    const order = [0, this.tags.indexOf(this.gppTag), ...this.tags.map((_, i) => i).filter(i => i > 0 && this.tags[i] !== this.gppTag)];
    for (const i of order) {
      const t = this.tags[i];
      let show = this.f > 0.95;
      if (show && i < TILES.length) show = i === 0 || (this.mods[i] && this.mods[i].a > 0.9);
      if (show && t === this.gppTag) show = this.gppA > 0.9;
      if (show && this.infraTags.includes(t)) show = this.infraA > 0.9;
      if (show) { v.copy(t.pos); this.model.localToWorld(v).project(cam); show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; }
      if (show) {
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, w = (t.el.offsetWidth || 60) / 2 + 3;
        const r = { l: x - w, r: x + w, t: y - (t.el.offsetHeight || 20) - 3, b: y };
        if (used.some(q => !(r.r < q.l || r.l > q.r || r.b < q.t || r.t > q.b))) show = false;
        else { used.push(r); t.el.style.left = x + 'px'; t.el.style.top = y + 'px'; }
      }
      t.el.style.opacity = show ? 1 : 0;
    }
  }
}
