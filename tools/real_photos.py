"""Swaps AI-made recipe photos for real photos from Openverse (openverse.org), a free search of openly licensed
photos (mostly Flickr and Wikimedia Commons). Only CC0, public-domain and CC BY photos are used, which allow
commercial use; CC BY needs a credit, which the app shows on the recipe page. No API key needed.

usage (from the pantrypilot folder):
  python3 tools/real_photos.py search            # find up to 4 candidates per recipe -> dist/review/index.html
  python3 tools/real_photos.py apply choices.json # use the chosen candidates: {"recipe-id": 2, "other-id": null, ...}

Only recipes whose photo was AI-made are searched (the 26 original photos are left alone).
Chosen photos replace img/<id>.jpg and the recipe gets a photo_credit (photographer name and links).
"""
import json, re, subprocess, sys, tempfile, os, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / 'recipes.js'
REVIEW = ROOT / 'dist' / 'review'
KEY_FILE = Path.home() / '.config/pexels/api-key'
ARRAYS = ['window.PP_RECIPES = ', 'window.PP_BIRTHDAY = ']
FILLER = r'\b(classic|easy|weeknight|homemade|from-scratch|make-ahead|fresh|creamy|crispy|chewy|soft|rich|smooth|hearty|cheesy|chunky|spicy|smoky|simple|quick|herb butter|brown sugar dijon|with .*)$|\b(classic|easy|weeknight|homemade|from-scratch|make-ahead|fresh|creamy|crispy|chewy|soft|rich|smooth|hearty|cheesy|chunky|smoky)\b'

def load():
    src = RECIPES.read_text(); spans = []
    for m in ARRAYS:
        a = src.index(m) + len(m); b = src.index('];', a) + 1
        spans.append((a, b, json.loads(src[a:b])))
    return src, spans

def save(src, spans):
    out, last = [], 0
    for a, b, data in spans:
        out.append(src[last:a]); out.append(json.dumps(data, ensure_ascii=False, indent=1)); last = b
    out.append(src[last:]); RECIPES.write_text(''.join(out))

def is_ai(r):  # original Base44 photos have 24-character hex ids
    return not re.fullmatch(r'[0-9a-f]{24}', r['id'])

def query(r):
    q = re.sub(FILLER, '', r['title'].lower()).replace('&', 'and')
    q = re.sub(r'\s+', ' ', q).strip(' -')
    return q or r['title'].lower()

def api(url, key=None):
    req = urllib.request.Request(url, headers={'User-Agent': 'PantryPilot recipe app (photo search)'})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)

def download(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': 'PantryPilot photo tool'})
    with urllib.request.urlopen(req, timeout=60) as res:
        dest.write_bytes(res.read())

def search(key):
    _, spans = load()
    targets = [r for _, _, d in spans for r in d if is_ai(r)]
    REVIEW.mkdir(parents=True, exist_ok=True)
    found = {}
    def find(q):
        return api('https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({'q': q, 'license': 'cc0,by,pdm', 'aspect_ratio': 'wide',
                                                                                   'size': 'large', 'page_size': 6, 'mature': 'false'})).get('results', [])
    def fetch_thumb(p, dest):
        try: download(p['thumbnail'], dest); return
        except Exception: pass
        # The thumbnail service sometimes fails; take the original and shrink it here.
        with tempfile.NamedTemporaryFile(suffix='.img', delete=False) as tmp: tmp_path = Path(tmp.name)
        try:
            download(p['url'], tmp_path)
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-Z', '480', str(tmp_path), '--out', str(dest)], check=True, capture_output=True)
        finally:
            os.unlink(tmp_path)
    for n, r in enumerate(targets, 1):
        q = query(r)
        try:
            results = find(q)
            words = q.split()
            while len(results) < 2 and len(words) > 1:  # long names often have no matches; try the main dish words
                words = words[1:]; q = ' '.join(words); time.sleep(1); results = find(q)
        except Exception as e:
            print(f'[{n}/{len(targets)}] {r["title"]}: search failed ({e})'); continue
        cands = []
        for k, p in enumerate(results):
            if len(cands) >= 4: break
            thumb = REVIEW / f"{r['id']}-{k}.jpg"
            try: fetch_thumb(p, thumb)
            except Exception: continue
            lic = 'Public domain' if p['license'] in ('cc0', 'pdm') else f"CC {p['license'].upper()} {p.get('license_version') or ''}".strip()
            cands.append({'n': k, 'id': p['id'], 'page': p.get('foreign_landing_url') or p.get('url'), 'photographer': p.get('creator') or 'Unknown',
                          'photographer_url': p.get('creator_url') or p.get('foreign_landing_url'), 'large': p['url'], 'alt': p.get('title') or '',
                          'license': lic, 'license_url': p.get('license_url'), 'site': p.get('source', '')})
        found[r['id']] = {'title': r['title'], 'query': q, 'candidates': cands}
        print(f'[{n}/{len(targets)}] {r["title"]} ("{q}"): {len(cands)} candidates', flush=True)
        time.sleep(1.2)  # stay well under Openverse's anonymous rate limit
    (REVIEW / 'candidates.json').write_text(json.dumps(found, indent=1))
    rows = ''.join(f'''<section><h3>{i + 1}. {v["title"]} <small>{rid} · "{v["query"]}"</small></h3><div>{''.join(
        f'<figure><img src="{rid}-{c["n"]}.jpg"><figcaption>#{c["n"]} {(c["alt"] or "")[:60]}</figcaption></figure>' for c in v["candidates"]) or "<p>No results</p>"}</div></section>'''
        for i, (rid, v) in enumerate(found.items()))
    (REVIEW / 'index.html').write_text(f'''<!doctype html><meta charset="utf-8"><title>Photo review</title>
<style>body{{font:12px sans-serif;margin:8px}}section{{margin:0 0 10px}}h3{{margin:4px 0;font-size:13px}}small{{color:#888;font-weight:400}}
section>div{{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}}img{{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}}figure{{margin:0}}figcaption{{font-size:10px;color:#555;height:2.4em;overflow:hidden}}</style>{rows}''')
    print(f'Review sheet: {REVIEW / "index.html"}')

def apply(choices_path):
    choices = json.loads(Path(choices_path).read_text())
    found = json.loads((REVIEW / 'candidates.json').read_text())
    done = 0
    for rid, n in choices.items():
        if n is None or rid not in found: continue
        c = next((x for x in found[rid]['candidates'] if x['n'] == n), None)
        if not c: print('no candidate', rid, n); continue
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp: tmp_path = Path(tmp.name)
        try:
            download(c['large'], tmp_path)
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', '-Z', '880', str(tmp_path), '--out', str(ROOT / 'img' / f'{rid}.jpg')], check=True, capture_output=True)
        finally:
            os.unlink(tmp_path)
        src, spans = load()
        for _, _, d in spans:
            for r in d:
                if r['id'] == rid:
                    r['image'] = f'img/{rid}.jpg'
                    r['photo_credit'] = {'name': c['photographer'], 'url': c['photographer_url'], 'page': c['page'], 'license': c['license'],
                                         'license_url': c['license_url'], 'source': c['site']}
        save(src, spans)
        done += 1
        print(f'{found[rid]["title"]}: photo by {c["photographer"]} ({c["license"]})', flush=True)
    print(f'Done: {done} real photos applied.')

if __name__ == '__main__':
    key = None
    if len(sys.argv) > 1 and sys.argv[1] == 'search': search(key)
    elif len(sys.argv) > 2 and sys.argv[1] == 'apply': apply(sys.argv[2])
    else: print(__doc__)
