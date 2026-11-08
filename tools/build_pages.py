"""Builds one plain web page per recipe so Google can find, read and show PantryPilot recipes
(with the schema.org Recipe data behind Google's recipe results), plus a recipe index, sitemap.xml and robots.txt.

usage: python3 tools/build_pages.py <output folder> <site url>
Called by build-zip.sh. Pages link back into the app for planning, the pantry matcher and the shopping list."""
import html, json, re, sys
from datetime import date
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
out_dir, site = Path(sys.argv[1]), sys.argv[2].rstrip('/')

src = (ROOT / 'recipes.js').read_text()
a = src.index('window.PP_RECIPES = ') + len('window.PP_RECIPES = ')
recipes = json.loads(src[a:src.index('];', a) + 1])
nsrc = (ROOT / 'nutrition.js').read_text()
nutrition = json.loads(nsrc[nsrc.index('{'):nsrc.rindex('}') + 1])

CAT = {'breakfast': 'Breakfast', 'lunch': 'Lunch', 'dinner': 'Dinner', 'side': 'Side dish', 'appetizer': 'Appetizer', 'dip': 'Dip',
       'dessert': 'Dessert', 'drink': 'Drink'}
CUISINE = {'american': 'American', 'italian': 'Italian', 'asian': 'Asian', 'mexican': 'Mexican', 'mediterranean': 'Mediterranean',
           'indian': 'Indian', 'baking': 'Baking'}
PLURAL = {'cup': 'cups', 'can': 'cans', 'sprig': 'sprigs', 'slice': 'slices', 'head': 'heads', 'portion': 'portions', 'pinch': 'pinches'}
SING = {v: k for k, v in PLURAL.items()}

def slug(t):
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', t.lower().replace('&', ' and ')))

def qty(q):
    if not q: return ''
    if q >= 10: return str(round(q))
    whole = int(q + 1e-9); frac = q - whole
    best = min([(0, ''), (1/8, '⅛'), (1/4, '¼'), (1/3, '⅓'), (1/2, '½'), (2/3, '⅔'), (3/4, '¾'), (1, '')], key=lambda x: abs(x[0] - frac))
    if best[0] == 1: whole += 1; best = (0, '')
    return (str(whole) if whole else '') + best[1] or '⅛'

def line(i):
    u = SING.get(i['unit'], i['unit'])
    u = PLURAL.get(u, u) if i['quantity'] > 1.001 else u
    return ' '.join(x for x in [qty(i['quantity']), u, i['item']] if x)

def iso_minutes(m): return f'PT{int(m)}M'

def credit(r):
    c = r.get('photo_credit')
    if not c: return ''
    link = lambda u, t: f'<a href="{esc(u)}" rel="noopener">{esc(t)}</a>' if str(u or '').startswith('https://') else esc(t)
    parts = [link(c.get('url'), c['name'])] if c.get('name') and c['name'] != 'Unknown' else []
    if c.get('license'): parts.append(link(c.get('license_url'), c['license']))
    if c.get('page'): parts.append(link(c['page'], 'source'))
    return f'<p class="meta" style="margin-top:-8px">Photo: {" · ".join(parts)}</p>'
esc = lambda s: html.escape(str(s), quote=True)
small = lambda src: str(src).replace('img/', 'img/sm/', 1)   # the lighter card-size photo

STYLE = """<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Plus+Jakarta+Sans:wght@400;600&display=swap">
<style>
:root{--paper:#F1F4F1;--surface:#fff;--ink:#16221F;--muted:#5A6863;--line:#D6DDD8;--teal:#2B656B;--paprika:#C2552A;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0E1614;--surface:#15201D;--ink:#E5ECE9;--muted:#95A6A0;--line:#27352F;--teal:#73B8B4;--paprika:#F08C5C;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.6 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px max(18px,env(safe-area-inset-right,0px)) 56px max(18px,env(safe-area-inset-left,0px))}
a{color:var(--teal)}h1,h2{font-family:Fraunces,Georgia,serif;font-weight:600;line-height:1.15;text-wrap:balance}h1{font-size:clamp(30px,5vw,44px);margin:6px 0}
h2{font-size:22px;margin:28px 0 10px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:600}.top a{text-decoration:none}
.eyebrow{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--paprika)}
.photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:20px;margin:16px 0}.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--muted);font-size:14px}
.cta{display:inline-block;margin:18px 0 6px;padding:12px 20px;border-radius:999px;background:var(--teal);color:#fff;font-weight:600;text-decoration:none}
@media (prefers-color-scheme:dark){.cta{color:#0A1513}}ul,ol{padding-left:22px}li{margin:6px 0}.panel{background:var(--surface);border-radius:18px;padding:6px 22px 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:16px}.grid a{text-decoration:none;color:var(--ink);background:var(--surface);border-radius:14px;overflow:hidden;display:block}
.grid img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}.grid span{display:block;padding:10px 12px;font-weight:600}footer{margin-top:40px;font-size:13px;color:var(--muted)}
.more{list-style:none;margin-left:-22px;color:var(--muted)}.gate{margin-top:16px;border:1.5px solid var(--teal)}.gate p{margin:0;color:var(--muted)}
</style>"""

def head(title, desc, canonical, image=None, extra=''):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title><meta name="description" content="{esc(desc)}"><link rel="canonical" href="{esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{esc(canonical)}">
{f'<meta property="og:image" content="{esc(image)}"><meta name="twitter:card" content="summary_large_image">' if image else ''}
<link rel="icon" href="../../icons/icon-32.png"><meta name="theme-color" content="#2B656B">{STYLE}{extra}</head><body><main>"""

pages, seen = [], set()
for r in recipes:
    s = slug(r['title'])
    if s in seen: s = f"{s}-{r['id'][-4:]}"
    seen.add(s)
    url = f"{site}/recipes/{s}/"
    img = f"{site}/{r['image']}" if r.get('image') and not str(r['image']).startswith('data:') else None
    n = nutrition.get(r['id'])
    ld = {"@context": "https://schema.org", "@type": "Recipe", "name": r['title'], "description": r['description'],
          "author": {"@type": "Organization", "name": "PantryPilot"}, "datePublished": "2026-11-06",
          "prepTime": iso_minutes(r['prep_time']), "cookTime": iso_minutes(r['cook_time']), "totalTime": iso_minutes(r['prep_time'] + r['cook_time']),
          "recipeYield": f"{r['servings']} servings", "recipeCategory": CAT.get(r['category'], 'Main course'), "recipeCuisine": CUISINE.get(r.get('cuisine'), 'American'),
          "keywords": ', '.join(r.get('tags', [])),
          "nutrition": {"@type": "NutritionInformation", "calories": f"{r['calories']} calories",
                        **({"proteinContent": f"{n[0]} g", "carbohydrateContent": f"{n[1]} g", "fatContent": f"{n[2]} g"} if n else {})}}
    if img: ld["image"] = [img]
    body = head(f"{r['title']} · PantryPilot", r['description'], url, img,
                f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>') + f"""
<div class="top"><a href="../">← All recipes</a><a href="../../#kitchen">PantryPilot</a></div>
<span class="eyebrow">{esc(CAT.get(r['category'], ''))}</span><h1>{esc(r['title'])}</h1><p>{esc(r['description'])}</p>
<div class="meta"><span>Prep {r['prep_time']} min</span><span>Cook {r['cook_time']} min</span><span>Serves {r['servings']}</span><span>{r['calories']} kcal per serving</span>{f'<span>{n[0]} g protein · {n[1]} g carbs · {n[2]} g fat</span>' if n else ''}</div>
{f'<img class="photo" src="../../{esc(r["image"])}" alt="{esc(r["title"])}">' if img else ''}
{credit(r)}
<div class="panel"><h2>Ingredients</h2><ul>{''.join(f'<li>{esc(line(i))}</li>' for i in r['ingredients'][:3])}{f'<li class="more">+ {len(r["ingredients"]) - 3} more</li>' if len(r['ingredients']) > 3 else ''}</ul></div>
<div class="panel gate"><h2>See the full recipe</h2><p>Every ingredient and all {len(r['steps'])} steps are in PantryPilot. Create a free account to see them, scale the servings, plan it into your week and add it to your shopping list.</p>
<a class="cta" href="../../#recipe-{esc(r['id'])}">Get the full recipe, free</a></div>
<footer>From <a href="../../">PantryPilot</a>, the app that shows what you can cook with what's in your pantry. · <a href="../../privacy.html">Privacy</a></footer>
</main></body></html>"""
    d = out_dir / 'recipes' / s; d.mkdir(parents=True, exist_ok=True)
    (d / 'index.html').write_text(body)
    pages.append((s, r, url))

index = head('All recipes · PantryPilot', f"{len(pages)} home-cooking recipes from PantryPilot: breakfasts, dinners, sides, appetizers, desserts and drinks.", f"{site}/recipes/").replace('../../icons', '../icons') + f"""
<div class="top"><a href="../#kitchen">← Open PantryPilot</a></div><h1>All recipes</h1><p>{len(pages)} recipes. Create a free PantryPilot account to see each one in full, scale servings, check your pantry and build a shopping list.</p>
<div class="grid">{''.join(f'<a href="{s}/"><img src="../{esc(small(r["image"]))}" alt="" loading="lazy"><span>{esc(r["title"])}</span></a>' for s, r, _ in pages if r.get('image'))}</div>
<footer><a href="../privacy.html">Privacy</a></footer></main></body></html>"""
(out_dir / 'recipes').mkdir(parents=True, exist_ok=True)
(out_dir / 'recipes' / 'index.html').write_text(index)

today = date.today().isoformat()
urls = [f"{site}/", f"{site}/recipes/"] + [u for _, _, u in pages]
(out_dir / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ''.join(f'  <url><loc>{esc(u)}</loc><lastmod>{today}</lastmod></url>\n' for u in urls) + '</urlset>\n')
(out_dir / 'robots.txt').write_text(f"User-agent: *\nAllow: /\n\nSitemap: {site}/sitemap.xml\n")
print(f'Built {len(pages)} recipe pages, recipes/index.html, sitemap.xml and robots.txt for {site}')
