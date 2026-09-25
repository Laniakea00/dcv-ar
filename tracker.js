// Marker tracker for the AR mat: finds the ArUco 4x4 markers of board.json in a grey image and computes the camera
// pose of the mat. Plain JS, no dependencies (runs in the browser and in Node for the tests).
//
// Frames: image = pixels, x right, y down. Camera = OpenCV (x right, y down, z forward). Board/maket = glTF frame of
// the app (metres, Y up, the mat at Y = 0), see tools/make_board.py.

// ---------------------------------------------------------------- small linear algebra
function solve(A, b) { // Gaussian elimination with partial pivoting, A n×n (array of rows), b n
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

// homography from src[i]=[x,y] to dst[i]=[u,v] (n >= 4), Hartley-normalised DLT with h33 = 1; returns 3x3 rows
export function homography(src, dst) {
  const nrm = pts => {
    let mx = 0, my = 0;
    for (const p of pts) { mx += p[0]; my += p[1]; }
    mx /= pts.length; my /= pts.length;
    let d = 0;
    for (const p of pts) d += Math.hypot(p[0] - mx, p[1] - my);
    const s = Math.SQRT2 / (d / pts.length || 1);
    return { T: [[s, 0, -s * mx], [0, s, -s * my], [0, 0, 1]], p: pts.map(q => [s * (q[0] - mx), s * (q[1] - my)]) };
  };
  const A = nrm(src), B = nrm(dst);
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
  for (let i = 0; i < src.length; i++) {
    const [x, y] = A.p[i], [u, v] = B.p[i];
    const rows = [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
    for (const r of rows) for (let a = 0; a < 8; a++) {
      Atb[a] += r[a] * r[8];
      for (let b = 0; b < 8; b++) AtA[a][b] += r[a] * r[b];
    }
  }
  const h = solve(AtA, Atb);
  if (!h) return null;
  const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  // H = inv(TB) * Hn * TA
  const TBi = [[1 / B.T[0][0], 0, -B.T[0][2] / B.T[0][0]], [0, 1 / B.T[1][1], -B.T[1][2] / B.T[1][1]], [0, 0, 1]];
  return mul3(mul3(TBi, Hn), A.T);
}
function mul3(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j];
  return r;
}
const applyH = (H, x, y) => {
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w];
};

// rotation vector <-> matrix (Rodrigues)
export function rodrigues(r) {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const [x, y, z] = [r[0] / th, r[1] / th, r[2] / th], c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
export function rotvec(R) {
  const tr = R[0][0] + R[1][1] + R[2][2], c = Math.max(-1, Math.min(1, (tr - 1) / 2)), th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-6) { // 180°: axis from the diagonal
    const x = Math.sqrt(Math.max(0, (R[0][0] + 1) / 2)), y = Math.sqrt(Math.max(0, (R[1][1] + 1) / 2)) * Math.sign(R[0][1] || 1),
      z = Math.sqrt(Math.max(0, (R[2][2] + 1) / 2)) * Math.sign(R[0][2] || 1);
    return [x * th, y * th, z * th];
  }
  const k = th / (2 * Math.sin(th));
  return [(R[2][1] - R[1][2]) * k, (R[0][2] - R[2][0]) * k, (R[1][0] - R[0][1]) * k];
}

// ---------------------------------------------------------------- detection
function sampleBilinear(g, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
}

function convexHull(pts) { // pts: flat [x0,y0,x1,y1...] -> array of [x,y]
  const P = [];
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
const area = q => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

function quadFromHull(hull) {
  if (hull.length < 4) return null;
  let cx = 0, cy = 0;
  for (const p of hull) { cx += p[0]; cy += p[1]; }
  cx /= hull.length; cy /= hull.length;
  const far = (from, f) => { let best = null, bd = -1; for (const p of hull) { const d = f(p); if (d > bd) { bd = d; best = p; } } return best; };
  const A = far(null, p => Math.hypot(p[0] - cx, p[1] - cy));
  const C = far(null, p => Math.hypot(p[0] - A[0], p[1] - A[1]));
  const side = p => (C[0] - A[0]) * (p[1] - A[1]) - (C[1] - A[1]) * (p[0] - A[0]);
  const B = far(null, p => side(p)), D = far(null, p => -side(p));
  if (side(B) <= 0 || side(D) >= 0) return null;
  let q = [A, B, C, D];
  if (area(q) < 0) q = [A, D, C, B]; // clockwise in image (y down) = positive shoelace
  return q;
}

// refine a quad's corners: sub-pixel edges from the grey gradient, a line per side, corners = line intersections
function refineQuad(g, w, h, q) {
  const lines = [];
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    // outward normal of a clockwise (y down) polygon
    const nx = dy / L, ny = -dx / L;
    const pts = [];
    const N = Math.max(6, Math.min(20, (L / 4) | 0)), R = Math.max(2, Math.min(6, L / 12));
    for (let k = 1; k < N; k++) {
      const t = 0.12 + 0.76 * k / N, px = a[0] + dx * t, py = a[1] + dy * t;
      const vals = [];
      for (let u = -R; u <= R + 1e-9; u += 0.5) vals.push(sampleBilinear(g, w, h, px + nx * u, py + ny * u));
      // central-difference derivative; dark inside -> light outside = positive
      const D = new Float32Array(vals.length);
      let best = 0, bs = 0;
      for (let i = 1; i < vals.length - 1; i++) {
        D[i] = vals[i + 1] - vals[i - 1];
        if (D[i] > best) { best = D[i]; bs = i; }
      }
      if (best < 8 || bs < 2 || bs > vals.length - 3) continue;
      const den = D[bs - 1] - 2 * D[bs] + D[bs + 1];
      let off = den < 0 ? 0.5 * (D[bs - 1] - D[bs + 1]) / den : 0;
      if (off > 1) off = 1; else if (off < -1) off = -1;
      const u = -R + (bs + off) * 0.5;
      pts.push([px + nx * u, py + ny * u]);
    }
    if (pts.length < 4) return q;
    // line fit (PCA)
    let mx = 0, my = 0;
    for (const p of pts) { mx += p[0]; my += p[1]; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { const ux = p[0] - mx, uy = p[1] - my; sxx += ux * ux; sxy += ux * uy; syy += uy * uy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    lines.push({ p: [mx, my], d: [Math.cos(th), Math.sin(th)] });
  }
  const out = [];
  for (let s = 0; s < 4; s++) {
    const l1 = lines[(s + 3) % 4], l2 = lines[s]; // corner s is between side s-1 and side s
    const det = l1.d[0] * -l2.d[1] - l1.d[1] * -l2.d[0];
    if (Math.abs(det) < 1e-6) return q;
    const rx = l2.p[0] - l1.p[0], ry = l2.p[1] - l1.p[1];
    const t = (rx * -l2.d[1] - ry * -l2.d[0]) / det;
    const c = [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t];
    if (Math.hypot(c[0] - q[s][0], c[1] - q[s][1]) > 4 + 0.1 * Math.hypot(q[s][0] - q[(s + 2) % 4][0], q[s][1] - q[(s + 2) % 4][1])) return q;
    out.push(c);
  }
  return out;
}

// read the (bits+2)^2 cells of a quad (corners TL,TR,BR,BL); returns {bits, ok}
function readCells(g, w, h, q, n) {
  const N = n + 2;
  const H = homography([[0, 0], [N, 0], [N, N], [0, N]], q);
  if (!H) return null;
  const v = new Float32Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let s = 0;
    for (const a of [0.3, 0.5, 0.7]) for (const b of [0.3, 0.5, 0.7]) {
      const [x, y] = applyH(H, c + b, r + a);
      s += sampleBilinear(g, w, h, x, y);
    }
    v[r * N + c] = s / 9;
  }
  let mn = 255, mx = 0;
  for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; }
  if (mx - mn < 25) return null;
  // Otsu over the cell means
  let best = -1, thr = (mn + mx) / 2;
  const sorted = Array.from(v).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const w0 = i, w1 = sorted.length - i;
    let m0 = 0, m1 = 0;
    for (let k = 0; k < i; k++) m0 += sorted[k];
    for (let k = i; k < sorted.length; k++) m1 += sorted[k];
    m0 /= w0; m1 /= w1;
    const s = w0 * w1 * (m0 - m1) * (m0 - m1);
    if (s > best) { best = s; thr = (sorted[i - 1] + sorted[i]) / 2; }
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r === 0 || c === 0 || r === N - 1 || c === N - 1) && v[r * N + c] > thr) return null; // border must be black
  }
  const bits = [];
  for (let r = 1; r <= n; r++) { const row = []; for (let c = 1; c <= n; c++) row.push(v[r * N + c] > thr ? 1 : 0); bits.push(row); }
  return bits;
}

const rot = b => { const n = b.length; return b.map((row, r) => row.map((_, k) => b[k][n - 1 - r])); }; // see match()

export class MarkerTracker {
  constructor(board) {
    this.board = board;
    this.n = board.bits;
    this.byId = new Map(board.markers.map(m => [m.id, m]));
    this.minSide = 8;
  }

  // g: Uint8Array grey image w×h. Returns [{id, corners: [[x,y] TL,TR,BR,BL of the printed marker]}]
  detect(g, w, h) {
    const n = w * h;
    // 1. adaptive threshold (mean over a (2r+1)^2 box, integral image)
    const r = Math.max(6, Math.round(Math.min(w, h) / 30));
    const I = new Uint32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = 0; x < w; x++) { s += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; }
    }
    const dark = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const m = s / ((x1 - x0) * (y1 - y0));
        dark[y * w + x] = g[y * w + x] < m - 7 ? 1 : 0;
      }
    }
    // 2. connected components (4-connectivity, union-find)
    const lab = new Int32Array(n).fill(-1), par = [];
    const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dark[i]) continue;
      const L = x > 0 && dark[i - 1] ? find(lab[i - 1]) : -1, U = y > 0 && dark[i - w] ? find(lab[i - w]) : -1;
      if (L < 0 && U < 0) { lab[i] = par.length; par.push(par.length); }
      else if (L >= 0 && U >= 0) { lab[i] = Math.min(L, U); par[Math.max(L, U)] = Math.min(L, U); }
      else lab[i] = L >= 0 ? L : U;
    }
    const st = new Map(); // root -> {x0,y0,x1,y1,cnt,edge:[]}
    for (let i = 0; i < n; i++) {
      if (lab[i] < 0) continue;
      const a = find(lab[i]);
      lab[i] = a;
      const x = i % w, y = (i / w) | 0;
      let s = st.get(a);
      if (!s) { s = { x0: x, y0: y, x1: x, y1: y, cnt: 0 }; st.set(a, s); }
      if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x; if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
      s.cnt++;
    }
    const cands = new Map();
    for (const [a, s] of st) {
      const bw = s.x1 - s.x0 + 1, bh = s.y1 - s.y0 + 1;
      if (bw < this.minSide || bh < this.minSide || bw > 0.95 * w || bh > 0.95 * h) continue;
      if (s.x0 === 0 || s.y0 === 0 || s.x1 === w - 1 || s.y1 === h - 1) continue;
      if (bw / bh > 6 || bh / bw > 6) continue;
      s.edge = [];
      cands.set(a, s);
    }
    // outer boundary pixels of the candidates
    for (const [a, s] of cands) {
      for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
        const i = y * w + x;
        if (lab[i] !== a) continue;
        if (lab[i - 1] !== a || lab[i + 1] !== a || lab[i - w] !== a || lab[i + w] !== a) s.edge.push(x, y);
      }
    }
    // 3. quads -> decode
    const out = [];
    for (const [, s] of cands) {
      const hull = convexHull(s.edge);
      let q = quadFromHull(hull);
      if (!q) continue;
      const ha = Math.abs(area(hull)), qa = area(q);
      if (qa < 120 || qa / ha < 0.85) continue;
      const sides = q.map((p, i) => Math.hypot(q[(i + 1) % 4][0] - p[0], q[(i + 1) % 4][1] - p[1]));
      if (Math.min(...sides) / Math.max(...sides) < 0.2) continue;
      q = refineQuad(g, w, h, q);
      const bits = readCells(g, w, h, q, this.n);
      if (!bits) continue;
      const m = this.match(bits);
      if (!m) continue;
      // corners as printed: the sampled grid equals the marker rotated `m.k` times
      const c = [0, 1, 2, 3].map(i => q[(i + m.k) % 4]);
      out.push({ id: m.id, corners: c });
    }
    // one detection per id (keep the biggest)
    const best = new Map();
    for (const d of out) {
      const a = Math.abs(area(d.corners)), b = best.get(d.id);
      if (!b || a > b.a) best.set(d.id, { d, a });
    }
    return [...best.values()].map(v => v.d);
  }

  // bits sampled from corners (c0..c3) in order; returns {id, k} with: marker bits == sampled grid read starting at
  // corner k (i.e. the printed TL is detected corner k)
  match(bits) {
    let b = bits;
    for (let k = 0; k < 4; k++) {
      for (const m of this.board.markers) {
        let d = 0;
        for (let r = 0; r < this.n && d <= 0; r++) for (let c = 0; c < this.n; c++) if (m.bits[r][c] !== b[r][c]) d++;
        if (d === 0) return { id: m.id, k };
      }
      b = rot(b); // grid as seen when starting one corner later
    }
    return null;
  }
}

// ---------------------------------------------------------------- pose
// K = {f, cx, cy}. dets from detect(). Returns {R (rows, board->camera), t, err (rms px), n (points)} or null.
export function estimatePose(dets, board, K, prev) {
  const obj = [], img = [];
  const byId = new Map(board.markers.map(m => [m.id, m]));
  for (const d of dets) {
    const m = byId.get(d.id);
    if (!m) continue;
    for (let i = 0; i < 4; i++) { obj.push(m.corners[i]); img.push(d.corners[i]); }
  }
  if (obj.length < 4) return null;
  let R, t;
  const H = homography(obj.map(p => [p[0], p[2]]), img);
  if (!H) return null;
  // K^-1 H = λ [r1 r3 t]  (plane axes: board X and board Z)
  const kinv = c => [(c[0] - K.cx * c[2]) / K.f, (c[1] - K.cy * c[2]) / K.f, c[2]];
  const h1 = kinv([H[0][0], H[1][0], H[2][0]]), h2 = kinv([H[0][1], H[1][1], H[2][1]]), h3 = kinv([H[0][2], H[1][2], H[2][2]]);
  let lam = 2 / (norm(h1) + norm(h2));
  if (h3[2] * lam < 0) lam = -lam; // board in front of the camera
  let r1 = scale(h1, lam), r3 = scale(h2, lam);
  t = scale(h3, lam);
  // orthonormalise r1, r3 symmetrically
  // (u = bisector of r1,r3; v = in their plane, perpendicular to u, towards r3)
  const a = scale(r1, 1 / norm(r1)), b = scale(r3, 1 / norm(r3));
  const bis = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const u = scale(bis, 1 / norm(bis));
  const ort = cross(cross(a, b), u), v = scale(ort, 1 / norm(ort));
  r1 = scale([u[0] - v[0], u[1] - v[1], u[2] - v[2]], Math.SQRT1_2);
  r3 = scale([u[0] + v[0], u[1] + v[1], u[2] + v[2]], Math.SQRT1_2);
  const r2 = cross(r3, r1);
  R = [[r1[0], r2[0], r3[0]], [r1[1], r2[1], r3[1]], [r1[2], r2[2], r3[2]]];
  // start from the previous pose if it explains the points better (fewer flips)
  let p = [...rotvec(R), ...t];
  const res = (q) => {
    const Rq = rodrigues(q), e = [];
    for (let i = 0; i < obj.length; i++) {
      const X = obj[i];
      const xc = Rq[0][0] * X[0] + Rq[0][1] * X[1] + Rq[0][2] * X[2] + q[3];
      const yc = Rq[1][0] * X[0] + Rq[1][1] * X[1] + Rq[1][2] * X[2] + q[4];
      const zc = Rq[2][0] * X[0] + Rq[2][1] * X[1] + Rq[2][2] * X[2] + q[5];
      e.push(K.f * xc / zc + K.cx - img[i][0], K.f * yc / zc + K.cy - img[i][1]);
    }
    return e;
  };
  const cost = e => e.reduce((s, x) => s + x * x, 0);
  if (prev) {
    const pp = [...rotvec(prev.R), ...prev.t];
    if (cost(res(pp)) < cost(res(p))) p = pp;
  }
  // Levenberg–Marquardt, numerical Jacobian
  let e = res(p), c = cost(e), mu = 1e-3;
  for (let it = 0; it < 12; it++) {
    const J = [];
    for (let k = 0; k < 6; k++) {
      const dp = [...p], hstep = k < 3 ? 1e-6 : 1e-6 * Math.max(0.01, Math.abs(p[5]));
      dp[k] += hstep;
      const e2 = res(dp);
      J.push(e2.map((x, i) => (x - e[i]) / hstep));
    }
    const A = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => J[i].reduce((s, x, k) => s + x * J[j][k], 0)));
    const g = J.map(col => col.reduce((s, x, k) => s + x * e[k], 0));
    let improved = false;
    for (let tries = 0; tries < 6; tries++) {
      const Ad = A.map((row, i) => row.map((x, j) => (i === j ? x * (1 + mu) + 1e-12 : x)));
      const d = solve(Ad, g.map(x => -x));
      if (!d) break;
      const pn = p.map((x, i) => x + d[i]), en = res(pn), cn = cost(en);
      if (cn < c) { p = pn; e = en; c = cn; mu = Math.max(mu / 3, 1e-7); improved = true; break; }
      mu *= 5;
    }
    if (!improved || c < 1e-6) break;
  }
  R = rodrigues(p);
  t = [p[3], p[4], p[5]];
  if (t[2] <= 0) return null;
  return { R, t, err: Math.sqrt(c / obj.length), n: obj.length, H };
}

// focal length (px) from a homography of the plane (principal point K.cx, K.cy, square pixels); null if not observable
export function focalFromH(H, cx, cy) {
  // shift principal point to the origin
  const T = [[1, 0, -cx], [0, 1, -cy], [0, 0, 1]], G = mul3(T, H);
  const h1 = [G[0][0], G[1][0], G[2][0]], h2 = [G[0][1], G[1][1], G[2][1]];
  const s = 1 / Math.max(norm(h1), norm(h2));
  const [a1, b1, c1] = scale(h1, s), [a2, b2, c2] = scale(h2, s);
  const cands = [];
  const d1 = c1 * c2, n1 = -(a1 * a2 + b1 * b2);
  const d2 = c1 * c1 - c2 * c2, n2 = -(a1 * a1 + b1 * b1 - a2 * a2 - b2 * b2);
  if (Math.abs(d1) > 1e-7 && n1 / d1 > 0) cands.push({ f: Math.sqrt(n1 / d1), wgt: Math.abs(d1) });
  if (Math.abs(d2) > 1e-7 && n2 / d2 > 0) cands.push({ f: Math.sqrt(n2 / d2), wgt: Math.abs(d2) });
  if (!cands.length) return null;
  cands.sort((a, b) => b.wgt - a.wgt);
  return cands[0];
}
