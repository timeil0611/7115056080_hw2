"""One-page infographic for Problem 1 (numbers from the executed notebook)."""
import sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import FancyBboxPatch

fm.fontManager.addfont('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
fm.fontManager.addfont('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')
plt.rcParams['font.family'] = 'Noto Sans CJK JP'   # TTC 的第一個字面名稱是 JP，同樣包含繁中字形
NAVY, IND, GRN, RED, GRAY = '#1e1b4b', '#4f46e5', '#10b981', '#dc2626', '#64748b'

fig = plt.figure(figsize=(12, 15), dpi=110, facecolor='white')
def box(x, y, w, h, fc='#f8fafc', ec='#e2e8f0'):
    fig.patches.append(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.004,rounding_size=0.012', transform=fig.transFigure, fc=fc, ec=ec, lw=1))
T = lambda x, y, s, **k: fig.text(x, y, s, **k)

# header
box(0.03, 0.885, 0.94, 0.1, fc=NAVY, ec=NAVY)
T(0.06, 0.95, 'WHO 各國平均壽命：多元線性回歸', fontsize=26, weight='bold', color='white')
T(0.06, 0.912, '193 國 · 2000–2015 · 2,938 筆 · 19 個特徵　｜　CRISP-DM　｜　學號 7115056080', fontsize=13, color='#c7d2fe')

# KPI cards
kpi = [('4.10 歲', 'Test RMSE'), ('0.820', 'Test R²'), ('7 / 19', '選入特徵'), ('90.7%', '95% PI 覆蓋率')]
for i, (v, l) in enumerate(kpi):
    x = 0.03 + i * 0.237
    box(x, 0.78, 0.225, 0.085)
    T(x + 0.1125, 0.825, v, fontsize=24, weight='bold', color=IND, ha='center')
    T(x + 0.1125, 0.795, l, fontsize=12, color=GRAY, ha='center')

# pipeline
T(0.03, 0.75, '流程', fontsize=16, weight='bold', color=NAVY)
steps = ['Business\n可解釋的壽命模型', 'Data\n缺值 · 共線 · 0 值', 'Preparation\nlog1p · 按國家切分', 'Modeling\nVIF + Forward CV', 'Evaluation\nRMSE · CI / PI', 'Deployment\nnotebook + 網頁']
for i, s in enumerate(steps):
    x = 0.03 + i * 0.158
    box(x, 0.655, 0.145, 0.075, fc='#eef2ff', ec='#c7d2fe')
    a, b = s.split('\n')
    T(x + 0.0725, 0.703, a, fontsize=12, weight='bold', color=NAVY, ha='center')
    T(x + 0.0725, 0.675, b, fontsize=10, color=GRAY, ha='center')
    if i < 5: T(x + 0.1505, 0.688, '›', fontsize=18, color=IND, ha='center', va='center')

# coefficients (standardized effect, years per 1 SD)  — from notebook / web page
ax = fig.add_axes([0.24, 0.34, 0.33, 0.27])
feat = ['log_HIV/AIDS', 'Adult Mortality', 'log_infant deaths', 'Polio', 'Diphtheria', 'Schooling', 'Income composition']
eff = [-2.6774, -2.0939, -0.886, 0.4889, 0.6385, 1.273, 3.0003]   # 標準化係數（訓練集，和網頁 / notebook 相同）
o = sorted(range(7), key=lambda i: eff[i])
ax.barh([feat[i] for i in o], [eff[i] for i in o], color=[RED if eff[i] < 0 else IND for i in o])
ax.axvline(0, color='#334155', lw=.8); ax.set_xlabel('每增加 1 個標準差，壽命變化（歲）')
ax.spines[['top', 'right']].set_visible(False); ax.tick_params(labelsize=10)
T(0.03, 0.625, '哪些因素影響最大？', fontsize=16, weight='bold', color=NAVY)

# split comparison
ax2 = fig.add_axes([0.66, 0.34, 0.31, 0.27])
lab = ['OLS\n隨機切', 'RF\n隨機切', 'OLS\n按國家切', 'RF\n按國家切']
r2 = [0.845, 0.961, 0.838, 0.905]
ax2.bar(lab, r2, color=['#a5b4fc', '#a5b4fc', IND, IND])
for i, v in enumerate(r2): ax2.text(i, v + 0.004, f'{v:.3f}', ha='center', fontsize=11)
ax2.set_ylim(0.8, 0.98); ax2.set_ylabel('Test R²'); ax2.spines[['top', 'right']].set_visible(False); ax2.tick_params(labelsize=10)
T(0.62, 0.625, '網路常見做法 vs 本作業', fontsize=16, weight='bold', color=NAVY)

# findings
box(0.03, 0.04, 0.94, 0.26)
T(0.06, 0.27, '重點發現', fontsize=16, weight='bold', color=NAVY)
pts = ['按國家切分：測試的 37 國完全沒在訓練出現，避免同一國家多年資料造成的洩漏。',
       '隨機切分時 Random Forest R² 0.961，按國家切分降到 0.905；網路上的高分有一部分來自洩漏。',
       '7 個特徵的 OLS 只比 19 個特徵多 0.22 歲 RMSE，但 VIF 全部 < 10，係數可以解釋。',
       '殘差有異質變異、同國家殘差相關（DW 0.61）→ 用 cluster-robust SE 重算，7 個特徵仍全部顯著。',
       '95% PI 實際覆蓋 90.7%，低壽命國家誤差較大；改進方向：混合效果模型、conformal prediction。']
for i, s in enumerate(pts):
    T(0.06, 0.225 - i * 0.04, '●', fontsize=10, color=GRN)
    T(0.08, 0.225 - i * 0.04, s, fontsize=12.5, color='#1e293b')
T(0.97, 0.015, '資料：Kaggle Life Expectancy (WHO) by KumarRajarshi', fontsize=9, color=GRAY, ha='right')
fig.savefig(sys.argv[1], facecolor='white')
print('saved', sys.argv[1])
