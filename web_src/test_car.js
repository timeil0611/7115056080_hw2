const C = require(__dirname + '/core.js'), fs = require('fs');
const { header, data } = C.parseCSV(fs.readFileSync(__dirname + '/../data/CarPrice.csv', 'utf8'));
const prof = C.profile(header, data), target = 'price';
const drops = C.autoDrop(prof, data.length, target); console.log('drops', drops);
const rows = data.filter(r => r[target] !== ''), y = rows.map(r => +r[target]);
const spec = C.genericSpec(C.profile(header, rows), target, drops.map(d => d.name));
const sp = C.randomSplit(rows.length, 0.2, 42), foldOf = C.kfoldOf(sp.train.length, 5, 42);
let t0 = Date.now();
const ctx = C.makeContext({ rows, y, spec, train: sp.train, test: sp.test, foldOf, K: 5, labels: rows.map(r => r.CarName), logY: process.argv[2]==='log' });
const res = C.runMethods(ctx);
console.log('time', Date.now() - t0, 'p', ctx.p, 'train', sp.train.length, 'test', sp.test.length);
console.log('vif dropped', res.vifDropped.length, res.vifDropped.map(d => d.name).join('|'));
for (const m of C.METHODS) { const r = res[m.id]; if (!r) { console.log(m.id, 'n/a'); continue; }
  const e = r.evals[r.recK - 1]; console.log(m.id.padEnd(6), 'recK', r.recK, 'cv', e.cv.toFixed(1), 'test', e.rmse.toFixed(1), 'R2', e.r2.toFixed(4), e.features.join('|')); }
const r = res[process.argv[3]||'vif'].evals[res[process.argv[3]||'vif'].recK - 1], d = ctx.detailOf(r.cols);
d.coefficients.forEach(c => console.log(c.feature.padEnd(24), c.coef.toFixed(4), c.stderr.toFixed(4), c.pvalue.toExponential(3), c.vif && c.vif.toFixed(2)));
console.log('F', d.f_stat.toFixed(3), 'cover', d.coverage.toFixed(4), 'DW', d.dw.toFixed(4), 'BP', d.bp.toFixed(4), d.bp_p, 'JB', d.jb.toFixed(3), 'r2tr', d.train_r2.toFixed(4));
console.log('row0', d.tests[0]);
const allE = ctx.evalOf([...Array(ctx.p).keys()]); console.log('all', allE.rmse.toFixed(1), allE.r2.toFixed(4), allE.cv.toFixed(1));
if (process.env.DUMP) fs.writeFileSync(__dirname + '/car_check.json', JSON.stringify({ train: sp.train, test: sp.test, foldOf, feats: r.features, names: ctx.names, cv: r.cv, rmse: r.rmse,
  coef: d.coefficients.map(c => c.coef), se: d.coefficients.map(c => c.stderr), F: d.f_stat, bp: d.bp, jb: d.jb, dw: d.dw, row0: d.tests[0], cover: d.coverage }));
