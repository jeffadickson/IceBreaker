from pathlib import Path
import re, sys, json
root=Path(__file__).resolve().parents[1]; site=root/'docs/site'; errors=[]
pages=list(site.glob('*.html'))
if len(pages)<15:errors.append('Fewer manual pages than expected')
for page in pages:
 data=page.read_text()
 for target in re.findall(r'href="([^"]+)"',data):
  if target.startswith(('https:','http:','#','mailto:')):continue
  if not (page.parent/target.split('#')[0]).exists():errors.append(f'{page.name}: missing link {target}')
 for filename in re.findall(r'(?:src|href)="([a-zA-Z0-9_-]+\.(?:js|css))"',data):
  if not (page.parent/filename).exists():errors.append(f'{page.name}: missing asset {filename}')
 try:
  assert '<main ' in data and '<title>' in data
 except AssertionError: errors.append(f'{page.name}: missing main/title')
try:json.loads((site/'search-index.json').read_text())
except Exception as e:errors.append('invalid search index: '+str(e))
for e in errors:print('FAIL',e)
print(f'checked {len(pages)} HTML pages: {len(errors)} error(s)')
sys.exit(1 if errors else 0)
