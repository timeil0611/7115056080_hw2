// ===== 靜態部分（每次重新訓練時更新）=====
function renderStatic() {
  const M = S.meta, C = S.ctx, P = PRESETS[S.problem], best = S.res[S.method].evals[S.res[S.method].recK - 1];
  $('titleText').textContent = M.preset ? P.title : `${S.ds.label.split('/').pop()} 多元線性回歸`;
  $('crumb').textContent = M.preset ? P.crumb : '自訂資料集';
  $('heroTitle').textContent = M.preset ? (S.problem === 'who' ? '影響各國平均壽命的因素：特徵選擇 × 預測區間' : '車輛規格如何決定車價：特徵選擇 × 預測區間')
    : `預測「${M.target}」：特徵選擇 × 預測區間`;
  $('heroText').innerHTML = M.who
    ? `Kaggle WHO 資料：193 國、2000–2015 年、19 個特徵。同一國家有 16 年資料，所以<strong>按國家切分</strong>，測試集的國家完全沒在訓練出現。比較 6 種特徵選擇方法，用 GroupKFold CV 決定 k，最後以 OLS 給出係數檢定與 95% 信賴 / 預測區間。`
    : M.preset ? `Kaggle Car Price：205 台車、24 個原始特徵，類別欄 one-hot 後共 ${C.p} 個候選特徵。車價右偏，所以在 <strong>log(price)</strong> 上建模，指標與區間換回美元。同一套流程：6 種特徵選擇、CV 決定 k、OLS 推論、95% CI / PI。`
    : `${M.rows.length} 筆、${S.ds.header.length} 欄，編碼後 ${C.p} 個候選特徵。套用和內建問題相同的流程：自動判斷欄位型態 → 6 種特徵選擇 → CV 決定 k → OLS 推論與 95% CI / PI。`;
  const pills = [`<i class="fa-solid fa-database"></i> ${M.rows.length} samples · ${C.p} candidate features`,
    `<i class="fa-solid fa-scissors"></i> ${M.group ? 'Group split by ' + esc(M.group) : 'Random split'}`,
    `<i class="fa-solid fa-star" style="color:#34d399"></i> 預設：${METHODS.find(m => m.id === S.method).name}, k = ${best.k}（test RMSE ${fmtY(best.rmse)}, R² ${best.r2.toFixed(3)}）`];
  if (M.logY) pills.push('<i class="fa-solid fa-square-root-variable"></i> 目標取 log');
  $('heroTags').innerHTML = pills.map(t => `<span class="hero-pill">${t}</span>`).join('');
  $('pMax').textContent = C.p;
  $('predTitle').textContent = `Live ${M.target} Predictor`;
  $('tsCard').classList.toggle('hidden', !M.group);
  renderColumns(); renderCorr(); renderHist(); renderMethodTabs(); buildPredInputs(); renderTsSelect();
}
function renderColumns() {
  const M = S.meta, drop = new Map(M.drops.map(d => [d.name, d.why])), spec = S.ctx.spec;
  $('colBody').innerHTML = M.prof.map(c => {
    const sp = spec.find(s => s.col === c.name);
    let tag;
    if (c.name === M.target) tag = `<span class="badge-tag badge-blue">Target${M.logY ? '（log）' : ''}</span>`;
    else if (drop.has(c.name)) tag = `<span class="badge-tag badge-gray">排除：${esc(drop.get(c.name))}</span>`;
    else if (sp) tag = `<span class="badge-tag badge-green">特徵${sp.tf ? '：' + esc(sp.tf) : ''}${sp.kind === 'cat' && sp.tf === 'one-hot' ? `（${sp.names.length} 個 dummy，基準 ${esc(sp.levels[0])}）` : ''}</span>` +
      (c.missing ? ' <span class="badge-tag badge-amber">中位數補值</span>' : '');
    else tag = '<span class="badge-tag badge-gray">未使用</span>';
    const range = c.numeric ? `${fmtN(c.min)} ~ ${fmtN(c.max)}` : esc(c.levels.slice(0, 4).join(', ') + (c.levels.length > 4 ? ' …' : ''));
    return `<tr><td><strong>${esc(c.name)}</strong></td><td>${c.numeric ? 'numeric' : 'categorical'}</td>
      <td>${c.missing ? `${c.missing}（${(c.missing / M.rows.length * 100).toFixed(1)}%）` : '0'}</td><td>${c.nunique}</td><td style="font-size:12px">${range}</td><td>${tag}</td></tr>`;
  }).join('');
}
function renderCorr() {
  const C = S.ctx, cy = C.corrY(), ord = [...cy.keys()].sort((a, b) => Math.abs(cy[b]) - Math.abs(cy[a])).slice(0, 25);
  $('corrSub').textContent = `前 ${ord.length} 個特徵（依 |r| 排序）${S.meta.logY ? '，目標為 log(y)' : ''}。紅色負相關、藍色正相關。`;
  chart('corrChart', { type: 'bar', data: { labels: ord.map(j => C.names[j]), datasets: [{ data: ord.map(j => cy[j]), backgroundColor: ord.map(j => (cy[j] < 0 ? '#ef4444' : '#4f46e5')) }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: -1, max: 1, title: { display: true, text: 'Pearson r' } }, y: { ticks: { font: { size: 11 } } } } } });
}
function renderHist() {
  const M = S.meta, y = M.y, lo = Math.min(...y), hi = Math.max(...y), B = 24, w = (hi - lo) / B || 1, cnt = new Array(B).fill(0);
  y.forEach(v => cnt[Math.min(B - 1, Math.floor((v - lo) / w))]++);
  $('histSub').textContent = `n = ${y.length}，平均 ${fmtY(mean(y))}，中位數 ${fmtY(median(y))}，skewness ${M.skew.toFixed(2)}${Math.abs(M.skew) > 1 ? '（明顯偏態）' : ''}。`;
  chart('histChart', { type: 'bar', data: { labels: cnt.map((_, i) => fmtN(lo + w * (i + 0.5))), datasets: [{ data: cnt, backgroundColor: '#10b981', barPercentage: 1, categoryPercentage: 1 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: M.target } }, y: { title: { display: true, text: 'count' } } } } });
}
function renderMethodTabs() {
  $('algoTabs').innerHTML = METHODS.map(m => `<button class="tab-btn${m.id === S.method ? ' active' : ''}" data-m="${m.id}" aria-pressed="${m.id === S.method}"${S.res[m.id] ? '' : ` disabled title="特徵數 ${S.ctx.p} > ${EXH_MAX}，2^p 組合太多"`}>
    <i class="fa-solid ${m.icon}"></i> ${m.name} <span class="badge-pill">${m.badge}</span></button>`).join('');
  $('algoTabs').querySelectorAll('.tab-btn').forEach(b => (b.onclick = () => { S.method = b.dataset.m; S.k = S.res[S.method].recK; update(); }));
}
function renderTsSelect() {
  const M = S.meta; if (!M.group) return;
  const gs = [...new Set(S.ctx.te.map(i => M.rows[i][M.group]))].sort();
  const def = M.who ? 'Myanmar' : gs[0];
  $('tsGroup').innerHTML = opts(gs, gs.includes(def) ? def : gs[0]);
  $('tsTitle').textContent = `測試組時間序列（${M.group}）`;
}

// ---------- CRISP-DM ----------
const PHASES = [['bu', 'Business Understanding', 'fa-briefcase'], ['du', 'Data Understanding', 'fa-magnifying-glass-chart'], ['dp', 'Data Preparation', 'fa-broom'],
  ['mo', 'Modeling', 'fa-gears'], ['ev', 'Evaluation', 'fa-clipboard-check'], ['de', 'Deployment', 'fa-rocket']];
function renderCrisp() {
  $('crispTabs').innerHTML = PHASES.map(([id, name, ic], i) => `<button class="tab-btn${id === S.crisp ? ' active' : ''}" role="tab" aria-selected="${id === S.crisp}" data-c="${id}"><i class="fa-solid ${ic}"></i> ${i + 1}. ${name}</button>`).join('');
  $('crispTabs').querySelectorAll('.tab-btn').forEach(b => (b.onclick = () => { S.crisp = b.dataset.c; renderCrisp(); }));
  $('crispBody').innerHTML = crispHTML(S.crisp);
}
function crispHTML(ph) {
  const M = S.meta, C = S.ctx, R = S.res, cur = S.cur, d = cur.d, e = cur.e, who = M.who, car = M.preset && S.problem === 'car';
  const mname = id => METHODS.find(m => m.id === id).name;
  const miss = M.prof.filter(c => c.missing).sort((a, b) => b.missing - a.missing);
  const missTxt = miss.length ? miss.slice(0, 4).map(c => `${esc(c.name)} ${(c.missing / M.rows.length * 100).toFixed(1)}%`).join('、') : '沒有缺值';
  const kv = items => `<div class="kv">${items.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>`;
  if (ph === 'bu') {
    if (who) return `<h4>問題</h4>給定一個國家某一年的健康、疫苗、經濟、教育指標，預測該國平均壽命，並找出影響最大的因素。
      <h4>使用情境</h4>公衛或政策單位想知道「疫苗接種率提高 10%」或「受教年數多一年」大約對應多少壽命差距，需要可以解釋的模型，所以用多元線性回歸而不是黑盒模型。
      <h4>成功標準</h4><ul><li>對訓練時沒看過的國家，test RMSE &lt; 4.5 歲（約目標標準差 9.5 歲的一半）、R² &gt; 0.80。</li><li>係數方向合理（HIV、成人死亡率為負）。</li><li>提供 95% 預測區間，實際覆蓋率接近 95%。</li></ul>`;
    if (car) return `<h4>問題</h4>用車輛規格（引擎、車身尺寸、油耗、驅動方式等）預測美國市場的車價。
      <h4>使用情境</h4>假設一家車廠要進入美國市場，想知道哪些規格真正影響定價、影響多大，用來替新車型設定合理的價格區間。需要看得懂每個係數，所以用線性回歸。
      <h4>成功標準</h4><ul><li>test R² &gt; 0.85，RMSE 明顯低於車價標準差（約 $8,000）。</li><li>給出 95% 預測區間，實際覆蓋率接近 95%。</li></ul>`;
    return `<h4>問題</h4>用其他欄位預測「${esc(M.target)}」（連續數值），並找出影響最大的特徵。
      <h4>做法</h4>自動判斷欄位型態、排除 ID 與高基數欄位、類別欄 one-hot，然後套用和內建問題相同的特徵選擇、評估與區間計算。
      <h4>評估方式</h4>以 test RMSE、R²、95% 預測區間覆蓋率衡量；k 只用訓練集的 CV 決定。`;
  }
  if (ph === 'du') {
    const nNum = M.prof.filter(c => c.numeric).length, cy = C.corrY(), top = [...cy.keys()].sort((a, b) => Math.abs(cy[b]) - Math.abs(cy[a])).slice(0, 4);
    return kv([[M.rows.length, '筆資料（target 有值）'], [S.ds.header.length, `欄（${nNum} 數值 / ${S.ds.header.length - nNum} 類別）`], [C.p, '編碼後候選特徵'],
      [`${fmtY(mean(M.y))}`, `${esc(M.target)} 平均（sd ${fmtY(M.sdY)}）`], [M.skew.toFixed(2), 'target skewness']]) +
      `<h4>觀察</h4><ul><li>缺值最多：${missTxt}。</li><li>和目標最相關（訓練集）：${top.map(j => `${esc(C.names[j])}（${cy[j] >= 0 ? '+' : ''}${cy[j].toFixed(2)}）`).join('、')}。</li>` +
      (Math.abs(M.skew) > 1 ? `<li>目標偏態 ${M.skew.toFixed(2)}，${M.logY ? '已改在 log(y) 上建模' : '可以考慮勾選 log(y)'}。</li>` : '') +
      (who ? `<li>同一國家有 16 年資料且高度相關，隨機切分會讓測試集「看過」這個國家，所以按國家切分。</li>
        <li>共線性：infant deaths 與 under-five deaths 相關 0.997、兩個 thinness 欄位 0.94。</li>
        <li>Income composition 有 130 筆、Schooling 有 28 筆是 0，不合理，視為缺值；infant deaths、Measles 名義上是每千人卻超過 1000，GDP、Population 嚴重右偏。</li>` : '') +
      (car ? `<li>CarName 有 147 種，幾乎每台車都不同，不適合直接當特徵。</li><li>enginesize、curbweight、horsepower、carwidth 彼此高度相關；fueltype = diesel 和 fuelsystem = idi 是同一批車（完全共線）。</li>` : '') +
      `</ul>完整欄位清單在下方「欄位總覽」。`;
  }
  if (ph === 'dp') {
    const tf = C.spec.filter(s => s.tf && s.tf !== 'one-hot').map(s => `${esc(s.col)}（${esc(s.tf)}）`);
    const oh = C.spec.filter(s => s.tf === 'one-hot');
    return `<ol>${M.nDropped ? `<li>刪除 target 缺值 ${M.nDropped} 筆。</li>` : ''}
      ${M.drops.length ? `<li>排除欄位：${M.drops.map(x => `${esc(x.name)}（${esc(x.why)}）`).join('、')}。</li>` : ''}
      ${tf.length ? `<li>轉換：${tf.join('、')}。</li>` : ''}
      ${oh.length ? `<li>類別欄 one-hot（drop first）：${oh.map(s => `${esc(s.col)} → ${s.names.length} 個 dummy`).join('、')}。</li>` : ''}
      ${M.logY ? '<li>目標取自然對數 log(y)，預測再用 exp 換回原始單位。</li>' : ''}
      <li>切分：${M.splitNote}。train ${C.tr.length} 筆 / test ${C.te.length} 筆。</li>
      <li>缺值用<strong>訓練集</strong>中位數補，標準化也只用訓練集的平均與標準差，避免資料洩漏。</li></ol>
      候選特徵共 ${C.p} 個。` + (who ? '<div class="note">這些步驟和 notebook（7115056080_hw2.ipynb）一模一樣，所以預設設定下網頁算出的係數、RMSE、預測區間都和 notebook 相同。</div>' : '');
  }
  if (ph === 'mo') {
    const rows = METHODS.filter(m => R[m.id]).map(m => { const r = R[m.id].evals[R[m.id].recK - 1]; return `<tr><td>${m.name}</td><td>${r.k}</td><td>${fmtY(r.cv)}</td></tr>`; }).join('');
    return `<h4>特徵選擇（全部只用訓練集）</h4><ul>${METHODS.map(m => `<li><strong>${m.name}</strong>：${m.desc}${R[m.id] ? '' : '（特徵太多，停用）'}</li>`).join('')}</ul>
      <h4>決定 k</h4>每個方法對 k = 1…${C.p} 算 ${M.group ? 'GroupKFold' : 'KFold'}(${M.K}) CV RMSE，取「CV RMSE 在最低值 1% 以內、特徵最少」的 k。不直接取最低點，是因為曲線後段很平，多加特徵只換到很小的改善。
      ${R.vifDropped.length ? `<h4>VIF 刪除順序</h4>${R.vifDropped.map(x => `${esc(x.name)}（${x.vif.toFixed(1)}）`).join(' → ')}` : ''}
      <h4>各方法建議的 k</h4><table class="data-table" style="max-width:480px"><thead><tr><th>方法</th><th>k</th><th>CV RMSE</th></tr></thead><tbody>${rows}</tbody></table>
      <h4>目前顯示</h4>${mname(S.method)}，k = ${e.k}：${e.features.map(esc).join('、')}。模型是 OLS${M.logY ? '（在 log y 上）' : ''}，訓練 R² = ${d.train_r2.toFixed(4)}${M.logY ? '（log 尺度）' : ''}，F = ${fmt(d.f_stat, 1)}（p ${pfmt(d.f_pvalue)}）。`;
  }
  if (ph === 'ev') {
    const all = C.evalOf([...Array(C.p).keys()]);
    return kv([[fmtY(e.rmse), 'Test RMSE'], [fmtY(e.mae), 'Test MAE'], [e.r2.toFixed(4), 'Test R²'], [e.adj_r2 == null ? '-' : e.adj_r2.toFixed(4), 'Adjusted R²'],
      [fmtY(e.cv), 'CV RMSE'], [(d.coverage * 100).toFixed(1) + '%', '95% PI 覆蓋率']]) +
      `<h4>解讀</h4><ul><li>模型在測試集解釋了 ${(e.r2 * 100).toFixed(1)}% 的變異；全部 ${C.p} 個特徵的 OLS 是 RMSE ${fmtY(all.rmse)} / R² ${all.r2.toFixed(4)}，目前模型用 ${e.k} 個特徵${e.rmse <= all.rmse ? '反而更好' : `只差 ${fmtY(e.rmse - all.rmse)}`}。</li>
      <li>95% PI 實際蓋到 ${(d.coverage * 100).toFixed(1)}% 的測試點，${d.coverage >= 0.93 ? '和名目值接近。' : '低於 95%，區間偏窄。'}</li>
      <li>Breusch-Pagan p ${pfmt(d.bp_p)}${d.bp_p < 0.05 ? '，有異質變異' : '，沒有明顯異質變異'}；Durbin-Watson ${d.dw.toFixed(2)}${d.dw < 1.5 ? '，殘差正相關' : ''}；最大 VIF ${d.maxVif.toFixed(2)}。</li></ul>` +
      (who ? `<div class="note">DW 低是因為同一國家的殘差相關，OLS 標準誤會低估。notebook 用以國家為群的 cluster-robust 標準誤重算，標準誤約變成 3 倍，但 7 個特徵仍全部顯著。PI 覆蓋率偏低主要來自低壽命國家殘差較大（異質變異）。另外，若改用隨機切分，Random Forest R² 會到 0.96，但按國家切分只有 0.905，網路上常見的高分有一部分來自資料洩漏。</div>` : '') +
      (car ? `<div class="note">不取 log 時同樣的 Forward 模型殘差右偏（JB 43.5）、異質變異明顯（BP p ≈ 0.0003），PI 覆蓋率只有 85%；取 log(price) 後 BP、JB 都不顯著，高價車的區間也變得比較合理（上寬下窄）。可以取消勾選 log(y) 比較。</div>` : '');
  }
  return `<h4>部署方式</h4>這個網頁本身就是部署成果：放在 GitHub Pages，所有回歸、特徵選擇、CV 與區間計算都在瀏覽器以 JavaScript 完成，不需要伺服器。
    <ul><li>下方 <strong>Live Predictor</strong>：輸入一筆新資料（原始單位），立刻得到預測值與 95% 預測區間；可以帶入測試樣本比較實際值。</li>
    <li>上方可以輸入任意 CSV 網址或上傳檔案，換資料集也能跑同一套流程。</li>
    ${who ? '<li>notebook 另外把最終模型存成 <code>model/life_expectancy_ols.joblib</code>，提供 <code>predict_life_expectancy()</code>，結果和這裡一致。</li>' : ''}</ul>
    <h4>注意事項</h4>${who ? '模型用 2000–2015 年資料訓練，對之後的年份或極端事件（戰爭、疫情）可能不準，建議每年用新資料重新訓練並重新檢查覆蓋率。'
      : car ? '資料是 1980 年代車款，直接套用到現在的車價需要重新蒐集資料；CarName 沒有放進模型，品牌溢價沒有被考慮。'
      : '模型只在訓練資料的範圍內可靠，輸入超出範圍的值時預測區間會變寬，結果也比較不可信。'}`;
}
