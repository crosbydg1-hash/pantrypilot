"""Makes a Pinterest pin (1000x1500) for each recipe, plus pinterest-bulk.csv for Pinterest's bulk upload.

usage: python3 marketing/make_pins.py [how many, default 40]
Pins are saved in marketing/pins/. deploy.sh publishes them at <site>/pins/, which is what the CSV points to,
so publish the site before uploading the CSV to Pinterest (Pinterest -> Create -> Create Pin -> Bulk create)."""
import csv, json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_ads import page, brand, shoot, HERE

ROOT = HERE.parent
SITE = 'https://crosbydg1-hash.github.io/pantrypilot'
PINS = HERE / 'pins'; PINS.mkdir(exist_ok=True)
SRC = HERE / 'pin-src'; SRC.mkdir(exist_ok=True)
src = (ROOT / 'recipes.js').read_text()
a = src.index('window.PP_RECIPES = ') + len('window.PP_RECIPES = ')
recipes = json.loads(src[a:src.index('];', a) + 1])
CAT = {'breakfast': 'Breakfast', 'lunch': 'Lunch', 'dinner': 'Dinner', 'side': 'Side dish', 'appetizer': 'Appetizer', 'dip': 'Dip', 'dessert': 'Dessert', 'drink': 'Drink'}

def slug(t):   # same as tools/build_pages.py, so links match the recipe pages
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', t.lower().replace('&', ' and ')))
seen, slugs = set(), {}
for r in recipes:
    s = slug(r['title'])
    if s in seen: s = f"{s}-{r['id'][-4:]}"
    seen.add(s); slugs[r['id']] = s

def hook(r):
    mins = r['prep_time'] + r['cook_time']
    tags = ' '.join(r.get('tags', []))
    if mins <= 15: return f'Ready in {mins} minutes'
    if 'kid friendly' in tags: return 'Kids love this one'
    if 'one pan' in tags or 'one pot' in tags: return 'One pan, easy cleanup'
    return f'{len(r["ingredients"])} ingredients · {mins} min'

def pin(r):
    mins = r['prep_time'] + r['cook_time']
    return page(1000, 1500, f'''
<img class="photo" src="../../{r["image"]}" style="position:absolute;inset:0 0 auto 0;width:100%;height:940px">
<span class="pill" style="position:absolute;top:44px;left:44px;font-size:30px;padding:16px 28px;background:var(--pap);color:#fff">{hook(r)}</span>
<div style="position:absolute;left:0;right:0;bottom:0;height:600px;background:var(--paper);border-radius:48px 48px 0 0;padding:56px 64px 54px;display:flex;flex-direction:column">
  <span style="font:700 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--pap)">{CAT.get(r["category"], "Recipe")}</span>
  <h1 class="serif" style="font-size:{86 if len(r["title"]) < 24 else 72 if len(r["title"]) < 34 else 62}px;margin-top:18px;text-wrap:balance">{r["title"]}</h1>
  <p style="font-size:30px;color:var(--muted);margin-top:18px;font-weight:600">{mins} min · serves {r["servings"]} · {r["calories"]} cal</p>
  <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center">{brand(30)}<span style="font-size:26px;color:var(--teal);font-weight:700">Get the recipe →</span></div>
</div>''')

def pick(n):
    score = lambda r: (r['id'].startswith('q-') * 3 + ('kid friendly' in r.get('tags', [])) * 2 + (r['prep_time'] + r['cook_time'] <= 30)
                       + (r['category'] in ('dinner', 'dessert')))
    return sorted([r for r in recipes if r.get('image', '').startswith('img/')], key=score, reverse=True)[:n]

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    rows = []
    for r in pick(n):
        shoot(slugs[r['id']], 1000, 1500, pin(r), SRC, PINS)
        tags = r.get('tags', [])
        rows.append({'Title': f'{r["title"]} | Easy {CAT.get(r["category"], "Recipe")} Recipe'[:100],
                     'Media URL': f'{SITE}/pins/{slugs[r["id"]]}.png',
                     'Pinterest board': 'PantryPilot Recipes',
                     'Thumbnail': '',
                     'Description': (f'{r["description"]} Ready in {r["prep_time"] + r["cook_time"]} minutes. '
                                     f'Open it in PantryPilot to see what you can make with what\'s in your pantry, plan your week and get one shopping list.')[:500],
                     'Link': f'{SITE}/recipes/{slugs[r["id"]]}/?utm_source=pinterest',
                     'Publish date': '',
                     'Keywords': ', '.join(dict.fromkeys(['easy recipes', 'dinner ideas', *tags, CAT.get(r['category'], '').lower()]))})
        print('pin', slugs[r['id']], flush=True)
    with open(HERE / 'pinterest-bulk.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f'{len(rows)} pins and pinterest-bulk.csv done')
