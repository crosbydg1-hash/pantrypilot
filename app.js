/* PantryPilot — pantry-first recipe app. No build step, no backend: state lives in this browser. */
(() => {
  'use strict';

  const RECIPES = Array.isArray(window.PP_RECIPES) ? window.PP_RECIPES : [];
  const byId = new Map(RECIPES.map(r => [r.id, r]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  /* ---------- storage (never trusted to exist) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pantrypilot:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('pantrypilot:' + k, JSON.stringify(v)); } catch { /* storage blocked: keep working in memory */ } }
  };

  /* ---------- light / dark mode: prefs.theme is 'auto' (match the phone), 'light' or 'dark' ---------- */
  // Built-in photos come in three sizes: img/x.jpg (full), img/sm/x.jpg (cards) and img/xs/x.jpg (little thumbnails).
  const sized = (src, size) => /^img\/[^/]+\.jpg$/.test(src || '') ? src.replace('img/', `img/${size}/`) : src;
  const thumb = src => sized(src, 'sm'), tiny = src => sized(src, 'xs');
  const THEMES = [['auto', 'Auto', 'Matches your phone or computer'], ['light', 'Light', 'Bright and clean'], ['dark', 'Dark', 'Easy on the eyes at night']];
  const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
    const dark = t === 'dark' || (t !== 'light' && !!darkQuery?.matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1614' : '#2B656B');
  }
  const themeChips = (cur, action) => `<div class="theme-picks" role="radiogroup" aria-label="Appearance">${THEMES.map(([v, l, sub]) =>
    `<button type="button" class="theme-pick" role="radio" data-action="${action}" data-v="${v}" aria-checked="${cur === v}" aria-pressed="${cur === v}"><span class="swatch ${v}" aria-hidden="true"></span><b>${l}</b><span>${sub}</span></button>`).join('')}</div>`;

  /* ---------- icons ---------- */
  const P = {
    kitchen: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20"/><path d="M9 6.5c0-1.2 1-1.5 1-2.7M14 6.5c0-1.2 1-1.5 1-2.7"/>',
    pantry: '<rect x="8" y="2.5" width="8" height="3" rx="1"/><path d="M7 5.5h10a1 1 0 0 1 1 1V19a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19V6.5a1 1 0 0 1 1-1z"/><path d="M6 11h12M6 16h12"/>',
    plan: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 14h3M7.5 17h6"/>',
    list: '<path d="M5 8h14l-1.1 11.6a1.5 1.5 0 0 1-1.5 1.4H7.6a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.8 0-3.6 3-5.4 3.6-9.2 2.2 1.4 3 3.4 3 5 .9-.6 1.5-1.6 1.6-2.8 2 1.5 3.8 4 3.8 7 0 3.4-2.4 5.8-6 5.8z"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.9c1.6.6 2.7 2.2 3 4.6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
    sparkle: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    note: '<path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M8.5 11h7M8.5 14.5h5"/>',
    jarIn: '<path d="M12 4v10M8 10l4 4 4-4"/><path d="M5 15v3.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V15"/>'
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
  const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13.4a2.8 2.8 0 0 1 1-5.4 3.2 3.2 0 0 1 6 0 2.8 2.8 0 0 1 1 5.4z"/><path d="M8 13.4h8v3H8z"/><path d="M2.8 3.5v3.4a1.7 1.7 0 0 0 3.4 0V3.5M4.5 3.5v4.2M4.5 8.6v11.9"/><rect x="17.6" y="3.3" width="3.8" height="5.4" rx=".7"/><path d="M19.5 5v2M19.5 8.7v11.8"/></svg>';

  /* ---------- ingredients: one name per real-world thing ---------- */
  const STRIP = /^(fresh|ripe|cooked|toasted|melted|unsalted|bone-in|fine|flaky|whole|shelled|mixed)\s+/;
  const ALIAS = {
    'garlic cloves': 'garlic', 'lemons': 'lemon', 'lemon juice': 'lemon', 'sea salt': 'salt',
    'basil leaves': 'basil', 'broccoli florets': 'broccoli', 'dill and parsley': 'dill & parsley',
    'greek yogurt': 'yogurt', 'plain yogurt': 'yogurt', 'yellow onion': 'onion', 'white miso paste': 'miso paste',
    'neutral oil for frying': 'neutral oil', 'sourdough bread': 'sourdough', 'powdered gelatin': 'gelatin',
    'salmon fillets': 'salmon', 'white fish fillets': 'white fish', 'cold beer': 'beer', 'sharp cheddar': 'cheddar',
    'crushed pistachios': 'pistachios', 'feta': 'feta', 'mozzarella': 'mozzarella',
    'lime juice': 'lime', 'ice water': 'water', 'mini mozzarella balls': 'mozzarella', 'avocados': 'avocado', 'white onion': 'onion'
  };
  function canon(raw) {
    let s = String(raw).toLowerCase().split(',')[0].trim(), prev;
    do { prev = s; s = s.replace(STRIP, ''); } while (s !== prev);
    return ALIAS[s] || s;
  }
  const STAPLES = new Set(['salt', 'black pepper', 'water']);
  const AISLES = [
    ['Meat & fish', /chicken|steak|salmon|fish|beef|sausage/],
    ['Pantry & dry goods', /coconut milk|oat milk|peanut butter/],
    ['Dairy & eggs', /butter|egg|cheese|cotija|cream|feta|mozzarella|parmesan|cheddar|milk|yogurt|puff pastry/],
    ['Bakery', /bread|sourdough|bun|tortilla|baguette|pita/],
    ['Spices & baking', /^salt$|pepper$|cinnamon|cumin|garam|paprika|chili flakes|powder|vanilla|yeast|gelatin|baking|sugar|flour|cocoa|cornstarch|sprinkles|cardamom|star anise|cloves|curry/],
    ['Pantry & dry goods', /crushed|paste|beans|chickpeas|marinara|sauce|oil|vinegar|honey|syrup|tahini|pickle|rice|farro|quinoa|noodles|rigatoni|panko|stock|wine|vodka|beer|chili crisp|mayonnaise|chocolate|walnuts|pistachios|sesame|edamame|corn$|tequila|liqueur|agave|cider|coffee|cold brew|sparkling|mustard|ranch|artichoke|water$/],
    ['Produce', /./]
  ];
  const AISLE_ORDER = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry & dry goods', 'Spices & baking', 'Added by you'];
  const aisleOf = name => AISLES.find(([, re]) => re.test(name))[0];

  // A plate-on-a-colored-table stand-in for recipes without a photo. The table color follows the category,
  // and the plate shows the recipe's emoji if it has one, otherwise its first letter.
  const PLATE_TINT = { drink: ['#F6E1D6', '#C2552A'], dip: ['#E4EDD5', '#5B7A2E'], appetizer: ['#F3E7C9', '#9A6B12'], dessert: ['#F2DCE3', '#9C3D5B'] };
  const placeholderImg = (title, emoji, category) => {
    const [bg, ink] = PLATE_TINT[category] || ['#DAEAE8', '#2B656B'];
    const mark = emoji
      ? `<text x="200" y="182" text-anchor="middle" font-size="92">${String(emoji).replace(/[<&>"]/g, '')}</text>`
      : `<text x="200" y="176" text-anchor="middle" font-family="Georgia,serif" font-size="78" fill="${ink}">${String(title || '?').trim().charAt(0).toUpperCase().replace(/[<&>"]/g, '')}</text>`;
    return 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${bg}"/><circle cx="200" cy="150" r="96" fill="#F7F9F7"/><circle cx="200" cy="150" r="70" fill="none" stroke="${ink}" stroke-opacity=".18" stroke-width="2"/>${mark}</svg>`);
  };
  function prep(r) {
    r.tags = Array.isArray(r.tags) ? r.tags : [];
    r.ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
    r.steps = Array.isArray(r.steps) ? r.steps : [];
    r.total = (r.prep_time || 0) + (r.cook_time || 0);
    r.keys = [...new Set(r.ingredients.map(i => canon(i.item)))].filter(k => !STAPLES.has(k));
    r.haystack = [r.title, r.description, r.category, ...r.tags, ...r.ingredients.map(i => i.item)].join(' ').toLowerCase();
    if (!r.image) r.image = placeholderImg(r.title, r.emoji, r.category);
    return r;
  }
  RECIPES.forEach(prep);
  const INGREDIENTS = [];
  const usage = new Map();
  function rebuildIndex() {
    INGREDIENTS.length = 0;
    INGREDIENTS.push(...[...new Set(RECIPES.flatMap(r => r.keys))].sort());
    usage.clear();
    INGREDIENTS.forEach(k => usage.set(k, RECIPES.filter(r => r.keys.includes(k)).length));
  }
  rebuildIndex();

  /* ---------- quantities ---------- */
  const FR = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
  function fmtQty(q) {
    if (!q || q <= 0) return '';
    if (q >= 10) return String(Math.round(q));
    let w = Math.floor(q + 1e-9);
    let [v, s] = FR.reduce((a, b) => Math.abs(b[0] - (q - w)) < Math.abs(a[0] - (q - w)) ? b : a);
    if (v === 1) { w += 1; s = ''; }
    if (!w && !s) return '⅛';
    return (w ? String(w) : '') + s;
  }
  const SING = { cups: 'cup', cans: 'can', sprigs: 'sprig', slices: 'slice', portions: 'portion', heads: 'head' };
  const PLUR = { cup: 'cups', can: 'cans', sprig: 'sprigs', slice: 'slices', portion: 'portions', head: 'heads', pinch: 'pinches' };
  const baseUnit = u => SING[u] || u || '';
  const unitFor = (u, q) => { const b = baseUnit(u); return q > 1.001 ? (PLUR[b] || b) : b; };
  const LIQUID_RE = /juice|milk|cream|water|stock|broth|oil|vinegar|syrup|sauce|wine|vodka|rum|tequila|gin|liqueur|cider|coffee|brew/;
  const METRIC = { cup: ['ml', 240], tbsp: ['ml', 15], tsp: ['ml', 5], lb: ['g', 453.6], pint: ['ml', 473], quart: ['ml', 946] };
  function amount(q, u, item = '') {
    const b = baseUnit(u);
    if (state.prefs.units === 'metric' && q > 0) {
      const m = b === 'oz' ? (LIQUID_RE.test(String(item).toLowerCase()) ? ['ml', 29.57] : ['g', 28.35]) : METRIC[b];
      if (m) {
        let v = q * m[1], unit = m[0];
        if (v >= 1000) { v /= 1000; unit = unit === 'ml' ? 'l' : 'kg'; return `${+v.toFixed(v < 10 ? 2 : 1)} ${unit}`; }
        return `${v < 20 ? Math.round(v * 2) / 2 : Math.round(v / 5) * 5} ${unit}`;
      }
    }
    return [fmtQty(q), unitFor(u, q)].filter(Boolean).join(' ');
  }
  const fmtMins = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
  const SKILL = { beginner: 1, intermediate: 2, advanced: 3 };
  const skillHTML = s => `<span class="skill" title="${cap(s)}">${[1, 2, 3].map(n => `<i class="${n <= (SKILL[s] || 1) ? 'on' : ''}"></i>`).join('')}<span>${cap(s)}</span></span>`;
  const CAT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', side: 'Sides', appetizer: 'Appetizers', dip: 'Dips', dessert: 'Dessert', drink: 'Drinks' };

  /* ---------- state ---------- */
  // Meal plan: { 'YYYY-MM-DD': { breakfast: [ids], lunch: [ids], dinner: [ids] } }.
  // Older plans stored a plain list per day; those meals are sorted into slots by recipe type.
  const SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']];
  const slotFor = id => { const c = byId.get(id)?.category; return c === 'breakfast' ? 'breakfast' : c === 'lunch' ? 'lunch' : 'dinner'; };
  /* A note on a planned meal lives in plan[day].notes["slot|recipeId"]. */
  const NOTE_MAX = 300;
  const noteKey = (slot, id) => slot + '|' + id;
  function setPlanNote(day, slot, id, text) {
    const d = state.plan[day]; if (!d) return;
    const t = String(text || '').trim().slice(0, NOTE_MAX);
    d.notes = d.notes || {};
    if (t) d.notes[noteKey(slot, id)] = t; else delete d.notes[noteKey(slot, id)];
    if (!Object.keys(d.notes).length) delete d.notes;
  }
  const PEOPLE_MAX = 24;
  const clampPeople = n => Math.min(PEOPLE_MAX, Math.max(1, Math.round(+n || 0)));
  function setPlanPeople(day, slot, id, n) {
    const d = state.plan[day]; if (!d) return;
    d.people = d.people || {};
    if (+n > 0) d.people[noteKey(slot, id)] = clampPeople(n); else delete d.people[noteKey(slot, id)];
    if (!Object.keys(d.people).length) delete d.people;
  }
  // How many people a planned meal is for: what was saved with it, else the usual amount.
  const planPeople = (day, slot, r) => state.plan[day]?.people?.[noteKey(slot, r.id)] || servingsOf(r);
  const peopleLabel = n => n === 1 ? '1 person' : n + ' people';
  const peopleStepper = n => `<div class="people-row"><span class="lbl" id="planPeopleLbl">How many people?</span>
    <div class="stepper" role="group" aria-labelledby="planPeopleLbl">
      <button type="button" data-action="ppl-step" data-d="-1" aria-label="Fewer people">${icon('minus')}</button>
      <output id="planPeople" class="num" data-n="${n}" aria-live="polite">${peopleLabel(n)}</output>
      <button type="button" data-action="ppl-step" data-d="1" aria-label="More people">${icon('plus')}</button>
    </div></div>`;
  const readPeople = () => { const o = $('#planPeople'); return o ? clampPeople(o.dataset.n) : 0; };
  function normalizePlan(p) {
    const out = {};
    if (!p || typeof p !== 'object') return out;
    Object.entries(p).forEach(([day, v]) => {
      const d = { breakfast: [], lunch: [], dinner: [] };
      if (Array.isArray(v)) v.forEach(id => d[slotFor(id)].push(id));
      else if (v && typeof v === 'object') {
        SLOTS.forEach(([k]) => { if (Array.isArray(v[k])) d[k] = v[k].slice(); });
        if (v.notes && typeof v.notes === 'object') {
          const notes = {};
          Object.entries(v.notes).forEach(([key, t]) => { if (typeof t === 'string' && t.trim()) notes[key] = t.slice(0, NOTE_MAX); });
          if (Object.keys(notes).length) d.notes = notes;
        }
        if (v.people && typeof v.people === 'object') {
          const people = {};
          Object.entries(v.people).forEach(([key, n]) => { if (+n > 0) people[key] = clampPeople(n); });
          if (Object.keys(people).length) d.people = people;
        }
      }
      if (SLOTS.some(([k]) => d[k].length)) out[day] = d;
    });
    return out;
  }
  const STARTER = ['olive oil', 'butter', 'eggs', 'all-purpose flour', 'garlic', 'onion', 'granulated sugar', 'brown sugar', 'soy sauce', 'milk',
    'lemon', 'baking powder', 'baking soda', 'honey', 'vegetable stock', 'parmesan', 'cocoa powder', 'vanilla bean paste', 'ground cinnamon',
    'sourdough', 'avocado', 'chili flakes', 'heavy cream', 'cornstarch', 'tomato paste', 'crushed tomatoes', 'dark chocolate', 'buttermilk',
    'maple syrup', 'blueberries', 'chili crisp'];
  const savedPantry = store.get('pantry', null);
  const state = {
    pantry: new Set(Array.isArray(savedPantry) ? savedPantry : STARTER.filter(x => INGREDIENTS.includes(x))),
    starter: !Array.isArray(savedPantry),
    favs: new Set(store.get('favs', [])),
    list: store.get('list', []),
    plan: normalizePlan(store.get('plan', {})),
    f: Object.assign({ q: '', cat: 'all', skill: 'all', time: 0, diets: [], sort: 'match' }, store.get('filters', {}), { q: '' }),
    servings: {},
    gathered: {},
    stepsDone: {},
    week: 0,
    pantryQuery: '',
    prefs: store.get('prefs', {}) || {},
    cooked: store.get('cooked', []) || [],
    gifts: store.get('gifts', []) || [],
    ratings: {}, myRatings: {}, showAllergens: false,
    pantryDates: store.get('pantryDates', {}) || {}
  };
  if (!Array.isArray(state.list)) state.list = [];
  if (!state.plan || typeof state.plan !== 'object') state.plan = {};
  const dayIds = day => { const d = state.plan[day]; return d ? SLOTS.flatMap(([k]) => d[k] || []) : []; };
  const allPlanIds = () => Object.keys(state.plan).flatMap(dayIds);
  const save = {
    pantry() { state.starter = false; store.set('pantry', [...state.pantry]); queueSync(); },
    favs() { store.set('favs', [...state.favs]); queueSync(); },
    list() { store.set('list', state.list); queueSync(); queueListPush(); },
    plan() { store.set('plan', state.plan); queueSync(); },
    filters() { const { q, ...rest } = state.f; store.set('filters', rest); },
    prefs() { store.set('prefs', state.prefs); queueSync(); },
    cooked() { store.set('cooked', state.cooked); queueSync(); },
    gifts() { store.set('gifts', state.gifts); queueSync(); },
    pantryDates() { store.set('pantryDates', state.pantryDates); queueSync(); }
  };

  function match(r) {
    const missing = r.keys.filter(k => !state.pantry.has(k));
    const have = r.keys.length - missing.length;
    return { have, total: r.keys.length, missing, pct: r.keys.length ? have / r.keys.length : 1 };
  }
  function ring(m) {
    const C = 2 * Math.PI * 14;
    return `<span class="ring ${m.missing.length ? '' : 'full'}" aria-hidden="true"><svg viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="14"/><circle class="fg" cx="17" cy="17" r="14" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - m.pct)).toFixed(2)}"/></svg><b>${m.have}/${m.total}</b></span>`;
  }

  /* ---------- dates ---------- */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  function weekDays(offset) {
    const d = today(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + offset * 7);
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
  }
  const fmtDay = (d, opts) => d.toLocaleDateString(undefined, opts);

  /* ---------- nav ---------- */
  const NAV = [
    ['kitchen', 'Kitchen', 'kitchen'], ['community', 'Community', 'users'], ['pantry', 'Pantry', 'pantry'], ['plan', 'Plan', 'plan'],
    ['list', 'List', 'list'], ['saved', 'Library', 'heart']
  ];
  function renderNav(view) {
    const listCount = state.list.filter(i => !i.done).length;
    const badge = id => id === 'list' && listCount ? `<span class="badge num">${listCount}</span>` : id === 'saved' && state.favs.size ? `<span class="badge num">${state.favs.size}</span>` : '';
    const cur = id => (view === id || (view === 'recipe' && id === 'kitchen') || (view === 'add' && id === 'saved')) ? 'aria-current="page"' : '';
    $('#railNav').innerHTML = NAV.map(([id, label, ic]) => `<a class="rail-link" href="#${id}" ${cur(id)}>${icon(ic)}<span>${label}</span>${badge(id)}</a>`).join('');
    $('#tabNav').innerHTML = NAV.map(([id, label, ic]) => `<a class="tab" href="#${id}" ${cur(id)}>${icon(ic)}<span>${label}</span>${badge(id)}</a>`).join('');
    const ready = RECIPES.filter(r => !match(r).missing.length).length;
    $('#railFoot').innerHTML = `
      <div class="stat"><span>IN PANTRY</span><b class="num">${state.pantry.size}</b></div>
      <div class="stat"><span>READY TO COOK</span><b class="num">${ready}</b></div>
      <div class="stat"><span>ON YOUR LIST</span><b class="num">${listCount}</b></div>
      ${accountChip()}
      <div class="links"><a href="privacy.html">Privacy policy</a></div>`;
    const mb = $('#mobileAccount'); if (mb) mb.outerHTML = accountButton();
  }
  const brandHTML = `<span class="brand-mark">${LOGO}</span><span><span class="brand-name">PantryPilot</span><span class="brand-sub" style="display:block">Kitchen co-pilot</span></span>`;
  $$('[data-brand]').forEach(el => { el.innerHTML = brandHTML; });
  const mobileHead = () => `<div class="mobile-head"><a class="brand" href="#kitchen">${brandHTML}</a>${accountButton()}</div>`;

  /* ---------- cards ---------- */
  function matchLine(r) {
    const m = match(r);
    if (!m.missing.length) return `<div class="match ready">${ring(m)}<span><strong>Ready to cook</strong> · you have everything</span></div>`;
    const need = m.missing.slice(0, 2).join(', ') + (m.missing.length > 2 ? ` +${m.missing.length - 2}` : '');
    return `<div class="match">${ring(m)}<span class="need"><strong>Need ${m.missing.length}:</strong> ${esc(need)}</span></div>`;
  }
  const favBtn = (r, cls = 'icon-btn fav') => `<button type="button" class="${cls}" data-action="fav" data-id="${r.id}" aria-pressed="${state.favs.has(r.id)}" aria-label="Save ${esc(r.title)}">${icon('heart')}</button>`;
  function card(r) {
    return `<article class="card">
      <a class="card-link" href="#recipe-${r.id}">
        <div class="card-media"><img src="${esc(thumb(r.image))}" alt="" loading="lazy" decoding="async"><span class="cat">${CAT_LABEL[r.category] || esc(r.category)}</span></div>
        <div class="card-body">
          <h3>${esc(r.title)}</h3>
          <div class="meta"><span>${icon('clock')}${fmtMins(r.total)}</span><span>${icon('flame')}${r.calories} kcal</span><span>${cap(r.skill_level)}</span>${starsMini(r.id)}</div>
          ${allergyBadge(r)}
          ${r.author && !r.mine ? `<span class="by">${avatar(r.author.name, 'sm', r.author.avatar)}<span>by ${esc(r.author.name)}</span></span>` : r.mine && r.published ? '<span class="shared-pill">Shared with the community</span>' : ''}
          ${matchLine(r)}
        </div>
      </a>
      ${favBtn(r)}
    </article>`;
  }

  /* ---------- KITCHEN ---------- */
  const DIETS = [
    ['vegetarian', 'Vegetarian', r => r.tags.includes('vegetarian')],
    ['protein', 'High protein', r => r.tags.includes('high protein')],
    ['gf', 'Gluten free', r => r.tags.includes('gluten free')],
    ['onepan', 'One pan or pot', r => r.tags.some(t => /^one (pan|pot|bowl)$/.test(t))],
    ['ahead', 'Make ahead', r => r.tags.includes('make ahead')],
    ['kids', 'Kid friendly', r => r.tags.includes('kid friendly')],
    ['nobooze', 'Alcohol-free', r => !r.tags.includes('contains alcohol')]
  ];
  function filtered() {
    const f = state.f, q = f.q.trim().toLowerCase();
    let out = forMe(RECIPES).filter(r =>
      (f.cat === 'all' || r.category === f.cat) &&
      (f.skill === 'all' || r.skill_level === f.skill) &&
      (!f.time || r.total <= f.time) &&
      f.diets.every(id => { const d = DIETS.find(x => x[0] === id); return !d || d[2](r); }) &&
      (!q || q.split(/\s+/).every(w => r.haystack.includes(w))));
    const by = {
      match: (a, b) => match(a).missing.length - match(b).missing.length || match(b).pct - match(a).pct || a.total - b.total,
      quick: (a, b) => a.total - b.total,
      light: (a, b) => a.calories - b.calories,
      az: (a, b) => a.title.localeCompare(b.title)
    }[f.sort] || (() => 0);
    return out.sort(by);
  }
  function mealNow() {
    const h = new Date().getHours();
    if (h < 11) return ['breakfast', 'This morning'];
    if (h < 15) return ['lunch', 'Lunch today'];
    if (h < 21) return ['dinner', 'Tonight'];
    return ['dessert', 'Late-night'];
  }
  function pick() {
    const [cat] = mealNow();
    const pool = forMe(RECIPES, true).filter(r => r.category === cat).sort((a, b) => match(a).missing.length - match(b).missing.length || a.total - b.total);
    const top = pool.slice(0, 3);
    const doy = Math.floor((today() - new Date(today().getFullYear(), 0, 0)) / 864e5);
    return top[doy % top.length] || forMe(RECIPES, true)[0] || RECIPES[0];
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Up late?' : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';
  }
  function viewKitchen() {
    const mine = forMe(RECIPES, true);
    const ready = mine.filter(r => !match(r).missing.length).length;
    const close = mine.filter(r => { const n = match(r).missing.length; return n > 0 && n <= 2; }).length;
    const p = pick(), pm = match(p), [, when] = mealNow();
    return `<div class="page fade-in">
      ${mobileHead()}
      <header class="kitchen-head">
        <span class="eyebrow">${esc(fmtDay(new Date(), { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
        <h1>${greeting()} What are we cooking?</h1>
        <p class="lede">${ready || close ? `You can make <strong>${ready}</strong> ${ready === 1 ? 'recipe' : 'recipes'} right now${close ? `, and <strong>${close}</strong> more ${close === 1 ? 'is' : 'are'} one or two ingredients away` : ''}.` : `${mine.length} recipes to pick from. <a href="#pantry">Add what's in your pantry</a> to see which ones you can make tonight.`}${state.starter ? ' <a href="#pantry">These numbers use an example pantry. Set up yours.</a>' : ''}</p>
      </header>

      <a class="feature" href="#recipe-${p.id}">
        <div class="feature-media"><img src="${esc(p.image)}" alt="${esc(p.title)}"></div>
        <div class="feature-body">
          <span class="eyebrow">${when}'s pick · ${CAT_LABEL[p.category]}</span>
          <h2>${esc(p.title)}</h2>
          <p class="muted">${esc(p.description)}</p>
          <dl class="strip">
            <div><dt>Total</dt><dd>${fmtMins(p.total)}</dd></div>
            <div><dt>Serves</dt><dd>${p.servings}</dd></div>
            <div><dt>Kcal</dt><dd>${p.calories}</dd></div>
          </dl>
          ${matchLine(p)}
        </div>
      </a>

      ${installCard()}
      ${useItUpCard(2)}
      ${pickedForYou(p)}
      ${collectionsRow()}

      <section class="toolbar" id="toolbar" aria-label="Find a recipe">
        <label class="field" for="q"><span class="sr-only">Search recipes or ingredients</span>${icon('search')}
          <input class="input" id="q" type="search" placeholder="Search recipes or ingredients, e.g. chickpeas" autocomplete="off" value="${esc(state.f.q)}"></label>
        <div id="filters"></div>
      </section>
      <div class="results-meta" id="resultsMeta"></div>
      <div class="grid" id="results"></div>
      <footer class="site-foot"><span>© ${new Date().getFullYear()} PantryPilot</span><a href="privacy.html">Privacy policy</a></footer>
    </div>`;
  }
  function renderFilters() {
    const f = state.f;
    const cats = [['all', 'All'], ...Object.entries(CAT_LABEL)];
    $('#filters').innerHTML = `
      <div class="filter-row">
        <div class="scroll-x" role="group" aria-label="Meal">
          ${cats.map(([id, l]) => `<button type="button" class="chip" data-action="cat" data-v="${id}" aria-pressed="${f.cat === id}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="filter-row"><div class="scroll-x" role="group" aria-label="Filters">
        <label class="sr-only" for="fSkill">Skill level</label>
        <select class="select" id="fSkill" data-filter="skill">
          ${[['all', 'Any skill'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']].map(([v, l]) => `<option value="${v}" ${f.skill === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <label class="sr-only" for="fTime">Total time</label>
        <select class="select" id="fTime" data-filter="time">
          ${[[0, 'Any time'], [15, 'Under 15 min'], [30, 'Under 30 min'], [45, 'Under 45 min'], [60, 'Under an hour']].map(([v, l]) => `<option value="${v}" ${+f.time === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        ${DIETS.map(([id, l]) => `<button type="button" class="chip" data-action="diet" data-v="${id}" aria-pressed="${f.diets.includes(id)}">${l}</button>`).join('')}
      </div></div>`;
  }
  function renderResults() {
    const list = filtered();
    const f = state.f;
    const active = f.q || f.cat !== 'all' || f.skill !== 'all' || f.time || f.diets.length;
    const pn = prefsNote();
    $('#resultsMeta').innerHTML = `<span class="rm-count"><span><strong class="num">${list.length}</strong> ${list.length === 1 ? 'recipe' : 'recipes'}</span>${active ? `<button type="button" class="linkish" data-action="clear-filters">Clear filters</button>` : ''}</span>${pn ? `<span class="rm-prefs">${pn}</span>` : ''}
      <label class="field" for="fSort"><span class="sr-only">Sort by</span>
        <select class="select" id="fSort" data-filter="sort">
          ${[['match', 'Best pantry match'], ['quick', 'Quickest first'], ['light', 'Lightest first'], ['az', 'A to Z']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>`;
    setTimeout(fillAds, 0);
    $('#results').innerHTML = list.length ? list.map((r, i) => card(r) + (i === 5 && list.length > 6 ? adSlot('kitchen') : '')).join('') :
      `<div class="empty" style="grid-column:1/-1">${icon('search')}<h3>No recipes match those filters</h3><p>Try a different search or loosen a filter.</p><div class="row"><button type="button" class="btn" data-action="clear-filters">Clear filters</button></div></div>`;
  }
  function mountKitchen() {
    renderFilters(); renderResults();
    const q = $('#q');
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.f.q = q.value; renderResults(); }, 120); });
    const tb = $('#toolbar');
    if ('IntersectionObserver' in window && tb) {
      const s = document.createElement('div'); s.style.height = '1px'; tb.before(s);
      new IntersectionObserver(([e]) => tb.classList.toggle('stuck', !e.isIntersecting)).observe(s);
    }
  }

  /* ---------- RECIPE ---------- */
  const TIME_RE = /(\d+)\s*minutes?\s+(\d+)\s*seconds?|(\d+)(?:\s*[–-]\s*(\d+))?\s*(seconds?|minutes?|mins?|hours?)/gi;
  const toMetricTemps = text => state.prefs.units === 'metric' ? text.replace(/(\d{3})\s?°F/g, (m, f) => `${Math.round((f - 32) * 5 / 9 / 5) * 5}°C`) : text;
  function stepHTML(text, label) {
    text = toMetricTemps(text);
    let out = '', last = 0;
    text.replace(TIME_RE, (m, mm, ss, a, b, unit, idx) => {
      const sec = mm ? (+mm) * 60 + (+ss) : (+a) * (/^h/i.test(unit) ? 3600 : /^s/i.test(unit) ? 1 : 60);
      out += esc(text.slice(last, idx)) + `<button type="button" class="tchip" data-action="timer" data-sec="${sec}" data-label="${esc(label)}" aria-label="Start a ${esc(m)} timer">${icon('timer')}<span>${esc(m)}</span></button>`;
      last = idx + m.length; return m;
    });
    return out + esc(text.slice(last));
  }
  const servingsOf = r => state.servings[r.id] || (+state.prefs.household > 0 ? +state.prefs.household : r.servings);
  function ingredientsHTML(r) {
    const s = servingsOf(r), k = s / r.servings, g = state.gathered[r.id] || [];
    return r.ingredients.map((ing, i) => {
      const key = canon(ing.item), staple = STAPLES.has(key), inP = state.pantry.has(key), got = g.includes(i);
      const allergy = allergensIn(ing.item).filter(a => (state.prefs.allergies || []).includes(a));
      return `<li class="ing ${got ? 'got' : ''} ${allergy.length ? 'allergen' : ''}" ${allergy.length ? `title="Contains ${allergy.map(a => ALLERGENS[a].label.toLowerCase()).join(', ')}"` : ''}>
        <button type="button" class="ing-row" role="checkbox" aria-checked="${got}" data-action="gather" data-id="${r.id}" data-i="${i}">
          <span class="check">${icon('check')}</span>
          <span class="ing-text"><span class="q">${esc(amount(ing.quantity * k, ing.unit, ing.item))}</span> ${esc(ing.item)}</span>
        </button>
        ${staple ? '' : `<button type="button" class="pill" data-action="pantry-toggle" data-key="${esc(key)}" aria-pressed="${inP}" title="${inP ? 'Remove from pantry' : 'Mark as in your pantry'}">${inP ? 'In pantry' : '+ Pantry'}</button>`}
      </li>`;
    }).join('');
  }
  function pantryBar(r) {
    const m = match(r);
    return m.missing.length
      ? `<div class="pantry-bar"><div><strong>You have ${m.have} of ${m.total} ingredients.</strong> Missing: ${esc(m.missing.join(', '))}.</div><div class="bar"><span style="width:${Math.round(m.pct * 100)}%"></span></div></div>`
      : `<div class="pantry-bar ready"><div><strong>You have everything.</strong> Salt and pepper aside, it's all in your pantry.</div><div class="bar"><span style="width:100%"></span></div></div>`;
  }
  function viewRecipe(r) {
    const m = match(r);
    const related = RECIPES.filter(x => x.category === r.category && x.id !== r.id).sort((a, b) => match(a).missing.length - match(b).missing.length).slice(0, 4);
    const done = state.stepsDone[r.id] || [];
    return `<div class="page fade-in">
      ${mobileHead()}
      <a class="back" href="#kitchen" data-action="back">${icon('left')} All recipes</a>
      <section class="r-hero">
        <div class="r-photo"><img src="${esc(r.image)}" alt="${esc(r.title)}">${photoCredit(r)}</div>
        <div class="r-info">
          <span class="eyebrow">${CAT_LABEL[r.category] || esc(r.category)} · ${skillHTML(r.skill_level)}</span>
          <h1>${esc(r.title)}</h1>
          <p class="lede">${esc(r.description)}</p>
          ${r.mine ? `<p class="src-line">${icon('sparkle')}<span>In your library${r.source_url ? ` · from <a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(r.source_url))}</a>` : r.source_kind === 'photo' ? ' · from a photo' : ''}</span></p>` : ''}
          <dl class="strip">
            <div><dt>Prep</dt><dd>${fmtMins(r.prep_time)}</dd></div>
            <div><dt>Cook</dt><dd>${fmtMins(r.cook_time)}</dd></div>
            <div><dt>Total</dt><dd>${fmtMins(r.total)}</dd></div>
            <div><dt>Calories</dt><dd>${r.calories}</dd></div>
          </dl>
          ${nutritionLine(r)}
          <div class="tags">${starsLine(r.id)}${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          ${communityLine(r)}
          ${allergyWarning(r)}
          <div id="pantryBar">${pantryBar(r)}</div>
          <div class="actions">
            <button type="button" class="btn primary" data-action="cook" data-id="${r.id}">${icon('play')} Start cooking</button>
            <button type="button" class="btn" data-action="add-list" data-id="${r.id}" data-only-missing="${m.missing.length ? 1 : 0}" id="addListBtn">${icon('list')} ${m.missing.length ? `Add ${m.missing.length} missing to list` : 'Add to list'}</button>
            <button type="button" class="btn" data-action="plan-recipe" data-id="${r.id}">${icon('plan')} Plan it</button>
            <button type="button" class="btn" data-action="made-it" data-id="${r.id}">${icon('check')} I made this</button>
            <button type="button" class="btn" data-action="share" data-id="${r.id}">${icon('share')} Share</button>
            ${r.mine ? `<button type="button" class="btn ghost small danger" data-action="recipe-delete" data-id="${r.id}">${icon('trash')} Delete</button>` : favBtn(r)}
          </div>
        </div>
      </section>

      <section class="r-body">
        <div class="panel r-ings" aria-labelledby="ingTitle">
          <div class="panel-head">
            <h2 id="ingTitle" style="font-size:22px">Ingredients</h2>
            ${unitToggle()}
            <div class="stepper" role="group" aria-label="Servings">
              <button type="button" data-action="serv" data-id="${r.id}" data-d="-1" aria-label="Fewer servings" ${servingsOf(r) <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
              <output id="servOut" class="num" aria-live="polite">Serves ${servingsOf(r)}</output>
              <button type="button" data-action="serv" data-id="${r.id}" data-d="1" aria-label="More servings" ${servingsOf(r) >= 24 ? 'disabled' : ''}>${icon('plus')}</button>
            </div>
          </div>
          <p class="note" id="servNote">${servingsOf(r) !== r.servings ? `Scaled from ${r.servings} servings. Amounts update as you change it.` : 'Tap an ingredient to tick it off as you gather it.'}</p>
          <ul class="ing-list" id="ingList">${ingredientsHTML(r)}</ul>
        </div>

        <div class="panel" aria-labelledby="methodTitle">
          <div class="panel-head">
            <h2 id="methodTitle" style="font-size:22px">Method</h2>
            <span class="note">Tap a time to start a timer</span>
          </div>
          <ol class="steps">
            ${r.steps.map((s, i) => `<li class="step ${done.includes(i) ? 'done' : ''}" data-action="step" data-id="${r.id}" data-i="${i}">
              <span class="step-n">${done.includes(i) ? icon('check') : i + 1}</span><p class="step-t">${stepHTML(s, `${r.title} · step ${i + 1}`)}</p></li>`).join('')}
          </ol>
          <button type="button" class="btn primary" data-action="cook" data-id="${r.id}" style="justify-self:start">${icon('play')} Cook step by step</button>
        </div>
      </section>

      ${adSlot('recipe')}
      ${r.mine && !r.published ? '' : commentsShell(r)}

      ${related.length ? `<section style="display:grid;gap:16px"><h2>More ${CAT_LABEL[r.category]?.toLowerCase() || ''} ideas</h2><div class="grid">${related.map(card).join('')}</div></section>` : ''}
    </div>`;
  }

  /* ---------- PANTRY ---------- */
  function viewPantry() {
    return `<div class="page fade-in">
      ${mobileHead()}
      <header class="kitchen-head">
        <span class="eyebrow">Your pantry</span>
        <h1>What's in your kitchen?</h1>
        <p class="lede">Tick what you have. PantryPilot ranks every recipe by how much of it you can already make, and lists exactly what's missing. Salt and pepper are assumed.</p>
      </header>
      ${receiptCard()}
      ${state.starter ? `<div class="banner" id="starterBanner"><span><strong>This is an example kitchen</strong> of ${state.pantry.size} everyday ingredients. Tick and untick to match yours.</span><button type="button" class="btn small" data-action="pantry-clear">Start from empty</button></div>` : ''}
      ${useItUpCard()}
      <div class="pantry-layout">
        <section class="pantry-results" id="pantryResults" aria-label="What you can cook"></section>
        <section class="pantry-picker" aria-label="Ingredients">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <label class="field" for="pq" style="flex:1;min-width:200px"><span class="sr-only">Filter ingredients</span>${icon('search')}<input class="input" id="pq" type="search" placeholder="Filter ingredients" autocomplete="off" value="${esc(state.pantryQuery)}"></label>
            <span class="note num" id="pantryCount"></span>
            <button type="button" class="btn ghost small danger" data-action="pantry-clear">Clear all</button>
          </div>
          <div id="aisles"></div>
        </section>
      </div>
    </div>`;
  }
  function renderAisles() {
    const q = state.pantryQuery.trim().toLowerCase();
    const groups = {};
    INGREDIENTS.filter(k => !q || k.includes(q)).forEach(k => (groups[aisleOf(k)] = groups[aisleOf(k)] || []).push(k));
    const order = AISLE_ORDER.filter(a => groups[a]);
    $('#aisles').innerHTML = order.length ? order.map(a => {
      const items = groups[a];
      return `<div class="aisle"><div class="aisle-head"><h3>${a}</h3><span class="num" data-aisle-count="${esc(a)}">${items.filter(k => state.pantry.has(k)).length} / ${items.length}</span></div>
        <div class="chips">${items.map(k => `<button type="button" class="chip ingr" data-action="pantry-chip" data-key="${esc(k)}" aria-pressed="${state.pantry.has(k)}" title="Used in ${usage.get(k)} recipe${usage.get(k) > 1 ? 's' : ''}">${esc(k)}${freshTag(k)}</button>`).join('')}</div></div>`;
    }).join('') : `<p class="muted" style="padding:20px 0">No ingredient called “${esc(q)}” appears in your recipes.</p>`;
    $('#pantryCount').textContent = `${state.pantry.size} ticked`;
  }
  function rrow(r, withAdd) {
    const m = match(r);
    return `<div class="rrow"><img src="${esc(tiny(r.image))}" alt="" loading="lazy"><div style="min-width:0"><a href="#recipe-${r.id}">${esc(r.title)}</a>
      <div class="sub">${fmtMins(r.total)} · ${m.missing.length ? `need <b>${esc(m.missing.join(', '))}</b>` : 'you have everything'}</div></div>
      ${withAdd ? `<button type="button" class="btn small" data-action="add-list" data-id="${r.id}" data-only-missing="1" aria-label="Add missing ingredients for ${esc(r.title)} to list">${icon('plus')} List</button>` : ''}</div>`;
  }
  function renderPantryResults() {
    const sorted = RECIPES.slice().sort((a, b) => match(a).missing.length - match(b).missing.length || match(b).pct - match(a).pct);
    const ready = sorted.filter(r => !match(r).missing.length);
    const close = sorted.filter(r => { const n = match(r).missing.length; return n >= 1 && n <= 2; });
    const far = sorted.filter(r => match(r).missing.length > 2);
    $('#pantryResults').innerHTML = `
      <div class="rgroup"><h3>Cook now <span class="badge num">${ready.length}</span></h3>
        ${ready.length ? ready.map(r => rrow(r, false)).join('') : '<p class="muted" style="padding:4px 8px 8px">Nothing is fully covered yet. Tick a few more ingredients, or pick something below that is close.</p>'}</div>
      <div class="rgroup"><h3>One or two away <span class="badge num" style="background:var(--paprika)">${close.length}</span></h3>
        ${close.length ? close.map(r => rrow(r, true)).join('') : '<p class="muted" style="padding:4px 8px 8px">None right now.</p>'}</div>
      ${far.length ? `<details class="more rgroup"><summary>Needs a shopping trip (${far.length})</summary>${far.map(r => rrow(r, true)).join('')}</details>` : ''}`;
  }
  function mountPantry() {
    renderAisles(); renderPantryResults();
    const pq = $('#pq');
    pq.addEventListener('input', () => { state.pantryQuery = pq.value; renderAisles(); });
  }
  function togglePantry(key, on) {
    const has = state.pantry.has(key);
    const want = on == null ? !has : on;
    want ? state.pantry.add(key) : state.pantry.delete(key);
    setPantryDate(key, want);
    save.pantry();
    $('#starterBanner')?.remove();
    return want;
  }

  /* ---------- PLAN ---------- */
  function viewPlan() {
    const days = weekDays(state.week), t = iso(today());
    const ids = days.flatMap(d => dayIds(iso(d))).filter(id => byId.has(id));
    const mins = ids.reduce((s, id) => s + byId.get(id).total, 0);
    const range = `${fmtDay(days[0], { month: 'short', day: 'numeric' })} – ${fmtDay(days[6], { month: 'short', day: 'numeric' })}`;
    return `<div class="page fade-in">
      ${mobileHead()}
      <header class="kitchen-head">
        <span class="eyebrow">Meal plan</span>
        <h1>Plan the week, shop once.</h1>
        <p class="lede">Pick a breakfast, lunch and dinner for each day, then send the whole week to your shopping list. Anything already in your pantry is left off.</p>
      </header>
      <div class="week-nav">
        <button type="button" class="icon-btn" data-action="week" data-d="-1" aria-label="Previous week">${icon('left')}</button>
        <h2 class="num" style="font-size:22px">${state.week === 0 ? 'This week' : state.week === 1 ? 'Next week' : state.week === -1 ? 'Last week' : 'Week of'} <span class="muted" style="font-family:var(--f-body);font-size:15px;font-weight:500">${range}</span></h2>
        <button type="button" class="icon-btn" data-action="week" data-d="1" aria-label="Next week">${icon('right')}</button>
        <span style="flex:1"></span>
        ${ids.length ? `<span class="note num">${ids.length} meal${ids.length > 1 ? 's' : ''} · ${fmtMins(mins)} of cooking</span>
        <button type="button" class="btn primary" data-action="plan-to-list">${icon('list')} Add week to list</button>` : ''}
      </div>
      <div class="days">
        ${days.map(d => {
          const k = iso(d);
          return `<div class="day ${k === t ? 'today' : ''}">
            <div class="day-label"><span class="dow">${k === t ? 'Today' : esc(fmtDay(d, { weekday: 'short' }))}</span><span class="dom num">${d.getDate()}</span></div>
            <div class="day-slots">
              ${SLOTS.filter(([slot]) => (state.plan[k]?.[slot] || []).some(id => byId.has(id))).map(([slot, label]) => {
                const meals = (state.plan[k]?.[slot] || []).filter(id => byId.has(id));
                return `<div class="slot">
                  <span class="slot-label">${label}</span>
                  <div class="day-meals">
                    ${meals.map((id, i) => { const r = byId.get(id), note = state.plan[k]?.notes?.[noteKey(slot, id)]; return `<div class="meal"><img src="${esc(tiny(r.image))}" alt="" loading="lazy"><div><a href="#recipe-${r.id}">${esc(r.title)}</a><div class="sub">${fmtMins(r.total)} · ${peopleLabel(planPeople(k, slot, r))}</div>${note ? `<div class="meal-note">${esc(note)}</div>` : ''}</div>
                      <button type="button" class="x" data-action="plan-note" data-day="${k}" data-slot="${slot}" data-id="${esc(id)}" aria-label="People and note for ${esc(r.title)}" title="People and note">${icon('note')}</button>
                      <button type="button" class="x" data-action="unplan" data-day="${k}" data-slot="${slot}" data-i="${i}" aria-label="Remove ${esc(r.title)} from ${esc(fmtDay(d, { weekday: 'long' }))} ${label.toLowerCase()}">${icon('x')}</button></div>`; }).join('')}
                    <button type="button" class="add-meal" data-action="plan-day" data-day="${k}" data-slot="${slot}" aria-label="Add another ${label.toLowerCase()} for ${esc(fmtDay(d, { weekday: 'long' }))}">${icon('plus')} Add</button>
                  </div>
                </div>`;
              }).join('')}
              ${(() => { const empty = SLOTS.filter(([slot]) => !(state.plan[k]?.[slot] || []).some(id => byId.has(id)));
                return empty.length ? `<div class="add-row">${empty.map(([slot, label]) => `<button type="button" class="add-chip" data-action="plan-day" data-day="${k}" data-slot="${slot}" aria-label="Add ${label.toLowerCase()} for ${esc(fmtDay(d, { weekday: 'long' }))}">${icon('plus')} ${label}</button>`).join('')}</div>` : ''; })()}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* ---------- LIST ---------- */
  const onList = r => state.list.some(i => !i.done && i.from.includes(r.title));
  function addRecipeToList(r, onlyMissing, people) {
    const k = (people > 0 ? people : servingsOf(r)) / r.servings;
    let added = 0, skipped = 0;
    r.ingredients.forEach(ing => {
      const key = canon(ing.item);
      if (STAPLES.has(key)) return;
      if (onlyMissing && state.pantry.has(key)) { skipped++; return; }
      const unit = baseUnit(ing.unit), id = key + '|' + unit, q = (ing.quantity || 0) * k;
      const ex = state.list.find(x => x.id === id);
      if (ex) { ex.qty += q; ex.done = false; if (!ex.from.includes(r.title)) ex.from.push(r.title); }
      else state.list.push({ id, name: key, qty: q, unit, aisle: aisleOf(key), from: [r.title], done: false });
      added++;
    });
    save.list();
    return { added, skipped };
  }
  function viewList() {
    const items = state.list;
    const done = items.filter(i => i.done).length;
    const groups = {};
    items.forEach(i => (groups[i.aisle] = groups[i.aisle] || []).push(i));
    return `<div class="page fade-in">
      ${mobileHead()}
      <header class="kitchen-head">
        <span class="eyebrow">Shopping list</span>
        <h1>${items.length ? 'Your list, sorted by aisle.' : 'Your list is empty.'}</h1>
        <p class="lede">${items.length ? 'Amounts from different recipes are combined. Tick things off as they go in the cart, then move them into your pantry.' : 'Add the missing ingredients from any recipe, or plan a week and send it here in one go.'}</p>
      </header>
      <div class="list-layout">
        ${householdBar()}
        <form class="add-form" id="addForm" autocomplete="off">
          <label class="field" for="newItem"><span class="sr-only">Add an item</span>${icon('plus')}<input class="input" id="newItem" placeholder="Add an item, e.g. sparkling water" maxlength="80"></label>
          <button class="btn primary" type="submit">Add</button>
        </form>
        ${items.length ? `
        <div class="progress">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
            <span class="num"><strong>${done}</strong> of ${items.length} in the cart</span>
            <div class="actions">
              <button type="button" class="btn small" data-action="copy-list">${icon('copy')} Copy</button>
              ${done ? `<button type="button" class="btn small" data-action="stock-done">${icon('jarIn')} Move ${done} to pantry</button>` : ''}
              <button type="button" class="btn small ghost danger" data-action="clear-list" id="clearList">Clear list</button>
            </div>
          </div>
          <div class="bar"><span style="width:${items.length ? Math.round(done / items.length * 100) : 0}%"></span></div>
        </div>
        ${AISLE_ORDER.filter(a => groups[a]).map(a => `<section class="lgroup"><h3><span>${a}</span><span class="num">${groups[a].filter(i => !i.done).length} left</span></h3>
          ${groups[a].slice().sort((x, y) => x.done - y.done || x.name.localeCompare(y.name)).map(i => `<div class="litem ${i.done ? 'done' : ''}">
            <button type="button" class="ing-row" role="checkbox" aria-checked="${i.done}" data-action="tick" data-id="${esc(i.id)}">
              <span class="check">${icon('check')}</span>
              <span class="meta-col"><span class="name">${esc(i.name)}</span>${i.from.length ? `<span class="from">for ${esc(i.from.join(', '))}</span>` : ''}</span>
              ${i.qty ? `<span class="qty">${esc(amount(i.qty, i.unit, i.name))}</span>` : ''}
            </button>
            <button type="button" class="x" data-action="rm-item" data-id="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">${icon('x')}</button>
          </div>`).join('')}</section>`).join('')}` :
        `<div class="empty">${icon('list')}<h3>Nothing to buy yet</h3><p>Open a recipe and choose “Add missing to list”.</p><div class="row"><a class="btn primary" href="#plan">Plan the week</a><a class="btn" href="#kitchen">Browse recipes</a></div></div>`}
      </div>
    </div>`;
  }
  function listText() {
    const groups = {};
    state.list.filter(i => !i.done).forEach(i => (groups[i.aisle] = groups[i.aisle] || []).push(i));
    return AISLE_ORDER.filter(a => groups[a]).map(a => `${a.toUpperCase()}\n` + groups[a].map(i => `- ${cap(i.name)}${i.qty ? ' (' + amount(i.qty, i.unit, i.name) + ')' : ''}`).join('\n')).join('\n\n');
  }

  /* ---------- SAVED ---------- */
  function viewSaved() {
    const favs = [...state.favs].map(id => byId.get(id)).filter(r => r && !r.mine);
    const mine = RECIPES.filter(r => r.mine);
    return `<div class="page fade-in">
      ${mobileHead()}
      <header class="kitchen-head"><span class="eyebrow">Library</span><h1>Your recipes, all in one place.</h1>
      <p class="lede">Recipes you've added and the ones you've saved. They all work with your pantry, plan and shopping list.</p></header>
      ${statsHTML()}
      <section class="lib-section" aria-labelledby="mineTitle">
        <div class="section-head"><h2 id="mineTitle">My recipes ${mine.length ? `<span class="muted num">${mine.length}</span>` : ''}</h2>
          <a class="btn primary small" href="#add">${icon('plus')} Add a recipe</a></div>
        ${mine.length ? `<div class="grid">${mine.map(card).join('')}</div>` :
          `<div class="empty">${icon('sparkle')}<h3>Bring in recipes from anywhere</h3><p>Paste a link to an Instagram reel, TikTok, YouTube video or recipe site, or snap a photo of a cookbook page.${isPro() ? '' : ' Part of PantryPilot Pro.'}</p><div class="row"><a class="btn primary" href="#add">Add a recipe</a></div></div>`}
      </section>
      <section class="lib-section" aria-labelledby="savedTitle">
        <div class="section-head"><h2 id="savedTitle">Saved ${favs.length ? `<span class="muted num">${favs.length}</span>` : ''}</h2></div>
        ${favs.length ? `<div class="grid">${favs.map(card).join('')}</div>` : `<div class="empty">${icon('heart')}<h3>Nothing saved yet</h3><p>Tap the heart on any recipe and it will wait for you here.</p><div class="row"><a class="btn" href="#kitchen">Browse recipes</a></div></div>`}
      </section>
    </div>`;
  }

  /* ---------- sheet (dialog) ---------- */
  const sheet = $('#sheet');
  function openSheet(title, tools, body, onMount) {
    sheet.dataset.kind = '';
    sheet.innerHTML = `<div class="sheet-inner"><div class="sheet-head"><h2 id="sheetTitle" style="font-size:21px">${title}</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-tools">${tools || ''}</div><div class="sheet-body" id="sheetBody">${body}</div></div>`;
    if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute('open', '');
    onMount && onMount();
  }
  const closeSheet = () => { if (sheet.open) sheet.close(); else sheet.removeAttribute('open'); };
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

  function sheetPickRecipe(day, slot = 'dinner', note = '', people = 0) {
    const d = new Date(day + 'T00:00');
    const fits = r => (slot === 'breakfast' ? r.category === 'breakfast' : slot === 'lunch' ? r.category === 'lunch' : r.category === 'dinner') ? 0 : 1;
    const rows = q => forMe(RECIPES, true).filter(r => !q || r.haystack.includes(q.toLowerCase()))
      .sort((a, b) => fits(a) - fits(b) || match(a).missing.length - match(b).missing.length)
      .map(r => { const m = match(r); return `<button type="button" class="pick" data-action="plan-add" data-day="${day}" data-slot="${slot}" data-id="${r.id}"><img src="${esc(tiny(r.image))}" alt="" loading="lazy"><span><span class="t">${esc(r.title)}</span><span class="sub">${fmtMins(r.total)} · ${CAT_LABEL[r.category]}</span></span>${ring(m)}</button>`; }).join('') || '<p class="muted" style="padding:12px">No matches.</p>';
    openSheet(`Add ${slot} for ${esc(fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' }))}`,
      `<label class="field" for="sheetQ"><span class="sr-only">Search recipes</span>${icon('search')}<input class="input" id="sheetQ" type="search" placeholder="Search recipes" autocomplete="off"></label>${peopleStepper(people || (+state.prefs.household > 0 ? +state.prefs.household : 4))}<label class="lbl" for="planNote" style="margin-top:10px">Note <span class="muted" style="font-weight:400">(optional)</span></label><input class="input plain" id="planNote" maxlength="300" autocomplete="off" placeholder="e.g. double it for guests, use leftover rice" value="${esc(note || '')}">`,
      rows(''), () => { const i = $('#sheetQ'); i.addEventListener('input', () => { $('#sheetBody').innerHTML = rows(i.value.trim()); }); setTimeout(() => i.focus(), 30); });
  }
  let pickSlot = 'dinner';
  function sheetPickDay(id, slot, note = '', people = 0) {
    const r = byId.get(id), t = iso(today());
    pickSlot = slot || slotFor(id);
    const days = [...weekDays(0), ...weekDays(1)].filter(d => iso(d) >= t);
    openSheet(`Plan ${esc(r.title)}`, `<div class="chips" role="radiogroup" aria-label="Which meal">${SLOTS.map(([k, l]) => `<button type="button" class="chip" role="radio" data-action="pick-slot" data-id="${id}" data-v="${k}" aria-checked="${pickSlot === k}" aria-pressed="${pickSlot === k}">${l}</button>`).join('')}</div>${peopleStepper(people || servingsOf(r))}<label class="lbl" for="planNote" style="margin-top:10px">Note <span class="muted" style="font-weight:400">(optional)</span></label><input class="input plain" id="planNote" maxlength="300" autocomplete="off" placeholder="e.g. double it for guests, use leftover rice" value="${esc(note || '')}"><p class="note" style="margin-top:8px">Choose a day. You can change it later from the Plan tab.</p>`,
      `<div class="daypick">${days.map(d => { const k = iso(d), n = (state.plan[k]?.[pickSlot] || []).length; return `<button type="button" data-action="plan-add" data-day="${k}" data-slot="${pickSlot}" data-id="${id}"><span class="dow">${k === t ? 'Today' : esc(fmtDay(d, { weekday: 'short' }))}</span><span class="d">${esc(fmtDay(d, { month: 'short', day: 'numeric' }))}</span><span class="n">${n ? n + ' planned' : 'Free'}</span></button>`; }).join('')}</div>`);
  }

  /* ---------- toasts ---------- */
  function toast(msg, action) {
    const w = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${msg}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) el.querySelector('button').addEventListener('click', () => { action.run(); el.remove(); });
    w.appendChild(el);
    while (w.children.length > 2) w.firstChild.remove();
    setTimeout(() => el.remove(), action ? 5000 : 2800);
  }

  /* ---------- timers ---------- */
  const timers = [];
  let actx = null, tickH = null;
  const clock = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  function chime() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, .35, .7].forEach(t => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(.0001, actx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + t + .02);
        g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + t + .3);
        o.connect(g).connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + .32);
      });
    } catch { /* no audio available */ }
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { }
  }
  function startTimer(sec, label) {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch { }
    timers.push({ id: Math.random().toString(36).slice(2), label, total: sec, end: Date.now() + sec * 1000, done: false });
    renderTimers();
    if (!tickH) tickH = setInterval(tick, 500);
    toast(`Timer started · ${clock(sec)}`);
  }
  function renderTimers() {
    $('#timers').innerHTML = timers.map(t => `<div class="timer ${t.done ? 'ringing' : ''}" data-t="${t.id}">
      <span class="lbl">${esc(t.label)}</span>
      <span class="clock" data-clock>${t.done ? "Time's up" : clock((t.end - Date.now()) / 1000)}</span>
      <div class="btns">${t.done ? '' : `<button type="button" data-action="timer-add" data-t="${t.id}" aria-label="Add one minute">+1m</button>`}
        <button type="button" data-action="timer-x" data-t="${t.id}" aria-label="${t.done ? 'Dismiss timer' : 'Cancel timer'}">${icon('x')}</button></div>
      <div class="bar"><span data-bar style="width:${t.done ? 100 : Math.min(100, (1 - (t.end - Date.now()) / 1000 / t.total) * 100)}%"></span></div>
    </div>`).join('');
  }
  function tick() {
    if (!timers.length) { clearInterval(tickH); tickH = null; return; }
    let changed = false;
    timers.forEach(t => {
      const left = (t.end - Date.now()) / 1000;
      if (!t.done && left <= 0) { t.done = true; changed = true; chime(); toast(`Time's up: ${esc(t.label)}`); }
      const el = $(`[data-t="${t.id}"].timer`);
      if (el && !t.done) { el.querySelector('[data-clock]').textContent = clock(left); el.querySelector('[data-bar]').style.width = Math.min(100, (1 - left / t.total) * 100) + '%'; }
    });
    if (changed) renderTimers();
    if (timers.some(t => t.done) && Date.now() % 4000 < 500) chime();
  }

  /* ---------- cook mode ---------- */
  const cook = { id: null, i: 0, lock: null, lastFocus: null };
  const cookEl = $('#cook');
  function openCook(id) {
    cook.id = id; cook.i = 0; cook.lastFocus = document.activeElement;
    cookEl.hidden = false; document.body.style.overflow = 'hidden'; document.body.classList.add('cooking');
    renderCook();
    requestWake();
    $('#cookNext')?.focus();
  }
  function requestWake() {
    try { navigator.wakeLock?.request('screen').then(l => { cook.lock = l; l.addEventListener('release', () => { cook.lock = null; }); }).catch(() => { }); } catch { }
  }
  function closeCook() {
    stopVoice();
    cookEl.hidden = true; document.body.style.overflow = ''; document.body.classList.remove('cooking');
    try { cook.lock?.release(); } catch { } cook.lock = null;
    cook.lastFocus?.focus?.();
  }
  function renderCook() {
    renderCookInner();
    afterCookRender();
  }
  function renderCookInner() {
    const r = byId.get(cook.id); if (!r) return;
    const n = r.steps.length, i = cook.i, k = servingsOf(r) / r.servings;
    cookEl.innerHTML = `
      <div class="cook-top">
        <div class="t"><span class="eyebrow">Cook mode · serves ${servingsOf(r)}</span><h2 id="cookTitle">${esc(r.title)}</h2></div>
        ${cookVoiceButtons()}
        <button type="button" class="icon-btn" data-action="cook-close" aria-label="Exit cook mode">${icon('x')}</button>
      </div>
      <div class="cook-main">
        <div class="cook-step" aria-live="polite">
          <span class="count num">Step ${i + 1} of ${n}</span>
          <p>${stepHTML(r.steps[i], `${r.title} · step ${i + 1}`)}</p>
        </div>
        <details class="panel cook-ings" ${window.matchMedia('(min-width: 900px)').matches ? 'open' : ''}>
          <summary>Ingredients</summary>
          <ul class="ing-list">${r.ingredients.map(ing => `<li class="ing"><span class="ing-text"><span class="q">${esc(amount(ing.quantity * k, ing.unit, ing.item))}</span> ${esc(ing.item)}</span></li>`).join('')}</ul>
        </details>
      </div>
      <div class="cook-bottom">
        <button type="button" class="btn" data-action="cook-prev" ${i === 0 ? 'disabled style="visibility:hidden"' : ''}>${icon('left')} Back</button>
        <div class="dots" role="group" aria-label="Steps">${r.steps.map((_, j) => `<button type="button" class="${j === i ? 'on' : j < i ? 'past' : ''}" data-action="cook-go" data-i="${j}" aria-label="Go to step ${j + 1}" ${j === i ? 'aria-current="step"' : ''}></button>`).join('')}</div>
        <button type="button" class="btn primary" id="cookNext" data-action="${i === n - 1 ? 'cook-finish' : 'cook-next'}">${i === n - 1 ? `${icon('check')} Done` : `Next ${icon('right')}`}</button>
      </div>`;
  }

  /* ---------- accounts & sync ---------- */
  const B = window.PPBackend;
  const acct = { user: null, sync: 'idle', blocked: new Set(), lastId: undefined, deleteArmed: false };
  let syncTimer = null;
  const initial = n => esc((n || '?').trim()[0]?.toUpperCase() || '?');
  const avatar = (name, cls = '', emoji = '') => `<span class="avatar ${cls} ${emoji ? 'emoji' : ''}" aria-hidden="true">${emoji ? esc(emoji) : initial(name)}</span>`;
  function accountButton() {
    const u = acct.user;
    return `<button type="button" class="icon-btn account-btn" id="mobileAccount" data-action="account" aria-label="${u ? 'Your account' : 'Sign in'}">${u ? avatar(u.name, '', u.avatar) : icon('users')}</button>`;
  }
  function accountChip() {
    const u = acct.user;
    if (!u) return `<div class="acct-card"><p>Sign in to keep your pantry, list and plan in sync, and to comment on recipes.</p>
      <button type="button" class="btn primary small" data-action="account">Sign in or create account</button></div>`;
    const status = { saving: 'Syncing…', saved: 'Synced', error: 'Sync failed, retrying', idle: 'Synced' }[acct.sync];
    return `<button type="button" class="acct-row" data-action="account">${avatar(u.name, '', u.avatar)}<span style="min-width:0"><b>${esc(u.name)}${u.pro ? ' <span class="pro-tag">Pro</span>' : ''}</b><small class="${acct.sync === 'error' ? 'warn' : ''}">${status}</small></span></button>`;
  }
  const snapshot = () => ({ pantry: [...state.pantry], favs: [...state.favs], list: state.list, plan: state.plan, prefs: state.prefs, cooked: state.cooked, gifts: state.gifts, pantry_dates: state.pantryDates });
  function queueSync() {
    if (!B || !acct.user) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushSync, 700);
  }
  async function pushSync() {
    if (!acct.user) return;
    acct.sync = 'saving'; renderNav(currentView);
    try { await B.saveData(snapshot()); acct.sync = 'saved'; }
    catch { acct.sync = 'error'; clearTimeout(syncTimer); syncTimer = setTimeout(pushSync, 15000); }
    renderNav(currentView);
  }
  function mergeCloud(cloud) {
    if (!cloud) return;
    if (Array.isArray(cloud.pantry)) state.pantry = state.starter ? new Set(cloud.pantry) : new Set([...cloud.pantry, ...state.pantry]);
    if (Array.isArray(cloud.favs)) cloud.favs.forEach(id => state.favs.add(id));
    if (Array.isArray(cloud.list)) {
      const ids = new Set(cloud.list.map(i => i.id));
      state.list = [...cloud.list, ...state.list.filter(i => !ids.has(i.id))];
    }
    if (cloud.plan && typeof cloud.plan === 'object') {
      const merged = normalizePlan(cloud.plan);
      Object.entries(state.plan).forEach(([day, slots]) => {
        const m = merged[day] || (merged[day] = { breakfast: [], lunch: [], dinner: [] });
        SLOTS.forEach(([k]) => (slots[k] || []).forEach(id => { if (!m[k].includes(id)) m[k].push(id); }));
        if (slots.notes) m.notes = { ...(m.notes || {}), ...slots.notes };
        if (slots.people) m.people = { ...(m.people || {}), ...slots.people };
      });
      state.plan = merged;
    }
    if (cloud.prefs && typeof cloud.prefs === 'object' && Object.keys(cloud.prefs).length) { state.prefs = { ...state.prefs, ...cloud.prefs }; applyTheme(state.prefs.theme); }
    if (Array.isArray(cloud.cooked)) {
      const seen = new Set(cloud.cooked.map(c => c.id + c.at));
      state.cooked = [...cloud.cooked, ...state.cooked.filter(c => !seen.has(c.id + c.at))].slice(-2000);
    }
    if (Array.isArray(cloud.gifts)) state.gifts = [...new Set([...cloud.gifts, ...state.gifts])];
    if (cloud.pantry_dates && typeof cloud.pantry_dates === 'object') state.pantryDates = { ...state.pantryDates, ...cloud.pantry_dates };
    store.set('pantryDates', state.pantryDates);
    state.starter = false;
    store.set('pantry', [...state.pantry]); store.set('favs', [...state.favs]); store.set('list', state.list); store.set('plan', state.plan);
    store.set('prefs', state.prefs); store.set('cooked', state.cooked); store.set('gifts', state.gifts);
    applyGifts();
  }
  // On sign-out, take the person's synced data off this device so the next person starts clean.
  function clearLocalData() {
    clearTimeout(syncTimer);
    setUserRecipes([]); resetImport();
    state.pantry = new Set(STARTER.filter(x => INGREDIENTS.includes(x)));
    state.starter = true; state.favs = new Set(); state.list = []; state.plan = {};
    state.prefs = {}; applyTheme('auto'); state.cooked = []; state.gifts = []; state.myRatings = {}; state.pantryDates = {};
    lockGifts();
    leaveHouseholdLocal();
    ['pantry', 'favs', 'list', 'plan', 'prefs', 'cooked', 'gifts', 'pantryDates'].forEach(k => { try { localStorage.removeItem('pantrypilot:' + k); } catch { } });
  }
  async function onUser(u) {
    const id = u ? u.id : null;
    if (!acct.ready && !u && id === acct.lastId) { acct.ready = true; refresh(); return; }
    if (id === acct.lastId) { const proChanged = !!acct.user?.pro !== !!u?.pro; acct.user = u; if (proChanged) refresh(); else renderNav(currentView); return; }
    const wasSignedIn = acct.lastId != null, firstCheck = !acct.ready;
    acct.ready = true;
    acct.lastId = id; acct.user = u;
    if (u && /^#?(home)?$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#kitchen');
    if (firstCheck && !u) { refresh(); return; } acct.blocked = new Set(); acct.deleteArmed = false;
    if (u) {
      acct.sync = 'saving'; renderNav(currentView);
      try { mergeCloud(await B.loadData()); await B.saveData(snapshot()); acct.sync = 'saved'; }
      catch { acct.sync = 'error'; }
      try { acct.blocked = new Set(await B.listBlocked()); } catch { }
      try { setUserRecipes(await B.listRecipes()); } catch { }
      try { state.myRatings = await B.myRatings(); } catch { }
    }
    if (!u && wasSignedIn) { clearLocalData(); history.replaceState(null, '', location.pathname + location.search + '#home'); }
    refresh();
    if (sheet.open && sheet.dataset.kind === 'auth' && u) { closeSheet(); toast(`Signed in as ${esc(u.name)}`); }
    if (u) afterSignIn();
    else if (!u && wasSignedIn) toast('Signed out. Sign in again to get your pantry, list and plan back.');
  }

  const demoNote = () => B.mode === 'demo' ? `<p class="demo-note">${icon('sparkle')}<span><strong>Demo mode.</strong> Accounts and comments are saved only in this browser until the app is connected to its server.</span></p>` : '';
  const GUIDELINES = 'Be kind and stay on topic. No hate, harassment, threats, sexual content, spam or personal information. Comments that break these rules are removed, and repeat offenders lose their account.';
  function openAuth(mode = 'signin', msg = '') {
    const signup = mode === 'signup', reset = mode === 'reset';
    const title = reset ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back';
    const body = `<form class="form" id="authForm" data-mode="${mode}" novalidate>
      ${demoNote()}
      ${signup ? inviteBanner() : ''}
      ${signup ? `<label class="lbl" for="aName">Display name <span class="muted">shown on your comments</span></label>
        <input class="input plain" id="aName" autocomplete="nickname" maxlength="40" required>` : ''}
      <label class="lbl" for="aEmail">Email</label>
      <input class="input plain" id="aEmail" type="email" autocomplete="email" inputmode="email" required>
      ${reset ? '' : `<label class="lbl" for="aPass">Password ${signup ? '<span class="muted">at least 8 characters</span>' : ''}</label>
        <input class="input plain" id="aPass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required>`}
      ${signup ? `<label class="agree" for="aAgree"><input type="checkbox" id="aAgree" required><span>I agree to the community guidelines: ${GUIDELINES}</span></label>` : ''}
      <p class="form-msg" id="authMsg" role="alert">${esc(msg)}</p>
      <button class="btn primary" type="submit" id="authSubmit">${reset ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}</button>
      <div class="form-links">
        ${mode === 'signin' ? `<button type="button" class="linkish" data-action="auth-mode" data-mode="reset">Forgot password?</button>
          <span>New here? <button type="button" class="linkish" data-action="auth-mode" data-mode="signup">Create an account</button></span>` :
          `<span>Have an account? <button type="button" class="linkish" data-action="auth-mode" data-mode="signin">Sign in</button></span>`}
      </div>
    </form>`;
    openSheet(title, '', body, () => { sheet.dataset.kind = 'auth'; setTimeout(() => $(signup ? '#aName' : '#aEmail')?.focus(), 40); });
  }
  async function openAccountSheet() {
    const u = acct.user;
    if (!u) return openAuth('signin');
    const status = { saving: 'Syncing now…', saved: 'Your pantry, list, plan and saved recipes are synced to your account.', error: 'Couldn’t sync just now. PantryPilot will keep retrying.', idle: 'Synced.' }[acct.sync];
    openSheet('Your account', '', `<div class="form">
      ${demoNote()}
      <div class="acct-head">${avatar(u.name, 'lg', u.avatar)}<div style="min-width:0"><b>${esc(u.name)}</b><span class="muted">${esc(u.email)}</span></div></div>
      <p class="note">${status}</p>
      <div class="pro-row">${u.pro
        ? `<span><span class="pro-tag">Pro</span> ${!u.paidPro && u.bonusUntil ? `Free from invites until ${esc(new Date(u.bonusUntil).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }))}.` : 'No ads, and recipe import from links and photos.'}</span>${B.mode === 'demo' ? '<button type="button" class="linkish" data-action="pro-off">Turn off Pro (demo)</button>' : u.paidPro ? '<button type="button" class="btn small" data-action="manage-sub">Manage subscription</button>' : '<button type="button" class="btn small" data-action="paywall">Keep Pro</button>'}`
        : `<span>Remove ads and import recipes from links and photos.</span><button type="button" class="btn small primary" data-action="paywall">Get Pro</button>`}</div>
      ${profileFormHTML(u)}
      ${inviteCardHTML(u)}
      <div><span class="lbl">Appearance</span>${themeChips(state.prefs.theme || 'auto', 'set-theme')}</div>
      <div class="acct-actions"><a class="btn small" href="#welcome" data-action="close-sheet">Edit food preferences</a>${u.isAdmin ? '<a class="btn small" href="#admin" data-action="close-sheet">Moderation</a>' : ''}</div>
      <label class="switch-row" for="weeklyEmail"><input type="checkbox" id="weeklyEmail" ${state.prefs.weekly_email ? 'checked' : ''}><span><b>Weekly dinner ideas</b><span class="note">An email each Sunday with 3 dinners you can make from your pantry.</span></span></label>
      <div><span class="lbl">Blocked people</span><div id="blockedList" class="note">Loading…</div></div>
      <div class="acct-actions">
        <button type="button" class="btn" data-action="sign-out">Sign out</button>
      </div>
      <div class="danger-zone" id="dangerZone">
        <span class="lbl">Delete account</span>
        <p class="note">Permanently deletes your account, synced data and comments. This can’t be undone.</p>
        <button type="button" class="btn small danger" data-action="delete-start">Delete my account</button>
      </div>
    </div>`, () => { sheet.dataset.kind = 'account'; renderBlocked(); });
  }
  async function renderBlocked() {
    const el = $('#blockedList'); if (!el) return;
    const ids = [...acct.blocked];
    if (!ids.length) { el.textContent = 'You haven’t blocked anyone.'; return; }
    el.innerHTML = ids.map(id => `<div class="blocked-row"><span>${esc(acct.blockedNames?.[id] || 'Someone you blocked')}</span><button type="button" class="linkish" data-action="unblock" data-uid="${esc(id)}">Unblock</button></div>`).join('');
  }

  /* ---------- comments ---------- */
  const COMMENT_MAX = 1000;
  function commentsShell(r) {
    return `<section class="panel comments" aria-labelledby="cTitle">
      <div class="panel-head"><h2 id="cTitle" style="font-size:22px">Comments</h2><span class="note num" id="cCount"></span></div>
      <div id="commentList" class="c-list"><p class="note">Loading comments…</p></div>
      <div id="composer">${composerHTML(r.id)}</div>
    </section>`;
  }
  function composerHTML(rid) {
    if (!acct.user) return `<div class="c-signin"><p>Sign in to share a tip, a swap or how it turned out.</p>
      <div class="actions"><button type="button" class="btn primary small" data-action="auth-open" data-mode="signin">Sign in</button><button type="button" class="btn small" data-action="auth-open" data-mode="signup">Create account</button></div></div>`;
    return `<form id="commentForm" class="c-form" data-rid="${esc(rid)}">
      ${avatar(acct.user.name, '', acct.user.avatar)}
      <div class="c-field"><label class="sr-only" for="commentBody">Write a comment</label>
        <textarea id="commentBody" class="input plain" rows="3" maxlength="${COMMENT_MAX}" placeholder="Share a tip, a swap or how it turned out"></textarea>
        <div class="c-foot"><span class="note num" id="cLeft">${COMMENT_MAX} characters left</span><button class="btn primary small" type="submit" id="cPost">Post</button></div>
        <p class="form-msg" id="cMsg" role="alert"></p></div>
    </form>`;
  }
  function ago(isoStr) {
    const t = new Date(isoStr).getTime(); if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000); // never show "in 3 hours" for a clock that runs ahead
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  let commentCache = { rid: null, items: [] };
  async function loadComments(rid) {
    const el = $('#commentList'); if (!el) return;
    try {
      const items = await B.listComments(rid);
      if (location.hash.slice(8) !== rid) return;
      commentCache = { rid, items };
      acct.blockedNames = acct.blockedNames || {};
      items.forEach(c => { if (acct.blocked.has(c.userId)) acct.blockedNames[c.userId] = c.name; });
      renderComments();
    } catch (e) {
      el.innerHTML = `<p class="note">Couldn’t load comments. ${esc(e.message)} <button type="button" class="linkish" data-action="comments-retry" data-rid="${esc(rid)}">Try again</button></p>`;
    }
  }
  function renderComments() {
    const el = $('#commentList'); if (!el) return;
    const me = acct.user?.id;
    const reported = new Set(store.get('reported', []));
    const shown = commentCache.items.filter(c => !reported.has(c.id));
    const visible = shown.filter(c => !acct.blocked.has(c.userId));
    const hiddenN = shown.length - visible.length;
    $('#cCount').textContent = visible.length ? `${visible.length} comment${visible.length > 1 ? 's' : ''}` : '';
    el.innerHTML = (visible.length ? visible.map(c => `<article class="c-item" id="c-${esc(c.id)}">
        ${avatar(c.name, '', c.avatar)}
        <div class="c-main">
          <div class="c-meta"><button type="button" class="c-name" data-action="profile" data-uid="${esc(c.userId)}">${esc(c.name)}</button>${c.userId === me ? '<span class="you">You</span>' : ''}${c.rating ? `<span class="c-stars" aria-label="${c.rating} out of 5 stars">${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)}</span>` : ''}<time datetime="${esc(c.createdAt)}">${ago(c.createdAt)}</time></div>
          ${c.body ? `<p class="c-body">${esc(c.body)}</p>` : ''}
          ${c.photo && /^data:image\/jpeg;base64,/.test(c.photo) ? `<img class="c-photo" src="${c.photo}" alt="${esc(c.name)}'s photo of this recipe" loading="lazy">` : ''}
          <div class="c-acts">${c.userId === me
            ? `<button type="button" class="linkish" data-action="c-delete" data-cid="${esc(c.id)}">Delete</button>`
            : acct.user ? `<button type="button" class="linkish" data-action="c-report" data-cid="${esc(c.id)}">Report</button><button type="button" class="linkish" data-action="c-block" data-uid="${esc(c.userId)}" data-name="${esc(c.name)}">Block ${esc(c.name)}</button>` : ''}</div>
        </div></article>`).join('')
      : '<p class="note c-empty">No comments yet. Made it? Tell everyone how it went.</p>')
      + (hiddenN ? `<p class="note">${hiddenN} comment${hiddenN > 1 ? 's' : ''} from people you blocked ${hiddenN > 1 ? 'are' : 'is'} hidden.</p>` : '');
  }
  const REPORT_REASONS = [['spam', 'Spam or advertising'], ['harassment', 'Harassment or hate'], ['sexual', 'Sexual or violent content'], ['personal', 'Shares personal information'], ['other', 'Something else']];

  /* account + comment actions */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action;
    try {
      switch (a) {
        case 'account': openAccountSheet(); break;
        case 'auth-open': openAuth(el.dataset.mode); break;
        case 'auth-mode': openAuth(el.dataset.mode); break;
        case 'sign-out': closeSheet(); await B.signOut(); break;
        case 'delete-start': {
          $('#dangerZone').innerHTML = `<span class="lbl">Delete account</span>
            <p class="note">Type <strong>DELETE</strong> to permanently delete <strong>${esc(acct.user.email)}</strong>, its synced data and its comments.</p>
            <label class="sr-only" for="delConfirm">Type DELETE to confirm</label>
            <div class="row-2"><input class="input plain" id="delConfirm" autocomplete="off" autocapitalize="characters"><button type="button" class="btn small danger-fill" data-action="delete-confirm">Delete forever</button></div>
            <button type="button" class="linkish" data-action="account">Cancel</button>`;
          $('#delConfirm').focus();
          break;
        }
        case 'delete-confirm': {
          if ($('#delConfirm').value.trim().toUpperCase() !== 'DELETE') { $('#delConfirm').focus(); toast('Type DELETE to confirm.'); break; }
          el.disabled = true; el.textContent = 'Deleting…';
          await B.deleteAccount();
          closeSheet(); toast('Your account has been deleted.');
          break;
        }
        case 'unblock': await B.unblock(el.dataset.uid); acct.blocked.delete(el.dataset.uid); renderBlocked(); renderComments(); toast('Unblocked'); break;
        case 'comments-retry': loadComments(el.dataset.rid); break;
        case 'c-delete': {
          if (el.dataset.armed) { await B.deleteComment(el.dataset.cid); commentCache.items = commentCache.items.filter(c => c.id !== el.dataset.cid); renderComments(); toast('Comment deleted'); }
          else { el.dataset.armed = '1'; el.textContent = 'Tap again to delete'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Delete'; } }, 3000); }
          break;
        }
        case 'c-report':
          openSheet('Report comment', '<p class="note">Tell us what’s wrong. Comments reported by several people are hidden automatically while we review them.</p>',
            `<div class="reasons">${REPORT_REASONS.map(([v, l]) => `<button type="button" class="pick reason" data-action="c-report-send" data-cid="${esc(el.dataset.cid)}" data-reason="${v}"><span class="t">${l}</span></button>`).join('')}</div>`);
          break;
        case 'c-report-send':
          await B.reportComment(el.dataset.cid, el.dataset.reason);
          closeSheet();
          store.set('reported', [...new Set([...store.get('reported', []), el.dataset.cid])].slice(-500));
          renderComments();
          toast('Thanks for reporting. We’ve hidden it for you.');
          break;
        case 'c-block':
          openSheet(`Block ${esc(el.dataset.name)}?`, '', `<div class="form"><p>You won’t see comments from ${esc(el.dataset.name)} anywhere in PantryPilot. They won’t be told. You can unblock them from your account page.</p>
            <div class="actions"><button type="button" class="btn danger-fill" data-action="c-block-confirm" data-uid="${esc(el.dataset.uid)}" data-name="${esc(el.dataset.name)}">Block</button><button type="button" class="btn" data-action="close-sheet">Cancel</button></div></div>`);
          break;
        case 'c-block-confirm':
          await B.block(el.dataset.uid);
          acct.blocked.add(el.dataset.uid); (acct.blockedNames = acct.blockedNames || {})[el.dataset.uid] = el.dataset.name;
          closeSheet(); renderComments(); toast(`Blocked ${esc(el.dataset.name)}`);
          break;
      }
    } catch (err) {
      const msg = $('#authMsg') || $('#cMsg');
      if (msg && sheet.open) msg.textContent = err.message; else toast(esc(err.message));
      if (el.tagName === 'BUTTON' && a === 'delete-confirm') { el.disabled = false; el.textContent = 'Delete forever'; }
    }
  });

  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.id === 'authForm') {
      e.preventDefault();
      const mode = f.dataset.mode, msg = $('#authMsg'), btn = $('#authSubmit');
      const email = B.clean($('#aEmail').value).toLowerCase(), pass = $('#aPass')?.value || '', name = B.clean($('#aName')?.value || '');
      const problem = mode === 'signup' && !name ? 'Add a display name.'
        : !B.validEmail(email) ? 'Enter a valid email address.'
        : mode !== 'reset' && pass.length < 8 ? 'Passwords are at least 8 characters.'
        : mode === 'signup' && !$('#aAgree').checked ? 'Please agree to the community guidelines.' : '';
      if (problem) { msg.textContent = problem; return; }
      const label = btn.textContent; btn.disabled = true; btn.textContent = 'One moment…'; msg.textContent = '';
      try {
        if (mode === 'signup') {
          const { needsConfirmation } = await B.signUp({ email, password: pass, name, ref: pendingRef() });
          clearRef();
          if (needsConfirmation) { $('#sheetBody').innerHTML = `<div class="form"><p><strong>Check your email.</strong> We sent a link to ${esc(email)}. Open it on this device to finish creating your account.</p><button type="button" class="btn" data-action="close-sheet">Done</button></div>`; }
        } else if (mode === 'signin') await B.signIn({ email, password: pass });
        else { await B.resetPassword(email); $('#sheetBody').innerHTML = `<div class="form"><p>If ${esc(email)} has an account, a reset link is on its way.</p><button type="button" class="btn" data-action="close-sheet">Done</button></div>`; }
      } catch (err) { msg.textContent = err.message; }
      if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
    if (f.id === 'nameForm') {
      e.preventDefault();
      const n = B.clean($('#newName').value);
      if (!n) return;
      try { await B.updateName(n); toast('Name updated'); openAccountSheet(); } catch (err) { toast(esc(err.message)); }
    }
    if (f.id === 'commentForm') {
      e.preventDefault();
      const ta = $('#commentBody'), body = ta.value.trim(), btn = $('#cPost'), msg = $('#cMsg');
      if (!body) { ta.focus(); return; }
      btn.disabled = true; msg.textContent = '';
      try {
        await B.addComment(f.dataset.rid, body.slice(0, COMMENT_MAX));
        ta.value = ''; $('#cLeft').textContent = `${COMMENT_MAX} characters left`;
        await loadComments(f.dataset.rid);
        toast('Comment posted');
      } catch (err) { msg.textContent = err.message; }
      btn.disabled = false;
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'commentBody') { const left = COMMENT_MAX - e.target.value.length; $('#cLeft').textContent = `${left} character${left === 1 ? '' : 's'} left`; }
  });

  /* ---------- Pro: ads, paywall, imports, personal library ---------- */
  const isPro = () => !!acct.user?.pro;
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\.|^m\./, ''); } catch { return 'the web'; } };
  const PRICES = { year: { label: 'Yearly', price: '$29.99', per: 'a year', note: 'Save 50%' }, month: { label: 'Monthly', price: '$4.99', per: 'a month', note: '' } };

  // Ad placement. Shows PantryPilot's own Pro promotion until an ad network is connected
  // (AdMob in the iPhone app); either way, Pro members never see it.
  // With Google AdSense set up in config.js these show real ads; until then, PantryPilot's own Pro promotion.
  const ADS = (window.PP_CONFIG && window.PP_CONFIG.adsense) || {};
  const adsenseReady = where => /^ca-pub-\d{10,20}$/.test(ADS.client || '') && /^\d{6,12}$/.test((ADS.slots || {})[where] || '');
  function adSlot(where) {
    if (isPro()) return '';
    if (adsenseReady(where)) {
      return `<aside class="ad ad-live" aria-label="Advertisement" data-ad-slot="${where}">
        <span class="ad-label">Ad</span>
        <ins class="adsbygoogle" style="display:block" data-ad-client="${ADS.client}" data-ad-slot="${ADS.slots[where]}" data-ad-format="auto" data-full-width-responsive="true"></ins>
        <button type="button" class="linkish ad-remove" data-action="paywall">Remove ads</button>
      </aside>`;
    }
    return `<aside class="ad" aria-label="Advertisement" data-ad-slot="${where}">
      <span class="ad-label">Ad</span>
      <div class="ad-body"><b>Cook without the ads</b><span>PantryPilot Pro removes ads and imports recipes from Instagram, TikTok, YouTube or a photo.</span></div>
      <button type="button" class="btn small" data-action="paywall">Go ad-free</button>
    </aside>`;
  }

  // Load Google's ad script only once a real ad is on screen for someone who isn't Pro, then fill each new unit.
  let adScript = null;
  function fillAds() {
    const units = $$('ins.adsbygoogle:not([data-adsbygoogle-status])');
    if (!units.length || isPro()) return;
    if (!adScript) {
      adScript = document.createElement('script');
      adScript.async = true; adScript.crossOrigin = 'anonymous';
      adScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADS.client)}`;
      document.head.appendChild(adScript);
    }
    units.forEach(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blocked by an ad blocker */ } });
  }

  // Coming back from Stripe Checkout: Stripe tells the server a moment later, so wait for Pro to switch on.
  async function checkoutReturn() {
    let result = null;
    try { result = new URLSearchParams(location.search).get('checkout'); } catch { }
    if (!result) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { }
    if (result !== 'success') { toast('Checkout cancelled. You haven’t been charged.'); return; }
    if (isPro()) { toast('Welcome to PantryPilot Pro'); return; }
    toast('Payment confirmed. Switching on Pro…');
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const u = await B.refreshUser?.().catch(() => null);
      if (u?.pro) { toast('Welcome to PantryPilot Pro. Ads are gone and recipe import is on.'); return; }
    }
    toast('Pro is taking a little longer than usual. Refresh the page in a minute.');
  }

  let paywallPlan = 'year';
  function openPaywall() {
    const opt = k => `<button type="button" role="radio" class="plan-opt" aria-checked="${paywallPlan === k}" data-action="plan-pick" data-plan="${k}">
      <b>${PRICES[k].label}</b><span class="num">${PRICES[k].price} ${PRICES[k].per}</span>${PRICES[k].note ? `<em>${PRICES[k].note}</em>` : ''}</button>`;
    openSheet('PantryPilot Pro', '', `<div class="form paywall">
      ${demoNote()}
      <ul class="perks">
        <li>${icon('check')}<span><b>No ads</b> anywhere in PantryPilot.</span></li>
        <li>${icon('check')}<span><b>Import from a link.</b> Paste an Instagram reel, TikTok, YouTube video or recipe site and get the full recipe.</span></li>
        <li>${icon('check')}<span><b>Snap a recipe.</b> Photograph a cookbook page or a handwritten card.</span></li>
        <li>${icon('check')}<span><b>Scan your receipts.</b> Snap a grocery receipt to fill your pantry and see what you can cook.</span></li>
        <li>${icon('check')}<span><b>Your own library.</b> Imported recipes work with your pantry, meal plan and shopping list.</span></li>
      </ul>
      <div class="plans" role="radiogroup" aria-label="Choose a plan">${opt('year')}${opt('month')}</div>
      <button type="button" class="btn primary" data-action="pro-buy" id="proBuy">Start 7-day free trial</button>
      <p class="note">Free for 7 days on your first subscription, then ${PRICES[paywallPlan].price} ${PRICES[paywallPlan].per}, charged to your card through Stripe's secure checkout. Cancel anytime from your account page.${acct.user ? '' : ' You’ll create a free account first so Pro follows you to every device.'}</p>
      <p class="form-msg" id="payMsg" role="alert"></p>
    </div>`, () => { sheet.dataset.kind = 'paywall'; });
  }

  /* personal recipes */
  function toRecipe(row) {
    return prep({
      id: 'u-' + row.id, dbId: row.id, mine: !row.user_id || row.user_id === acct.user?.id,
      published: !!row.published, published_at: row.published_at || null, author: row.author || null,
      title: row.title, description: row.description || '', category: row.category || 'dinner', image: row.image || null,
      prep_time: row.prep_time || 0, cook_time: row.cook_time || 0, calories: row.calories || 0, servings: row.servings || 2,
      skill_level: row.skill_level || 'beginner', tags: row.tags || [], ingredients: row.ingredients || [], steps: row.steps || [],
      source_url: row.source_url || null, source_kind: row.source_kind || 'manual'
    });
  }
  function setUserRecipes(rows) {
    for (let i = RECIPES.length - 1; i >= 0; i--) if (RECIPES[i].mine) { byId.delete(RECIPES[i].id); RECIPES.splice(i, 1); }
    rows.map(toRecipe).forEach(r => { RECIPES.push(r); byId.set(r.id, r); });
    rebuildIndex();
  }
  function addUserRecipe(row) { const r = toRecipe(row); RECIPES.push(r); byId.set(r.id, r); rebuildIndex(); return r; }

  /* ingredient lines in the review form: "1½ cups flour" <-> {quantity, unit, item} */
  const UNIT_WORDS = new Set(['cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'pinch', 'pinches', 'clove', 'cloves', 'slice', 'slices', 'can', 'cans', 'sprig', 'sprigs', 'head', 'heads', 'portion', 'portions', 'bunch', 'handful', 'stick', 'sticks']);
  const VULGAR = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125 };
  function readQty(tok) {
    if (!tok) return null;
    const m = tok.match(/^(\d+)?([¼½¾⅓⅔⅛])$/); if (m) return (+(m[1] || 0)) + VULGAR[m[2]];
    if (/^\d+\/\d+$/.test(tok)) { const [a, b] = tok.split('/').map(Number); return b ? a / b : null; }
    if (/^\d*[.,]?\d+$/.test(tok)) return parseFloat(tok.replace(',', '.'));
    return null;
  }
  function parseIngLine(line) {
    const t = line.trim().split(/\s+/); let q = 0;
    const a = readQty(t[0]);
    if (a != null) { q = a; t.shift(); const b = readQty(t[0]); if (b != null && b < 1) { q += b; t.shift(); } }
    let unit = '';
    if (t.length > 1 && UNIT_WORDS.has(t[0].toLowerCase().replace(/\.$/, ''))) unit = baseUnit(t.shift().toLowerCase().replace(/\.$/, '').replace(/^lbs$/, 'lb'));
    return { item: t.join(' ').replace(/^of\s+/i, ''), quantity: Math.round(q * 1000) / 1000, unit };
  }
  const ingLine = i => [i.quantity ? fmtQty(i.quantity) : '', i.quantity ? unitFor(i.unit, i.quantity) : i.unit, i.item].filter(Boolean).join(' ');

  /* the Add a recipe screen */
  const imp = { tab: 'write', busy: false, draft: null, site: '', demo: false, photo: null, thumb: null, msg: '', needCaption: false, url: '', caption: '' };
  function resetImport() { Object.assign(imp, { busy: false, draft: null, site: '', demo: false, photo: null, thumb: null, msg: '', needCaption: false, url: '', caption: '', manual: false }); }
  function viewAdd() {
    const head = `<header class="kitchen-head"><a class="back" href="#saved">${icon('left')} Library</a>
      <span class="eyebrow">Add a recipe</span><h1>Add your recipes.</h1>
      <p class="lede">Write up a recipe of your own and share it with the community, or bring one in from a link or photo with Pro. Everything you add works with your pantry, plan and list.</p></header>`;
    let body;
    if (!acct.user) {
      body = `<div class="panel gate">${icon('users')}<h2>Sign in to add recipes</h2><p class="muted">Create a free account to write and share your own recipes. Importing from links and photos is part of PantryPilot Pro.</p>
        <div class="actions"><button type="button" class="btn primary" data-action="auth-open" data-mode="signup">Create account</button><button type="button" class="btn" data-action="auth-open" data-mode="signin">Sign in</button></div></div>`;
    } else if (imp.draft) {
      body = draftHTML();
    } else {
      const tab = (k, l, ic) => `<button type="button" role="tab" class="seg" id="tab-${k}" aria-selected="${imp.tab === k}" aria-controls="${k === 'link' ? 'linkForm' : 'pane-' + k}" data-action="imp-tab" data-tab="${k}">${icon(ic)} ${l}</button>`;
      body = `<div class="panel import">
        <div class="segs three" role="tablist" aria-label="How to add">${tab('write', 'Write it', 'list')}${tab('link', 'From a link', 'copy')}${tab('photo', 'From a photo', 'plus')}</div>
        ${imp.tab === 'write' ? writePane() : !isPro() ? proPitch() : imp.tab === 'link' ? `<form id="linkForm" class="form" role="tabpanel" aria-labelledby="tab-link" novalidate>
            <label class="lbl" for="impUrl">Link</label>
            <input class="input plain" id="impUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://www.instagram.com/reel/…" value="${esc(imp.url)}" ${imp.busy ? 'disabled' : ''}>
            <details class="cap" ${imp.needCaption || imp.caption ? 'open' : ''}><summary>Add the caption or description ${imp.needCaption ? '' : '(optional)'}</summary>
              <p class="note">Instagram and TikTok sometimes hide a post's text from apps. If the recipe is in the caption, copy it from the post and paste it here.</p>
              <label class="sr-only" for="impCaption">Caption or description</label>
              <textarea class="input plain" id="impCaption" rows="5" maxlength="8000" placeholder="Paste the caption here" ${imp.busy ? 'disabled' : ''}>${esc(imp.caption)}</textarea></details>
            <p class="form-msg" role="alert">${esc(imp.msg)}</p>
            <button class="btn primary" type="submit" ${imp.busy ? 'disabled' : ''}>${imp.busy ? '<span class="spin" aria-hidden="true"></span> Reading the recipe…' : `${icon('sparkle')} Get the recipe`}</button>
            ${imp.busy ? '<p class="note">This usually takes 10 to 30 seconds.</p>' : ''}
          </form>`
          : `<div class="form" role="tabpanel" id="pane-photo" aria-labelledby="tab-photo">
            <label class="dropzone ${imp.thumb ? 'has' : ''}" for="impPhoto">
              ${imp.thumb ? `<img src="${imp.thumb}" alt="Your recipe photo">` : `${icon('plus')}<b>Take or choose a photo</b><span class="note">A cookbook page, recipe card or screenshot. Make sure the text is sharp and fills the frame.</span>`}
            </label>
            <input id="impPhoto" class="sr-only" type="file" accept="image/*" ${imp.busy ? 'disabled' : ''}>
            <p class="form-msg" role="alert">${esc(imp.msg)}</p>
            ${imp.thumb ? `<div class="actions"><button type="button" class="btn primary" data-action="imp-photo-read" ${imp.busy ? 'disabled' : ''}>${imp.busy ? '<span class="spin" aria-hidden="true"></span> Reading the recipe…' : `${icon('sparkle')} Read this recipe`}</button>
              <button type="button" class="btn" data-action="imp-photo-clear" ${imp.busy ? 'disabled' : ''}>Choose another</button></div>` : ''}
            ${imp.busy ? '<p class="note">This usually takes 10 to 30 seconds.</p>' : ''}
          </div>`}
      </div>`;
    }
    return `<div class="page fade-in">${mobileHead()}${head}${body}</div>`;
  }
  function draftHTML() {
    const d = imp.draft;
    const num = (id, label, v, max) => `<div><label class="lbl" for="${id}">${label}</label><input class="input plain num" id="${id}" type="number" inputmode="numeric" min="0" max="${max}" value="${v}"></div>`;
    return `<form id="draftForm" class="panel draft" novalidate>
      ${imp.demo ? `<p class="demo-note">${icon('sparkle')}<span><strong>Demo mode.</strong> This is a sample result. Once the app is connected to its server, PantryPilot reads the real link or photo.</span></p>` : ''}
      <p class="note">${imp.manual ? 'Write your recipe below. You can edit the details later by deleting and re-adding it.' : `Found on ${esc(imp.site || 'your link')}. Check it over and fix anything before saving.`}</p>
      <div id="draftImg">${d.image ? `<img class="draft-img" src="${esc(d.image)}" alt="">` : ''}</div>
      <label class="btn small photo-btn" for="dPhoto">${icon('plus')} ${d.image ? 'Change photo' : 'Add a photo'}</label>
      <input id="dPhoto" class="sr-only" type="file" accept="image/*">
      <label class="lbl" for="dTitle">Title</label><input class="input plain" id="dTitle" maxlength="120" value="${esc(d.title)}" required>
      <label class="lbl" for="dDesc">Description</label><textarea class="input plain" id="dDesc" rows="2" maxlength="600">${esc(d.description)}</textarea>
      <div class="draft-nums">
        <div><label class="lbl" for="dCat">Meal</label><select class="input plain" id="dCat">${Object.entries(CAT_LABEL).map(([v, l]) => `<option value="${v}" ${d.category === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${num('dServ', 'Serves', d.servings, 50)}${num('dPrep', 'Prep (min)', d.prep_time, 1440)}${num('dCook', 'Cook (min)', d.cook_time, 2880)}${num('dKcal', 'Kcal / serving', d.calories, 5000)}
      </div>
      <label class="lbl" for="dIngs">Ingredients <span class="muted">one per line, e.g. “1½ cups flour”</span></label>
      <textarea class="input plain" id="dIngs" rows="${Math.min(14, d.ingredients.length + 2)}">${esc(d.ingredients.map(ingLine).join('\n'))}</textarea>
      <label class="lbl" for="dSteps">Method <span class="muted">one step per line</span></label>
      <textarea class="input plain" id="dSteps" rows="${Math.min(14, d.steps.length * 2 + 2)}">${esc(d.steps.join('\n'))}</textarea>
      <label class="switch-row" for="dShare"><input type="checkbox" id="dShare" ${(d.source_kind || 'manual') === 'manual' ? 'checked' : ''}><span><b>Share with the PantryPilot community</b>
        <span class="note">${(d.source_kind || 'manual') === 'manual' ? 'Anyone can see shared recipes, rate them and comment. You can make it private again anytime.' : 'Only share recipes you created yourself. Recipes from other people’s posts, videos or cookbooks belong to them.'}</span></span></label>
      <p class="form-msg" id="draftMsg" role="alert"></p>
      <div class="actions"><button class="btn primary" type="submit" id="draftSave">${icon('check')} Save recipe</button><button type="button" class="btn" data-action="imp-reset">Start over</button></div>
    </form>`;
  }
  function mountAdd() { /* inputs keep their values through imp; nothing else to wire */ }

  function loadImage(file) {
    return new Promise((res, rej) => { const url = URL.createObjectURL(file), img = new Image(); img.onload = () => res(img); img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Couldn’t open that photo. Try a JPEG or PNG.')); }; img.src = url; });
  }
  function jpeg(img, max, q) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  async function runImport(payload) {
    imp.busy = true; imp.msg = ''; refresh();
    try {
      const res = await B.importRecipe(payload);
      imp.draft = { ...res.recipe, image: payload.kind === 'photo' ? imp.thumb : res.recipe.image };
      imp.site = res.site; imp.demo = !!res.demo; imp.needCaption = false;
    } catch (e) {
      imp.msg = e.message; imp.needCaption = e.code === 'need_caption';
      if (e.code === 'not_pro') { B.refreshUser?.(); }
    }
    imp.busy = false;
    if (currentView === 'add') { refresh(); if (imp.draft) window.scrollTo(0, 0); }
    else if (imp.draft) toast('Your recipe is ready to review', { label: 'Review', run: () => { location.hash = 'add'; } });
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    switch (el.dataset.action) {
      case 'paywall': openPaywall(); break;
      case 'plan-pick': paywallPlan = el.dataset.plan; openPaywall(); break;
      case 'pro-buy': {
        if (!acct.user) { openAuth('signup', ''); toast('Create a free account first, then start your trial.'); break; }
        el.disabled = true; el.textContent = 'One moment…';
        if (B.mode !== 'demo') el.textContent = 'Opening secure checkout…';
        try { await B.startPro(true, paywallPlan); closeSheet(); toast('Welcome to PantryPilot Pro'); }
        catch (err) { $('#payMsg').textContent = err.message; el.disabled = false; el.textContent = 'Start 7-day free trial'; }
        break;
      }
      case 'pro-off': await B.startPro(false); closeSheet(); toast('Pro turned off (demo)'); break;
      case 'manage-sub':
        el.disabled = true; el.textContent = 'Opening…';
        try { await B.manageSubscription(); }
        catch (err) { toast(esc(err.message)); el.disabled = false; el.textContent = 'Manage subscription'; }
        break;
      case 'imp-tab': imp.tab = el.dataset.tab; imp.msg = ''; refresh(); break;
      case 'imp-photo-clear': imp.photo = imp.thumb = null; imp.msg = ''; refresh(); break;
      case 'imp-photo-read': if (imp.photo && !imp.busy) runImport({ kind: 'photo', image: imp.photo }); break;
      case 'imp-reset': resetImport(); refresh(); break;
      case 'recipe-delete': {
        const r = byId.get(el.dataset.id); if (!r) break;
        if (!el.dataset.armed) { el.dataset.armed = '1'; el.lastChild.textContent = ' Tap again to delete'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.lastChild.textContent = ' Delete'; } }, 3000); break; }
        try { await B.deleteRecipe(r.dbId); setUserRecipes(RECIPES.filter(x => x.mine && x.id !== r.id).map(x => ({ ...x, id: x.dbId }))); location.hash = 'saved'; toast(`Deleted ${esc(r.title)}`); }
        catch (err) { toast(esc(err.message)); }
        break;
      }
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id !== 'impPhoto' || !e.target.files?.[0]) return;
    try {
      const img = await loadImage(e.target.files[0]);
      imp.photo = jpeg(img, 1600, 0.85); imp.thumb = jpeg(img, 700, 0.72); imp.msg = '';
    } catch (err) { imp.msg = err.message; }
    refresh();
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'impUrl') imp.url = e.target.value;
    if (e.target.id === 'impCaption') imp.caption = e.target.value;
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'linkForm') {
      e.preventDefault();
      if (imp.busy) return;
      const url = imp.url.trim(), caption = imp.caption.trim();
      if (!url && !caption) { imp.msg = 'Paste a link first.'; refresh(); return; }
      if (url && !/^https?:\/\/\S+\.\S+/.test(url)) { imp.msg = 'That doesn’t look like a full link. It should start with https://'; refresh(); return; }
      runImport({ kind: 'link', url, caption });
    }
    if (e.target.id === 'draftForm') {
      e.preventDefault();
      const v = id => $('#' + id).value, n = (id, d) => { const x = parseInt(v(id), 10); return Number.isFinite(x) && x >= 0 ? x : d; };
      const ingredients = v('dIngs').split('\n').map(l => l.trim()).filter(Boolean).map(parseIngLine).filter(i => i.item);
      const steps = v('dSteps').split('\n').map(l => l.trim()).filter(Boolean);
      const title = B.clean(v('dTitle'));
      const msg = $('#draftMsg');
      if (!title) { msg.textContent = 'Give the recipe a title.'; return; }
      if (!ingredients.length || !steps.length) { msg.textContent = 'Add at least one ingredient and one step.'; return; }
      const row = {
        title, description: B.clean(v('dDesc')), category: v('dCat'),
        servings: Math.max(1, n('dServ', 2)), prep_time: n('dPrep', 0), cook_time: n('dCook', 0), calories: n('dKcal', 0),
        skill_level: imp.draft.skill_level || 'beginner', tags: imp.draft.tags || [], ingredients, steps,
        image: imp.draft.image || null, source_url: imp.draft.source_url || null, source_kind: imp.draft.source_kind || 'manual',
        published: !!$('#dShare')?.checked
      };
      const btn = $('#draftSave'); btn.disabled = true;
      try {
        const saved = await B.saveRecipe(row);
        const r = addUserRecipe(saved);
        resetImport();
        if (r.published) state.comm.loaded = false;
        location.hash = 'recipe-' + r.id;
        toast(r.published ? 'Saved and shared with the community' : 'Saved to your library');
      } catch (err) { msg.textContent = err.message; btn.disabled = false; }
    }
  });

  /* ===================================================================
   * Personal touches: preferences, allergies, ratings, "I made this",
   * stats and badges, profiles, invites and the birthday gift.
   * =================================================================== */

  /* ---------- diet and allergies ---------- */
  const ALLERGENS = {
    dairy: { label: 'Dairy', re: /\b(butter|buttermilk|milk|cream|cheese|parmesan|mozzarella|cheddar|feta|cotija|yogurt|ghee|caramel|brioche)\b/ },
    eggs: { label: 'Eggs', re: /\beggs?\b|brioche|mayonnaise/ },
    gluten: { label: 'Gluten', re: /flour|bread|sourdough|\bbuns?\b|brioche|panko|rigatoni|spaghetti|pasta|noodle|ramen|soba|soy sauce|oyster sauce|\bbeer\b|farro|(?<!corn )tortilla|pastry|baguette|pita/ },
    nuts: { label: 'Tree nuts', re: /walnut|pistachio|almond|pecan|cashew|hazelnut|macadamia/ },
    peanuts: { label: 'Peanuts', re: /peanut/ },
    sesame: { label: 'Sesame', re: /sesame|tahini/ },
    fish: { label: 'Fish', re: /salmon|\bfish\b|tuna|anchov|\bcod\b/ },
    shellfish: { label: 'Shellfish', re: /shrimp|prawn|crab|lobster|oyster/ },
    soy: { label: 'Soy', re: /\bsoy\b|miso|edamame|tofu/ }
  };
  const MEAT_RE = /chicken|beef|steak|pork|bacon|\bham\b|sausage|prosciutto|turkey|lamb|salmon|\bfish\b|tuna|anchov|shrimp|prawn|oyster sauce|gelatin/;
  const DIET_OPTIONS = [['', 'No restrictions'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['gluten-free', 'Gluten-free'], ['dairy-free', 'Dairy-free']];
  function allergensIn(item) {
    const s = String(item).toLowerCase().replace(/coconut milk|oat milk|peanut butter/g, m => m.startsWith('peanut') ? 'peanut' : m.startsWith('oat') ? 'oat drink' : 'coconut');
    return Object.keys(ALLERGENS).filter(k => ALLERGENS[k].re.test(s));
  }
  function allergensOf(r) {
    if (!r._al) {
      const set = new Set(), items = r.ingredients.map(i => String(i.item).toLowerCase());
      items.forEach(i => allergensIn(i).forEach(a => set.add(a)));
      if (items.some(i => MEAT_RE.test(i))) set.add('meat');
      if (items.some(i => /honey/.test(i))) set.add('honey');
      r._al = set;
    }
    return r._al;
  }
  function dietOk(r, diet = state.prefs.diet) {
    const al = allergensOf(r);
    if (diet === 'vegetarian') return !al.has('meat');
    if (diet === 'vegan') return !['meat', 'dairy', 'eggs', 'honey'].some(x => al.has(x));
    if (diet === 'gluten-free') return !al.has('gluten');
    if (diet === 'dairy-free') return !al.has('dairy');
    return true;
  }
  const allergyHits = r => (state.prefs.allergies || []).filter(a => allergensOf(r).has(a));
  // Recipes that fit this person's diet, and (unless they chose to see them) their allergies. Their own recipes always show.
  function forMe(list, strict = false) {
    return list.filter(r => r.mine || (dietOk(r) && ((!strict && state.showAllergens) || !allergyHits(r).length)));
  }
  const allergyBadge = r => { const h = allergyHits(r); return h.length ? `<span class="allergy-badge">${icon('flame')} Contains ${esc(h.map(a => ALLERGENS[a].label.toLowerCase()).join(', '))}</span>` : ''; };
  const allergyWarning = r => { const h = allergyHits(r); return h.length ? `<div class="allergy-bar" role="note"><strong>Heads up:</strong> this recipe contains ${esc(h.map(a => ALLERGENS[a].label.toLowerCase()).join(' and '))}, which you said to avoid. The ingredients are marked below.</div>` : ''; };
  function prefsNote() {
    const parts = [];
    const diet = DIET_OPTIONS.find(d => d[0] === state.prefs.diet && d[0]);
    if (diet) parts.push(`${diet[1].toLowerCase()} recipes only`);
    const hidden = RECIPES.filter(r => !r.mine && dietOk(r) && allergyHits(r).length).length;
    if (hidden) parts.push(state.showAllergens
      ? `showing ${hidden} with your allergens <button type="button" class="linkish" data-action="toggle-allergens">Hide them</button>`
      : `${hidden} hidden for your allergies <button type="button" class="linkish" data-action="toggle-allergens">Show</button>`);
    return parts.length ? `${cap(parts.join(' · '))} · <a href="#welcome" class="linkish">Change</a>` : '';
  }

  /* ---------- ratings ---------- */
  const starsMini = id => { const s = state.ratings[id]; return s?.count ? `<span class="rating" title="${s.average} out of 5 from ${s.count} rating${s.count > 1 ? 's' : ''}">★ ${s.average.toFixed(1)} <small>(${s.count})</small></span>` : ''; };
  function starsLine(id) {
    const s = state.ratings[id], mine = state.myRatings[id];
    if (!s?.count && !mine) return '';
    return `<span class="tag rating-tag">★ ${s?.count ? `${s.average.toFixed(1)} · ${s.count} rating${s.count > 1 ? 's' : ''}` : ''}${mine ? `${s?.count ? ' · ' : ''}you gave ${mine}` : ''}</span>`;
  }
  async function loadRatings(rerender = true) {
    try { state.ratings = await B.ratingSummary(); } catch { return; }
    if (rerender && ['kitchen', 'recipe', 'saved'].includes(currentView)) refresh();
  }

  /* ---------- "Picked for you" ---------- */
  const CUISINES = [['american', 'Comfort & American'], ['italian', 'Italian'], ['asian', 'Asian'], ['mexican', 'Mexican'], ['mediterranean', 'Mediterranean & Middle Eastern'], ['indian', 'Indian'], ['baking', 'Baking & sweets']];
  function pickedForYou(feature) {
    const p = state.prefs;
    if (!p.onboarded || !(p.cuisines?.length || p.level)) return '';
    const lvl = { beginner: 1, intermediate: 2, advanced: 3 }[p.level] || 2;
    const scored = forMe(RECIPES, true).filter(r => r.id !== feature.id && !r.birthday)
      .map(r => ({ r, s: ((p.cuisines || []).includes(r.cuisine) ? 3 : 0) + (SKILL[r.skill_level] <= lvl ? 1 : -1) + match(r).pct * 2 + (state.favs.has(r.id) ? -1 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.r);
    if (!scored.length) return '';
    return `<section class="picked" aria-labelledby="pickedTitle">
      <div class="section-head"><h2 id="pickedTitle">Picked for you</h2><a class="linkish" href="#welcome">Edit your tastes</a></div>
      <div class="picked-row">${scored.map(card).join('')}</div>
    </section>`;
  }

  /* ---------- onboarding (#welcome) ---------- */
  const STAPLE_TILES = ['olive oil', 'butter', 'eggs', 'all-purpose flour', 'garlic', 'onion', 'granulated sugar', 'brown sugar', 'milk', 'lemon', 'lime',
    'soy sauce', 'parmesan', 'baking powder', 'baking soda', 'honey', 'vegetable stock', 'heavy cream', 'tomato paste', 'crushed tomatoes', 'chili flakes',
    'cocoa powder', 'rice vinegar', 'sesame oil', 'yogurt', 'avocado', 'ground cumin', 'smoked paprika', 'maple syrup', 'ginger', 'cilantro', 'scallions'];
  const AVATARS = ['🍳', '🥑', '🍕', '🌮', '🍜', '🥐', '🍰', '🧁', '🥗', '🍓', '🍋', '🌶️', '🧄', '🍝', '🥞', '🍪', '☕', '🍣', '🥘', '🧀', '🍔', '🥕', '🍩', '🫐'];
  const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));
  const ob = { step: 0, draft: null };
  function obDraft() {
    if (!ob.draft) {
      const p = state.prefs, u = acct.user || {};
      ob.draft = { diet: p.diet || '', allergies: [...(p.allergies || [])], level: p.level || '', household: p.household || 0, cuisines: [...(p.cuisines || [])],
        avatar: u.avatar || '', bio: u.bio || '', birthday: p.birthday || null, weekly_email: !!p.weekly_email };
    }
    return ob.draft;
  }
  const OB_STEPS = ['look', 'pantry', 'diet', 'cook', 'cuisines', 'about', 'pro'];
  const obSteps = () => OB_STEPS.filter(s => s !== 'pro' || !isPro());
  function viewWelcome() {
    if (!acct.user) return `<div class="page fade-in">${mobileHead()}<div class="panel gate">${icon('users')}<h2>Sign in to set up your kitchen</h2><div class="actions"><button type="button" class="btn primary" data-action="auth-open" data-mode="signup">Create account</button><button type="button" class="btn" data-action="auth-open" data-mode="signin">Sign in</button></div></div></div>`;
    const d = obDraft(), steps = obSteps(), step = steps[Math.min(ob.step, steps.length - 1)], n = Math.min(ob.step, steps.length - 1);
    const chip = (action, v, label, on, cls = '') => `<button type="button" class="chip ${cls}" data-action="${action}" data-v="${esc(v)}" aria-pressed="${on}">${label}</button>`;
    let body = '';
    if (step === 'look') {
      body = `<h1>Light or dark?</h1><p class="lede">Pick how PantryPilot looks. You can change this any time in Your account.</p>
        ${themeChips(state.prefs.theme || 'auto', 'set-theme')}`;
    } else if (step === 'pantry') {
      const tiles = STAPLE_TILES.filter(k => INGREDIENTS.includes(k));
      body = `<h1>What's in your kitchen?</h1><p class="lede">Tap everything you have right now. PantryPilot uses this to show what you can cook tonight. You can add the rest later in the Pantry tab.</p>
        <div class="tiles">${tiles.map(k => `<button type="button" class="tile" data-action="ob-pantry" data-v="${esc(k)}" aria-pressed="${state.pantry.has(k)}">${esc(cap(k))}</button>`).join('')}</div>
        <p class="note num" id="obPantryCount">${state.pantry.size} items in your pantry</p>`;
    } else if (step === 'diet') {
      body = `<h1>Any diet or allergies?</h1><p class="lede">We'll only show recipes that fit your diet, and warn you about ingredients you need to avoid.</p>
        <h3 class="ob-h">Diet</h3><div class="chips">${DIET_OPTIONS.map(([v, l]) => chip('ob-diet', v, l, d.diet === v)).join('')}</div>
        <h3 class="ob-h">Allergies and things you avoid</h3><div class="chips">${Object.entries(ALLERGENS).map(([k, a]) => chip('ob-allergy', k, a.label, d.allergies.includes(k))).join('')}</div>
        <p class="note">Always check labels. PantryPilot spots common allergens by ingredient name, and can't know about cross-contamination or brand differences.</p>`;
    } else if (step === 'cook') {
      const lv = [['beginner', 'Just starting', 'Simple recipes with clear steps'], ['intermediate', 'Comfortable', 'Happy with most weeknight recipes'], ['confident', 'Confident', 'Bring on the projects']];
      body = `<h1>How do you like to cook?</h1>
        <h3 class="ob-h">Your cooking level</h3><div class="level-cards">${lv.map(([v, t, s]) => `<button type="button" class="level-card" data-action="ob-level" data-v="${v === 'confident' ? 'advanced' : v}" aria-pressed="${d.level === (v === 'confident' ? 'advanced' : v)}"><b>${t}</b><span>${s}</span></button>`).join('')}</div>
        <h3 class="ob-h">How many people do you usually cook for?</h3><div class="chips">${[1, 2, 3, 4, 6].map(v => chip('ob-house', v, v === 6 ? '6 or more' : v === 1 ? 'Just me' : String(v), +d.household === v)).join('')}</div>
        <p class="note">Recipes will open already scaled to this many servings.</p>`;
    } else if (step === 'cuisines') {
      body = `<h1>What do you love to eat?</h1><p class="lede">Pick as many as you like. We'll put these first in "Picked for you".</p>
        <div class="chips">${CUISINES.map(([v, l]) => chip('ob-cuisine', v, l, d.cuisines.includes(v))).join('')}</div>`;
    } else if (step === 'about') {
      const days = Array.from({ length: 31 }, (_, i) => i + 1);
      body = `<h1>A little about you</h1><p class="lede">This shows next to your comments. All of it is optional.</p>
        <h3 class="ob-h">Pick an avatar</h3><div class="avatar-grid">${['', ...AVATARS].map(a => `<button type="button" class="avatar-pick" data-action="ob-avatar" data-v="${esc(a)}" aria-pressed="${d.avatar === a}" aria-label="${a ? 'Avatar ' + a : 'Use my initial'}">${a ? esc(a) : initial(acct.user.name)}</button>`).join('')}</div>
        <label class="lbl" for="obBio">Short bio <span class="muted">up to 160 characters</span></label>
        <textarea class="input plain" id="obBio" rows="2" maxlength="160" placeholder="Home cook who loves one-pan dinners">${esc(d.bio)}</textarea>
        <h3 class="ob-h">Your birthday</h3><p class="note">We'll give you a few special cake recipes on your birthday. We only ask for the month and day.</p>
        <div class="row-2"><label class="sr-only" for="obMonth">Birth month</label><select class="input plain" id="obMonth"><option value="">Month</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${d.birthday?.m === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <label class="sr-only" for="obDay">Birth day</label><select class="input plain" id="obDay"><option value="">Day</option>${days.map(x => `<option value="${x}" ${d.birthday?.d === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <label class="switch-row" for="obWeekly"><input type="checkbox" id="obWeekly" ${d.weekly_email ? 'checked' : ''}><span><b>Send me weekly dinner ideas</b><span class="note">One email each Sunday with 3 dinners you can make from your pantry. Unsubscribe anytime.</span></span></label>`;
    } else if (step === 'pro') {
      body = `<h1>Want the full kitchen?</h1><p class="lede">Try PantryPilot Pro free for 7 days.</p>
        <ul class="perks"><li>${icon('check')}<span><b>No ads</b> anywhere in PantryPilot.</span></li>
          <li>${icon('check')}<span><b>Import any recipe</b> from Instagram, TikTok, YouTube or a recipe site.</span></li>
          <li>${icon('check')}<span><b>Snap a recipe</b> from a cookbook page or a handwritten card.</span></li></ul>
        <div class="actions"><button type="button" class="btn primary" data-action="paywall">Start free trial</button></div>`;
    }
    const last = n === steps.length - 1;
    return `<div class="page fade-in welcome">${mobileHead()}
      <div class="ob-progress" aria-label="Step ${n + 1} of ${steps.length}"><span class="eyebrow">Set up your kitchen · step ${n + 1} of ${steps.length}</span><div class="bar"><span style="width:${Math.round((n + 1) / steps.length * 100)}%"></span></div></div>
      <section class="panel ob-panel">${body}</section>
      <div class="ob-nav">
        ${n > 0 ? `<button type="button" class="btn" data-action="ob-back">${icon('left')} Back</button>` : '<span></span>'}
        <span style="flex:1"></span>
        <button type="button" class="btn ghost" data-action="ob-finish">${last ? 'Maybe later' : 'Skip setup'}</button>
        ${last && step === 'pro' ? '' : `<button type="button" class="btn primary" data-action="${last ? 'ob-finish' : 'ob-next'}">${last ? 'Finish' : 'Next'} ${last ? icon('check') : icon('right')}</button>`}
      </div>
    </div>`;
  }
  function obReadAbout() {
    const d = obDraft();
    if ($('#obBio')) d.bio = B.clean($('#obBio').value).slice(0, 160);
    if ($('#obMonth')) { const m = +$('#obMonth').value, dd = +$('#obDay').value; d.birthday = m && dd ? { m, d: dd } : null; }
    if ($('#obWeekly')) d.weekly_email = $('#obWeekly').checked;
  }
  async function obFinish() {
    obReadAbout();
    const d = obDraft();
    state.prefs = { ...state.prefs, diet: d.diet, allergies: d.allergies, level: d.level, household: d.household, cuisines: d.cuisines, birthday: d.birthday, weekly_email: d.weekly_email, onboarded: true };
    save.prefs();
    const u = acct.user;
    if (u && (d.avatar !== (u.avatar || '') || d.bio !== (u.bio || ''))) { try { await B.updateProfile({ avatar: d.avatar, bio: d.bio }); } catch (e) { toast(esc(e.message)); } }
    ob.step = 0; ob.draft = null;
    location.hash = 'kitchen';
    toast('Your kitchen is set up. Change it anytime from your account.');
    checkBirthday();
  }

  /* ---------- stats and badges ---------- */
  const dayKey = d => iso(new Date(d));
  function stats() {
    const days = [...new Set(state.cooked.map(c => dayKey(c.at)))].sort();
    let best = 0, run = 0, prev = null;
    days.forEach(k => { const t = new Date(k + 'T00:00'); run = prev && (t - prev) / 864e5 === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    let streak = 0; const d = today();
    if (!days.includes(iso(d))) d.setDate(d.getDate() - 1);
    while (days.includes(iso(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { cooked: state.cooked.length, saved: state.favs.size, streak, best, pantry: state.pantry.size,
      planned: allPlanIds().length, added: RECIPES.filter(r => r.mine).length };
  }
  const BADGES = [
    ['first', 'First dish', 'Cook your first recipe', s => s.cooked >= 1],
    ['five', 'Five-dish cook', 'Cook 5 recipes', s => s.cooked >= 5],
    ['twenty', 'Kitchen regular', 'Cook 20 recipes', s => s.cooked >= 20],
    ['streak', 'On a roll', 'Cook 7 days in a row', s => s.best >= 7],
    ['collector', 'Collector', 'Save 10 recipes', s => s.saved >= 10],
    ['stocked', 'Well stocked', 'Have 25 items in your pantry', s => s.pantry >= 25],
    ['planner', 'Planner', 'Plan 5 meals', s => s.planned >= 5],
    ['hunter', 'Recipe hunter', 'Add a recipe of your own', s => s.added >= 1]
  ];
  const earned = (s = stats()) => BADGES.filter(b => b[3](s)).map(b => b[0]);
  function statsHTML() {
    const s = stats(), got = new Set(earned(s));
    return `<section class="panel stats" aria-labelledby="statsTitle">
      <div class="panel-head"><h2 id="statsTitle" style="font-size:22px">Your kitchen</h2><span class="note">${got.size} of ${BADGES.length} badges</span></div>
      <dl class="strip stats-strip">
        <div><dt>Cooked</dt><dd class="num">${s.cooked}</dd></div>
        <div><dt>Saved</dt><dd class="num">${s.saved}</dd></div>
        <div><dt>Day streak</dt><dd class="num">${s.streak}</dd></div>
        <div><dt>Added</dt><dd class="num">${s.added}</dd></div>
      </dl>
      <ul class="badges">${BADGES.map(([id, name, how]) => `<li class="badge-item ${got.has(id) ? 'on' : ''}" title="${esc(how)}"><span class="medal" aria-hidden="true">${got.has(id) ? icon('check') : ''}</span><span><b>${name}</b><small>${got.has(id) ? 'Earned' : esc(how)}</small></span></li>`).join('')}</ul>
      ${s.cooked ? '' : '<p class="note">Tap “I made this” on any recipe after you cook it to start your streak.</p>'}
    </section>`;
  }

  /* ---------- "I made this!" ---------- */
  let madePhoto = null;
  function openMadeIt(r) {
    if (!r) return;
    madePhoto = null;
    const canShare = acct.user && !r.mine;
    const mine = state.myRatings[r.id] || 0;
    openSheet(`You made ${esc(r.title)}!`, '', `<form class="form" id="madeForm" data-id="${r.id}">
      ${canShare ? `<fieldset class="stars-pick"><legend class="lbl">How was it?</legend>
          ${[1, 2, 3, 4, 5].map(n => `<label class="${n <= mine ? 'lit' : ''}"><input type="radio" name="stars" value="${n}" ${mine === n ? 'checked' : ''}><span aria-hidden="true">★</span><span class="sr-only">${n} star${n > 1 ? 's' : ''}</span></label>`).join('')}</fieldset>
        <label class="lbl" for="madeNote">Share a tip or how it turned out <span class="muted">optional, posted as a comment</span></label>
        <textarea class="input plain" id="madeNote" rows="3" maxlength="1000" placeholder="Added extra garlic and it was perfect"></textarea>
        <label class="btn small photo-btn" for="madePhotoIn">${icon('plus')} Add a photo</label>
        <input id="madePhotoIn" class="sr-only" type="file" accept="image/*">
        <div id="madePreview"></div>`
      : r.mine ? '<p class="note">We’ll add it to your cooking stats.</p>'
      : `<p class="note">We’ll add it to your cooking stats on this device. <button type="button" class="linkish" data-action="auth-open" data-mode="signup">Create an account</button> to rate recipes and share photos.</p>`}
      <p class="form-msg" id="madeMsg" role="alert"></p>
      <button class="btn primary" type="submit" id="madeSave">${icon('check')} ${canShare ? 'Save' : 'Mark as cooked'}</button>
    </form>`, () => { sheet.dataset.kind = 'made'; });
  }
  async function photoData(file) {
    const img = await loadImage(file);
    let out = jpeg(img, 1000, 0.72);
    if (out.length > 380000) out = jpeg(img, 760, 0.62);
    if (out.length > 380000) throw new Error('That photo is too large. Try another one.');
    return out;
  }

  /* ---------- profiles ---------- */
  function profileFormHTML(u) {
    return `<form id="profileForm" class="inline-form">
      <details class="avatar-fold"><summary><span class="lbl">Avatar</span><span class="avatar-now" aria-hidden="true">${u.avatar ? esc(u.avatar) : initial(u.name)}</span><span class="linkish">Change</span></summary>
      <div class="avatar-grid small">${['', ...AVATARS].map(a => `<button type="button" class="avatar-pick" data-action="pick-avatar" data-v="${esc(a)}" aria-pressed="${(u.avatar || '') === a}" aria-label="${a ? 'Avatar ' + a : 'Use my initial'}">${a ? esc(a) : initial(u.name)}</button>`).join('')}</div></details>
      <label class="lbl" for="newName">Display name</label>
      <input class="input plain" id="newName" maxlength="40" value="${esc(u.name)}" required>
      <label class="lbl" for="newBio">Bio <span class="muted">shown when people tap your name</span></label>
      <textarea class="input plain" id="newBio" rows="2" maxlength="160" placeholder="Home cook who loves one-pan dinners">${esc(u.bio || '')}</textarea>
      <button class="btn small" type="submit" style="justify-self:start">Save profile</button>
    </form>`;
  }
  async function openProfile(uid) {
    openSheet('Cook profile', '', '<p class="note" style="padding:0 8px">Loading…</p>');
    try {
      const p = await B.getProfile(uid);
      if (!p) { $('#sheetBody').innerHTML = '<p class="note" style="padding:0 8px">This cook’s profile isn’t available.</p>'; return; }
      const mine = acct.user?.id === p.id;
      $('#sheetBody').innerHTML = `<div class="form profile-card">
        <div class="acct-head">${avatar(p.name, 'lg', p.avatar)}<div style="min-width:0"><b>${esc(p.name)}</b>${p.since ? `<span class="muted">Cooking with PantryPilot since ${esc(new Date(p.since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span>` : ''}</div></div>
        <p>${p.bio ? esc(p.bio) : '<span class="muted">No bio yet.</span>'}</p>
        ${mine ? '<button type="button" class="btn small" data-action="account">Edit your profile</button>' : acct.user && !acct.blocked.has(p.id) ? `<button type="button" class="linkish" data-action="c-block" data-uid="${esc(p.id)}" data-name="${esc(p.name)}">Block ${esc(p.name)}</button>` : ''}
      </div>`;
    } catch (e) { $('#sheetBody').innerHTML = `<p class="note" style="padding:0 8px">${esc(e.message)}</p>`; }
  }

  /* ---------- invites ---------- */
  const REF_KEY = 'pantrypilot:ref';
  const pendingRef = () => { try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; } };
  const clearRef = () => { try { localStorage.removeItem(REF_KEY); } catch { } };
  const inviteLink = code => `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;
  const inviteBanner = () => pendingRef() ? `<p class="invite-note">${icon('sparkle')}<span>You were invited by a friend. Once you confirm your email, you both get <strong>a free week of Pro</strong>.</span></p>` : '';
  function inviteCardHTML(u) {
    if (!u.refCode) return '';
    return `<div class="invite-card">
      <span class="lbl">Invite friends, get Pro free</span>
      <p class="note">When a friend signs up with your link and confirms their email, you both get a week of Pro. You can earn up to 10 weeks.</p>
      <div class="row-2"><label class="sr-only" for="inviteLink">Your invite link</label><input class="input plain" id="inviteLink" readonly value="${esc(inviteLink(u.refCode))}"><button type="button" class="btn small" data-action="copy-invite">${icon('copy')} Copy</button></div>
    </div>`;
  }
  function captureRef() {
    let ref = null;
    try { ref = new URLSearchParams(location.search).get('ref'); } catch { }
    if (!ref || !/^[A-Za-z0-9]{4,16}$/.test(ref)) return;
    try { localStorage.setItem(REF_KEY, ref.toUpperCase()); } catch { }
    try { const u = new URL(location.href); u.searchParams.delete('ref'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { }
    if (!acct.user) toast('A friend invited you. Create an account and you both get a free week of Pro.', { label: 'Sign up', run: () => openAuth('signup') });
  }

  /* ---------- birthday gift ---------- */
  const CAKES = Array.isArray(window.PP_BIRTHDAY) ? window.PP_BIRTHDAY : [];
  function applyGifts() {
    if (!state.gifts.some(g => String(g).startsWith('cakes'))) return;
    let added = false;
    CAKES.forEach(c => { if (!byId.has(c.id)) { prep(c); RECIPES.push(c); byId.set(c.id, c); added = true; } });
    if (added) rebuildIndex();
  }
  function lockGifts() {
    let removed = false;
    for (let i = RECIPES.length - 1; i >= 0; i--) if (RECIPES[i].birthday) { byId.delete(RECIPES[i].id); RECIPES.splice(i, 1); removed = true; }
    if (removed) rebuildIndex();
  }
  function checkBirthday() {
    const b = state.prefs.birthday, u = acct.user;
    if (!u || !b?.m || !b?.d || !CAKES.length) return;
    const t = today();
    let bd = new Date(t.getFullYear(), b.m - 1, b.d);
    if (bd > t) bd = new Date(t.getFullYear() - 1, b.m - 1, b.d);
    if ((t - bd) / 864e5 > 6) return; // the gift waits for up to a week after your birthday
    const key = 'cakes-' + bd.getFullYear();
    if (state.gifts.includes(key)) return;
    state.gifts = [...state.gifts, key]; save.gifts();
    applyGifts();
    CAKES.forEach(c => state.favs.add(c.id)); save.favs();
    renderNav(currentView);
    openSheet(`Happy birthday, ${esc(u.name)}!`, '', `<div class="form birthday">
      <p class="lede">Here’s a little gift from the PantryPilot kitchen: ${CAKES.length} special cake recipes, saved to your Library to keep.</p>
      <div>${CAKES.map(c => byId.get(c.id)).filter(Boolean).map(c => `<div class="rrow"><img src="${esc(tiny(c.image))}" alt="" loading="lazy"><div style="min-width:0"><a href="#recipe-${c.id}" data-action="close-sheet">${esc(c.title)}</a><div class="sub">${fmtMins(c.total)} · ${cap(c.skill_level)}</div></div><span></span></div>`).join('')}</div>
      <a class="btn primary" href="#saved" data-action="close-sheet">See them in your Library</a>
    </div>`, () => { sheet.dataset.kind = 'birthday'; });
  }

  /* ---------- after signing in ---------- */
  function afterSignIn() {
    loadHousehold();
    loadReferenced();
    if (!state.prefs.onboarded && currentView !== 'welcome' && !/checkout=/.test(location.search)) { ob.step = 0; ob.draft = null; location.hash = 'welcome'; return; }
    checkBirthday();
  }

  /* ---------- events for this section ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const v = el.dataset.v;
    const toggleIn = (arr, x) => arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x];
    switch (el.dataset.action) {
      case 'toggle-allergens': state.showAllergens = !state.showAllergens; renderResults(); break;
      case 'made-it': openMadeIt(byId.get(el.dataset.id)); break;
      case 'profile': openProfile(el.dataset.uid); break;
      case 'ob-next': obReadAbout(); ob.step++; refresh(); window.scrollTo(0, 0); break;
      case 'ob-back': obReadAbout(); ob.step = Math.max(0, ob.step - 1); refresh(); window.scrollTo(0, 0); break;
      case 'ob-finish': obFinish(); break;
      case 'ob-pantry': { const on = togglePantry(v); el.setAttribute('aria-pressed', on); $('#obPantryCount').textContent = `${state.pantry.size} items in your pantry`; break; }
      case 'ob-diet': obDraft().diet = v; refresh(); break;
      case 'ob-allergy': obDraft().allergies = toggleIn(obDraft().allergies, v); el.setAttribute('aria-pressed', obDraft().allergies.includes(v)); break;
      case 'ob-level': obDraft().level = v; refresh(); break;
      case 'set-theme':
        state.prefs = { ...state.prefs, theme: v }; save.prefs(); applyTheme(v);
        document.querySelectorAll('[data-action="set-theme"]').forEach(b => { b.setAttribute('aria-checked', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v); });
        break;
      case 'ob-house': obDraft().household = +v; refresh(); break;
      case 'ob-cuisine': obDraft().cuisines = toggleIn(obDraft().cuisines, v); el.setAttribute('aria-pressed', obDraft().cuisines.includes(v)); break;
      case 'ob-avatar': obReadAbout(); obDraft().avatar = v; $$('[data-action="ob-avatar"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); break;
      case 'pick-avatar': { $$('[data-action="pick-avatar"]').forEach(b => b.setAttribute('aria-pressed', b === el)); const now = el.closest('details')?.querySelector('.avatar-now'); if (now) now.textContent = el.textContent; break; }
      case 'copy-invite': {
        const input = $('#inviteLink');
        try { await navigator.clipboard.writeText(input.value); toast('Invite link copied. Send it to a friend.'); }
        catch { input.focus(); input.select(); toast('Select the link and copy it.'); }
        break;
      }
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.name === 'stars') { const n = +e.target.value; $$('.stars-pick label').forEach((l, i) => l.classList.toggle('lit', i < n)); }
    if (e.target.id === 'weeklyEmail') { state.prefs = { ...state.prefs, weekly_email: e.target.checked }; save.prefs(); toast(e.target.checked ? 'You’ll get dinner ideas each Sunday.' : 'Weekly emails turned off.'); }
    if (e.target.id === 'madePhotoIn' && e.target.files?.[0]) {
      try { madePhoto = await photoData(e.target.files[0]); $('#madePreview').innerHTML = `<img class="c-photo" src="${madePhoto}" alt="Your photo">`; $('#madeMsg').textContent = ''; }
      catch (err) { madePhoto = null; $('#madeMsg').textContent = err.message; }
    }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'profileForm') {
      e.preventDefault();
      const name = B.clean($('#newName').value), bio = B.clean($('#newBio').value).slice(0, 160);
      const av = $('[data-action="pick-avatar"][aria-pressed="true"]')?.dataset.v ?? (acct.user.avatar || '');
      if (!name) { toast('Add a display name.'); return; }
      try { await B.updateProfile({ name, bio, avatar: av }); toast('Profile saved'); openAccountSheet(); } catch (err) { toast(esc(err.message)); }
    }
    if (e.target.id === 'madeForm') {
      e.preventDefault();
      const r = byId.get(e.target.dataset.id); if (!r) return;
      const btn = $('#madeSave'); btn.disabled = true;
      const stars = +($('input[name="stars"]:checked')?.value || 0), note = ($('#madeNote')?.value || '').trim();
      const before = new Set(earned());
      try {
        if (acct.user && !r.mine && stars) { await B.rate(r.id, stars); state.myRatings[r.id] = stars; }
        if (acct.user && !r.mine && (note || madePhoto)) await B.addComment(r.id, note, { photo: madePhoto, rating: stars || null });
      } catch (err) { $('#madeMsg').textContent = err.message; btn.disabled = false; return; }
      state.cooked = [...state.cooked, { id: r.id, at: new Date().toISOString() }].slice(-2000); save.cooked();
      closeSheet();
      const fresh = BADGES.filter(b => earned().includes(b[0]) && !before.has(b[0]));
      toast(fresh.length ? `New badge: ${fresh.map(b => b[1]).join(', ')}!` : `Nice! That’s ${state.cooked.length} recipe${state.cooked.length === 1 ? '' : 's'} cooked.`, { label: 'See stats', run: () => { location.hash = 'saved'; } });
      if (stars) await loadRatings(false);
      if (currentView === 'recipe') { refresh(); }
    }
  });

  /* ===================================================================
   * Community recipes: people share their own recipes for everyone.
   * =================================================================== */
  state.comm = { items: [], offset: 0, done: false, loading: false, loaded: false, q: '', cat: 'all', error: '' };
  const PAGE = 24;
  const reportedRecipes = () => new Set(store.get('reportedRecipes', []));

  function communityLine(r) {
    if (r.mine && r.dbId) {
      return `<div class="share-row">${icon(r.published ? 'users' : 'heart')}<span>${r.published ? '<b>Shared with the community.</b> Anyone can see, rate and comment on it.' : '<b>Private.</b> Only you can see this recipe.'}</span>
        <button type="button" class="btn small" data-action="share-toggle" data-id="${r.id}">${r.published ? 'Make private' : 'Share with community'}</button></div>`;
    }
    if (r.author) {
      return `<div class="share-row">${avatar(r.author.name, 'sm', r.author.avatar)}<span>Shared by <button type="button" class="c-name" data-action="profile" data-uid="${esc(r.author.id)}">${esc(r.author.name)}</button>
        ${r.published_at ? `· ${esc(ago(r.published_at))}` : ''}</span>
        ${acct.user ? `<button type="button" class="linkish" data-action="r-report" data-id="${r.id}">Report recipe</button>` : ''}</div>`;
    }
    return '';
  }
  const writePane = () => `<div class="form" role="tabpanel" id="pane-write" aria-labelledby="tab-write">
      <p>Type up a family favorite or your own creation. You can share it with the PantryPilot community, or keep it just for you.</p>
      <div class="actions"><button type="button" class="btn primary" data-action="write-start">${icon('plus')} Start writing</button></div>
    </div>`;
  const proPitch = () => `<div class="form" role="tabpanel" id="pane-${imp.tab}" aria-labelledby="tab-${imp.tab}">
      <p><b>Importing from links and photos is part of Pro.</b></p>
      <ul class="perks"><li>${icon('check')}<span>Turn a reel, TikTok or YouTube video into a full recipe</span></li><li>${icon('check')}<span>Photograph a cookbook page or recipe card</span></li><li>${icon('check')}<span>No ads</span></li></ul>
      <div class="actions"><button type="button" class="btn primary" data-action="paywall">Try Pro free for 7 days</button></div>
    </div>`;

  /* ===================================================================
   * Visitors without an account: a home page and a short preview of a recipe.
   * Everything else in the app needs an account.
   * =================================================================== */
  const PREVIEW_IDS = ['h-pumpkin-pie', 'r-pad-thai', 'x-bruschetta', 'r-green-curry', 'r-hot-chocolate', 'r-yogurt-parfait', 'x-caprese-skewers', 'r-mojito'];
  const previewRecipes = () => {
    const picked = PREVIEW_IDS.map(id => byId.get(id)).filter(Boolean);
    return (picked.length >= 6 ? picked : [...picked, ...RECIPES.filter(r => !picked.includes(r))]).slice(0, 8);
  };
  const guestHead = () => `<header class="guest-head"><a class="brand" href="#home">${brandHTML}</a>
    <div class="guest-actions"><button type="button" class="btn small" data-action="auth-open" data-mode="signin">Sign in</button><button type="button" class="btn small primary" data-action="auth-open" data-mode="signup">Create account</button></div></header>`;
  const guestCard = r => `<a class="g-card" href="#recipe-${esc(r.id)}"><img src="${esc(thumb(r.image))}" alt="" loading="lazy"><span class="g-card-body"><b>${esc(r.title)}</b><span class="note">${fmtMins(r.total)} · ${esc(CAT_LABEL[r.category] || '')}</span></span></a>`;
  function viewHome() {
    const feats = [
      ['kitchen', 'Cook with what you have', 'Tell PantryPilot what is in your kitchen and see every recipe you can make right now.'],
      ['plan', 'Plan the week', 'Breakfast, lunch and dinner for every day, with notes and how many people you are feeding.'],
      ['list', 'One shopping list', 'Send the whole week to a list sorted by aisle. Things you already have are left off.'],
      ['users', 'Cook together', 'Share a live shopping list with your household, and swap recipes with the community.'],
      ['sparkle', 'Save any recipe', 'Pro imports recipes from Instagram, TikTok, YouTube or a photo of a cookbook page.'],
      ['play', 'Hands-free cook mode', 'Big steps, built-in timers and voice control, so you never touch your phone with messy hands.']
    ];
    const hero = previewRecipes().slice(0, 3);
    return `<div class="page fade-in home">${guestHead()}
      <section class="home-hero">
        <div class="home-copy">
          <span class="eyebrow">Your kitchen co-pilot</span>
          <h1>Cook with what you already have.</h1>
          <p class="lede">PantryPilot shows you what you can make from your pantry, plans your week and builds your shopping list. ${Math.floor(RECIPES.length / 10) * 10}+ recipes, free to start.</p>
          <div class="actions"><button type="button" class="btn primary" data-action="auth-open" data-mode="signup">Create a free account</button><button type="button" class="btn" data-action="auth-open" data-mode="signin">I have an account</button></div>
        </div>
        <div class="home-collage" aria-hidden="true">${hero.map((r, i) => `<img class="c${i}" src="${esc(thumb(r.image))}" alt="">`).join('')}</div>
      </section>
      <section class="home-feats">${feats.map(([ic, t, d]) => `<div class="feat">${icon(ic)}<b>${t}</b><span>${d}</span></div>`).join('')}</section>
      <section class="lib-section"><div class="section-head"><h2>A taste of what's inside</h2></div>
        <p class="note">Tap one for a preview. Create a free account to see every recipe in full.</p>
        <div class="g-grid">${previewRecipes().map(guestCard).join('')}</div>
      </section>
      <section class="panel home-cta"><h2>Ready to cook?</h2><p class="lede">It takes a minute to set up your kitchen.</p>
        <div class="actions"><button type="button" class="btn primary" data-action="auth-open" data-mode="signup">Create a free account</button></div></section>
      <footer class="home-foot"><a href="privacy.html">Privacy policy</a><a href="recipes/">Browse recipe pages</a></footer>
    </div>`;
  }
  function viewPreview(r) {
    const shown = r.ingredients.slice(0, 3), more = r.ingredients.length - shown.length;
    return `<div class="page fade-in home">${guestHead()}
      <a class="back" href="#home">${icon('left')} Home</a>
      <article class="preview">
        <img class="preview-img" src="${esc(r.image)}" alt="${esc(r.title)}">
        <div class="preview-body">
          <span class="eyebrow">${esc(CAT_LABEL[r.category] || '')}</span>
          <h1>${esc(r.title)}</h1>
          <p class="lede">${esc(r.description || '')}</p>
          <p class="note num">${fmtMins(r.total)} · serves ${r.servings}${r.calories ? ` · ${r.calories} cal` : ''}</p>
          <h3 class="ob-h">Ingredients</h3>
          <ul class="preview-ings">${shown.map(i => `<li>${esc(i.item)}</li>`).join('')}${more > 0 ? `<li class="fade">+ ${more} more</li>` : ''}</ul>
          <div class="panel gate-card">${icon('users')}<div><b>See the full recipe</b><p class="note">Create a free account to see every ingredient and step, plan it into your week and add it to your shopping list.</p></div>
            <div class="actions"><button type="button" class="btn primary" data-action="auth-open" data-mode="signup">Create a free account</button><button type="button" class="btn" data-action="auth-open" data-mode="signin">Sign in</button></div></div>
        </div>
      </article>
      <section class="lib-section"><div class="section-head"><h2>More to try</h2></div><div class="g-grid">${previewRecipes().filter(x => x.id !== r.id).slice(0, 4).map(guestCard).join('')}</div></section>
    </div>`;
  }
  const viewWaiting = () => `<div class="page fade-in"><p class="note" style="padding:40px 0;text-align:center"><span class="spin" aria-hidden="true"></span> Loading…</p></div>`;

  function viewLoading() {
    return `<div class="page fade-in">${mobileHead()}<a class="back" href="#community">${icon('left')} Community</a><p class="note" id="loadingNote"><span class="spin" aria-hidden="true"></span> Loading recipe…</p></div>`;
  }
  async function loadShared(uuid) {
    try {
      const rows = await B.getRecipesByIds([uuid]);
      if (rows[0]) { const r = toRecipe(rows[0]); if (!byId.has(r.id)) byId.set(r.id, r); if (location.hash.slice(1) === 'recipe-u-' + uuid) route(); return; }
    } catch { }
    const n = $('#loadingNote');
    if (n) n.textContent = 'This recipe isn’t available. Its cook may have made it private or deleted it.';
  }
  // Saved or planned community recipes aren't in the built-in list, so fetch them after loading.
  async function loadReferenced() {
    const ids = [...new Set([...state.favs, ...allPlanIds()])].filter(id => String(id).startsWith('u-') && !byId.has(id)).map(id => id.slice(2));
    if (!ids.length) return;
    try {
      (await B.getRecipesByIds(ids)).forEach(row => { const r = toRecipe(row); if (!byId.has(r.id)) byId.set(r.id, r); });
      if (['saved', 'plan'].includes(currentView)) refresh();
    } catch { }
  }

  function viewCommunity() {
    const c = state.comm, cats = [['all', 'All'], ...Object.entries(CAT_LABEL)];
    return `<div class="page fade-in">
      ${mobileHead()}
      <header class="kitchen-head">
        <span class="eyebrow">Community</span>
        <h1>Recipes from PantryPilot cooks.</h1>
        <p class="lede">Home cooks share their own recipes here. Rate them, ask questions in the comments, and save your favorites.</p>
        <div class="actions"><a class="btn primary" href="#add" data-action="share-new">${icon('plus')} Share a recipe</a></div>
      </header>
      <section class="toolbar" aria-label="Find a community recipe">
        <label class="field" for="cq"><span class="sr-only">Search community recipes</span>${icon('search')}
          <input class="input" id="cq" type="search" placeholder="Search community recipes" autocomplete="off" value="${esc(c.q)}"></label>
        <div class="scroll-x" role="group" aria-label="Meal">${cats.map(([id, l]) => `<button type="button" class="chip" data-action="comm-cat" data-v="${id}" aria-pressed="${c.cat === id}">${l}</button>`).join('')}</div>
      </section>
      <div class="grid" id="commResults"></div>
      <div id="commMore"></div>
    </div>`;
  }
  function renderCommunity() {
    const el = $('#commResults'); if (!el) return;
    const c = state.comm, q = c.q.trim().toLowerCase(), reported = reportedRecipes();
    const list = forMe(c.items.filter(r => !reported.has(r.id) && !acct.blocked.has(r.author?.id)), false)
      .filter(r => (c.cat === 'all' || r.category === c.cat) && (!q || q.split(/\s+/).every(w => r.haystack.includes(w))));
    if (!c.loaded) { el.innerHTML = `<p class="note" style="grid-column:1/-1"><span class="spin" aria-hidden="true"></span> Loading community recipes…</p>`; $('#commMore').innerHTML = ''; return; }
    if (c.error) { el.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Couldn’t load community recipes</h3><p>${esc(c.error)}</p><div class="row"><button type="button" class="btn" data-action="comm-retry">Try again</button></div></div>`; return; }
    el.innerHTML = list.length ? list.map(card).join('') : c.items.length
      ? `<div class="empty" style="grid-column:1/-1">${icon('search')}<h3>No shared recipes match</h3><p>Try another search or meal.</p></div>`
      : `<div class="empty" style="grid-column:1/-1">${icon('users')}<h3>No community recipes yet</h3><p>Be the first to share one. Write up a family favorite and it will show up here.</p><div class="row"><a class="btn primary" href="#add" data-action="share-new">Share a recipe</a></div></div>`;
    $('#commMore').innerHTML = c.done || !c.items.length ? '' : `<div class="actions" style="justify-content:center"><button type="button" class="btn" data-action="comm-more" ${c.loading ? 'disabled' : ''}>${c.loading ? 'Loading…' : 'Load more'}</button></div>`;
  }
  async function loadCommunity(more = false) {
    const c = state.comm;
    if (c.loading) return;
    if (!more) { c.items = []; c.offset = 0; c.done = false; }
    c.loading = true; c.error = ''; renderCommunity();
    try {
      const rows = await B.listCommunity({ offset: c.offset, limit: PAGE });
      const recs = rows.map(row => { const fresh = toRecipe(row); if (!byId.has(fresh.id)) byId.set(fresh.id, fresh); return byId.get(fresh.id); });
      c.items = [...c.items, ...recs.filter(r => !c.items.some(x => x.id === r.id))];
      c.offset += rows.length; c.done = rows.length < PAGE;
    } catch (e) { c.error = e.message; }
    c.loading = false; c.loaded = true;
    renderCommunity();
  }
  function mountCommunity() {
    if (!state.comm.loaded) loadCommunity(); else renderCommunity();
    const q = $('#cq'); let t;
    q?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.comm.q = q.value; renderCommunity(); }, 120); });
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    switch (el.dataset.action) {
      case 'comm-cat': state.comm.cat = el.dataset.v; $$('[data-action="comm-cat"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === state.comm.cat)); renderCommunity(); break;
      case 'comm-more': loadCommunity(true); break;
      case 'comm-retry': loadCommunity(); break;
      case 'share-new': resetImport(); imp.tab = 'write'; break; // the link then opens #add
      case 'write-start': {
        const hh = +state.prefs.household > 0 ? +state.prefs.household : 4;
        imp.draft = { title: '', description: '', category: 'dinner', servings: hh, prep_time: 10, cook_time: 20, calories: 0, skill_level: 'beginner', tags: [], ingredients: [], steps: [], image: null, source_url: null, source_kind: 'manual' };
        imp.manual = true; imp.site = ''; imp.demo = false;
        refresh(); setTimeout(() => $('#dTitle')?.focus(), 30);
        break;
      }
      case 'share-toggle': {
        const r = byId.get(el.dataset.id); if (!r?.dbId) break;
        el.disabled = true;
        try {
          const res = await B.setPublished(r.dbId, !r.published);
          r.published = !!res.published; r.published_at = res.published_at;
          state.comm.loaded = false;
          toast(r.published ? 'Shared with the community' : 'Your recipe is private now');
          refresh();
        } catch (err) { toast(esc(err.message)); el.disabled = false; }
        break;
      }
      case 'r-report':
        openSheet('Report recipe', '<p class="note">Tell us what’s wrong. Recipes reported by several people are hidden automatically while we review them.</p>',
          `<div class="reasons">${[['spam', 'Spam or advertising'], ['copied', 'Copied from someone else'], ['unsafe', 'Unsafe food advice'], ['offensive', 'Offensive or inappropriate'], ['other', 'Something else']].map(([v, l]) => `<button type="button" class="pick reason" data-action="r-report-send" data-id="${el.dataset.id}" data-reason="${v}"><span class="t">${l}</span></button>`).join('')}</div>`);
        break;
      case 'r-report-send': {
        const r = byId.get(el.dataset.id); if (!r) break;
        try { await B.reportRecipe(r.dbId, el.dataset.reason); }
        catch (err) { toast(esc(err.message)); break; }
        store.set('reportedRecipes', [...new Set([...reportedRecipes(), r.id])].slice(-500));
        closeSheet();
        location.hash = 'community';
        toast('Thanks for reporting. We’ve hidden it for you.');
        break;
      }
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id !== 'dPhoto' || !e.target.files?.[0] || !imp.draft) return;
    try {
      imp.draft.image = await photoData(e.target.files[0]);
      $('#draftImg').innerHTML = `<img class="draft-img" src="${imp.draft.image}" alt="Your recipe photo">`;
      $('#draftMsg').textContent = '';
    } catch (err) { $('#draftMsg').textContent = err.message; }
  });

  /* ===================================================================
   * Extras: install as an app, share, US/metric, hands-free cooking,
   * and "use it up" reminders for fresh pantry items.
   * =================================================================== */

  /* ---------- install as an app ---------- */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (currentView === 'kitchen') refresh(); });
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function installCard() {
    if (standalone() || store.get('installDismissed', false) || (!installEvt && !isIOS)) return '';
    return `<aside class="install-card"><img src="icons/icon-192.png" alt="" width="44" height="44">
      <div><b>Get the PantryPilot app</b><span>Add it to your home screen. It opens full screen and works offline.</span></div>
      <button type="button" class="btn small primary" data-action="install">Install</button>
      <button type="button" class="x" data-action="install-dismiss" aria-label="Hide this">${icon('x')}</button></aside>`;
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- share ---------- */
  const slugOf = title => String(title).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hasPublicPage = r => !r.mine && !r.author && !r.birthday && !String(r.id).startsWith('u-');
  const siteBase = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  const shareUrl = r => hasPublicPage(r) ? `${siteBase()}recipes/${slugOf(r.title)}/` : `${siteBase()}#recipe-${r.id}`;

  /* ---------- US / metric ---------- */
  const unitToggle = () => `<div class="unit-toggle" role="group" aria-label="Measurement units">${[['us', 'US'], ['metric', 'Metric']].map(([v, l]) =>
    `<button type="button" data-action="units" data-v="${v}" aria-pressed="${(state.prefs.units || 'us') === v}">${l}</button>`).join('')}</div>`;

  /* ---------- hands-free cook mode ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window;
  let recog = null;
  function cookVoiceButtons() {
    return `${canSpeak ? `<button type="button" class="icon-btn ${cook.read ? 'on' : ''}" data-action="cook-read" aria-pressed="${!!cook.read}" aria-label="Read steps aloud" title="Read steps aloud">${icon('speaker')}</button>` : ''}
      ${SR ? `<button type="button" class="icon-btn ${cook.listen ? 'on' : ''}" data-action="cook-listen" aria-pressed="${!!cook.listen}" aria-label="Voice control" title="Voice control">${icon('mic')}</button>` : ''}`;
  }
  function speakStep() {
    if (!canSpeak || !cook.id) return;
    const r = byId.get(cook.id);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`Step ${cook.i + 1}. ${toMetricTemps(r.steps[cook.i])}`);
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  function afterCookRender() {
    if (cook.listen) $('.cook-step')?.insertAdjacentHTML('beforeend', `<p class="voice-hint">${icon('mic')} Listening. Say “next”, “back”, “repeat”, “start timer” or “done”.</p>`);
    if (cook.read) speakStep();
  }
  function cookMove(d) {
    const n = byId.get(cook.id).steps.length;
    const next = Math.min(n - 1, Math.max(0, cook.i + d));
    if (next === cook.i) { if (d > 0 && cook.read && canSpeak) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('That was the last step. Say done when you’re finished.')); } return; }
    cook.i = next; renderCook();
  }
  function handleVoice(t) {
    if (/\b(next|forward|continue|go on)\b/.test(t)) cookMove(1);
    else if (/\b(back|previous|go back)\b/.test(t)) cookMove(-1);
    else if (/\b(repeat|again|say that)\b/.test(t)) speakStep();
    else if (/timer/.test(t)) { const chip = $('.cook-step .tchip'); chip ? chip.click() : toast('This step doesn’t have a timer.'); }
    else if (/\b(done|finish|finished)\b/.test(t)) { const r = byId.get(cook.id); closeCook(); openMadeIt(r); }
  }
  function startListen() {
    recog = new SR();
    recog.continuous = true; recog.interimResults = false; recog.lang = navigator.language || 'en-US';
    recog.onresult = e => handleVoice(e.results[e.results.length - 1][0].transcript.toLowerCase());
    recog.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        cook.listen = false; recog = null; renderCook();
        toast('Microphone access is blocked. Allow it in your browser settings to use voice control.');
      }
    };
    recog.onend = () => { if (cook.listen && !cookEl.hidden) { try { recog.start(); } catch { } } };
    try { recog.start(); } catch { }
  }
  function stopVoice() {
    cook.listen = false;
    try { recog?.stop(); } catch { }
    recog = null;
    if (canSpeak) speechSynthesis.cancel();
  }

  /* ---------- "use it up" reminders ---------- */
  // Roughly how many days fresh things keep once bought or opened.
  const SHELF = [[/^(chicken|salmon|white fish|shrimp|ground beef|ground lamb|flank steak|sirloin|pork|bacon)/, 2], [/^(milk|whole milk|heavy cream|buttermilk|oat milk)$/, 7],
    [/yogurt|sour cream|cream cheese|ricotta/, 12], [/mozzarella|feta/, 7], [/cilantro|basil|parsley|dill|mint|chives|thyme|rosemary/, 5],
    [/spinach|lettuce|romaine|kale|bean sprouts/, 5], [/avocado/, 3], [/banana/, 4], [/berr/, 4], [/mushroom/, 6], [/scallion/, 6],
    [/cucumber|zucchini/, 6], [/^(ripe )?tomatoes$|cherry tomatoes/, 5], [/bread|sourdough|baguette|\bbuns?\b|pita/, 4], [/tortilla/, 10],
    [/^(lemon|lime)$/, 14], [/broccoli|cauliflower|green beans/, 6], [/bell pepper/, 7], [/watermelon|mango/, 4]];
  const shelfLife = key => (SHELF.find(([re]) => re.test(key)) || [])[1] || 0;
  function setPantryDate(key, on) {
    if (on && shelfLife(key)) state.pantryDates[key] = new Date().toISOString(); else delete state.pantryDates[key];
    save.pantryDates();
  }
  function daysLeft(key) {
    const d = state.pantryDates[key], life = shelfLife(key);
    if (!d || !life || !state.pantry.has(key)) return null;
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    return life - Math.round((today() - start) / 864e5);
  }
  const freshTag = k => { const n = daysLeft(k); return n == null ? '' : ` <small class="fresh ${n <= 1 ? 'soon' : ''}">${n <= 0 ? 'use now' : n + 'd'}</small>`; };
  function useItUpCard(max = 4) {
    const all = [...state.pantry].map(k => ({ k, n: daysLeft(k) })).filter(x => x.n != null && x.n <= 2).sort((a, b) => a.n - b.n);
    const items = all.slice(0, max);
    if (!items.length) return '';
    return `<section class="panel useup" aria-labelledby="useupTitle">
      <div class="panel-head"><h2 id="useupTitle" style="font-size:20px">Use it up</h2><span class="note">Fresh things to cook with soon</span></div>
      ${items.map(({ k, n }) => {
        const recs = forMe(RECIPES, true).filter(r => r.keys.includes(k)).sort((a, b) => match(a).missing.length - match(b).missing.length).slice(0, 2);
        return `<div class="useup-row">
          <div class="useup-name"><b>${esc(cap(k))}</b><span class="${n <= 0 ? 'warn' : ''}">${n <= 0 ? 'May be past its best' : n === 1 ? 'Use by tomorrow' : 'Use within 2 days'}</span></div>
          <div class="useup-recs">${recs.length ? recs.map(r => `<a href="#recipe-${r.id}">${esc(r.title)}</a>`).join('') : '<span class="note">No recipes use it yet</span>'}</div>
          <div class="useup-acts"><button type="button" class="linkish" data-action="fresh-reset" data-key="${esc(k)}">Bought more</button><button type="button" class="linkish" data-action="fresh-gone" data-key="${esc(k)}">Used it up</button></div>
        </div>`;
      }).join('')}
      ${all.length > items.length ? `<a class="useup-more" href="#pantry">See all ${all.length} in your pantry ${icon('right')}</a>` : ''}
    </section>`;
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    switch (el.dataset.action) {
      case 'install':
        if (installEvt) {
          installEvt.prompt();
          const choice = await installEvt.userChoice.catch(() => null);
          installEvt = null;
          if (choice?.outcome === 'accepted') toast('PantryPilot is on your home screen');
          refresh();
        } else {
          openSheet('Add PantryPilot to your home screen', '', `<div class="form"><ol class="install-steps">
            <li>Tap the <b>Share</b> button at the bottom of Safari (the square with an arrow pointing up).</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>. PantryPilot appears with your other apps.</li></ol></div>`);
        }
        break;
      case 'install-dismiss': store.set('installDismissed', true); el.closest('.install-card')?.remove(); break;
      case 'share': {
        const r = byId.get(el.dataset.id); if (!r) break;
        const url = shareUrl(r);
        try { if (navigator.share) { await navigator.share({ title: r.title, text: `${r.title} on PantryPilot`, url }); break; } }
        catch (err) { if (err?.name === 'AbortError') break; }
        try { await navigator.clipboard.writeText(url); toast('Link copied. Paste it into a message to share.'); }
        catch { openSheet('Share this recipe', '', `<div class="form"><label class="lbl" for="shareLink">Link</label><input class="input plain" id="shareLink" readonly value="${esc(url)}"></div>`, () => { const i = $('#shareLink'); i.focus(); i.select(); }); }
        break;
      }
      case 'units': state.prefs = { ...state.prefs, units: el.dataset.v }; save.prefs(); refresh(); if (!cookEl.hidden) renderCook(); break;
      case 'cook-read':
        cook.read = !cook.read;
        if (!cook.read && canSpeak) speechSynthesis.cancel();
        renderCook();
        break;
      case 'cook-listen':
        if (cook.listen) { cook.listen = false; try { recog?.stop(); } catch { } recog = null; }
        else { cook.listen = true; startListen(); }
        renderCook();
        break;
      case 'fresh-reset': state.pantryDates[el.dataset.key] = new Date().toISOString(); save.pantryDates(); refresh(); toast('Got it. We’ll remind you again before it goes off.'); break;
      case 'fresh-gone': togglePantry(el.dataset.key, false); refresh(); toast(`Took ${esc(el.dataset.key)} out of your pantry`); break;
    }
  });

  /* ===================================================================
   * Receipt scanning (Pro): photo of a grocery receipt -> review -> pantry,
   * shopping list ticked off, and the recipes you can now cook.
   * =================================================================== */
  let scan = null; // { store, items: [{ text, name, match, key, on }], demo }
  function receiptCard() {
    const action = !acct.user ? 'data-action="auth-open" data-mode="signup"' : !isPro() ? 'data-action="paywall"' : '';
    return `<aside class="receipt-card">
      <span class="receipt-icon" aria-hidden="true">${icon('list')}</span>
      <div><b>Scan a grocery receipt ${isPro() ? '' : '<span class="pro-tag">Pro</span>'}</b>
        <span>Snap your receipt. PantryPilot adds what you bought to your pantry, ticks it off your list and shows what you can cook now.</span></div>
      ${action ? `<button type="button" class="btn small primary" ${action}>Scan receipt</button>`
        : `<label class="btn small primary" for="receiptIn">Scan receipt</label><input id="receiptIn" class="sr-only" type="file" accept="image/*">`}
    </aside>`;
  }
  // Compare grocery names loosely: "Limes", "lime" and "fresh limes" are the same thing.
  const listKey = n => canon(String(n)).replace(/(oes|ies|s)$/, m => m === 'ies' ? 'y' : m === 'oes' ? 'o' : '');
  function readySet() { return new Set(forMe(RECIPES, true).filter(r => !match(r).missing.length).map(r => r.id)); }
  function renderScanReview() {
    const s = scan, onList = new Set(state.list.filter(i => !i.done).map(i => listKey(i.name)));
    const chosen = s.items.filter(i => i.on), listHits = chosen.filter(i => onList.has(listKey(i.key))).length;
    openSheet(`Found ${s.items.length} item${s.items.length === 1 ? '' : 's'}${s.store ? ` from ${esc(s.store)}` : ''}`, '<p class="note">Untick anything you don’t want in your pantry.</p>', `<div class="form">
      ${s.demo ? `<p class="demo-note">${icon('sparkle')}<span><strong>Demo mode.</strong> This is an example receipt. Once the app is connected to its server, PantryPilot reads your real photo.</span></p>` : ''}
      <ul class="scan-list">${s.items.map((i, k) => `<li><label class="scan-row" for="sc${k}"><input type="checkbox" id="sc${k}" data-scan="${k}" ${i.on ? 'checked' : ''}>
        <span class="scan-name"><b>${esc(cap(i.name))}</b><small>${esc(i.text)}</small></span>
        ${i.match ? `<span class="pill" aria-pressed="true">${state.pantry.has(i.key) ? 'Already have' : 'Used in recipes'}</span>` : '<span class="note">Not in our recipes yet</span>'}</label></li>`).join('')}</ul>
      ${listHits ? `<label class="switch-row" for="scanTick"><input type="checkbox" id="scanTick" checked><span><b>Tick ${listHits} off my shopping list</b><span class="note">They’re on your list and you just bought them.</span></span></label>` : ''}
      <button type="button" class="btn primary" data-action="scan-apply">${icon('check')} Add ${chosen.length} to my pantry</button>
    </div>`, () => { sheet.dataset.kind = 'scan'; });
  }
  function showScanResults(before) {
    const after = readySet(), fresh = forMe(RECIPES, true).filter(r => after.has(r.id) && !before.has(r.id));
    const ready = forMe(RECIPES, true).filter(r => after.has(r.id));
    const show = (fresh.length ? fresh : ready).slice(0, 6);
    openSheet(fresh.length ? `You can now cook ${fresh.length} more recipe${fresh.length === 1 ? '' : 's'}` : 'Your pantry is updated', '', `<div class="form">
      <p class="lede">${ready.length} recipe${ready.length === 1 ? '' : 's'} need nothing else from the store.${fresh.length ? ' Here’s what your shopping just unlocked:' : ready.length ? ' A few ideas:' : ''}</p>
      <div>${show.map(r => `<div class="rrow"><img src="${esc(tiny(r.image))}" alt="" loading="lazy"><div style="min-width:0"><a href="#recipe-${r.id}" data-action="close-sheet">${esc(r.title)}</a><div class="sub">${fmtMins(r.total)} · ${CAT_LABEL[r.category] || ''}</div></div><span></span></div>`).join('') || '<p class="note">Nothing is fully covered yet. Recipes that are one or two items away are on the Pantry page.</p>'}</div>
      <a class="btn" href="#pantry" data-action="close-sheet">See everything you can cook</a>
    </div>`);
  }
  document.addEventListener('change', async e => {
    if (e.target.dataset?.scan != null && scan) {
      scan.items[+e.target.dataset.scan].on = e.target.checked;
      const btn = $('[data-action="scan-apply"]'); if (btn) btn.lastChild.textContent = ` Add ${scan.items.filter(i => i.on).length} to my pantry`;
      return;
    }
    if (e.target.id !== 'receiptIn' || !e.target.files?.[0]) return;
    let photo;
    try { photo = jpeg(await loadImage(e.target.files[0]), 1800, 0.85); }
    catch (err) { toast(esc(err.message)); return; }
    e.target.value = '';
    openSheet('Reading your receipt…', '', '<p class="note" style="padding:0 8px 12px"><span class="spin" aria-hidden="true"></span> This usually takes 10 to 30 seconds.</p>');
    try {
      const res = await B.scanReceipt({ image: photo, known: INGREDIENTS });
      if (!res.items?.length) { openSheet('No groceries found', '', '<p class="note" style="padding:0 8px 12px">We couldn’t find any food on that receipt. Try a flatter, sharper photo with the whole receipt in frame.</p>'); return; }
      const seen = new Set();
      scan = { store: res.store, demo: !!res.demo, items: res.items.map(i => ({ ...i, key: i.match || canon(i.name), on: true })).filter(i => !seen.has(i.key) && seen.add(i.key)) };
      renderScanReview();
    } catch (err) {
      openSheet('Couldn’t read that receipt', '', `<p class="note" style="padding:0 8px 12px">${esc(err.message)}</p>`);
    }
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action="scan-apply"]'); if (!el || !scan) return;
    const before = readySet(), chosen = scan.items.filter(i => i.on);
    chosen.forEach(i => { state.pantry.add(i.key); setPantryDate(i.key, true); });
    save.pantry();
    let ticked = 0;
    if ($('#scanTick')?.checked) {
      const keys = new Set(chosen.map(i => listKey(i.key)));
      state.list.forEach(i => { if (!i.done && keys.has(listKey(i.name))) { i.done = true; ticked++; } });
      if (ticked) save.list();
    }
    scan = null;
    renderNav(currentView);
    if (['pantry', 'kitchen', 'list'].includes(currentView)) refresh();
    toast(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} to your pantry${ticked ? ` · ticked ${ticked} off your list` : ''}`);
    showScanResults(before);
  });

  /* ---------- photo credits (real photos used under CC BY need a credit) ---------- */
  function photoCredit(r) {
    const c = r.photo_credit; if (!c) return '';
    const safe = u => /^https:\/\//.test(u || '') ? esc(u) : '';
    const name = !c.name || c.name === 'Unknown' ? '' : safe(c.url) ?`<a href="${safe(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>` : esc(c.name);
    const lic = safe(c.license_url) ? `<a href="${safe(c.license_url)}" target="_blank" rel="noopener noreferrer">${esc(c.license)}</a>` : esc(c.license || '');
    return `<span class="photo-credit">Photo: ${[name, lic].filter(Boolean).join(' · ')}${safe(c.page) ? ` · <a href="${safe(c.page)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}</span>`;
  }

  /* ---------- nutrition (estimated, per serving) ---------- */
  const NUTRITION = window.PP_NUTRITION || {};
  function nutritionLine(r) {
    const n = NUTRITION[r.id];
    if (!n) return '';
    const [p, c, f] = n, total = p * 4 + c * 4 + f * 9 || 1;
    const bar = (v, k, cls) => `<span class="macro ${cls}" style="flex:${Math.max(2, Math.round(v * k / total * 100))}"></span>`;
    return `<div class="nutrition" aria-label="Estimated nutrition per serving">
      <div class="macro-bar" aria-hidden="true">${bar(p, 4, 'p')}${bar(c, 4, 'c')}${bar(f, 9, 'f')}</div>
      <div class="macro-legend"><span><i class="p"></i><b class="num">${p} g</b> protein</span><span><i class="c"></i><b class="num">${c} g</b> carbs</span><span><i class="f"></i><b class="num">${f} g</b> fat</span><span class="note">per serving, estimated</span></div>
    </div>`;
  }

  /* ===================================================================
   * Collections: seasonal menus and year-round themes
   * Seasonal ones show first on the Kitchen page while they're in season.
   * =================================================================== */
  const hasTag = (r, ...t) => t.some(x => r.tags.includes(x));
  const COLLECTIONS = [
    { id: 'thanksgiving', title: 'Thanksgiving menu', blurb: 'The whole feast: roast turkey, every side you need and pumpkin pie to finish.', season: [[10, 1], [10, 30]], test: r => hasTag(r, 'thanksgiving') },
    { id: 'christmas', title: 'Christmas classics', blurb: 'Glazed ham, crispy sprouts, gingerbread and warm drinks for the holidays.', season: [[11, 1], [11, 31]],
      test: r => hasTag(r, 'christmas') || ['Cinnamon Rolls', 'Rich Hot Chocolate', 'Warm Spiced Apple Cider', 'Lemon Herb Roast Chicken', 'Brown Butter Chocolate Chip Cookies', 'Creamy Mashed Potatoes', 'Classic Sage Stuffing'].includes(r.title) },
    { id: 'gameday', title: 'Game day', blurb: 'Wings, dips and finger food for the big game.', season: [[8, 1], [1, 15]], test: r => hasTag(r, 'game day') || r.category === 'dip' || (r.category === 'appetizer' && hasTag(r, 'party')) },
    { id: 'summer', title: 'Summer cookout', blurb: 'Fresh, bright food and cold drinks for long evenings outside.', season: [[5, 1], [7, 31]], test: r => hasTag(r, 'summer', 'grill', 'no cook') },
    { id: 'weeknight', title: '30-minute dinners', blurb: 'Dinner on the table in half an hour or less.', test: r => r.category === 'dinner' && r.total <= 30 },
    { id: 'makeahead', title: 'Make ahead', blurb: 'Cook once, eat well all week.', test: r => hasTag(r, 'make ahead', 'meal prep', 'freezer friendly') },
    { id: 'party', title: 'Party food', blurb: 'Appetizers and dips that disappear first.', test: r => r.category === 'appetizer' || r.category === 'dip' },
    { id: 'veggie', title: 'Vegetarian dinners', blurb: 'Hearty meat-free mains.', test: r => (r.category === 'dinner' || r.category === 'lunch') && dietOk(r, 'vegetarian') },
    { id: 'cozy', title: 'Soups & cozy food', blurb: 'Warm bowls and comfort classics.', test: r => hasTag(r, 'cozy', 'comfort', 'comfort food') || /soup|stew|chili/i.test(r.title) },
    { id: 'sweet', title: 'Baking & sweets', blurb: 'Cakes, cookies, pies and puddings.', test: r => r.category === 'dessert' && !r.birthday }
  ];
  function inSeason(c) {
    if (!c.season) return false;
    const t = today(), md = t.getMonth() * 100 + t.getDate();
    const [[m1, d1], [m2, d2]] = c.season, a = m1 * 100 + d1, b = m2 * 100 + d2;
    return a <= b ? md >= a && md <= b : md >= a || md <= b; // ranges like Sep–Feb wrap around the new year
  }
  const collectionRecipes = c => forMe(RECIPES.filter(r => !r.mine && c.test(r)), true);
  function collectionsRow() {
    const list = COLLECTIONS.filter(c => !c.season || inSeason(c)).sort((a, b) => inSeason(b) - inSeason(a))
      .map(c => ({ c, recs: collectionRecipes(c) })).filter(x => x.recs.length >= 3);
    if (!list.length) return '';
    return `<section class="collections" aria-labelledby="collTitle">
      <div class="section-head"><h2 id="collTitle">Collections</h2></div>
      <div class="coll-row">${list.map(({ c, recs }) => `<a class="coll-card ${inSeason(c) ? 'seasonal' : ''}" href="#collection-${c.id}">
        <div class="coll-imgs">${recs.slice(0, 3).map(r => `<img src="${esc(thumb(r.image))}" alt="" loading="lazy">`).join('')}</div>
        <div class="coll-body">${inSeason(c) ? '<span class="eyebrow">In season</span>' : ''}<b>${esc(c.title)}</b><span class="note">${recs.length} recipes</span></div>
      </a>`).join('')}</div>
    </section>`;
  }
  // 4th Thursday of November
  function thanksgivingDay(year = today().getFullYear()) {
    const d = new Date(year, 10, 1); const offset = (4 - d.getDay() + 7) % 7;
    return new Date(year, 10, 1 + offset + 21);
  }
  function viewCollection(id) {
    const c = COLLECTIONS.find(x => x.id === id), recs = collectionRecipes(c);
    const tday = id === 'thanksgiving' ? thanksgivingDay() : null;
    return `<div class="page fade-in">
      ${mobileHead()}
      <a class="back" href="#kitchen">${icon('left')} Kitchen</a>
      <header class="kitchen-head">
        <span class="eyebrow">Collection${inSeason(c) ? ' · in season' : ''}</span>
        <h1>${esc(c.title)}</h1>
        <p class="lede">${esc(c.blurb)}</p>
        <div class="actions">
          ${tday && tday >= today() ? `<button type="button" class="btn primary" data-action="coll-plan" data-id="${c.id}" data-day="${iso(tday)}">${icon('plan')} Plan it for ${esc(fmtDay(tday, { weekday: 'long', month: 'long', day: 'numeric' }))}</button>` : ''}
          <button type="button" class="btn ${tday ? '' : 'primary'}" data-action="coll-list" data-id="${c.id}">${icon('list')} Add everything to my list</button>
        </div>
      </header>
      <div class="grid">${recs.map(card).join('')}</div>
    </div>`;
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const c = COLLECTIONS.find(x => x.id === el.dataset.id);
    if (el.dataset.action === 'coll-list' && c) {
      let added = 0, skipped = 0;
      collectionRecipes(c).forEach(r => { const res = addRecipeToList(r, true); added += res.added; skipped += res.skipped; });
      renderNav(currentView);
      toast(`Added ${added} item${added === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} in your pantry` : ''}`, { label: 'View list', run: () => { location.hash = 'list'; } });
    }
    if (el.dataset.action === 'coll-plan' && c) {
      const day = el.dataset.day, d = state.plan[day] || (state.plan[day] = { breakfast: [], lunch: [], dinner: [] });
      collectionRecipes(c).forEach(r => { if (!d.dinner.includes(r.id)) d.dinner.push(r.id); });
      save.plan();
      toast(`Planned the ${esc(c.title.toLowerCase())} for ${esc(fmtDay(new Date(day + 'T00:00'), { weekday: 'long', month: 'short', day: 'numeric' }))}`, { label: 'View plan', run: () => { const days = Math.round((new Date(day + 'T00:00') - weekDays(0)[0]) / (7 * 864e5)); state.week = Math.max(0, Math.floor(days)); location.hash = 'plan'; } });
    }
  });

  /* ===================================================================
   * Shared household shopping list
   * One list shared live by up to 8 people. Each item is stored on its own row,
   * so two people ticking different items at once never overwrite each other.
   * =================================================================== */
  state.household = null;
  let unsubList = null, lastServer = new Map(), pushTimer = null, applyingRemote = false;
  const itemSig = i => JSON.stringify([i.name, +i.qty || 0, i.unit || '', i.aisle || '', i.from || [], !!i.done]);

  async function loadHousehold() {
    if (!acct.user || !B.getHousehold) return;
    let h = null;
    try { h = await B.getHousehold(); } catch { return; }
    const pending = pendingJoin();
    if (pending && (!h || h.code !== pending)) { offerJoin(pending); }
    if (!h) { state.household = null; renderListIfOpen(); return; }
    await attachHousehold(h, false);
  }
  async function attachHousehold(h, uploadMine) {
    unsubList?.(); unsubList = null;
    state.household = h;
    let items = [];
    try { items = await B.listItems(h.id); } catch { }
    const ids = new Set(items.map(i => i.id));
    const mine = state.list.filter(i => !ids.has(i.id));
    if (uploadMine && mine.length) { try { await B.upsertItems(h.id, mine); items = [...items, ...mine]; } catch { } }
    applyingRemote = true;
    state.list = items;
    lastServer = new Map(items.map(i => [i.id, itemSig(i)]));
    store.set('list', state.list);
    applyingRemote = false;
    unsubList = B.subscribeList(h.id, onRemoteChange);
    renderNav(currentView); renderListIfOpen();
  }
  function onRemoteChange(ev) {
    if (!state.household) return;
    if (ev.type === 'reload') { B.listItems(state.household.id).then(items => { state.list = items; lastServer = new Map(items.map(i => [i.id, itemSig(i)])); store.set('list', state.list); renderNav(currentView); renderListIfOpen(); }); return; }
    if (ev.type === 'delete') { state.list = state.list.filter(i => i.id !== ev.id); lastServer.delete(ev.id); }
    else if (ev.item) {
      const k = state.list.findIndex(i => i.id === ev.item.id);
      if (k > -1) state.list[k] = ev.item; else state.list.push(ev.item);
      lastServer.set(ev.item.id, itemSig(ev.item));
    }
    store.set('list', state.list);
    renderNav(currentView); renderListIfOpen();
  }
  function queueListPush() {
    if (!state.household || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushList, 350);
  }
  async function pushList() {
    const h = state.household; if (!h) return;
    const now = new Map(state.list.map(i => [i.id, i]));
    const upserts = state.list.filter(i => lastServer.get(i.id) !== itemSig(i));
    const deletes = [...lastServer.keys()].filter(id => !now.has(id));
    try {
      await B.upsertItems(h.id, upserts);
      await B.deleteItems(h.id, deletes);
      upserts.forEach(i => lastServer.set(i.id, itemSig(i)));
      deletes.forEach(id => lastServer.delete(id));
    } catch (e) { toast('Couldn’t update the shared list. Check your connection.'); }
  }
  function leaveHouseholdLocal() { unsubList?.(); unsubList = null; state.household = null; lastServer = new Map(); }
  function renderListIfOpen() {
    if (currentView !== 'list') return;
    const typing = document.activeElement?.id === 'newItem' ? $('#newItem').value : null;
    refresh();
    if (typing != null) { const i = $('#newItem'); if (i) { i.value = typing; i.focus(); } }
  }
  function householdBar() {
    if (!acct.user) return `<div class="house-bar"><span>${icon('users')} Shop together: sign in to share this list with your household.</span><button type="button" class="btn small" data-action="auth-open" data-mode="signin">Sign in</button></div>`;
    const h = state.household;
    if (!h) return `<div class="house-bar"><span>${icon('users')} Share this list so everyone at home can add and tick off items live.</span>
      <span class="actions"><button type="button" class="btn small primary" data-action="house-share">Share list</button><button type="button" class="btn small" data-action="house-join-open">Join a list</button></span></div>`;
    const others = h.people.filter(p => p.id !== acct.user.id);
    return `<div class="house-bar shared"><span class="faces">${h.people.slice(0, 5).map(p => avatar(p.name, 'sm', p.avatar)).join('')}</span>
      <span>${others.length ? `Shared with ${esc(others.map(p => p.name).join(', '))}` : 'Shared list. Invite someone to shop together.'}</span>
      <span class="actions"><button type="button" class="btn small" data-action="house-share">Invite</button><button type="button" class="linkish" data-action="house-leave">Leave</button></span></div>`;
  }
  const JOIN_KEY = 'pantrypilot:join';
  const pendingJoin = () => { try { return localStorage.getItem(JOIN_KEY) || ''; } catch { return ''; } };
  function captureJoin() {
    let c = null;
    try { c = new URLSearchParams(location.search).get('join'); } catch { }
    if (!c || !/^[A-Za-z0-9]{4,12}$/.test(c)) return;
    try { localStorage.setItem(JOIN_KEY, c.toUpperCase()); } catch { }
    try { const u = new URL(location.href); u.searchParams.delete('join'); history.replaceState(null, '', u.pathname + u.search + '#list'); } catch { }
    if (!acct.user) toast('You’ve been invited to a shared shopping list. Sign in to join it.', { label: 'Sign in', run: () => openAuth('signin') });
  }
  function offerJoin(code) {
    openSheet('Join a shared shopping list?', '', `<div class="form"><p>You’ve been invited to shop together. Your current list will be added to the shared one.</p>
      <div class="actions"><button type="button" class="btn primary" data-action="house-join" data-code="${esc(code)}">Join list</button><button type="button" class="btn" data-action="house-join-skip">Not now</button></div></div>`);
  }
  async function openShareSheet() {
    let h = state.household;
    if (!h) {
      try { h = await B.createHousehold(); await attachHousehold(h, true); }
      catch (e) { toast(esc(e.message)); return; }
    }
    const link = `${siteBase()}?join=${h.code}`;
    openSheet('Shop together', '', `<div class="form">
      <p>Send this link to the people you live with. When they open it and sign in, they’ll see the same list and changes show up for everyone right away.</p>
      <label class="lbl" for="joinLink">Invite link</label>
      <div class="row-2"><input class="input plain" id="joinLink" readonly value="${esc(link)}"><button type="button" class="btn small" data-action="copy-join">${icon('copy')} Copy</button></div>
      <p class="note">Or have them choose <b>Join a list</b> and enter the code <b class="num">${esc(h.code)}</b>.</p>
    </div>`);
  }

  /* ===================================================================
   * Moderation (admins): reported comments and shared recipes
   * =================================================================== */
  state.mod = { loading: false, data: null, error: '' };
  function viewAdmin() {
    const head = `<header class="kitchen-head"><span class="eyebrow">Moderation</span><h1>Reports</h1>
      <p class="lede">Comments and shared recipes people have reported. Anything reported by 3 people is hidden automatically until you review it.</p></header>`;
    if (!acct.user?.isAdmin) return `<div class="page fade-in">${mobileHead()}${head}<div class="empty"><h3>Admins only</h3><p>Ask the app owner to give your account admin access.</p></div></div>`;
    return `<div class="page fade-in">${mobileHead()}${head}${B.mode === 'demo' ? demoNote() : ''}${proGiftPanel()}<div id="modBody"><p class="note"><span class="spin" aria-hidden="true"></span> Loading reports…</p></div></div>`;
  }
  /* admins can give anyone Pro for free (or take it away) */
  function proGiftPanel() {
    return `<section class="lib-section"><div class="section-head"><h2>Give Pro for free</h2></div>
      <form class="panel form" id="proGiftForm">
        <p class="note">They need a PantryPilot account first. Use the email they signed up with.</p>
        <label class="lbl" for="proEmail">Their email</label>
        <input class="input plain" id="proEmail" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="friend@example.com" required>
        <label class="lbl" for="proLength">How long</label>
        <select class="input plain" id="proLength"><option value="1">1 month</option><option value="3">3 months</option><option value="12">1 year</option><option value="forever" selected>Forever</option><option value="0">Take Pro away</option></select>
        <p class="form-msg" id="proGiftMsg" role="status"></p>
        <button class="btn primary" type="submit">Save</button>
      </form>
      <div id="proList"></div></section>`;
  }
  async function loadProList() {
    const el = $('#proList'); if (!el || !acct.user?.isAdmin) return;
    try {
      const rows = await B.adminListPro();
      el.innerHTML = `<h3 class="sub-h">Everyone with Pro <span class="muted num">${rows.length}</span></h3>` + (rows.length ? `<ul class="pro-list">${rows.map(r => `<li><span><b>${esc(r.name || 'No name')}</b> <span class="note">${esc(r.email)}</span></span>
        <span class="note">${r.paid ? 'Paying · ' : 'Free · '}${r.proUntil ? 'until ' + esc(new Date(r.proUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) : 'forever'}</span>
        <button type="button" class="linkish" data-action="pro-edit" data-email="${esc(r.email)}">Change</button></li>`).join('')}</ul>` : '<p class="note">Nobody has Pro yet.</p>');
    } catch (e) { el.innerHTML = `<p class="note">Couldn’t load the Pro list: ${esc(e.message)}</p>`; }
  }
  async function loadReports() {
    if (!acct.user?.isAdmin) return;
    try { state.mod.data = await B.listReports(); state.mod.error = ''; } catch (e) { state.mod.error = e.message; }
    renderReports();
  }
  function reasonSummary(reasons) {
    const c = reasons.reduce((m, r) => { m[r] = (m[r] || 0) + 1; return m; }, {});
    return Object.entries(c).map(([r, n]) => `<span class="tag">${esc(r)}${n > 1 ? ` ×${n}` : ''}</span>`).join('');
  }
  function renderReports() {
    const el = $('#modBody'); if (!el) return;
    if (state.mod.error) { el.innerHTML = `<div class="empty"><h3>Couldn’t load reports</h3><p>${esc(state.mod.error)}</p></div>`; return; }
    const { comments = [], recipes = [] } = state.mod.data || {};
    const status = hidden => `<span class="mod-status ${hidden ? 'hidden' : ''}">${hidden ? 'Hidden' : 'Visible'}</span>`;
    el.innerHTML = `
      <section class="lib-section"><div class="section-head"><h2>Reported comments <span class="muted num">${comments.length}</span></h2></div>
        ${comments.length ? comments.map(c => `<article class="panel mod-item">
          <div class="mod-top">${status(c.hidden)}<b>${esc(c.author)}</b><span class="note">${esc(ago(c.createdAt))}</span><a class="linkish" href="#recipe-${esc(c.recipeId)}">Open recipe</a></div>
          ${c.body ? `<p class="c-body">${esc(c.body)}</p>` : ''}${c.photo && /^data:image\/jpeg;base64,/.test(c.photo) ? `<img class="c-photo" src="${c.photo}" alt="Reported photo">` : ''}
          <div class="tags">${reasonSummary(c.reasons)}</div>
          <div class="actions"><button type="button" class="btn small" data-action="mod" data-kind="comment" data-op="${c.hidden ? 'unhide' : 'hide'}" data-id="${esc(c.id)}">${c.hidden ? 'Unhide' : 'Hide'}</button>
            <button type="button" class="btn small" data-action="mod" data-kind="comment" data-op="dismiss" data-id="${esc(c.id)}">Dismiss reports</button>
            <button type="button" class="btn small danger" data-action="mod" data-kind="comment" data-op="delete" data-id="${esc(c.id)}">Delete</button></div>
        </article>`).join('') : '<p class="note">No reported comments.</p>'}
      </section>
      <section class="lib-section"><div class="section-head"><h2>Reported recipes <span class="muted num">${recipes.length}</span></h2></div>
        ${recipes.length ? recipes.map(r => `<article class="panel mod-item">
          <div class="mod-top">${status(r.hidden)}<b>${esc(r.title)}</b><a class="linkish" href="#recipe-u-${esc(r.id)}">Open recipe</a></div>
          <p class="note">${esc(r.description || '')}</p>
          <div class="tags">${reasonSummary(r.reasons)}</div>
          <div class="actions"><button type="button" class="btn small" data-action="mod" data-kind="recipe" data-op="${r.hidden ? 'unhide' : 'hide'}" data-id="${esc(r.id)}">${r.hidden ? 'Unhide' : 'Hide'}</button>
            <button type="button" class="btn small" data-action="mod" data-kind="recipe" data-op="dismiss" data-id="${esc(r.id)}">Dismiss reports</button>
            <button type="button" class="btn small danger" data-action="mod" data-kind="recipe" data-op="delete" data-id="${esc(r.id)}">Delete</button></div>
        </article>`).join('') : '<p class="note">No reported recipes.</p>'}
      </section>`;
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    switch (el.dataset.action) {
      case 'house-share': openShareSheet(); break;
      case 'house-join-open':
        openSheet('Join a shared list', '', `<form class="form" id="joinForm"><label class="lbl" for="joinCode">Code from the invite</label>
          <input class="input plain" id="joinCode" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="e.g. 4F7A2C" required>
          <p class="form-msg" id="joinMsg" role="alert"></p><button class="btn primary" type="submit">Join list</button></form>`, () => setTimeout(() => $('#joinCode')?.focus(), 30));
        break;
      case 'house-join': case 'house-join-skip': {
        try { localStorage.removeItem(JOIN_KEY); } catch { }
        if (el.dataset.action === 'house-join-skip') { closeSheet(); break; }
        try { const h = await B.joinHousehold(el.dataset.code); await attachHousehold(h, true); closeSheet(); toast('You’re shopping together now'); location.hash = 'list'; }
        catch (err) { toast(esc(err.message)); }
        break;
      }
      case 'house-leave': {
        if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tap again to leave'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Leave'; } }, 3000); break; }
        try { await B.leaveHousehold(); leaveHouseholdLocal(); store.set('list', state.list); refresh(); toast('You left the shared list. You kept a copy of it.'); }
        catch (err) { toast(esc(err.message)); }
        break;
      }
      case 'copy-join': {
        const i = $('#joinLink');
        try { await navigator.clipboard.writeText(i.value); toast('Invite link copied'); } catch { i.focus(); i.select(); }
        break;
      }
      case 'pro-edit': {
        const i = $('#proEmail'); if (!i) break;
        i.value = el.dataset.email; $('#proLength').value = '0'; i.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('#proLength').focus();
        break;
      }
      case 'mod': {
        const { kind, op, id } = el.dataset;
        if (op === 'delete' && !el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tap again to delete'; break; }
        try {
          if (kind === 'comment') {
            if (op === 'hide' || op === 'unhide') await B.setCommentHidden(id, op === 'hide');
            else if (op === 'delete') await B.adminDeleteComment(id);
            else await B.dismissReports('comment', id);
          } else {
            if (op === 'hide' || op === 'unhide') await B.setRecipeHidden(id, op === 'hide');
            else if (op === 'delete') await B.adminDeleteRecipe(id);
            else await B.dismissReports('recipe', id);
          }
          toast({ hide: 'Hidden', unhide: 'Visible again', delete: 'Deleted', dismiss: 'Reports dismissed' }[op]);
          loadReports();
        } catch (err) { toast(esc(err.message)); }
        break;
      }
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'planNoteForm') return;
    e.preventDefault();
    const f = e.target;
    setPlanNote(f.dataset.day, f.dataset.slot, f.dataset.id, $('#planNoteText').value);
    setPlanPeople(f.dataset.day, f.dataset.slot, f.dataset.id, readPeople());
    save.plan(); closeSheet(); refresh(); toast('Saved');
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'proGiftForm') return;
    e.preventDefault();
    const email = $('#proEmail').value.trim(), v = $('#proLength').value, msg = $('#proGiftMsg'), btn = e.target.querySelector('button[type=submit]');
    const months = v === 'forever' ? null : Number(v);
    btn.disabled = true; msg.textContent = 'Saving…';
    try {
      const r = await B.adminSetPro(email, months);
      const who = r.name || email;
      msg.textContent = !r.pro ? `${who} no longer has Pro.` : r.proUntil ? `${who} has Pro until ${new Date(r.proUntil).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.` : `${who} has Pro forever.`;
      toast(r.pro ? 'Pro given' : 'Pro removed');
      $('#proEmail').value = ''; loadProList();
    } catch (err) { msg.textContent = err.message; }
    btn.disabled = false;
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'joinForm') return;
    e.preventDefault();
    const code = $('#joinCode').value.trim();
    if (!code) return;
    try { const h = await B.joinHousehold(code); await attachHousehold(h, true); closeSheet(); toast('You’re shopping together now'); }
    catch (err) { $('#joinMsg').textContent = err.message; }
  });

  /* ---------- router ---------- */
  let currentView = null;
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    let view = 'kitchen', r = null;
    if (h.startsWith('recipe-')) {
      r = byId.get(h.slice(7));
      if (!r && h.startsWith('recipe-u-')) { view = 'loading'; loadShared(h.slice(9)); }
      else view = r ? 'recipe' : 'kitchen';
    }
    else if (h.startsWith('collection-') && COLLECTIONS.some(c => c.id === h.slice(11))) view = 'collection';
    else if (['pantry', 'plan', 'list', 'saved', 'add', 'welcome', 'community', 'admin'].includes(h)) view = h;
    const guest = acct.ready && !acct.user;
    document.body.classList.toggle('guest', guest);
    if (!acct.ready) { if (view !== 'recipe') view = 'waiting'; } // don't flash the home page while checking for a signed-in account
    else if (guest) view = view === 'recipe' && !r.mine && !h.startsWith('recipe-u-') ? 'preview' : 'home';
    if (!acct.ready && view === 'recipe') view = 'waiting';
    const changed = view !== currentView || view === 'recipe' || view === 'preview';
    currentView = view;
    renderNav(view);
    const main = $('#main');
    const html = { kitchen: viewKitchen, pantry: viewPantry, plan: viewPlan, list: viewList, saved: viewSaved, add: viewAdd, welcome: viewWelcome, community: viewCommunity, loading: viewLoading, admin: viewAdmin, collection: () => viewCollection(h.slice(11)) }[view];
    main.innerHTML = view === 'recipe' ? viewRecipe(r) : view === 'preview' ? viewPreview(r) : view === 'home' ? viewHome() : view === 'waiting' ? viewWaiting() : html();
    setTimeout(fillAds, 0);
    if (view === 'kitchen') mountKitchen();
    if (view === 'pantry') mountPantry();
    if (view === 'recipe' && (!r.mine || r.published)) loadComments(r.id);
    if (view === 'community') mountCommunity();
    if (view === 'admin') { loadReports(); loadProList(); }
    if (view === 'add') mountAdd();
    document.title = view === 'recipe' || view === 'preview' ? `${r.title} · PantryPilot` : view === 'home' || view === 'waiting' ? 'PantryPilot · Cook with what you already have' : view === 'kitchen' ? 'PantryPilot' : `${{ list: 'Shopping list', saved: 'Library', add: 'Add a recipe', welcome: 'Welcome', community: 'Community', loading: 'Loading', admin: 'Moderation', collection: COLLECTIONS.find(c => c.id === h.slice(11))?.title }[view] || cap(view)} · PantryPilot`;
    if (changed) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  }
  function refresh() { // re-render the current view in place, keeping scroll position
    const y = window.scrollY; route(); window.scrollTo(0, y);
  }
  let navigated = 0;
  window.addEventListener('hashchange', () => { navigated++; route(); });

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action, id = el.dataset.id;
    const r = id && byId.get(id);
    switch (a) {
      case 'fav': {
        e.preventDefault();
        const on = !state.favs.has(id); on ? state.favs.add(id) : state.favs.delete(id); save.favs();
        $$(`[data-action="fav"][data-id="${id}"]`).forEach(b => b.setAttribute('aria-pressed', on));
        renderNav(currentView);
        toast(on ? `Saved ${esc(r.title)}` : `Removed from saved`);
        if (currentView === 'saved') refresh();
        break;
      }
      case 'cat': state.f.cat = el.dataset.v; save.filters(); renderFilters(); renderResults(); break;
      case 'diet': { const v = el.dataset.v, d = state.f.diets; state.f.diets = d.includes(v) ? d.filter(x => x !== v) : [...d, v]; save.filters(); renderFilters(); renderResults(); break; }
      case 'clear-filters': Object.assign(state.f, { q: '', cat: 'all', skill: 'all', time: 0, diets: [] }); save.filters(); $('#q').value = ''; renderFilters(); renderResults(); break;
      case 'back': if (navigated > 0) { e.preventDefault(); history.back(); } break;
      case 'gather': {
        const i = +el.dataset.i, g = state.gathered[id] = state.gathered[id] || [];
        const on = !g.includes(i); on ? g.push(i) : g.splice(g.indexOf(i), 1);
        el.setAttribute('aria-checked', on); el.closest('.ing').classList.toggle('got', on);
        break;
      }
      case 'pantry-toggle': {
        const on = togglePantry(el.dataset.key);
        const rr = byId.get(location.hash.slice(8));
        $$(`[data-action="pantry-toggle"][data-key="${CSS.escape(el.dataset.key)}"]`).forEach(b => { b.setAttribute('aria-pressed', on); b.textContent = on ? 'In pantry' : '+ Pantry'; });
        if (rr) {
          $('#pantryBar').innerHTML = pantryBar(rr);
          const m = match(rr), b = $('#addListBtn');
          b.dataset.onlyMissing = m.missing.length ? 1 : 0; b.innerHTML = `${icon('list')} ${m.missing.length ? `Add ${m.missing.length} missing to list` : 'Add to list'}`;
        }
        renderNav(currentView);
        break;
      }
      case 'serv': {
        const s = Math.min(24, Math.max(1, servingsOf(r) + (+el.dataset.d)));
        state.servings[id] = s;
        $('#servOut').textContent = `Serves ${s}`;
        $('#ingList').innerHTML = ingredientsHTML(r);
        $('#servNote').textContent = s !== r.servings ? `Scaled from ${r.servings} servings. Amounts update as you change it.` : 'Tap an ingredient to tick it off as you gather it.';
        $$('[data-action="serv"]').forEach(b => { b.disabled = (+b.dataset.d < 0 && s <= 1) || (+b.dataset.d > 0 && s >= 24); });
        break;
      }
      case 'step': {
        if (e.target.closest('.tchip')) break;
        const i = +el.dataset.i, d = state.stepsDone[id] = state.stepsDone[id] || [];
        const on = !d.includes(i); on ? d.push(i) : d.splice(d.indexOf(i), 1);
        el.classList.toggle('done', on); el.querySelector('.step-n').innerHTML = on ? icon('check') : i + 1;
        break;
      }
      case 'timer': e.stopPropagation(); startTimer(+el.dataset.sec, el.dataset.label); break;
      case 'timer-add': { const t = timers.find(x => x.id === el.dataset.t); if (t) { t.end += 60000; t.total += 60; } break; }
      case 'timer-x': { const i = timers.findIndex(x => x.id === el.dataset.t); if (i > -1) timers.splice(i, 1); renderTimers(); break; }
      case 'add-list': {
        const only = el.dataset.onlyMissing === '1';
        const doAdd = () => { const res = addRecipeToList(r, only); renderNav(currentView); if (currentView === 'list') refresh(); return res; };
        if (onList(r)) {
          toast(`${esc(r.title)} is already on your list`, { label: 'Add again', run: () => { const { added } = doAdd(); toast(`Added ${added} more item${added === 1 ? '' : 's'}`); } });
          break;
        }
        const { added, skipped } = addRecipeToList(r, only);
        renderNav(currentView);
        toast(added ? `Added ${added} item${added > 1 ? 's' : ''} for ${esc(r.title)}${skipped ? ` · skipped ${skipped} you have` : ''}` : 'Nothing to add. You have it all.', added ? { label: 'View list', run: () => { location.hash = 'list'; } } : null);
        break;
      }
      case 'plan-recipe': sheetPickDay(id); break;
      case 'plan-day': sheetPickRecipe(el.dataset.day, el.dataset.slot); break;
      case 'pick-slot': sheetPickDay(id, el.dataset.v, $('#planNote')?.value || '', readPeople()); break;
      case 'ppl-step': {
        const o = $('#planPeople'); if (!o) break;
        const n = clampPeople(+o.dataset.n + +el.dataset.d);
        o.dataset.n = n; o.textContent = peopleLabel(n);
        break;
      }
      case 'plan-add': {
        const day = el.dataset.day, slot = el.dataset.slot || slotFor(id);
        const d = state.plan[day] || (state.plan[day] = { breakfast: [], lunch: [], dinner: [] });
        d[slot].push(id);
        const note = $('#planNote')?.value.trim();
        if (note) setPlanNote(day, slot, id, note);
        if (readPeople()) setPlanPeople(day, slot, id, readPeople());
        save.plan(); closeSheet();
        toast(`Planned ${esc(r.title)} for ${esc(fmtDay(new Date(day + 'T00:00'), { weekday: 'long' }))} ${slot}`, currentView !== 'plan' ? { label: 'View plan', run: () => { location.hash = 'plan'; } } : null);
        if (currentView === 'plan') refresh();
        break;
      }
      case 'unplan': {
        const day = el.dataset.day, arr = state.plan[day]?.[el.dataset.slot];
        if (arr) { const [gone] = arr.splice(+el.dataset.i, 1); if (gone && !arr.includes(gone)) { setPlanNote(day, el.dataset.slot, gone, ''); setPlanPeople(day, el.dataset.slot, gone, 0); } }
        if (!dayIds(day).length) delete state.plan[day];
        save.plan(); refresh(); break;
      }
      case 'plan-note': {
        const { day, slot } = el.dataset, rid = el.dataset.id, rr = byId.get(rid); if (!rr) break;
        const cur = state.plan[day]?.notes?.[noteKey(slot, rid)] || '';
        openSheet(esc(rr.title), `<p class="note">${esc(fmtDay(new Date(day + 'T00:00'), { weekday: 'long', month: 'short', day: 'numeric' }))} · ${esc(slot)}</p>`,
          `<form class="form" id="planNoteForm" data-day="${esc(day)}" data-slot="${esc(slot)}" data-id="${esc(rid)}">
            ${peopleStepper(planPeople(day, slot, rr))}
            <label class="lbl" for="planNoteText">Note</label>
            <textarea class="input plain" id="planNoteText" maxlength="300" rows="3" placeholder="e.g. double it for guests, use leftover rice">${esc(cur)}</textarea>
            <div class="actions"><button class="btn primary" type="submit">Save</button>${cur ? '<button class="btn" type="button" data-action="plan-note-clear">Remove note</button>' : ''}</div>
          </form>`, () => setTimeout(() => $('#planNoteText')?.focus(), 30));
        break;
      }
      case 'plan-note-clear': {
        const f = $('#planNoteForm'); if (!f) break;
        setPlanNote(f.dataset.day, f.dataset.slot, f.dataset.id, ''); save.plan(); closeSheet(); refresh(); toast('Note removed');
        break;
      }
      case 'week': state.week += +el.dataset.d; refresh(); break;
      case 'plan-to-list': {
        let added = 0, skipped = 0, already = 0;
        // Add up the people for every time a recipe is planned this week, then buy for all of them at once.
        const total = new Map();
        weekDays(state.week).forEach(d => { const k = iso(d); SLOTS.forEach(([slot]) => (state.plan[k]?.[slot] || []).forEach(rid => {
          const x = byId.get(rid); if (x) total.set(rid, (total.get(rid) || 0) + planPeople(k, slot, x));
        })); });
        total.forEach((n, rid) => {
          const x = byId.get(rid);
          if (onList(x)) { already++; return; }
          const res = addRecipeToList(x, true, n); added += res.added; skipped += res.skipped;
        });
        renderNav(currentView);
        const parts = [`Added ${added} item${added === 1 ? '' : 's'}`];
        if (skipped) parts.push(`skipped ${skipped} in your pantry`);
        if (already) parts.push(`${already} recipe${already > 1 ? 's were' : ' was'} already on the list`);
        toast(parts.join(' · '), { label: 'View list', run: () => { location.hash = 'list'; } });
        break;
      }
      case 'tick': { const it = state.list.find(x => x.id === el.dataset.id); if (it) { it.done = !it.done; save.list(); refresh(); } break; }
      case 'rm-item': { const i = state.list.findIndex(x => x.id === el.dataset.id); if (i > -1) { const [gone] = state.list.splice(i, 1); save.list(); refresh(); toast(`Removed ${esc(gone.name)}`, { label: 'Undo', run: () => { state.list.splice(i, 0, gone); save.list(); refresh(); } }); } break; }
      case 'clear-list': {
        if (el.dataset.armed) { const old = state.list; state.list = []; save.list(); refresh(); toast('List cleared', { label: 'Undo', run: () => { state.list = old; save.list(); refresh(); } }); }
        else { el.dataset.armed = '1'; el.textContent = 'Tap again to clear'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Clear list'; } }, 3000); }
        break;
      }
      case 'stock-done': {
        const done = state.list.filter(i => i.done);
        done.forEach(i => { if (INGREDIENTS.includes(i.name)) state.pantry.add(i.name); });
        state.list = state.list.filter(i => !i.done); save.list(); save.pantry(); refresh();
        toast(`Moved ${done.length} item${done.length > 1 ? 's' : ''} into your pantry`);
        break;
      }
      case 'copy-list': {
        const text = listText();
        const fallback = () => openSheet('Copy your list', '<p class="note">Select the text below and copy it.</p>', `<div style="padding:0 8px"><textarea class="copybox" id="copyBox" readonly>${esc(text)}</textarea></div>`, () => { const b = $('#copyBox'); b.focus(); b.select(); });
        try { navigator.clipboard.writeText(text).then(() => toast('List copied. Paste it into your notes or a message.'), fallback); } catch { fallback(); }
        break;
      }
      case 'pantry-chip': {
        const on = togglePantry(el.dataset.key);
        el.setAttribute('aria-pressed', on);
        const a2 = aisleOf(el.dataset.key), cnt = $(`[data-aisle-count="${CSS.escape(a2)}"]`);
        if (cnt) { const keys = $$('[data-action="pantry-chip"]', cnt.closest('.aisle')).map(b => b.dataset.key); cnt.textContent = `${keys.filter(k => state.pantry.has(k)).length} / ${keys.length}`; }
        $('#pantryCount').textContent = `${state.pantry.size} ticked`;
        renderPantryResults(); renderNav(currentView);
        break;
      }
      case 'pantry-clear': {
        const old = [...state.pantry]; state.pantry.clear(); save.pantry(); refresh();
        toast('Pantry cleared', { label: 'Undo', run: () => { state.pantry = new Set(old); save.pantry(); refresh(); } });
        break;
      }
      case 'close-sheet': closeSheet(); break;
      case 'cook': openCook(id); break;
      case 'cook-close': closeCook(); break;
      case 'cook-prev': cook.i = Math.max(0, cook.i - 1); renderCook(); $('#cookNext')?.focus(); break;
      case 'cook-next': cook.i = Math.min(byId.get(cook.id).steps.length - 1, cook.i + 1); renderCook(); $('#cookNext')?.focus(); break;
      case 'cook-go': cook.i = +el.dataset.i; renderCook(); break;
      case 'cook-finish': { const rr = byId.get(cook.id); closeCook(); openMadeIt(rr); break; }
    }
  });

  document.addEventListener('change', e => {
    const el = e.target.closest('[data-filter]');
    if (!el) return;
    const k = el.dataset.filter;
    state.f[k] = k === 'time' ? +el.value : el.value;
    save.filters(); renderResults();
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'addForm') return;
    e.preventDefault();
    const inp = $('#newItem'), v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    const key = v.toLowerCase(), id = 'custom|' + key;
    const ex = state.list.find(x => x.id === id);
    if (ex) ex.done = false; else state.list.push({ id, name: key, qty: 0, unit: '', aisle: 'Added by you', from: [], done: false });
    save.list(); refresh();
    $('#newItem')?.focus();
  });
  document.addEventListener('keydown', e => {
    if (cookEl.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCook(); }
    else if (e.key === 'ArrowRight') { cook.i = Math.min(byId.get(cook.id).steps.length - 1, cook.i + 1); renderCook(); }
    else if (e.key === 'ArrowLeft') { cook.i = Math.max(0, cook.i - 1); renderCook(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !cookEl.hidden && !cook.lock) requestWake();
  });

  applyGifts();
  route();
  loadReferenced();
  captureRef();
  captureJoin();
  loadRatings();
  if (B) {
    B.onAuthChange(u => { onUser(u); });
    B.init().then(u => onUser(u)).catch(() => onUser(null)).then(checkoutReturn);
  }
})();
