"""Assemble the single-file index.html.
python3 web_src/build.py index.html [--inline]
--inline 需要先下載 chart.umd.min.js 到 web_src/（離線預覽用）"""
import json, sys, pathlib
H = pathlib.Path(__file__).parent
out, inline = sys.argv[1], '--inline' in sys.argv
css = (H / 'base.css').read_text(encoding='utf8') + (H / 'extra.css').read_text(encoding='utf8')   # base.css 沿用 DIC2 的版面
data = ('const DATA_CSV = ' + json.dumps({'who': (H.parent / 'data' / 'Life Expectancy Data.csv').read_text(encoding='utf8'), 'car': (H.parent / 'data' / 'CarPrice.csv').read_text(encoding='utf8')}, ensure_ascii=False) + ';\n'
        'const WHO_SPLIT = ' + (H / 'who_split.json').read_text(encoding='utf8') + ';')
core = (H / 'core.js').read_text(encoding='utf8')
app = '\n'.join((H / f'app{i}.js').read_text(encoding='utf8') for i in range(1, 5))
chartjs = ('<script>' + (H / 'chart.umd.min.js').read_text(encoding='utf8') + '</script>') if inline else \
          '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'
html = (H / 'template.html').read_text(encoding='utf8')
for k, v in {'/*__CSS__*/': css, '/*__CHARTJS__*/': chartjs, '/*__DATA__*/': data.replace('</', '<\\/'), '/*__CORE__*/': core, '/*__APP__*/': app}.items():
    assert html.count(k) == 1, k
    html = html.replace(k, v)
pathlib.Path(out).write_text(html, encoding='utf8')
print(out, len(html.encode()) // 1024, 'KB')
