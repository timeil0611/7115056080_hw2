// ===== App：state、資料載入、建模 =====
const PRESETS = {
  who: { name: 'WHO Life Expectancy', title: 'WHO Life Expectancy 多元線性回歸', crumb: 'Life Expectancy · 按國家切分', target: 'Life expectancy',
         group: 'Country', logY: false, seed: 42, unit: 'yr', method: 'vif', time: 'Year', label: r => `${r.Country} ${r.Year}` },
  car: { name: 'Car Price', title: 'Car Price 多元線性回歸', crumb: 'Car Price · log(price)', target: 'price',
         group: '', logY: true, seed: 42, unit: '$', method: null, time: null, label: r => `#${r.car_ID} ${r.CarName}` }
};
const MCOLOR = { vif: '#4f46e5', fwd: '#0ea5e9', rfe: '#f59e0b', lasso: '#10b981', corr: '#ec4899', exh: '#8b5cf6' };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 2) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const norm = t => t.replace(/\r/g, '').replace(/^﻿/, '').trim();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pfmt = p => (p < 1e-4 ? '&lt; 0.0001' : p.toFixed(4));
const S = { problem: 'who', ds: null, ctx: null, res: null, meta: null, method: null, k: 1, crisp: 'bu', cmpAll: false, cur: null };
const charts = {};

function fmtN(v) { if (!isFinite(v)) return '-'; const a = Math.abs(v); return a >= 1000 ? fmt(v, 0) : a >= 10 ? fmt(v, 2) : Number(v.toPrecision(4)).toString(); }
function fmtY(v, unit = false) {
  if (v == null || !isFinite(v)) return '-';
  const u = S.meta && S.meta.unit;
  if (u === '$') return (v < 0 ? '-$' : '$') + fmt(Math.abs(v), 0);
  if (u === 'yr') return fmt(v, 2) + (unit ? ' 歲' : '');
  return fmt(v, S.meta ? S.meta.dec : 2);
}
function skewOf(a) {
  const n = a.length, m = mean(a), m2 = mean(a.map(v => (v - m) ** 2)), m3 = mean(a.map(v => (v - m) ** 3));
  return n > 2 && m2 ? Math.sqrt(n * (n - 1)) / (n - 2) * m3 / m2 ** 1.5 : 0;     // 同 pandas .skew()
}
function status(msg, err = false) { $('status').innerHTML = msg; $('status').className = err ? 'err' : ''; }
function chart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  if (typeof Chart === 'undefined') return;
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, cfg.options || {});
  charts[id] = new Chart($(id), cfg);
}
const opts = (arr, sel) => arr.map(n => `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');

// ---------- data loading ----------
function guessTarget(nums) {
  return nums.find(n => /^(price|profit|target|y|label|life expectancy|saleprice|charges|medv|selling_price|score)$/i.test(n)) || nums[nums.length - 1];
}
function setDataset(text, label) {
  const hit = Object.keys(DATA_CSV).find(k => norm(text) === norm(DATA_CSV[k]));     // 內建資料（例如從鏡像網址載入）
  if (hit) { S.problem = hit; $('problem').value = hit; }
  const { header, data } = parseCSV(text);
  const prof = profile(header, data), nums = prof.filter(c => c.numeric).map(c => c.name);
  if (!nums.length) throw new Error('找不到數值欄位，請確認 CSV 格式');
  const P = PRESETS[S.problem], builtin = !!hit;
  S.ds = { header, data, prof, builtin, label };
  $('target').innerHTML = opts(nums, builtin ? P.target : guessTarget(nums));
  const cats = prof.filter(c => !c.numeric && c.nunique >= 5 && c.nunique < data.length * 0.5).map(c => c.name);
  $('group').innerHTML = '<option value="">（不分組，隨機切分）</option>' + opts(cats, builtin ? P.group : '');
  $('logY').checked = builtin ? P.logY : false;
  $('seed').value = builtin ? P.seed : 42; $('testSize').value = 0.2;
  S.method = null; S.crisp = S.crisp || 'bu';
  compute();
}
async function loadURL() {
  const url = $('url').value.trim();
  if (!url) return loadDefault();
  status('<i class="fa-solid fa-spinner fa-spin"></i> 下載中…');
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    setDataset(await r.text(), url);
  } catch (e) { status(`無法載入 ${esc(url)}：${esc(e.message)}。請確認網址指向 raw CSV，且伺服器允許跨網域讀取（CORS）。`, true); }
}
function loadDefault() {
  try { setDataset(DATA_CSV[S.problem], '內建 ' + PRESETS[S.problem].name); } catch (e) { status(esc(e.message), true); }
}

// ---------- modeling ----------
function compute() {
  status('<i class="fa-solid fa-spinner fa-spin"></i> 計算中（6 種特徵選擇 × 每個 k 的交叉驗證）…');
  setTimeout(() => {
    try {
      const t0 = performance.now();
      build();
      const M = S.meta, ms = Math.round(performance.now() - t0);
      status(`<i class="fa-solid fa-circle-check" style="color:var(--emerald)"></i> 已載入：${esc(S.ds.label)}｜${M.rows.length} 筆｜train ${S.ctx.tr.length} / test ${S.ctx.te.length}｜${S.ctx.p} 個候選特徵｜${M.splitNote}｜${ms} ms` +
        (M.warn ? `<br><span style="color:#b45309">${M.warn}</span>` : ''));
      renderStatic(); update();
    } catch (e) { console.error(e); status('無法建立模型：' + esc(e.message), true); }
  }, 30);
}
function build() {
  const ds = S.ds, P = PRESETS[S.problem], target = $('target').value, group = $('group').value;
  const ratio = clamp(+$('testSize').value || 0.2, 0.05, 0.5), seed = Math.round(+$('seed').value || 0);
  const preset = ds.builtin && target === P.target, who = preset && S.problem === 'who';
  const rows = ds.data.filter(r => isNum(r[target]));
  if (rows.length < 15) throw new Error(`target 有效資料只有 ${rows.length} 筆，至少需要 15 筆`);
  const y = rows.map(r => Number(r[target])), prof = profile(ds.header, rows);
  let logY = $('logY').checked, warn = '';
  if (logY && y.some(v => !(v > 0))) { logY = false; $('logY').checked = false; warn = 'target 有 ≤ 0 的值，已取消 log(y)。'; }
  let drops, spec;
  if (who) {
    drops = [{ name: 'Country', why: '組別（只用來切分）' }, { name: 'Year', why: '時間索引（notebook 同樣不當特徵）' }];
    spec = whoSpec();
  } else {
    drops = autoDrop(prof, rows.length, target);
    if (group) { drops = drops.filter(d => d.name !== group); drops.push({ name: group, why: 'Group 欄位（只用來切分）' }); }
    spec = genericSpec(prof, target, drops.map(d => d.name));
  }
  let split, foldOf, K = 5, splitNote;
  if (who && group === 'Country' && seed === 42 && Math.abs(ratio - 0.2) < 1e-9) {
    const T = new Set(WHO_SPLIT.test), test = [], train = [];
    rows.forEach((r, i) => (T.has(r.Country) ? test : train).push(i));
    split = { train, test, nGroupsTest: WHO_SPLIT.test.length, nGroupsTrain: Object.keys(WHO_SPLIT.folds).length };
    foldOf = train.map(i => WHO_SPLIT.folds[rows[i].Country]);
    splitNote = `按國家切分 ${split.nGroupsTrain} / ${split.nGroupsTest} 國（和 notebook 相同的 GroupShuffleSplit + GroupKFold(5)）`;
  } else if (group) {
    const g = rows.map(r => r[group] || '(missing)');
    split = groupSplit(g, ratio, seed);
    if (split.nGroupsTrain < 2) throw new Error('組別太少，無法分組切分');
    K = Math.min(5, split.nGroupsTrain);
    foldOf = groupKFoldOf(split.train.map(i => g[i]), K);
    splitNote = `按「${esc(group)}」分組切分 ${split.nGroupsTrain} / ${split.nGroupsTest} 組，CV = GroupKFold(${K})`;
  } else {
    split = randomSplit(rows.length, ratio, seed); foldOf = kfoldOf(split.train.length, 5, seed);
    splitNote = `隨機切分（test ${ratio}, seed ${seed}），CV = KFold(5)`;
  }
  const timeCol = who ? 'Year' : (ds.header.find(h => /^(year|date|time|年份?)$/i.test(h)) || null);
  const nameCol = prof.find(c => !c.numeric && c.name !== target && c.name !== group && c.nunique > rows.length * 0.3);
  const labels = rows.map((r, i) => (preset ? P.label(r) : group ? `${r[group]}${timeCol ? ' ' + r[timeCol] : ''}` : nameCol ? `#${i + 1} ${r[nameCol.name]}` : `Row ${i + 1}`));
  const ctx = makeContext({ rows, y, spec, train: split.train, test: split.test, foldOf, K, labels, logY });
  if (ctx.p > 80) warn += ` 特徵有 ${ctx.p} 個，Forward 類方法會比較慢。`;
  const res = runMethods(ctx), sdY = sdPop(y);
  S.ctx = ctx; S.res = res;
  S.meta = { rows, y, prof, target, group, preset, who, drops, split, K, splitNote, timeCol, logY, warn, sdY, skew: skewOf(y),
             nDropped: ds.data.length - rows.length, unit: preset ? P.unit : '', dec: sdY >= 1000 ? 0 : sdY >= 10 ? 2 : 4 };
  const avail = METHODS.filter(m => res[m.id]).map(m => m.id);
  if (!S.method || !res[S.method]) {
    S.method = preset && P.method ? P.method
      : avail.reduce((b, id) => (res[id].evals[res[id].recK - 1].cv < res[b].evals[res[b].recK - 1].cv ? id : b), avail[0]);
  }
  S.k = res[S.method].recK;
}
