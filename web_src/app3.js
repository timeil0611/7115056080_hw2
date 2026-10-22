// ===== 動態部分（換方法 / k 時更新）=====
function metricCard(title, val, note, badge = '', cls = '') {
  return `<div class="metric-card ${cls}"><div class="metric-title"><span>${title}</span>${badge}</div><div class="metric-val">${val}</div><div class="metric-note">${note}</div></div>`;
}
function update() {
  const R = S.res[S.method], C = S.ctx, M = S.meta, e = R.evals[S.k - 1];
  if (!e) { S.k = R.recK; return update(); }
  const d = C.detailOf(e.cols); S.cur = { e, d };
  $('algoTabs').querySelectorAll('.tab-btn').forEach(b => { const on = b.dataset.m === S.method; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  $('methodDesc').innerHTML = `<i class="fa-solid fa-circle-info"></i> ${METHODS.find(m => m.id === S.method).desc}` +
    (S.method === 'vif' && S.res.vifDropped.length ? `（刪掉 ${S.res.vifDropped.length} 個：${S.res.vifDropped.map(x => esc(x.name)).join('、')}）` : '');
  // k buttons
  $('kGroup').innerHTML = R.evals.map((r, i) => {
    const k = i + 1, cls = ['k-btn', k === R.recK ? 'sweet-spot' : '', k === R.minK && k !== R.recK ? 'cvmin' : '', k === S.k ? 'active' : ''].join(' ');
    const tip = r ? `CV RMSE ${fmtY(r.cv)}｜test RMSE ${fmtY(r.rmse)}｜+ ${r.added}` : '這個方法在此 k 沒有結果';
    return `<button class="${cls}" data-k="${k}" aria-pressed="${k === S.k}" title="${esc(tip)}"${r ? '' : ' disabled'}>${k}${k === R.recK ? ' ★' : ''}</button>`;
  }).join('');
  $('kGroup').querySelectorAll('.k-btn').forEach(b => (b.onclick = () => { S.k = +b.dataset.k; update(); }));
  // metrics
  const rec = S.k === R.recK;
  $('metricsGrid').innerHTML =
    metricCard('Test RMSE', fmtY(e.rmse, true), `CV RMSE ${fmtY(e.cv)} ± ${fmtY(e.cvSd)}`, rec ? '<span class="badge-tag badge-green"><i class="fa-solid fa-award"></i> CV 建議</span>' : `<span class="badge-tag badge-blue">k = ${S.k}</span>`, rec ? 'sweet' : '') +
    metricCard('Test R²', e.r2.toFixed(4), `Train R² ${e.train_r2.toFixed(4)}`, `<span class="badge-tag badge-blue">${(e.r2 * 100).toFixed(1)}% Fit</span>`) +
    metricCard('Adjusted R²', e.adj_r2 == null ? 'N/A' : e.adj_r2.toFixed(4), '懲罰多餘的特徵') +
    metricCard('Test MAE', fmtY(e.mae, true), '平均絕對誤差') +
    metricCard('95% PI 覆蓋率', (d.coverage * 100).toFixed(1) + '%', `${C.te.length} 筆測試資料落在預測區間內的比例`, '', d.coverage < 0.9 ? 'alert' : '') +
    metricCard('F-Statistic', fmt(d.f_stat, 1), `df = (${e.k}, ${d.df})`, `<span class="badge-tag ${d.f_pvalue < 0.05 ? 'badge-green' : 'badge-amber'}">p ${pfmt(d.f_pvalue)}</span>`);
  $('featCount').textContent = e.k;
  $('chips').innerHTML = e.features.map(f => `<span class="feature-chip">${esc(f)}</span>`).join('');
  const nt = $('notice');
  if (rec) { nt.className = 'badge-tag badge-green notice'; nt.innerHTML = `<i class="fa-solid fa-star"></i> k = ${R.recK} 是 CV RMSE 在最低值（k = ${R.minK}, ${fmtY(R.cvMin)}）1% 以內、特徵最少的選擇。`; }
  else if (S.k === R.minK) { nt.className = 'badge-tag badge-blue notice'; nt.innerHTML = `<i class="fa-solid fa-circle-info"></i> CV RMSE 最低點，但只比 k = ${R.recK} 好 ${fmtY(R.evals[R.recK - 1].cv - R.cvMin)}。`; }
  else { nt.className = 'badge-tag badge-blue notice'; nt.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${S.k} 個特徵，CV RMSE 比建議的 k = ${R.recK} ${e.cv > R.evals[R.recK - 1].cv ? '高' : '低'} ${fmtY(Math.abs(e.cv - R.evals[R.recK - 1].cv))}。`; }
  renderCurves(); renderCompare(); renderEquation(); renderCoefs(); renderStd(); renderBand(); renderAvp(); renderRes(); renderTs(); renderAssumptions(); renderOutliers(); updatePred(); renderCrisp();
}
function renderCurves() {
  const C = S.ctx, R = S.res, labels = C.names.map((_, i) => String(i + 1)), pr = (r, i) => (i + 1 === S.k ? 7 : i + 1 === r.recK ? 6 : 3);
  let ds;
  if (S.cmpAll) ds = METHODS.filter(m => R[m.id]).map(m => ({ label: m.name + ' CV', data: R[m.id].evals.map(r => r && r.cv), borderColor: MCOLOR[m.id], backgroundColor: MCOLOR[m.id],
    borderWidth: m.id === S.method ? 3 : 1.5, pointRadius: R[m.id].evals.map((_, i) => (m.id === S.method ? pr(R[m.id], i) : 0)), tension: .1 }));
  else {
    const r = R[S.method], c = MCOLOR[S.method];
    ds = [{ label: 'CV RMSE', data: r.evals.map(x => x && x.cv), borderColor: c, backgroundColor: c, borderWidth: 2.5, pointRadius: r.evals.map((_, i) => pr(r, i)),
            pointBackgroundColor: r.evals.map((_, i) => (i + 1 === r.recK ? '#10b981' : c)), tension: .1 },
          { label: 'Test RMSE', data: r.evals.map(x => x && x.rmse), borderColor: '#94a3b8', borderDash: [6, 4], borderWidth: 2, pointRadius: 2, tension: .1 },
          { label: 'CV 最低 + 1%', data: labels.map(() => r.thr), borderColor: '#10b981', borderDash: [2, 3], borderWidth: 1, pointRadius: 0 }];
  }
  const o = yt => ({ interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { title: { display: true, text: 'number of features k' } }, y: { title: { display: true, text: yt } } },
    onClick: (ev, el) => { if (el.length && R[S.method].evals[el[0].index]) { S.k = el[0].index + 1; update(); } } });
  chart('rmseChart', { type: 'line', data: { labels, datasets: ds }, options: o(`RMSE (${S.meta.unit === '$' ? 'USD' : S.meta.unit === 'yr' ? 'years' : 'y units'})`) });
  const ms = S.cmpAll ? METHODS.filter(m => R[m.id]).map(m => m.id) : [S.method];
  const r2 = ms.flatMap(id => [{ label: (S.cmpAll ? METHODS.find(m => m.id === id).name + ' ' : '') + 'Test R²', data: R[id].evals.map(x => x && x.r2), borderColor: MCOLOR[id], backgroundColor: MCOLOR[id], borderWidth: 2, pointRadius: 2, tension: .1 }]
    .concat(S.cmpAll ? [] : [{ label: 'Train R²', data: R[id].evals.map(x => x && x.train_r2), borderColor: '#f59e0b', borderDash: [6, 4], borderWidth: 2, pointRadius: 2, tension: .1 }]));
  chart('r2Chart', { type: 'line', data: { labels, datasets: r2 }, options: o('R²') });
}
function renderCompare() {
  const C = S.ctx, R = S.res, all = C.evalOf([...Array(C.p).keys()]);
  const row = (name, r, id) => `<tr class="${id ? 'clickable' : ''}${id === S.method ? ' on' : ''}" ${id ? `data-m="${id}" tabindex="0"` : ''}><td><strong>${name}</strong></td><td>${r.k}</td><td>${fmtY(r.cv)}</td><td>${fmtY(r.rmse)}</td><td>${fmtY(r.mae)}</td><td>${r.r2.toFixed(4)}</td><td>${r.adj_r2 == null ? '-' : r.adj_r2.toFixed(4)}</td></tr>`;
  $('cmpBody').innerHTML = METHODS.filter(m => R[m.id]).map(m => row(m.name, R[m.id].evals[R[m.id].recK - 1], m.id)).join('') + row(`全部 ${C.p} 個特徵（OLS）`, all, null);
  $('cmpBody').querySelectorAll('tr.clickable').forEach(t => { const go = () => { S.method = t.dataset.m; S.k = S.res[S.method].recK; update(); }; t.onclick = go; t.onkeydown = ev => { if (ev.key === 'Enter') go(); }; });
}
function renderEquation() {
  const d = S.cur.d, M = S.meta, cs = d.coefficients, f = v => (Math.abs(v) >= 100 ? fmt(v, 2) : Math.abs(v) >= 0.01 ? v.toFixed(4) : v.toExponential(3));
  $('equationBox').innerHTML = `<strong>${M.logY ? `log(${esc(M.target)})` : esc(M.target)}</strong> = <span class="eq-intercept">${f(cs[0].coef)}</span> ` +
    cs.slice(1).map(c => `${c.coef >= 0 ? '<span class="eq-pos">+</span>' : '<span class="eq-neg">−</span>'} ${f(Math.abs(c.coef))} × <span class="eq-var">${esc(c.feature)}</span>`).join(' ');
}
function renderCoefs() {
  const d = S.cur.d, M = S.meta, f = v => (Math.abs(v) >= 100 ? fmt(v, 2) : Math.abs(v) >= 0.001 ? v.toFixed(4) : v.toExponential(3));
  $('coefSub').innerHTML = `OLS on training set（n = ${S.ctx.tr.length}, df = ${d.df}）。` + (M.logY ? 'log(y) 模型：β 約等於 x 增加 1 單位時 y 變化 100·β %。' : '係數是原始單位。');
  $('coefBody').innerHTML = d.coefficients.map(c => {
    const pv = c.pvalue < 0.05 ? `<span class="badge-tag badge-green">${pfmt(c.pvalue)}</span>` : `<span class="badge-tag badge-amber">${c.pvalue.toFixed(4)} (n.s.)</span>`;
    const vf = c.vif == null ? '-' : `<span class="badge-tag ${c.vif < 5 ? 'badge-green' : c.vif < 10 ? 'badge-amber' : 'badge-red'}">${c.vif.toFixed(2)}</span>`;
    return `<tr><td><strong>${esc(c.feature)}</strong></td><td class="mono">${f(c.coef)}</td><td>${f(c.stderr)}</td><td>${c.tstat.toFixed(2)}</td><td>${pv}</td>
      <td style="font-size:12px;color:var(--s600)">[${f(c.ci_lower)}, ${f(c.ci_upper)}]</td><td>${vf}</td></tr>`;
  }).join('');
}
function renderStd() {
  const cs = S.cur.d.coefficients.slice(1).slice().sort((a, b) => a.std - b.std);
  chart('stdChart', { type: 'bar', data: { labels: cs.map(c => c.feature), datasets: [{ data: cs.map(c => c.std), backgroundColor: cs.map(c => (c.std < 0 ? '#ef4444' : '#2563eb')) }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: S.meta.logY ? 'Δ log(y) per 1 SD' : 'Δ y per 1 SD' } } } } });
}
