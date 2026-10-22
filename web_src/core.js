// ===== Regression core (no DOM). Runs in the browser and in Node (for tests). =====
'use strict';
const MISSING = new Set(['', 'na', 'nan', 'null', 'none', '?', 'n/a', '#n/a']);
const isNum = v => v !== '' && v != null && isFinite(Number(v));
const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
const sdPop = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
function median(a) {
  const s = a.filter(v => !Number.isNaN(v)).sort((x, y) => x - y), m = s.length >> 1;
  if (!s.length) return 0;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- CSV ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some(v => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('CSV 至少需要標題列與一筆資料');
  // 欄名去掉多餘空白（WHO 原始欄名像 ' thinness  1-19 years'）
  const header = rows[0].map((h, j) => h.replace(/\s+/g, ' ').trim() || `Unnamed_${j}`);
  const clean = v => { const t = (v ?? '').trim(); return MISSING.has(t.toLowerCase()) ? '' : t; };
  const data = rows.slice(1).map(r => Object.fromEntries(header.map((h, j) => [h, clean(r[j])])));
  return { header, data };
}

function profile(header, data) {
  const n = data.length;
  return header.map(h => {
    const vals = data.map(r => r[h]).filter(v => v !== '');
    const numeric = vals.length > 0 && vals.every(isNum);
    const uniq = [...new Set(vals)];
    const c = { name: h, numeric, missing: n - vals.length, nunique: uniq.length, levels: numeric ? null : uniq.sort() };
    if (numeric) {
      const nv = vals.map(Number); let mn = Infinity, mx = -Infinity;
      for (const v of nv) { if (v < mn) mn = v; if (v > mx) mx = v; }
      Object.assign(c, { min: mn, max: mx, mean: mean(nv), sd: sdPop(nv), allInt: nv.every(Number.isInteger) });
    }
    return c;
  });
}

// 自動排除不適合當特徵的欄位
function autoDrop(prof, n, target) {
  return prof.filter(c => c.name !== target).map(c => {
    let why = null;
    if (c.missing > 0.5 * n) why = `缺值 ${(c.missing / n * 100).toFixed(0)}%`;
    else if (c.nunique <= 1) why = '只有一種值';
    else if (/^(id|index|no|unnamed.*)$|[_\s]id$|^id[_\s]/i.test(c.name)) why = 'ID 欄位';
    else if (c.numeric && c.allInt && c.nunique > 20 && c.nunique === n - c.missing && c.max - c.min === c.nunique - 1) why = '連續整數編號';
    else if (!c.numeric && c.nunique > 30) why = `類別太多（${c.nunique} 種）`;
    return why && { name: c.name, why };
  }).filter(Boolean);
}

// ---------- feature specs: each item maps raw columns → encoded feature values ----------
const numOf = (r, c) => (isNum(r[c]) ? Number(r[c]) : NaN);
function genericSpec(prof, target, dropNames) {
  const drop = new Set(dropNames), spec = [];
  for (const c of prof) {
    if (c.name === target || drop.has(c.name)) continue;
    if (c.numeric) spec.push({ col: c.name, kind: 'num', names: [c.name], tf: '', enc: r => [numOf(r, c.name)] });
    else {
      const lv = c.levels, rest = lv.slice(1);
      spec.push({ col: c.name, kind: 'cat', levels: lv, names: rest.map(l => `${c.name}_${l}`), tf: 'one-hot',
                  enc: r => (r[c.name] === '' ? rest.map(() => NaN) : rest.map(l => (r[c.name] === l ? 1 : 0))) });
    }
  }
  return spec;
}

// WHO：和 notebook 完全相同的特徵工程（順序也相同）
const WHO_TARGET = 'Life expectancy';
function whoSpec() {
  const num = c => r => numOf(r, c);
  const nz = c => r => { const v = numOf(r, c); return v === 0 ? NaN : v; };
  const lg = c => r => Math.log1p(numOf(r, c));
  const S = (col, f, name, tf = '') => ({ col, kind: 'num', names: [name || col], tf, enc: r => [f(r)] });
  return [
    S('Adult Mortality', num('Adult Mortality')),
    S('infant deaths', lg('infant deaths'), 'log_infant deaths', 'log1p'),
    S('Alcohol', num('Alcohol')),
    S('percentage expenditure', lg('percentage expenditure'), 'log_percentage expenditure', 'log1p'),
    S('Hepatitis B', num('Hepatitis B')),
    S('Measles', lg('Measles'), 'log_Measles', 'log1p'),
    S('BMI', num('BMI')),
    S('under-five deaths', lg('under-five deaths'), 'log_under-five deaths', 'log1p'),
    S('Polio', num('Polio')),
    S('Total expenditure', num('Total expenditure')),
    S('Diphtheria', num('Diphtheria')),
    S('HIV/AIDS', lg('HIV/AIDS'), 'log_HIV/AIDS', 'log1p'),
    S('GDP', lg('GDP'), 'log_GDP', 'log1p'),
    S('Population', lg('Population'), 'log_Population', 'log1p'),
    S('thinness 1-19 years', num('thinness 1-19 years')),
    S('thinness 5-9 years', num('thinness 5-9 years')),
    S('Income composition of resources', nz('Income composition of resources'), null, '0→NaN'),
    S('Schooling', nz('Schooling'), null, '0→NaN'),
    { col: 'Status', kind: 'cat', levels: ['Developing', 'Developed'], names: ['Developed'], tf: 'Developed=1',
      enc: r => [r.Status === '' || r.Status == null ? NaN : r.Status === 'Developed' ? 1 : 0] }
  ];
}

// ---------- splits ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, seed) {
  const a = arr.slice(), r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function randomSplit(n, ratio, seed) {
  const idx = shuffled([...Array(n).keys()], seed), nt = Math.min(n - 3, Math.max(1, Math.ceil(n * ratio)));
  return { test: idx.slice(0, nt).sort((a, b) => a - b), train: idx.slice(nt).sort((a, b) => a - b) };
}
function groupSplit(groups, ratio, seed) {
  const G = shuffled([...new Set(groups)].sort(), seed), nt = Math.min(G.length - 1, Math.max(1, Math.ceil(G.length * ratio)));
  const T = new Set(G.slice(0, nt)), test = [], train = [];
  groups.forEach((g, i) => (T.has(g) ? test : train).push(i));
  return { test, train, nGroupsTest: nt, nGroupsTrain: G.length - nt };
}
function kfoldOf(n, K, seed) {
  const idx = shuffled([...Array(n).keys()], seed + 1), f = new Array(n); let st = 0;
  for (let k = 0; k < K; k++) { const sz = Math.floor(n / K) + (k < n % K ? 1 : 0); for (let i = st; i < st + sz; i++) f[idx[i]] = k; st += sz; }
  return f;
}
function groupKFoldOf(groups, K) {          // 類似 sklearn GroupKFold：大的組先放進目前最輕的 fold
  const cnt = new Map(); groups.forEach(g => cnt.set(g, (cnt.get(g) || 0) + 1));
  const order = [...cnt.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)), load = new Array(K).fill(0), gf = new Map();
  for (const [g, c] of order) { let m = 0; for (let k = 1; k < K; k++) if (load[k] < load[m]) m = k; gf.set(g, m); load[m] += c; }
  return groups.map(g => gf.get(g));
}

// ---------- linear algebra ----------
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) throw new Error('矩陣奇異（可能有完全共線的特徵）');
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]; if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
function invert(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...A.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) throw new Error('singular');
    const d = M[c][c]; for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map(r => r.slice(n));
}
function gramRows(Z, y, rows, q) {
  const G = Array.from({ length: q }, () => new Float64Array(q)), b = new Float64Array(q);
  for (const i of rows) {
    const z = Z[i], yi = y[i];
    for (let a = 0; a < q; a++) { const za = z[a]; if (za === 0) continue; b[a] += za * yi; const Ga = G[a]; for (let c = a; c < q; c++) Ga[c] += za * z[c]; }
  }
  for (let a = 0; a < q; a++) for (let c = 0; c < a; c++) G[a][c] = G[c][a];
  return { G, b, n: rows.length };
}

// ---------- distributions ----------
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (const v of c) s += v / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function betacf(a, b, x) {
  const EPS = 3e-16, FP = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function ibeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
const tPval = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);            // two-sided
const fPval = (F, d1, d2) => ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
function tCrit(df, alpha = 0.05) { let lo = 0, hi = 1000; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; tPval(m, df) > alpha ? lo = m : hi = m; } return (lo + hi) / 2; }
function gammaQ(a, x) {                                                   // regularized upper incomplete gamma
  if (x <= 0) return 1;
  const lpre = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return Math.max(0, 1 - sum * Math.exp(lpre));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(lpre) * h;
}
const chi2sf = (x, k) => gammaQ(k / 2, x / 2);

// ---------- modeling context ----------
// o = { rows, y, spec, train, test, foldOf (對齊 train 的 fold 編號), K, labels, logY }
// logY：在 log(y) 上建模，所有 RMSE / MAE / R² 與區間都換回原始單位
function makeContext(o) {
  const spec = o.spec, names = spec.flatMap(s => s.names), p = names.length, q = p + 1;
  if (!p) throw new Error('除了 target 之外沒有可用的特徵欄位');
  const tr = o.train, te = o.test, y = o.y, ntr = tr.length, logY = !!o.logY;
  if (logY && y.some(v => !(v > 0))) throw new Error('target 有 ≤ 0 的值，不能取 log');
  const yt = logY ? y.map(Math.log) : y, back = logY ? Math.exp : v => v;
  const raw = o.rows.map(r => spec.flatMap(s => s.enc(r)));
  const med = names.map((_, j) => median(tr.map(i => raw[i][j])));            // 只用訓練集
  const fill = r => r.map((v, j) => (Number.isNaN(v) ? med[j] : v));
  const X = raw.map(fill);
  const mu = names.map((_, j) => mean(tr.map(i => X[i][j])));
  const sd = names.map((_, j) => sdPop(tr.map(i => X[i][j])) || 1);
  const Z = X.map(r => [1, ...r.map((v, j) => (v - mu[j]) / sd[j])]);
  const GT = gramRows(Z, yt, tr, q);
  const foldRows = Array.from({ length: o.K }, () => []);
  tr.forEach((i, t) => foldRows[o.foldOf[t]].push(i));
  const GF = foldRows.map(rs => gramRows(Z, yt, rs, q));
  const ridge = 1e-9 * ntr;
  const D = S => [0, ...S.map(j => j + 1)];
  const sub = (G, b, d) => { const A = d.map(a => d.map(c => G[a][c])), v = d.map(a => b[a]); for (let i = 1; i < d.length; i++) A[i][i] += ridge; return { A, v }; };
  const dot = (z, d, w) => { let s = 0; for (let t = 0; t < d.length; t++) s += z[d[t]] * w[t]; return s; };
  const quad = (u, M) => { let s = 0; for (let a = 0; a < u.length; a++) { let r = 0; for (let b = 0; b < u.length; b++) r += M[a][b] * u[b]; s += u[a] * r; } return s; };
  const key = S => S.slice().sort((a, b) => a - b).join(',');
  const cvC = new Map(), evC = new Map(), dtC = new Map();
  const ytr = tr.map(i => y[i]), yttr = tr.map(i => yt[i]), sdY = sdPop(yttr);

  function cvOf(S) {                                   // mean / sd of per-fold RMSE（同 sklearn cross_val_score）
    const kk = key(S); if (cvC.has(kk)) return cvC.get(kk);
    const d = D(S), rm = [];
    for (let k = 0; k < o.K; k++) {
      const rs = foldRows[k]; if (!rs.length) continue;
      const Gk = GF[k], A = d.map(a => d.map(c => GT.G[a][c] - Gk.G[a][c])), v = d.map(a => GT.b[a] - Gk.b[a]);
      for (let i = 1; i < d.length; i++) A[i][i] += ridge;
      const w = solve(A, v); let sse = 0;
      for (const i of rs) sse += (y[i] - back(dot(Z[i], d, w))) ** 2;
      rm.push(Math.sqrt(sse / rs.length));
    }
    const r = { mean: mean(rm), sd: sdPop(rm) }; cvC.set(kk, r); return r;
  }
  function evalOf(S) {
    const kk = key(S); if (evC.has(kk)) return evC.get(kk);
    const d = D(S), { A, v } = sub(GT.G, GT.b, d), w = solve(A, v), n = te.length, k = S.length;
    let sse = 0, sae = 0, sst = 0; const ym = mean(te.map(i => y[i]));
    for (const i of te) { const e = y[i] - back(dot(Z[i], d, w)); sse += e * e; sae += Math.abs(e); sst += (y[i] - ym) ** 2; }
    let tse = 0, tst = 0; const tm = mean(ytr);
    for (const i of tr) { tse += (y[i] - back(dot(Z[i], d, w))) ** 2; tst += (y[i] - tm) ** 2; }
    const r2 = 1 - sse / sst, cv = cvOf(S);
    const r = { cols: S.slice(), features: S.map(j => names[j]), k, rmse: Math.sqrt(sse / n), mae: sae / n, mse: sse / n, r2,
                adj_r2: n - k - 1 > 0 ? 1 - (1 - r2) * (n - 1) / (n - k - 1) : null, train_r2: 1 - tse / tst, cv: cv.mean, cvSd: cv.sd };
    evC.set(kk, r); return r;
  }
  function stdCoef(S) { const d = D(S), { A, v } = sub(GT.G, GT.b, d); return solve(A, v).slice(1); }
  function vif(S) {
    if (S.length === 1) return [1];
    const R = S.map(a => S.map(c => GT.G[a + 1][c + 1] / ntr)); S.forEach((_, i) => (R[i][i] += 1e-10));
    const Ri = invert(R); return S.map((_, i) => Ri[i][i]);
  }
  const corrY = () => names.map((_, j) => (sdY ? GT.b[j + 1] / ntr / sdY : 0));

  function detailOf(S) {
    const kk = key(S); if (dtC.has(kk)) return dtC.get(kk);
    const d = D(S), { A, v } = sub(GT.G, GT.b, d), w = solve(A, v), Ai = invert(A), k = S.length, df = ntr - k - 1;
    const fitted = tr.map(i => dot(Z[i], d, w)), e = tr.map((i, t) => yt[i] - fitted[t]);   // 模型尺度（logY 時為 log）
    const sse = e.reduce((s, v) => s + v * v, 0), tm = mean(yttr), sst = yttr.reduce((s, v) => s + (v - tm) ** 2, 0), s2 = sse / df, tc = tCrit(df);
    const beta = [w[0] - S.reduce((s, j, t) => s + w[t + 1] * mu[j] / sd[j], 0), ...S.map((j, t) => w[t + 1] / sd[j])];
    const m0 = [1, ...S.map(j => -mu[j] / sd[j])];
    const se = [Math.sqrt(s2 * quad(m0, Ai)), ...S.map((j, t) => Math.sqrt(s2 * Ai[t + 1][t + 1]) / sd[j])];
    const vifs = vif(S);
    const coefficients = beta.map((b, a) => {
      const t = b / se[a];
      return { feature: a === 0 ? 'Intercept' : names[S[a - 1]], coef: b, stderr: se[a], tstat: t, pvalue: tPval(Math.abs(t), df),
               ci_lower: b - tc * se[a], ci_upper: b + tc * se[a], vif: a === 0 ? null : vifs[a - 1], std: a === 0 ? null : w[a] };
    });
    const F = ((sst - sse) / k) / s2;
    const interval = z => { const pr = z.reduce((s, v, t) => s + v * w[t], 0), vv = quad(z, Ai), sm = Math.sqrt(s2 * vv), so = Math.sqrt(s2 * (1 + vv));
      return { pred: back(pr), ciLo: back(pr - tc * sm), ciHi: back(pr + tc * sm), piLo: back(pr - tc * so), piHi: back(pr + tc * so) }; };
    const tests = te.map(i => ({ i, label: o.labels[i], actual: y[i], ...interval(d.map(a => Z[i][a])) }));
    const coverage = mean(tests.map(t => (t.actual >= t.piLo && t.actual <= t.piHi ? 1 : 0)));
    // diagnostics on training residuals
    let dwn = 0; for (let t = 1; t < e.length; t++) dwn += (e[t] - e[t - 1]) ** 2;
    const m2 = sse / ntr, m3 = e.reduce((s, v) => s + v ** 3, 0) / ntr, m4 = e.reduce((s, v) => s + v ** 4, 0) / ntr;
    const skew = m3 / m2 ** 1.5, kurt = m4 / m2 ** 2, JB = ntr / 6 * (skew ** 2 + (kurt - 3) ** 2 / 4);
    const e2 = e.map(v => v * v), b2 = d.map(a => tr.reduce((s, i, t) => s + Z[i][a] * e2[t], 0)), g = solve(A, b2);
    const e2m = mean(e2); let sa = 0, st = 0; tr.forEach((i, t) => { sa += (e2[t] - dot(Z[i], d, g)) ** 2; st += (e2[t] - e2m) ** 2; });
    const LM = ntr * (1 - sa / st);
    const predict = row => {
      const x = spec.flatMap(s => s.enc(row)).map((v, j) => (Number.isNaN(v) ? med[j] : v));
      return interval([1, ...S.map(j => (x[j] - mu[j]) / sd[j])]);
    };
    const r = { cols: S.slice(), features: S.map(j => names[j]), coefficients, logY, fittedOrig: fitted.map(back), f_stat: F, f_pvalue: fPval(F, k, df), df, tc, s2,
      train_r2: 1 - sse / sst, adj_train_r2: 1 - (1 - (1 - sse / sst)) * (ntr - 1) / df, tests, coverage, fitted, resid: e,
      dw: dwn / sse, skew, kurt, jb: JB, jb_p: Math.exp(-JB / 2), bp: LM, bp_p: chi2sf(LM, k), maxVif: Math.max(...vifs), predict };
    dtC.set(kk, r); return r;
  }
  return { logY, names, p, tr, te, y, X, raw, med, mu, sd, spec, K: o.K, labels: o.labels, foldRows, cvOf, evalOf, detailOf, stdCoef, vif, corrY, GT, ntr };
}

// ---------- feature selection: each returns subsets[k-1] (array of column indices) ----------
function forwardCV(ctx, pool) {
  const sel = [], out = [], rem = pool.slice();
  while (rem.length) {
    let best = null;
    for (const f of rem) { const s = ctx.cvOf([...sel, f]).mean; if (!best || s < best.s) best = { f, s }; }
    sel.push(best.f); rem.splice(rem.indexOf(best.f), 1); out.push(sel.slice());
  }
  return out;
}
function vifPrune(ctx, thr = 10) {
  const cols = [...Array(ctx.p).keys()], dropped = [];
  while (cols.length > 1) {
    const v = ctx.vif(cols); let m = 0; v.forEach((x, i) => { if (x > v[m]) m = i; });
    if (v[m] < thr) break;
    dropped.push({ name: ctx.names[cols[m]], vif: v[m] }); cols.splice(m, 1);
  }
  return { cols, dropped };
}
function rfeSubsets(ctx) {
  let cur = [...Array(ctx.p).keys()]; const out = new Array(ctx.p).fill(null); out[ctx.p - 1] = cur.slice();
  while (cur.length > 1) {
    const w = ctx.stdCoef(cur); let mi = 0; w.forEach((c, i) => { if (Math.abs(c) < Math.abs(w[mi])) mi = i; });
    cur = cur.filter((_, i) => i !== mi); out[cur.length - 1] = cur.slice();
  }
  return out;
}
function lassoSubsets(ctx) {                  // coordinate descent on the standardized Gram（sklearn 的目標函數）
  const p = ctx.p, n = ctx.ntr, G = ctx.GT.G, Q = (a, b) => G[a + 1][b + 1] / n, c = [...Array(p).keys()].map(j => ctx.GT.b[j + 1] / n);
  const amax = Math.max(...c.map(Math.abs)) || 1, w = new Array(p).fill(0), order = [];
  for (let s = 0; s < 100 && order.length < p; s++) {
    const alpha = amax * Math.pow(1e-3, s / 99);
    for (let it = 0; it < 3000; it++) {
      let dmax = 0;
      for (let j = 0; j < p; j++) {
        const qjj = Q(j, j); if (qjj < 1e-12) continue;
        let rho = c[j]; for (let k = 0; k < p; k++) if (k !== j && w[k]) rho -= Q(j, k) * w[k];
        const nw = Math.sign(rho) * Math.max(0, Math.abs(rho) - alpha) / qjj, dd = Math.abs(nw - w[j]);
        if (dd > dmax) dmax = dd; w[j] = nw;
      }
      if (dmax < 1e-10) break;
    }
    w.map((v, j) => [j, Math.abs(v)]).filter(([j, a]) => a > 0 && !order.includes(j)).sort((a, b) => b[1] - a[1]).forEach(([j]) => order.push(j));
  }
  const cy = ctx.corrY();
  [...Array(p).keys()].filter(j => !order.includes(j)).sort((a, b) => Math.abs(cy[b]) - Math.abs(cy[a])).forEach(j => order.push(j));
  return order.map((_, i) => order.slice(0, i + 1));
}
function corrSubsets(ctx) {
  const cy = ctx.corrY(), order = [...Array(ctx.p).keys()].sort((a, b) => Math.abs(cy[b]) - Math.abs(cy[a]));
  return order.map((_, i) => order.slice(0, i + 1));
}
const EXH_MAX = 12;
function exhaustiveSubsets(ctx) {
  const p = ctx.p, best = new Array(p).fill(null);
  for (let mask = 1; mask < (1 << p); mask++) {
    const cols = []; for (let j = 0; j < p; j++) if (mask & (1 << j)) cols.push(j);
    const s = ctx.cvOf(cols).mean, k = cols.length - 1;
    if (!best[k] || s < best[k].s) best[k] = { s, cols };
  }
  return best.map(b => b && b.cols);
}

const METHODS = [
  { id: 'vif', name: 'VIF + Forward', icon: 'fa-filter-circle-xmark', badge: 'Notebook 採用', desc: '先反覆刪掉 VIF 最大的特徵直到全部 < 10，再用 CV RMSE 逐步向前加入。' },
  { id: 'fwd', name: 'Forward (CV)', icon: 'fa-arrow-trend-up', badge: 'Wrapper', desc: '每一步加入讓 CV RMSE 最低的特徵。' },
  { id: 'rfe', name: 'RFE', icon: 'fa-scissors', badge: 'Wrapper', desc: '在標準化資料上，每次刪掉 |係數| 最小的特徵。' },
  { id: 'lasso', name: 'Lasso path', icon: 'fa-wave-square', badge: 'Embedded', desc: 'L1 正則化路徑上，特徵進入模型的先後順序。' },
  { id: 'corr', name: 'Correlation filter', icon: 'fa-ranking-star', badge: 'Filter', desc: '依 |corr(x, y)| 由大到小取前 k 個。' },
  { id: 'exh', name: 'Exhaustive (CV)', icon: 'fa-magnifying-glass-chart', badge: `p ≤ ${EXH_MAX}`, desc: '窮舉所有 2^p 組合，每個 k 取 CV RMSE 最低者。' }
];
function runMethods(ctx) {
  const all = [...Array(ctx.p).keys()], out = {}, vp = vifPrune(ctx);
  const sets = {
    vif: forwardCV(ctx, vp.cols), fwd: forwardCV(ctx, all), rfe: rfeSubsets(ctx), lasso: lassoSubsets(ctx), corr: corrSubsets(ctx),
    exh: ctx.p <= EXH_MAX ? exhaustiveSubsets(ctx) : null
  };
  for (const m of METHODS) {
    const ss = sets[m.id];
    if (!ss) { out[m.id] = null; continue; }
    // 快取以排序後的欄位為 key，這裡依各方法自己的加入順序重排 features
    const evals = all.map(i => (ss[i] ? { ...ctx.evalOf(ss[i]), cols: ss[i].slice(), features: ss[i].map(j => ctx.names[j]),
      added: i === 0 ? ctx.names[ss[0][0]] : (ss[i - 1] ? ss[i].filter(j => !ss[i - 1].includes(j)).map(j => ctx.names[j]).join(', ') : null) } : null));
    const ok = evals.filter(Boolean), cvMin = Math.min(...ok.map(r => r.cv)), thr = cvMin * 1.01;
    const recK = ok.filter(r => r.cv <= thr).reduce((a, r) => (r.k < a ? r.k : a), Infinity);
    const minK = ok.find(r => r.cv === cvMin).k;
    out[m.id] = { evals, recK, minK, cvMin, thr };
  }
  out.vifDropped = vp.dropped;
  return out;
}

if (typeof module !== 'undefined') module.exports = { parseCSV, profile, autoDrop, genericSpec, whoSpec, WHO_TARGET, randomSplit, groupSplit, kfoldOf, groupKFoldOf, makeContext, runMethods, METHODS, vifPrune, forwardCV, tPval, chi2sf };
