// ===== 預測圖、診斷、Live Predictor、事件 =====
function renderBand() {
  const d = S.cur.d, T = d.tests.slice().sort((a, b) => a.pred - b.pred), labels = T.map((_, i) => i + 1);
  const ln = (label, key, extra) => Object.assign({ label, data: T.map(t => t[key]), pointRadius: 0, borderWidth: 0, tension: 0 }, extra);
  $('bandSub').textContent = `${T.length} 筆測試資料依預測值排序。淺色為 95% 預測區間（單筆），深色為 95% 信賴區間（平均值），黑點為實際值。`;
  $('coverBadge').textContent = `PI coverage ${(d.coverage * 100).toFixed(1)}%`;
  chart('bandChart', { type: 'line', data: { labels, datasets: [
    ln('PI lower', 'piLo', { order: 4 }), ln('95% prediction interval', 'piHi', { fill: '-1', backgroundColor: 'rgba(59,130,246,.15)', order: 4 }),
    ln('CI lower', 'ciLo', { order: 3 }), ln('95% confidence interval', 'ciHi', { fill: '-1', backgroundColor: 'rgba(37,99,235,.55)', order: 3 }),
    ln('prediction', 'pred', { borderColor: '#1d4ed8', borderWidth: 1.5, order: 2 }),
    { label: 'actual', data: T.map(t => t.actual), showLine: false, pointRadius: 2.2, pointBackgroundColor: T.map(t => (t.actual < t.piLo || t.actual > t.piHi ? '#dc2626' : '#0f172a')), pointBorderWidth: 0, order: 1 }] },
    options: { interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { filter: it => !/lower/.test(it.text), boxWidth: 14 } },
        tooltip: { filter: it => /actual|prediction$/.test(it.dataset.label), callbacks: { title: it => T[it[0].dataIndex].label,
          afterBody: it => { const t = T[it[0].dataIndex]; return `95% PI [${fmtY(t.piLo)}, ${fmtY(t.piHi)}]\n95% CI [${fmtY(t.ciLo)}, ${fmtY(t.ciHi)}]`; } } } },
      scales: { x: { title: { display: true, text: 'test samples (sorted by prediction)' }, ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: S.meta.target } } } } });
}
function renderAvp() {
  const T = S.cur.d.tests, out = t => t.actual < t.piLo || t.actual > t.piHi, lo = Math.min(...T.map(t => Math.min(t.actual, t.pred))), hi = Math.max(...T.map(t => Math.max(t.actual, t.pred)));
  const pt = f => T.filter(f).map(t => ({ x: t.actual, y: t.pred, l: t.label }));
  chart('avpChart', { type: 'scatter', data: { datasets: [
    { label: 'inside 95% PI', data: pt(t => !out(t)), backgroundColor: 'rgba(37,99,235,.55)', pointRadius: 3 },
    { label: 'outside 95% PI', data: pt(out), backgroundColor: '#dc2626', pointRadius: 3.5 },
    { label: 'y = x', type: 'line', data: [{ x: lo, y: lo }, { x: hi, y: hi }], borderColor: '#ef4444', borderDash: [6, 6], pointRadius: 0 }] },
    options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.raw.l ? `${c.raw.l}: actual ${fmtY(c.raw.x)}, pred ${fmtY(c.raw.y)}` : '' } } },
      scales: { x: { title: { display: true, text: 'Actual' } }, y: { title: { display: true, text: 'Predicted' } } } } });
}
function renderRes() {
  const d = S.cur.d, pts = d.fitted.map((f, i) => ({ x: f, y: d.resid[i] }));
  $('resSub').textContent = `看有沒有曲線趨勢（非線性）或漏斗形（異質變異）${S.meta.logY ? '；log 尺度' : ''}。`;
  const xs = d.fitted, lo = Math.min(...xs), hi = Math.max(...xs);
  chart('resChart', { type: 'scatter', data: { datasets: [{ label: 'residual', data: pts, backgroundColor: 'rgba(245,158,11,.45)', pointRadius: 2.2 },
    { label: '0', type: 'line', data: [{ x: lo, y: 0 }, { x: hi, y: 0 }], borderColor: '#ef4444', pointRadius: 0 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: S.meta.logY ? 'fitted log(y)' : 'fitted' } }, y: { title: { display: true, text: 'residual' } } } } });
}
function renderTs() {
  const M = S.meta; if (!M.group) return;
  const g = $('tsGroup').value, tc = M.timeCol;
  const T = S.cur.d.tests.filter(t => M.rows[t.i][M.group] === g).map(t => ({ ...t, x: tc ? M.rows[t.i][tc] : t.label }))
    .sort((a, b) => (isNum(a.x) && isNum(b.x) ? a.x - b.x : String(a.x).localeCompare(String(b.x))));
  const ln = (label, key, extra) => Object.assign({ label, data: T.map(t => t[key]), pointRadius: 0, borderWidth: 0, tension: 0 }, extra);
  chart('tsChart', { type: 'line', data: { labels: T.map(t => t.x), datasets: [
    ln('PI lower', 'piLo', { order: 4 }), ln('95% PI', 'piHi', { fill: '-1', backgroundColor: 'rgba(59,130,246,.15)', order: 4 }),
    ln('CI lower', 'ciLo', { order: 3 }), ln('95% CI', 'ciHi', { fill: '-1', backgroundColor: 'rgba(249,115,22,.45)', order: 3 }),
    ln('predicted', 'pred', { borderColor: '#2563eb', borderWidth: 2, order: 2 }),
    ln('actual', 'actual', { borderColor: '#0f172a', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#0f172a', order: 1 })] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { filter: it => !/lower/.test(it.text) } },
      tooltip: { filter: it => !/lower/.test(it.dataset.label) } }, scales: { x: { title: { display: true, text: tc || 'sample' } }, y: { title: { display: true, text: M.target } } } } });
}
function renderAssumptions() {
  const d = S.cur.d, M = S.meta, b = (c, t) => `<span class="badge-tag badge-${c}">${t}</span>`;
  const rows = [
    ['線性', '殘差 vs 預測值圖', '看 Residuals vs Fitted 圖有沒有曲線', b('gray', '目視')],
    ['無共線性', '最大 VIF', d.maxVif.toFixed(2), d.maxVif < 5 ? b('green', '成立') : d.maxVif < 10 ? b('amber', '可接受') : b('red', '共線嚴重')],
    ['常態', 'Jarque-Bera', `JB = ${fmt(d.jb, 2)}, p ${pfmt(d.jb_p)}, skew ${d.skew.toFixed(2)}`, d.jb_p >= 0.05 ? b('green', '成立') : b('amber', '不成立（樣本大時影響有限）')],
    ['同質變異', 'Breusch-Pagan', `LM = ${fmt(d.bp, 2)}, p ${pfmt(d.bp_p)}`, d.bp_p >= 0.05 ? b('green', '成立') : b('amber', '有異質變異')],
    ['獨立', 'Durbin-Watson', d.dw.toFixed(3) + (M.group || M.timeCol ? '' : '（列順序無意義時僅供參考）'), d.dw >= 1.5 && d.dw <= 2.5 ? b('green', '成立') : b('amber', d.dw < 1.5 ? '殘差正相關' : '殘差負相關')],
    ['區間校準', '95% PI 覆蓋率（test）', (d.coverage * 100).toFixed(1) + '%', d.coverage >= 0.93 ? b('green', '接近 95%') : d.coverage >= 0.88 ? b('amber', '偏窄') : b('red', '太窄')]];
  $('assBody').innerHTML = rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:600"' : ''}>${c}</td>`).join('')}</tr>`).join('');
}
function renderOutliers() {
  const T = S.cur.d.tests.slice().sort((a, b) => Math.abs(b.actual - b.pred) - Math.abs(a.actual - a.pred)).slice(0, 10);
  $('outBody').innerHTML = T.map((t, i) => { const r = t.actual - t.pred, inn = t.actual >= t.piLo && t.actual <= t.piHi;
    return `<tr><td>${i + 1}</td><td>${esc(t.label)}</td><td class="mono">${fmtY(t.actual)}</td><td class="mono">${fmtY(t.pred)}</td>
      <td style="color:${r >= 0 ? '#059669' : '#dc2626'};font-weight:600">${r >= 0 ? '+' : ''}${fmtY(r)}</td>
      <td style="font-size:12px">[${fmtY(t.piLo)}, ${fmtY(t.piHi)}] ${inn ? '' : '<span class="badge-tag badge-red">外</span>'}</td></tr>`; }).join('');
}

// ---------- Live Predictor ----------
function buildPredInputs() {
  const C = S.ctx, M = S.meta, trRows = C.tr.map(i => M.rows[i]);
  let off = 0;
  S.predCols = C.spec.map(sp => { const idx = sp.names.map((_, j) => off + j); off += sp.names.length; return idx; });
  $('predInputs').innerHTML = C.spec.map((sp, i) => {
    const lab = `<div class="input-label-row"><label for="pi${i}">${esc(sp.col)}${sp.tf && sp.tf !== 'one-hot' ? ` <span class="tf">→ ${esc(sp.names[0] === sp.col ? sp.tf : sp.names[0])}</span>` : ''}</label><span class="unusedTag tf"></span></div>`;
    if (sp.kind === 'cat') {
      const cnt = {}; trRows.forEach(r => { if (r[sp.col] !== '') cnt[r[sp.col]] = (cnt[r[sp.col]] || 0) + 1; });
      const mode = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      return `<div class="input-group" data-s="${i}">${lab}<select id="pi${i}" class="input-field">${sp.levels.map((l, j) => `<option value="${esc(l)}"${l === mode ? ' selected' : ''}>${esc(l)}${j === 0 ? '（基準）' : ''}</option>`).join('')}</select></div>`;
    }
    const v = median(trRows.map(r => (isNum(r[sp.col]) ? Number(r[sp.col]) : NaN)));
    return `<div class="input-group" data-s="${i}">${lab}<input type="number" id="pi${i}" class="input-field" value="${Number(v.toPrecision(6))}" step="any"></div>`;
  }).join('');
  $('predInputs').querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => { $('sampleSel').value = ''; updatePred(); }));
  const te = C.te, def = M.who ? te.find(i => C.labels[i] === 'Myanmar 2015') : null;
  $('sampleSel').innerHTML = '<option value="">（自訂輸入，預設為訓練集中位數 / 眾數）</option>' +
    te.map(i => `<option value="${i}"${i === def ? ' selected' : ''}>${esc(C.labels[i])}（actual ${esc(fmtY(M.y[i]))}）</option>`).join('');
  if (def != null) fillSample(def);
}
function fillSample(i) {
  const row = S.meta.rows[i];
  S.ctx.spec.forEach((sp, j) => { $('pi' + j).value = row[sp.col] ?? ''; });
}
function updatePred() {
  if (!S.cur) return;
  const d = S.cur.d, M = S.meta, row = {};
  S.ctx.spec.forEach((sp, j) => { row[sp.col] = String($('pi' + j).value).trim(); });
  S.ctx.spec.forEach((sp, j) => { const used = S.predCols[j].some(c => d.cols.includes(c)), g = $('predInputs').querySelector(`[data-s="${j}"]`);
    g.classList.toggle('unused', !used); g.querySelector('.unusedTag').textContent = used ? '' : '未使用'; });
  const p = d.predict(row), si = $('sampleSel').value;
  $('predLabel').textContent = `Predicted ${M.target}`;
  $('predOut').textContent = fmtY(p.pred, true);
  let pi = `95% 預測區間 [${fmtY(p.piLo)}, ${fmtY(p.piHi)}]<br>95% 信賴區間 [${fmtY(p.ciLo)}, ${fmtY(p.ciHi)}]`;
  if (si !== '') { const a = M.y[+si]; pi += `<br>實際值 ${fmtY(a, true)}（${a >= p.piLo && a <= p.piHi ? '在 PI 內' : '在 PI 外'}，誤差 ${fmtY(a - p.pred)}）`; }
  $('predPI').innerHTML = pi;
  $('predNote').innerHTML = `${METHODS.find(m => m.id === S.method).name}, k = ${d.cols.length}：${d.features.map(esc).join('、')}`;
}

// ---------- wiring ----------
$('problem').onchange = () => { S.problem = $('problem').value; $('url').value = ''; S.method = null; loadDefault(); };
$('btnLoad').onclick = loadURL;
$('url').addEventListener('keydown', e => { if (e.key === 'Enter') loadURL(); });
$('btnDefault').onclick = () => { $('url').value = ''; loadDefault(); };
$('file').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { setDataset(t, f.name); } catch (er) { status(esc(er.message), true); } }); };
document.querySelectorAll('.linkbtn').forEach(b => (b.onclick = () => { $('url').value = b.dataset.url; loadURL(); }));
$('btnRun').onclick = () => S.ds && compute();
['target', 'group', 'logY'].forEach(id => ($(id).onchange = () => { if (id === 'target') S.method = null; S.ds && compute(); }));
$('cmpAll').onchange = () => { S.cmpAll = $('cmpAll').checked; renderCurves(); };
$('tsGroup').onchange = renderTs;
$('sampleSel').onchange = () => { const v = $('sampleSel').value; if (v !== '') fillSample(+v); updatePred(); };
(() => { const q = new URLSearchParams(location.search).get('data'); if (q) { $('url').value = q; loadURL(); } else loadDefault(); })();
