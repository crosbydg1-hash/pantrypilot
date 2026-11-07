"""Creates AI food photos for PantryPilot recipes that don't have one yet.

Uses Pollinations (https://pollinations.ai) with the FLUX.1 schnell model (Apache 2.0 license, fine
for commercial use). The API key is read from ~/.config/pollinations/agent-key and is never printed.

usage (from the pantrypilot folder):
  python3 tools/generate_photos.py --limit 1          # try one photo first
  python3 tools/generate_photos.py                     # every recipe still missing a photo
  python3 tools/generate_photos.py --only r-lemonade   # (re)make one photo
  python3 tools/generate_photos.py --list              # show which recipes still need photos

Safe to stop and restart: each finished photo is saved straight away.
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / 'recipes.js'
IMG = ROOT / 'img'
KEY_FILE = Path.home() / '.config/pollinations/agent-key'
MODEL = 'flux'  # black-forest-labs/flux.1-schnell
ARRAYS = ['window.PP_RECIPES = ', 'window.PP_BIRTHDAY = ']

SCENE = {
    'breakfast': 'served on a ceramic plate on a rustic wooden breakfast table, morning window light',
    'lunch': 'served in a ceramic bowl or plate on a light wooden table, bright natural daylight',
    'dinner': 'plated on a stoneware dish on a rustic wooden dinner table with a linen napkin, warm natural light',
    'appetizer': 'arranged on a serving board for a party, on a wooden table, soft natural light',
    'dip': 'in a ceramic serving bowl with things to dip around it, on a wooden table, soft natural light',
    'dessert': 'on a ceramic plate on a marble or wooden table, soft natural window light',
    'drink': 'in a glass on a wooden table, condensation and garnish, soft natural window light',
}

def load():
    src = RECIPES.read_text()
    spans = []
    for marker in ARRAYS:
        a = src.index(marker) + len(marker)
        b = src.index('];', a) + 1
        spans.append((a, b, json.loads(src[a:b])))
    return src, spans

def save(src, spans):
    out, last = [], 0
    for a, b, data in spans:
        out.append(src[last:a]); out.append(json.dumps(data, ensure_ascii=False, indent=1)); last = b
    out.append(src[last:])
    RECIPES.write_text(''.join(out))

def prompt_for(r):
    scene = SCENE.get(r['category'], SCENE['dinner'])
    return (f"Professional food photograph of {r['title']}: {r['description']} "
            f"The dish is {scene}. Shot at a 45 degree angle, shallow depth of field, "
            f"appetizing, realistic, high detail, editorial cookbook style. No text, no people, no hands, no logos.")

def fetch(prompt, seed, key):
    q = urllib.parse.urlencode({'model': MODEL, 'width': 1024, 'height': 768, 'seed': seed, 'nologo': 'true', 'enhance': 'false', 'safe': 'true'})
    url = 'https://gen.pollinations.ai/image/' + urllib.parse.quote(prompt, safe='') + '?' + q
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + key, 'User-Agent': 'PantryPilot photo tool'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                kind = res.headers.get('Content-Type', '')
                body = res.read()
                if not kind.startswith('image/'):
                    raise RuntimeError(f'expected an image, got {kind}: {body[:200]!r}')
                return body
        except urllib.error.HTTPError as e:
            detail = e.read()[:300]
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                wait = int(e.headers.get('Retry-After') or 10 * (attempt + 1))
                print(f'    busy ({e.code}), retrying in {wait}s'); time.sleep(wait); continue
            raise RuntimeError(f'HTTP {e.code}: {detail!r}')
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3:
                print(f'    network problem ({e}), retrying'); time.sleep(10); continue
            raise

def to_jpeg(raw, out_path):
    with tempfile.NamedTemporaryFile(suffix='.img', delete=False) as tmp:
        tmp.write(raw); tmp_path = tmp.name
    try:
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', '-Z', '880', tmp_path, '--out', str(out_path)],
                       check=True, capture_output=True)
    finally:
        os.unlink(tmp_path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--retry', type=int, default=0, help='try a different variation (1, 2, 3...)')
    ap.add_argument('--hint', default='', help='extra description, e.g. "in a baking dish with golden mashed potato on top"')
    args = ap.parse_args()

    src, spans = load()
    todo = [r for _, _, data in spans for r in data
            if (args.only and r['id'] == args.only) or (not args.only and not r.get('image'))]
    if args.list:
        for r in todo: print(r['id'], '-', r['title'])
        print(len(todo), 'recipes need photos'); return
    if not todo: print('Every recipe already has a photo.'); return
    if not KEY_FILE.exists(): sys.exit(f'No Pollinations key found at {KEY_FILE}. Sign in first (see SETUP.md).')
    key = KEY_FILE.read_text().strip()
    if args.limit: todo = todo[:args.limit]

    IMG.mkdir(exist_ok=True)
    done = failed = 0
    for n, r in enumerate(todo, 1):
        seed = int(hashlib.sha1(r['id'].encode()).hexdigest()[:6], 16) + args.retry
        print(f'[{n}/{len(todo)}] {r["title"]}', flush=True)
        try:
            prompt = prompt_for(r) + (f' {args.hint}.' if args.hint else '')
            raw = fetch(prompt, seed, key)
            out = IMG / f"{r['id']}.jpg"
            to_jpeg(raw, out)
            src, spans = load()  # re-read so a stop/restart never loses earlier work
            for _, _, data in spans:
                for x in data:
                    if x['id'] == r['id']: x['image'] = f"img/{r['id']}.jpg"
            save(src, spans)
            done += 1
            print(f'    saved img/{out.name} ({out.stat().st_size // 1024} KB)', flush=True)
        except Exception as e:  # keep going; failed recipes keep their illustration
            failed += 1
            print(f'    FAILED: {e}', flush=True)
        time.sleep(1)
    print(f'Done: {done} photos made, {failed} failed.')

if __name__ == '__main__':
    main()
