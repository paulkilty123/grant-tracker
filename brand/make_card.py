#!/usr/bin/env python3
"""Render a LinkedIn fund card from _card.html.

  python3 brand/make_card.py cards/wembley.json

The JSON carries kicker, headline (with optional <span class="hl">), sub,
catches (list of strings), deadline, out (png path). Renders with headless
Chrome at 1200x1200.
"""
import json, sys, subprocess, pathlib, html, tempfile, os
here = pathlib.Path(__file__).parent
spec = json.loads(pathlib.Path(sys.argv[1]).read_text())
tpl = (here / '_card.html').read_text()
catches = ''.join(f'<li>{html.escape(c)}</li>' for c in spec['catches'])
page = (tpl.replace('{{KICKER}}', html.escape(spec['kicker']))
           .replace('{{HEADLINE}}', spec['headline'])
           .replace('{{SUB}}', html.escape(spec['sub']))
           .replace('{{CATCHES}}', catches)
           .replace('{{DEADLINE}}', html.escape(spec['deadline'])))
with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, dir=here) as f:
    f.write(page); tmp = f.name
out = here / spec['out']
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
subprocess.run([chrome, '--headless=new', '--hide-scrollbars', '--window-size=1200,1200',
                '--virtual-time-budget=4000', f'--screenshot={out}', f'file://{tmp}'],
               check=True, capture_output=True)
os.unlink(tmp)
print('wrote', out)
