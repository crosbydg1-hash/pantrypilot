"""Makes short PantryPilot videos for Instagram Reels and TikTok (1080x1920, no sound: add a trending song in the app).

usage: python3 marketing/make_reels.py
Each reel is a list of scenes. Every scene is designed in HTML, saved as a PNG with Chrome,
then marketing/render_video.swift joins them into an MP4 with fades and gentle motion.
The finished videos go in marketing/reels/."""
import json, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_ads import page, brand, chips, img, LOGO, shoot, HERE

FRAMES, REELS = HERE / 'reel-frames', HERE / 'reels'
FRAMES.mkdir(exist_ok=True); REELS.mkdir(exist_ok=True)
W, H = 1080, 1920
# Reels and TikTok cover the bottom ~420px and the right edge with buttons and captions: keep words above that.
TOP = 'position:absolute;left:80px;right:150px;top:'

def hook(big, small, bg='var(--teal)', fg='#fff'):
    return page(W, H, f'''<div style="position:absolute;inset:0;background:{bg};color:{fg}">
      <div style="{TOP}520px">
        <h1 class="serif" style="font-size:128px">{big}</h1>
        <p style="font-size:46px;line-height:1.3;margin-top:36px;opacity:.85;font-weight:600">{small}</p>
      </div></div>''')

def end_card(line):
    return page(W, H, f'''<div style="position:absolute;inset:0;background:var(--teal);color:#fff;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:470px">
      <span class="badge" style="width:230px;height:230px;background:#fff">{LOGO("var(--teal)", 165, 1.3)}</span>
      <div class="serif" style="font-size:104px;margin-top:48px">PantryPilot</div>
      <p style="font-size:44px;margin-top:22px;opacity:.9;font-weight:600;max-width:820px;line-height:1.3">{line}</p>
      <span class="cta" style="font-size:44px;padding:30px 60px;margin-top:64px">Free · link in bio</span>
    </div>''')

def recipe_card(photo, title, sub, tag):
    return page(W, H, f'''<div style="position:absolute;inset:0">
      <div style="{TOP}300px">
        <span class="pill" style="font-size:34px;padding:14px 26px;background:var(--soft);color:var(--teal-d)">{tag}</span>
        <div class="card" style="margin-top:36px;border-radius:44px;overflow:hidden">
          <img class="photo" src="{img(photo)}" style="width:100%;height:640px">
          <div style="padding:34px 38px"><div class="serif" style="font-size:60px">{title}</div>
          <div style="font-size:34px;color:var(--muted);font-weight:600;margin-top:10px">{sub}</div></div>
        </div>
      </div></div>''')

# ---------- Reel 1: "nothing to eat" -> recipes from what you have ----------
have = ['chicken', 'garlic', 'lemon', 'honey']
def have_scene(n):
    return page(W, H, f'''<div style="{TOP}520px">
      <h1 class="serif" style="font-size:110px">You have…</h1>
      <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:56px">{chips(have[:n], 50) if n else ''}</div>
    </div>''')
reel1 = [
    ('r1-hook', hook("POV: there's<br>nothing to eat", "(there's definitely something to eat)"), 2.4, 'pop'),
    *[(f'r1-have{n}', have_scene(n), 0.75 if n < 4 else 1.2, 'none') for n in range(1, 5)],
    ('r1-found', page(W, H, f'''<div style="{TOP}560px">
      <p style="font-size:50px;font-weight:600;color:var(--muted)">PantryPilot found</p>
      <div class="serif" style="font-size:230px;color:var(--teal);line-height:1;margin-top:10px">8</div>
      <h1 class="serif" style="font-size:100px">recipes you can<br>make right now</h1></div>'''), 1.8, 'pop'),
    ('r1-c1', recipe_card('r-honey-garlic-chicken', 'Honey Garlic Chicken', '35 min · you have everything', '✓ Ready to cook'), 1.8, 'zoom'),
    ('r1-c2', recipe_card('6aec8d87c6ca2ef928e55a61', 'Charred Lemon Chicken', '50 min · need 1 more thing', 'Almost there'), 1.8, 'zoom'),
    ('r1-c3', recipe_card('r-roast-chicken', 'Lemon Herb Roast Chicken', 'Sunday dinner, sorted', '✓ Ready to cook'), 1.8, 'zoom'),
    ('r1-end', end_card('Cook with what you already have'), 2.8, 'pop'),
]

# ---------- Reel 2: plan a week of dinners, get one shopping list ----------
week = [('Mon', 'r-baked-ziti', 'Baked Ziti'), ('Tue', 'r-beef-tacos', 'Beef Tacos'), ('Wed', 'r-honey-garlic-chicken', 'Honey Garlic Chicken'),
        ('Thu', 'r-pad-thai', 'Shrimp Pad Thai'), ('Fri', 'r-chicken-fajitas', 'Chicken Fajitas')]
def week_scene(n):
    rows = ''.join(f'''<div style="display:flex;align-items:center;gap:24px;opacity:{1 if i < n else 0}">
        <b style="width:84px;font-size:36px;color:var(--muted)">{d}</b><img class="photo" src="{img(p)}" style="width:132px;height:132px;border-radius:26px">
        <span style="font-size:42px;font-weight:700;line-height:1.1">{t}</span></div>''' for i, (d, p, t) in enumerate(week))
    return page(W, H, f'''<div style="{TOP}240px">
      <h1 class="serif" style="font-size:92px">This week's<br>dinners</h1>
      <div class="card" style="margin-top:44px;border-radius:44px;padding:36px;display:grid;gap:24px">{rows}</div></div>''')
items = ['ziti', 'ground beef', 'taco shells', 'chicken thighs', 'shrimp', 'rice noodles', 'peppers', 'limes']
reel2 = [
    ('r2-hook', hook('Plan a whole week<br>of dinners in<br>30 seconds', 'no more 5pm panic', 'var(--paper)', 'var(--ink)'), 2.4, 'pop'),
    *[(f'r2-week{n}', week_scene(n), 0.7 if n < 5 else 1.3, 'none') for n in range(1, 6)],
    ('r2-list', page(W, H, f'''<div style="{TOP}240px">
      <h1 class="serif" style="font-size:92px">One tap →<br><span style="color:var(--teal)">shopping list</span></h1>
      <div class="card" style="margin-top:44px;border-radius:44px;padding:36px 40px">
        {''.join(f'<div style="font-size:40px;padding:16px 0;border-top:2px solid #EEF2EF;display:flex;gap:18px"><span style="color:var(--teal)">☐</span>{t}</div>' for t in items)}
      </div></div>'''), 2.2, 'slide'),
    ('r2-skip', page(W, H, f'''<div style="{TOP}600px">
      <h1 class="serif" style="font-size:108px">…and it skips what you <span style="color:var(--teal)">already have.</span></h1>
      <div style="display:flex;flex-wrap:wrap;gap:18px;margin-top:50px">{''.join(f'<span class="pill" style="font-size:40px;padding:16px 30px;background:#fff;border:2px solid var(--soft);color:var(--muted);text-decoration:line-through">{t}</span>' for t in ['garlic', 'rice', 'olive oil', 'eggs'])}</div>
    </div>'''), 2.0, 'pop'),
    ('r2-end', end_card('Plan the week. Shop once.'), 2.8, 'pop'),
]

# ---------- Reel 3: three 15-minute dinners ----------
def quick_card(n, photo, title, line):
    return page(W, H, f'''<div style="{TOP}230px">
      <span class="pill" style="font-size:34px;padding:14px 26px;background:var(--pap);color:#fff">Dinner {n} of 3</span>
      <div class="card" style="margin-top:34px;border-radius:44px;overflow:hidden">
        <img class="photo" src="{img(photo)}" style="width:100%;height:700px">
        <div style="padding:34px 38px"><div class="serif" style="font-size:64px">{title}</div>
        <div style="font-size:36px;color:var(--muted);font-weight:600;margin-top:10px">{line}</div></div>
      </div></div>''')
reel3 = [
    ('r3-hook', hook('3 dinners<br>you can make in<br>15 minutes', 'save this for busy nights'), 2.4, 'pop'),
    ('r3-c1', quick_card(1, 'q-quesadillas', 'Chicken Quesadillas', '15 min · tortillas, chicken, cheddar'), 2.0, 'zoom'),
    ('r3-c2', quick_card(2, 'q-shrimp-tacos', 'Shrimp Tacos', '13 min · shrimp, cabbage, lime'), 2.0, 'zoom'),
    ('r3-c3', quick_card(3, 'q-pesto-pasta', 'Pesto Pasta with Peas', '15 min · pasta, pesto, peas'), 2.0, 'zoom'),
    ('r3-end', end_card('Find dinners you can make with what you have'), 2.8, 'pop'),
]
REELS_ALL = {'reel-nothing-to-eat': lambda: reel1, 'reel-plan-the-week': lambda: reel2, 'reel-15-minute-dinners': lambda: reel3}

def build(name, scenes):
    timeline = {'width': W, 'height': H, 'fps': 30, 'fade': 0.22, 'scenes': []}
    for key, html, secs, effect in scenes:
        png = shoot(key, W, H, html, FRAMES, FRAMES)
        timeline['scenes'].append({'image': str(png), 'seconds': secs, 'effect': effect})
    tl = FRAMES / f'{name}.json'
    tl.write_text(json.dumps(timeline, indent=1))
    subprocess.run(['swift', str(HERE / 'render_video.swift'), str(tl), str(REELS / f'{name}.mp4')], check=True)

if __name__ == '__main__':
    for name in (sys.argv[1:] or REELS_ALL):   # e.g. python3 marketing/make_reels.py reel-15-minute-dinners
        build(name, REELS_ALL[name]())
