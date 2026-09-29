// «4D · строительство»: how ЦОД-1 is built, in the style of a BIM 4D simulation (Navisworks TimeLiner; the Unity app had
// it as Construction4D): a schematic 24-month sequence, not a real schedule. The whole building is see-through while it
// is built, so the equipment going in is visible: survey and pit → slabs → walls and roofs rising as a wave along the site
// (a clipping plane with a glowing edge) → power, cooling, racks hall by hall, network and commissioning (the units come
// down into place) → the shell turns solid. Then the campus modules 2–10 are built the same way, faster (campus.js).
// Driven by the story steps (story.js, STORIES.build4d: step.build = phase); app.js asks it for the equipment state,
// the group glow and the floor slabs while it is active, and calls prerender() once the matrices are final.
import * as THREE from 'three';

export const PHASES = ['site', 'found', 'walls', 'power', 'cooling', 'racks', 'network', 'close', 'campus', 'done'];
const KINDS = { power: ['DRUPS', 'Transformer', 'Switchgear'], cooling: ['Chiller', 'DryCooler', 'CDU', 'CRAH'], racks: ['Rack', 'StandardRack'], network: ['Network', 'Fire', 'Operations'] };
const TINT = { power: new THREE.Color(1, 0.62, 0.2), cooling: new THREE.Color(0.3, 0.68, 1), racks: new THREE.Color(0.36, 0.86, 0.96), network: new THREE.Color(0.25, 0.9, 0.45) };
const MONTHS = { site: [1, 2], found: [3, 5], walls: [6, 11], power: [12, 14], cooling: [15, 17], racks: [18, 21], network: [22, 23], close: [24, 24] };
const H = 48, WAVE = 0.55;                 // model m: the top of the tallest part; the share of the height the wave leans
const GHOST = 0.16;                          // opacity of the shell while it is being built
const EDGES = /(стены_и_цоколь|кровл|Задний_корпус_\|_конструкция|Эстакада|переход)/;
const clamp01 = t => Math.min(1, Math.max(0, t));
const ease = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

// a clipped material: a glowing band along the cut (NUM_CLIPPING_PLANES > 0 gives vClipPosition in view space)
export function withCutGlow(mat, glow) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.bGlow = glow.color; sh.uniforms.bBand = glow.band;
    sh.fragmentShader = 'uniform vec3 bGlow; uniform float bBand;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #if NUM_CLIPPING_PLANES > 0
      { vec4 cp = clippingPlanes[ 0 ]; float dd = cp.w - dot( vClipPosition, cp.xyz ); totalEmissiveRadiance += bGlow * ( 1.0 - smoothstep( 0.0, bBand, dd ) ); }
      #endif`);
  };
  mat.customProgramCacheKey = () => 'cutglow';
  return mat;
}

export class Build4D {
  constructor({ model, eq, groups, context, campus }) {
    Object.assign(this, { model, eq, groups, context, campus });
    this.active = false; this.phase = null; this.t = 0; this.d = 6; this.label = '';
    this.plane = new THREE.Plane(); this.world = new THREE.Plane();
    this.glow = { color: { value: new THREE.Color(0.45, 0.95, 1).multiplyScalar(2.2) }, band: { value: 0.001 } };
    this.parts = null;
  }

  // ЦОД-1's structure (everything built: pads, buildings, galleries, substation, floor slabs), with its 4D material
  prepare() {
    if (this.parts) return;
    const m = this.model, chain = o => { const M = new THREE.Matrix4(); for (let q = o; q && q !== m; q = q.parent) M.premultiply(q.matrix); return M; };
    const skip = /^(Дороги|Газон|Бордюры|Дорожная_разметка|Дерево|Кустарник|Фонарь|Макет_|Окантовка)/;
    const roots = [];
    const ext = m.getObjectByName('Maket_Clean_exterior');
    for (const o of ext ? ext.children : []) if (o.name && !skip.test(o.name)) roots.push(o);
    m.traverse(o => { if (o.name.startsWith('Central_building') && !roots.some(r => r === o || r.getObjectById(o.id))) roots.push(o); });
    roots.push(...this.context);
    this.parts = []; const box = new THREE.Box3(), b = new THREE.Box3();
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0xa8f2ff, transparent: true, opacity: 0.6, depthWrite: false, clippingPlanes: [this.world] });
    for (const r of roots) r.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const mat = o.material.clone(); mat.clippingPlanes = [this.world]; mat.transparent = true; mat.depthWrite = false;
      if (mat.emissive) mat.emissive = new THREE.Color(0x49d6ff);
      withCutGlow(mat, this.glow);
      const pad = /^(Площадки|Восток_\||Запад_\|)/.test(o.name) || /floor/i.test(o.name);
      // the main walls and roofs also get their edges drawn: a BIM-like line model that reads well through the glass
      let edges = null;
      if (EDGES.test(o.name) || EDGES.test(o.parent?.name || '')) {
        edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), this.edgeMat); edges.visible = false; edges.raycast = () => {}; o.add(edges);
      }
      this.parts.push({ o, orig: o.material, mat, pad, vis: o.visible, edges });
      o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(chain(o)); box.union(b);
    });
    this.x0 = box.min.x; this.x1 = box.max.x;
    // survey: a glowing grid and the outline of the buildings over a dark pit
    this.fx = new THREE.Group(); this.fx.name = '4D survey'; this.fx.visible = false; m.add(this.fx);
    const fp = { x0: -290, x1: 190, z0: -165, z1: 200 };
    const grid = new THREE.GridHelper(1, 24, 0x7de8ff, 0x3aa8c8); grid.scale.set(fp.x1 - fp.x0 + 120, 1, fp.z1 - fp.z0 + 120);
    grid.position.set((fp.x0 + fp.x1) / 2, 1.2, (fp.z0 + fp.z1) / 2); grid.material.transparent = true; grid.material.depthWrite = false;
    this.grid = grid; this.fx.add(grid);
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(fp.x1 - fp.x0, fp.z1 - fp.z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3b2f24, transparent: true, depthWrite: false }));
    pit.position.set((fp.x0 + fp.x1) / 2, 0.9, (fp.z0 + fp.z1) / 2); this.pit = pit; this.fx.add(pit);
    const c = [[fp.x0, fp.z0], [fp.x1, fp.z0], [fp.x1, fp.z1], [fp.x0, fp.z1], [fp.x0, fp.z0]].map(([x, z]) => new THREE.Vector3(x, 1.5, z));
    this.outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), new THREE.LineBasicMaterial({ color: 0xaaf4ff, transparent: true }));
    this.fx.add(this.outline);
    // the order the units come in: west → east, then south → north
    this.order = {};
    for (const [ph, kinds] of Object.entries(KINDS)) {
      const list = this.eq.filter(e => kinds.includes(e.kind));
      list.sort((a, b) => (ph === 'racks' ? a.room - b.room : 0) || a.pos.x - b.pos.x || a.pos.z - b.pos.z);
      list.forEach((e, i) => { e.b4k = i / Math.max(1, list.length - 1); e.b4p = ph; });
      this.order[ph] = list;
    }
  }

  apply(phase, d) {
    const i = PHASES.indexOf(phase); if (i < 0) return;
    this.prepare();
    this.phase = phase; this.t = 0; this.d = d || 6;
    const module = i <= PHASES.indexOf('close');
    if (module && !this.active) { this.active = true; for (const p of this.parts) { p.o.material = p.mat; if (p.edges) p.edges.visible = true; } }
    if (!module && this.active) this.release();
    if (this.campus) {
      if (phase === 'campus') this.campus.start4d(this.eq);
      else if (phase === 'done') this.campus.end4d(true);
      else this.campus.end4d(false);
    }
    this.label = MONTHS[phase] ? `Месяц ${MONTHS[phase][0]}${MONTHS[phase][1] !== MONTHS[phase][0] ? '–' + MONTHS[phase][1] : ''} из 24` : phase === 'campus' ? 'Очереди 2–10' : '500 МВт';
  }
  release() {
    this.active = false;
    if (this.parts) for (const p of this.parts) { p.o.material = p.orig; p.o.visible = p.vis; if (p.edges) p.edges.visible = false; }
    if (this.fx) this.fx.visible = false;
    for (const e of this.eq) e.drop = 0;
  }
  stop() { if (this.active) this.release(); if (this.campus) this.campus.end4d(true); this.phase = null; this.label = ''; }

  // progress of a phase: 1 for the phases already done, the animation for the current one, 0 for the later ones
  prog(ph, span = 1) {
    const a = PHASES.indexOf(ph), b = PHASES.indexOf(this.phase);
    return a < b ? 1 : a > b ? 0 : clamp01(this.t / (this.d * span));
  }

  tick(dt) {
    if (!this.phase) return;
    this.t += dt;
    if (this.campus && (this.phase === 'campus')) this.campus.b4t = this.t;
    if (!this.active) return;
    // the rising cut: foundations (u 0 → 0.16), then the walls and roofs (→ 1)
    const u = 0.16 * ease(this.prog('found', 0.85)) + 0.84 * this.prog('walls', 0.9);
    const span = Math.max(1, this.x1 - this.x0), a = H * u * (1 + WAVE) + H * WAVE * this.x0 / span, bb = H * WAVE / span;
    const n = new THREE.Vector3(-bb, -1, 0), len = n.length();
    this.plane.set(n.divideScalar(len), a / len);
    // the shell: ghost while built, solid when it closes
    const close = ease(this.prog('close', 0.8));
    const pulse = this.phase === 'walls' ? 1 : 0.55;
    for (const p of this.parts) {
      const mat = p.mat;
      mat.opacity = p.pad ? 0.55 + 0.45 * close : GHOST + (1 - GHOST) * close;
      if (mat.emissive) mat.emissiveIntensity = 0.35 * (1 - close) * pulse;
      const solid = close >= 0.999;
      if (mat.transparent === solid || mat.depthWrite !== solid) { mat.transparent = !solid; mat.depthWrite = solid; mat.needsUpdate = true; }
    }
    this.edgeMat.opacity = 0.6 * (1 - close);
    this.glow.color.value.setRGB(0.45, 0.95, 1).multiplyScalar(3 * (this.phase === 'found' || this.phase === 'walls' ? 1 : 0));
    // survey grid, pit, outline
    const site = this.prog('site', 0.7), found = this.prog('found');
    this.fx.visible = found < 1;
    this.grid.material.opacity = 0.55 * ease(site) * (1 - ease(found * 1.6));
    this.pit.material.opacity = 0.55 * ease(site * 1.4) * (1 - ease(found));
    this.outline.material.opacity = ease(site * 2) * (1 - ease(found));
    this.outline.geometry.setDrawRange(0, Math.max(2, Math.ceil(5 * clamp01(site * 1.5))));
    // month counter
    const mm = MONTHS[this.phase];
    if (mm) this.label = `Месяц ${Math.min(mm[1], Math.round(mm[0] - 0.5 + (mm[1] - mm[0] + 1) * clamp01(this.t / this.d)) || mm[0])} из 24`;
  }

  // per unit: shown?, the drop into place (model m above its place)
  eqState(e) {
    const ph = e.b4p; if (!ph) { e.show = false; e.drop = 0; return; }
    const p = this.prog(ph), k = clamp01((p * 1.35 - e.b4k * 0.95) / 0.4); // a wave through the list, each unit ~0.3 of the phase
    e.show = k > 0; e.drop = (1 - k * k * (3 - 2 * k)) * 38; e.y = 0;
  }
  // the glow of the equipment groups: the system going in, then the commissioning wave over the racks
  groupGlow(kind) {
    for (const [ph, kinds] of Object.entries(KINDS)) if (kinds.includes(kind)) {
      if (this.phase === ph) return [TINT[ph], 0.6 * (1 - 0.5 * clamp01(this.t / this.d))];
      if (this.phase === 'network' && ph === 'racks') return [TINT.network, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 5))];
    }
    return null;
  }
  get slabs() { return this.prog('found') > 0; }

  prerender() {
    if (!this.active) return;
    const mw = this.model.matrixWorld;
    this.world.copy(this.plane).applyMatrix4(mw);
    this.glow.band.value = 4.5 * mw.getMaxScaleOnAxis();
  }
}
