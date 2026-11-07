"""Makes PantryPilot ad images for Instagram, Facebook, TikTok and Google.

usage: python3 marketing/make_ads.py
Writes an HTML design for each ad into marketing/src/, then uses Google Chrome to save each one as a PNG in marketing/ads/.
Ad text lives in the ADS list below; change it and run this again."""
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC, OUT = HERE / 'src', HERE / 'ads'
SRC.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
img = lambda name: f'../../img/{name}.jpg'

LOGO = lambda color, size, stroke=1.5: f'''<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13.4a2.8 2.8 0 0 1 1-5.4 3.2 3.2 0 0 1 6 0 2.8 2.8 0 0 1 1 5.4z"/><path d="M8 13.4h8v3H8z"/><path d="M2.8 3.5v3.4a1.7 1.7 0 0 0 3.4 0V3.5M4.5 3.5v4.2M4.5 8.6v11.9"/><rect x="17.6" y="3.3" width="3.8" height="5.4" rx=".7"/><path d="M19.5 5v2M19.5 8.7v11.8"/></svg>'''

BASE = '''<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@500;600;700&display=block">
<style>
h1,p{text-wrap:balance}:root{--paper:#F1F4F1;--ink:#16221F;--muted:#55635E;--teal:#2B656B;--teal-d:#1F4D52;--soft:#DAEAE8;--pap:#C2552A;--pap-soft:#F6E1D6;--white:#fff}
*{box-sizing:border-box;margin:0}html,body{width:var(--w);height:var(--h);overflow:hidden}
body{background:var(--paper);color:var(--ink);font-family:"Plus Jakarta Sans",system-ui,sans-serif;position:relative}
.serif{font-family:Fraunces,Georgia,serif;font-weight:700;letter-spacing:-.02em;line-height:1.02}
.brand{display:flex;align-items:center;gap:.4em;font-weight:700}
.badge{display:inline-flex;align-items:center;justify-content:center;background:var(--teal);border-radius:24%}
.pill{display:inline-flex;align-items:center;gap:.35em;border-radius:999px;font-weight:600;white-space:nowrap}
.cta{display:inline-flex;align-items:center;border-radius:999px;background:var(--pap);color:#fff;font-weight:700}
.photo{object-fit:cover;display:block}
.card{background:#fff;box-shadow:0 30px 60px -20px rgba(22,34,31,.35),0 2px 6px rgba(22,34,31,.08)}
.check{color:var(--teal);font-weight:800}
</style>'''

def page(w, h, body, extra=''):
    return f'<!doctype html><html><head><meta charset="utf-8">{BASE}<style>:root{{--w:{w}px;--h:{h}px}}{extra}</style></head><body>{body}</body></html>'

def brand(size, color='var(--ink)', badge=True):
    mark = f'<span class="badge" style="width:{size * 1.6}px;height:{size * 1.6}px">{LOGO("#fff", size * 1.15)}</span>' if badge else LOGO(color, size * 1.3)
    return f'<div class="brand" style="font-size:{size}px;color:{color}">{mark}PantryPilot</div>'

def chips(items, size):
    return ''.join(f'<span class="pill" style="font-size:{size}px;padding:{size * .45}px {size * .8}px;background:#fff;border:2px solid var(--soft)"><span class="check">✓</span>{t}</span>' for t in items)

# 1. Square feed ad: what can I cook with what I have?
sq_pantry = page(1080, 1080, f'''
<div style="position:absolute;inset:0;padding:72px 76px;display:flex;flex-direction:column">
  {brand(34)}
  <h1 class="serif" style="font-size:132px;margin-top:40px">What's for<br>dinner?</h1>
  <p style="font-size:36px;line-height:1.35;color:var(--muted);margin-top:22px;max-width:820px">Tell PantryPilot what's in your kitchen. It shows every recipe you can make right now.</p>
  <div class="card" style="margin-top:auto;border-radius:40px;padding:38px 40px;display:grid;gap:30px">
    <div style="display:flex;flex-wrap:wrap;gap:12px">{chips(['chicken', 'rice', 'garlic', 'lime'], 30)}</div>
    <div style="display:flex;align-items:center;gap:22px">
      <div style="display:flex">{''.join(f'<img class="photo" src="{img(n)}" style="width:170px;height:170px;border-radius:30px;border:6px solid #fff;margin-left:{0 if i == 0 else -34}px">' for i, n in enumerate(['r-green-curry', 'r-beef-tacos', 'r-pad-thai']))}</div>
      <div><div class="serif" style="font-size:64px;color:var(--teal)">14 recipes</div><div style="font-size:30px;color:var(--muted);font-weight:600">you can cook tonight</div></div>
    </div>
  </div>
</div>''')

# 2. Square feed ad: plan the week, shop once
days = [('Mon', 'r-baked-ziti', 'Baked Ziti'), ('Tue', 'r-beef-tacos', 'Beef Tacos'), ('Wed', 'r-green-curry', 'Green Curry'), ('Thu', 'r-pad-thai', 'Pad Thai')]
sq_plan = page(1080, 1080, f'''
<div style="position:absolute;inset:0;background:var(--teal);color:#fff;padding:72px 76px;display:flex;flex-direction:column">
  {brand(34, '#fff', badge=False)}
  <h1 class="serif" style="font-size:112px;margin-top:40px">Plan the week.<br><span style="color:#F6C9B2">Shop once.</span></h1>
  <div style="margin-top:auto;display:grid;grid-template-columns:1.25fr 1fr;gap:24px;align-items:end">
    <div class="card" style="border-radius:36px;padding:30px;color:var(--ink);display:grid;gap:18px">
      {''.join(f'<div style="display:flex;align-items:center;gap:16px"><b style="width:66px;font-size:28px;color:var(--muted)">{d}</b><img class="photo" src="{img(n)}" style="width:104px;height:104px;border-radius:20px"><span style="font-size:32px;font-weight:700;line-height:1.1">{t}</span></div>' for d, n, t in days)}
    </div>
    <div class="card" style="border-radius:32px;padding:28px;color:var(--ink)">
      <div style="font-size:28px;font-weight:700;color:var(--muted);margin-bottom:14px">Shopping list</div>
      {''.join(f'<div style="font-size:30px;padding:16px 0;border-top:2px solid #EEF2EF;display:flex;gap:12px"><span style="color:var(--teal)">☐</span>{t}</div>' for t in ['ziti', 'ground beef', 'coconut milk', 'shrimp', 'limes'])}
    </div>
  </div>
</div>''')

# 3. Story / Reels / TikTok: stop staring into the fridge
story = page(1080, 1920, f'''
<img class="photo" src="{img('r-green-curry')}" style="position:absolute;inset:0;width:100%;height:46%">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(22,34,31,.15) 0%,rgba(22,34,31,0) 22%,rgba(241,244,241,0) 36%,var(--paper) 46%)"></div>
<div style="position:absolute;top:120px;left:76px">{brand(38, '#fff')}</div>
<div style="position:absolute;left:76px;right:76px;top:820px;display:flex;flex-direction:column">
  <h1 class="serif" style="font-size:130px">Stop staring<br>into the fridge.</h1>
  <div style="display:grid;gap:34px;margin-top:60px">
    {''.join(f'<div style="display:flex;gap:22px;align-items:center;font-size:44px;font-weight:600"><span class="pill" style="width:74px;height:74px;justify-content:center;background:var(--soft);color:var(--teal);font-size:34px">{n}</span>{t}</div>' for n, t in [('1', 'Add what you have'), ('2', 'See what you can cook'), ('3', 'Plan it and get the list')])}
  </div>
  <div style="margin-top:96px;display:flex;align-items:center;gap:36px">
    <span class="cta" style="font-size:44px;padding:32px 60px">Try it free</span>
    <span style="font-size:32px;color:var(--muted);font-weight:600">100+ recipes inside</span>
  </div>
</div>''')

# 4. Story: turn this into this
story2 = page(1080, 1920, f'''
<div style="position:absolute;inset:0;padding:120px 76px 120px;display:flex;flex-direction:column">
  {brand(38)}
  <h1 class="serif" style="font-size:112px;margin-top:70px">Turn <span style="color:var(--pap)">this</span>…</h1>
  <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:40px">{chips(['baguette', 'tomatoes', 'garlic', 'basil', 'olive oil', 'balsamic'], 34)}</div>
  <h1 class="serif" style="font-size:112px;margin-top:80px">…into <span style="color:var(--teal)">dinner.</span></h1>
  <div class="card" style="margin-top:44px;border-radius:44px;overflow:hidden">
    <img class="photo" src="{img('x-bruschetta')}" style="width:100%;height:600px">
    <div style="padding:30px 36px;display:flex;justify-content:space-between;align-items:center">
      <div><div class="serif" style="font-size:46px">Tomato Bruschetta</div><div style="font-size:28px;color:var(--muted);font-weight:600;margin-top:6px">20 min · you have everything</div></div>
      <span class="pill" style="font-size:28px;padding:14px 22px;background:var(--soft);color:var(--teal-d)">✓ Ready</span>
    </div>
  </div>
  <div style="margin-top:64px;text-align:center"><span class="cta" style="font-size:42px;padding:32px 64px">Get PantryPilot free</span></div>
</div>''')

# 5. Landscape: Facebook link ad, Google display, Pinterest wide
wide = page(1200, 628, f'''
<div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 520px">
  <div style="padding:52px 56px;display:flex;flex-direction:column">
    {brand(26)}
    <h1 class="serif" style="font-size:66px;margin-top:34px">Cook with what<br>you already have.</h1>
    <p style="font-size:24px;line-height:1.4;color:var(--muted);margin-top:18px">Recipes from your pantry, a weekly meal plan and one shopping list.</p>
    <div style="margin-top:auto"><span class="cta" style="font-size:24px;padding:18px 34px">Start free</span></div>
  </div>
  <div style="position:relative">
    <img class="photo" src="{img('r-pad-thai')}" style="position:absolute;inset:0;width:100%;height:100%">
    <div class="card" style="position:absolute;left:-40px;bottom:44px;border-radius:24px;padding:18px 22px;display:flex;gap:14px;align-items:center">
      <span class="pill" style="width:46px;height:46px;justify-content:center;background:var(--soft);color:var(--teal);font-size:24px">✓</span>
      <div><div style="font-weight:700;font-size:22px">Easy Shrimp Pad Thai</div><div style="color:var(--muted);font-size:18px;font-weight:600">You have 11 of 12 ingredients</div></div>
    </div>
  </div>
</div>''')

# 6. Pinterest pin (2:3)
pin = page(1000, 1500, f'''
<div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:66%">
  {''.join(f'<img class="photo" src="{img(n)}" style="width:100%;height:100%">' for n in ['r-ricotta-pancakes', 'r-baked-ziti', 'h-pumpkin-pie', 'r-mojito'])}
</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:38%;background:var(--paper);border-radius:48px 48px 0 0;padding:60px 64px;display:flex;flex-direction:column">
  <h1 class="serif" style="font-size:78px">100+ easy recipes,<br>matched to <span style="color:var(--teal)">your pantry</span></h1>
  <p style="font-size:30px;color:var(--muted);margin-top:20px;font-weight:500">Breakfast to dessert. Plan the week and get one shopping list.</p>
  <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center">{brand(32)}<span class="cta" style="font-size:28px;padding:20px 36px">Free to start</span></div>
</div>''')

# 7. Instagram / TikTok profile picture: the logo, sized to stay inside the circle crop
profile = page(1080, 1080, f'''
<div style="position:absolute;inset:0;background:var(--teal);display:flex;align-items:center;justify-content:center">
  {LOGO("#fff", 640, 1.1)}
</div>''')

ADS = [('square-whats-for-dinner', 1080, 1080, sq_pantry), ('square-plan-the-week', 1080, 1080, sq_plan),
       ('story-stop-staring', 1080, 1920, story), ('story-turn-this-into-dinner', 1080, 1920, story2),
       ('wide-cook-with-what-you-have', 1200, 628, wide), ('pinterest-100-recipes', 1000, 1500, pin),
       ('profile-picture', 1080, 1080, profile)]

for name, w, h, html in ADS:
    src = SRC / f'{name}.html'
    src.write_text(html)
    out = OUT / f'{name}.png'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
                    '--virtual-time-budget=6000', f'--window-size={w},{h}', f'--screenshot={out}', src.as_uri()],
                   check=True, capture_output=True)
    print('made', out.name, f'{w}x{h}')
