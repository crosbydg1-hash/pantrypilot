/* PantryPilot backend: accounts, profiles, synced user data, comments, ratings and invites.
 * One interface, two implementations:
 *   - Supabase, when config.js has a project URL and key (real accounts, shared comments)
 *   - Demo, otherwise (everything kept in this browser so the app can be tried without a server)
 * Every method returns a Promise and throws an Error with a readable message on failure. */
(() => {
  'use strict';
  const cfg = window.PP_CONFIG || {};
  const listeners = new Set();
  const emit = user => listeners.forEach(fn => { try { fn(user); } catch (e) { console.error(e); } });
  const friendly = e => {
    const m = String(e?.message || e || 'Something went wrong');
    if (/invalid login credentials/i.test(m)) return 'That email and password don’t match an account.';
    if (/already registered|already exists/i.test(m)) return 'An account with that email already exists. Try signing in.';
    if (/password should be at least/i.test(m)) return 'Use a password of at least 8 characters.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link we sent.';
    if (/failed to fetch|network/i.test(m)) return 'Couldn’t reach the server. Check your connection and try again.';
    if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
    if (/comments_body_check/i.test(m)) return 'Write something or add a photo first.';
    return m;
  };
  const fail = e => { throw new Error(friendly(e)); };
  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const future = t => !!t && new Date(t) > new Date();
  const DATA_FIELDS = ['pantry', 'favs', 'list', 'plan', 'prefs', 'cooked', 'gifts', 'pantry_dates'];

  /* ---------------- Supabase ---------------- */
  function supabaseBackend() {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    let current = null;
    // Calls one of PantryPilot's server functions and turns its error reply into a readable message.
    async function invoke(name, body) {
      const { data, error } = await sb.functions.invoke(name, { body });
      if (error) {
        let info = {};
        try { info = await error.context.json(); } catch { }
        throw Object.assign(new Error(info.error || friendly(error)), { code: info.code || 'error' });
      }
      return data;
    }
    async function toUser(authUser) {
      if (!authUser) return null;
      const { data } = await sb.from('profiles')
        .select('display_name, is_pro, pro_until, avatar, bio, referral_code, bonus_until, created_at, is_admin').eq('id', authUser.id).maybeSingle();
      const paid = !!data?.is_pro && (!data.pro_until || future(data.pro_until));
      return {
        id: authUser.id, email: authUser.email,
        name: data?.display_name || authUser.user_metadata?.display_name || authUser.email.split('@')[0],
        pro: paid || future(data?.bonus_until), paidPro: paid, bonusUntil: data?.bonus_until || null,
        avatar: data?.avatar || '', bio: data?.bio || '', refCode: data?.referral_code || '', since: data?.created_at || null, isAdmin: !!data?.is_admin
      };
    }
    // Supabase advises not awaiting its own calls inside this callback (it can deadlock), so defer the work.
    sb.auth.onAuthStateChange((_event, session) => {
      setTimeout(async () => {
        const u = await toUser(session?.user || null).catch(() => null);
        const changed = (u && u.id) !== (current && current.id);
        current = u;
        if (changed) emit(current);
      }, 0);
    });

    return {
      mode: 'supabase',
      async init() { const { data } = await sb.auth.getSession(); current = await toUser(data.session?.user || null); return current; },
      user: () => current,
      onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      async signUp({ email, password, name, ref }) {
        const meta = { display_name: name };
        if (ref) meta.ref = ref;
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: location.origin + location.pathname } });
        if (error) fail(error);
        return { needsConfirmation: !data.session };
      },
      async signIn({ email, password }) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) fail(error);
      },
      async signOut() { const { error } = await sb.auth.signOut(); if (error) fail(error); },
      async resetPassword(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) fail(error);
      },
      async updateProfile({ name, avatar, bio }) {
        const patch = {};
        if (name != null) patch.display_name = name;
        if (avatar != null) patch.avatar = avatar || null;
        if (bio != null) patch.bio = bio || null;
        const { error } = await sb.from('profiles').update(patch).eq('id', current.id);
        if (error) fail(error);
        current = { ...current, ...(name != null && { name }), ...(avatar != null && { avatar }), ...(bio != null && { bio }) };
        emit(current);
      },
      async updateName(name) { return this.updateProfile({ name }); },
      async getProfile(userId) {
        const { data, error } = await sb.from('profiles').select('id, display_name, avatar, bio, created_at').eq('id', userId).maybeSingle();
        if (error) fail(error);
        return data && { id: data.id, name: data.display_name, avatar: data.avatar || '', bio: data.bio || '', since: data.created_at };
      },
      async deleteAccount() {
        const { error } = await sb.rpc('delete_my_account');
        if (error) fail(error);
        await sb.auth.signOut().catch(() => {});
      },

      async loadData() {
        const { data, error } = await sb.from('user_data').select(DATA_FIELDS.join(', ')).eq('user_id', current.id).maybeSingle();
        if (error) fail(error);
        return data || null;
      },
      async saveData(d) {
        const { error } = await sb.from('user_data').upsert({ user_id: current.id, ...d, updated_at: new Date().toISOString() });
        if (error) fail(error);
      },

      async listComments(recipeId) {
        const { data, error } = await sb.from('comments')
          .select('id, body, photo, rating, created_at, user_id, profiles(display_name, avatar)')
          .eq('recipe_id', recipeId).order('created_at', { ascending: true }).limit(200);
        if (error) fail(error);
        return (data || []).map(c => ({ id: c.id, body: c.body, photo: c.photo, rating: c.rating, createdAt: c.created_at, userId: c.user_id, name: c.profiles?.display_name || 'Cook', avatar: c.profiles?.avatar || '' }));
      },
      async addComment(recipeId, body, extra = {}) {
        const row = { recipe_id: recipeId, user_id: current.id, body: body || '' };
        if (extra.photo) row.photo = extra.photo;
        if (extra.rating) row.rating = extra.rating;
        const { error } = await sb.from('comments').insert(row);
        if (error) fail(error);
      },
      async deleteComment(id) { const { error } = await sb.from('comments').delete().eq('id', id); if (error) fail(error); },
      async reportComment(id, reason) {
        const { error } = await sb.from('comment_reports').insert({ comment_id: id, reporter_id: current.id, reason });
        if (error && !/duplicate/i.test(error.message)) fail(error);
      },
      async listBlocked() {
        if (!current) return [];
        const { data, error } = await sb.from('blocks').select('blocked_id').eq('user_id', current.id);
        if (error) fail(error);
        return (data || []).map(b => b.blocked_id);
      },
      async block(userId) {
        const { error } = await sb.from('blocks').insert({ user_id: current.id, blocked_id: userId });
        if (error && !/duplicate/i.test(error.message)) fail(error);
      },
      async unblock(userId) { const { error } = await sb.from('blocks').delete().eq('user_id', current.id).eq('blocked_id', userId); if (error) fail(error); },

      async ratingSummary() {
        const { data, error } = await sb.from('recipe_ratings').select('recipe_id, average, count');
        if (error) fail(error);
        return Object.fromEntries((data || []).map(r => [r.recipe_id, { average: Number(r.average), count: r.count }]));
      },
      async myRatings() {
        if (!current) return {};
        const { data, error } = await sb.from('ratings').select('recipe_id, stars').eq('user_id', current.id);
        if (error) fail(error);
        return Object.fromEntries((data || []).map(r => [r.recipe_id, r.stars]));
      },
      async rate(recipeId, stars) {
        const { error } = await sb.from('ratings').upsert({ user_id: current.id, recipe_id: recipeId, stars, updated_at: new Date().toISOString() });
        if (error) fail(error);
      },

      async refreshUser() { const { data } = await sb.auth.getUser(); current = await toUser(data.user); emit(current); return current; },
      // Sends the person to Stripe's secure checkout page. Pro switches on when Stripe confirms the payment.
      async startPro(on = true, plan = 'year') {
        if (!on) throw new Error('Cancel from Manage subscription.');
        const data = await invoke('create-checkout', { plan });
        location.href = data.url;
        return new Promise(() => {}); // the page is leaving
      },
      async manageSubscription() {
        const data = await invoke('customer-portal', {});
        location.href = data.url;
        return new Promise(() => {});
      },
      async listRecipes() {
        const { data, error } = await sb.from('user_recipes').select('*').eq('user_id', current.id).order('created_at', { ascending: false });
        if (error) fail(error);
        return data || [];
      },
      async saveRecipe(r) {
        const row = { ...r, user_id: current.id }; delete row.id;
        const { data, error } = await sb.from('user_recipes').insert(row).select('*').single();
        if (error) fail(error);
        return data;
      },
      async deleteRecipe(id) { const { error } = await sb.from('user_recipes').delete().eq('id', id); if (error) fail(error); },
      async importRecipe(payload) { return invoke('import-recipe', payload); },
      async scanReceipt(payload) { return invoke('scan-receipt', payload); },

      /* community recipes */
      async listCommunity({ offset = 0, limit = 24 } = {}) {
        const { data, error } = await sb.from('user_recipes').select(COMMUNITY_COLS)
          .eq('published', true).order('published_at', { ascending: false }).range(offset, offset + limit - 1);
        if (error) fail(error);
        return withAuthors(data || []);
      },
      async getRecipesByIds(ids) {
        if (!ids.length) return [];
        const { data, error } = await sb.from('user_recipes').select(COMMUNITY_COLS).in('id', ids.slice(0, 100));
        if (error) fail(error);
        return withAuthors(data || []);
      },
      async setPublished(id, on) {
        const { data, error } = await sb.from('user_recipes').update({ published: on }).eq('id', id).select('published, published_at').single();
        if (error) fail(error);
        return data;
      },
      async reportRecipe(id, reason) {
        const { error } = await sb.from('recipe_reports').insert({ recipe_id: id, reporter_id: current.id, reason });
        if (error && !/duplicate/i.test(error.message)) fail(error);
      },

      /* shared household shopping list */
      async getHousehold() {
        if (!current) return null;
        const { data: m } = await sb.from('household_members').select('household_id').eq('user_id', current.id).maybeSingle();
        if (!m) return null;
        const [{ data: h }, { data: people }] = await Promise.all([
          sb.from('households').select('id, code').eq('id', m.household_id).single(),
          sb.rpc('household_people')
        ]);
        return h && { id: h.id, code: h.code, people: (people || []).map(p => ({ id: p.user_id, name: p.display_name, avatar: p.avatar || '' })) };
      },
      async createHousehold() { const { error } = await sb.rpc('create_household'); if (error) fail(error); return this.getHousehold(); },
      async joinHousehold(code) { const { error } = await sb.rpc('join_household', { join_code: code }); if (error) fail(error); return this.getHousehold(); },
      async leaveHousehold() { const { error } = await sb.from('household_members').delete().eq('user_id', current.id); if (error) fail(error); },
      async listItems(hid) {
        const { data, error } = await sb.from('list_items').select('*').eq('household_id', hid);
        if (error) fail(error);
        return (data || []).map(fromRow);
      },
      async upsertItems(hid, items) {
        if (!items.length) return;
        const rows = items.map(i => ({ household_id: hid, id: i.id, name: i.name, qty: i.qty || 0, unit: i.unit || '', aisle: i.aisle || 'Added by you', sources: i.from || [], done: !!i.done, updated_by: current.id, updated_at: new Date().toISOString() }));
        const { error } = await sb.from('list_items').upsert(rows);
        if (error) fail(error);
      },
      async deleteItems(hid, ids) {
        if (!ids.length) return;
        const { error } = await sb.from('list_items').delete().eq('household_id', hid).in('id', ids);
        if (error) fail(error);
      },
      // Calls onChange({ type: 'upsert', item } | { type: 'delete', id }) when someone else edits the list.
      subscribeList(hid, onChange) {
        const ch = sb.channel('list-' + hid)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: 'household_id=eq.' + hid }, payload => {
            if (payload.eventType === 'DELETE') onChange({ type: 'delete', id: payload.old?.id });
            else onChange({ type: 'upsert', item: fromRow(payload.new), by: payload.new.updated_by });
          })
          .subscribe();
        return () => { try { sb.removeChannel(ch); } catch { } };
      },

      /* moderation (admins only; the database enforces it) */
      async listReports() {
        const [{ data: cr, error: e1 }, { data: rr, error: e2 }] = await Promise.all([
          sb.from('comment_reports').select('comment_id, reason, created_at'),
          sb.from('recipe_reports').select('recipe_id, reason, created_at')
        ]);
        if (e1 || e2) fail(e1 || e2);
        const cids = [...new Set((cr || []).map(r => r.comment_id))], rids = [...new Set((rr || []).map(r => r.recipe_id))];
        const [{ data: comments }, { data: recipes }] = await Promise.all([
          cids.length ? sb.from('comments').select('id, body, photo, hidden, recipe_id, created_at, user_id, profiles(display_name)').in('id', cids) : { data: [] },
          rids.length ? sb.from('user_recipes').select('id, title, description, hidden, published, user_id, published_at').in('id', rids) : { data: [] }
        ]);
        const group = (list, key) => list.reduce((m, r) => { (m[r[key]] = m[r[key]] || []).push(r.reason); return m; }, {});
        const cg = group(cr || [], 'comment_id'), rg = group(rr || [], 'recipe_id');
        return {
          comments: (comments || []).map(c => ({ id: c.id, body: c.body, photo: c.photo, hidden: c.hidden, recipeId: c.recipe_id, createdAt: c.created_at, author: c.profiles?.display_name || 'Unknown', reasons: cg[c.id] || [] })),
          recipes: (recipes || []).map(r => ({ id: r.id, title: r.title, description: r.description, hidden: r.hidden, published: r.published, reasons: rg[r.id] || [] }))
        };
      },
      async setCommentHidden(id, hidden) { const { error } = await sb.from('comments').update({ hidden }).eq('id', id); if (error) fail(error); },
      async setRecipeHidden(id, hidden) { const { error } = await sb.from('user_recipes').update({ hidden }).eq('id', id); if (error) fail(error); },
      async adminDeleteComment(id) { const { error } = await sb.from('comments').delete().eq('id', id); if (error) fail(error); },
      async adminDeleteRecipe(id) { const { error } = await sb.from('user_recipes').delete().eq('id', id); if (error) fail(error); },
      async dismissReports(kind, id) {
        const { error } = kind === 'comment' ? await sb.from('comment_reports').delete().eq('comment_id', id) : await sb.from('recipe_reports').delete().eq('recipe_id', id);
        if (error) fail(error);
      },
      /* free Pro (admins only; the database checks) — months: null = forever, 0 = remove */
      async adminSetPro(email, months) {
        const { data, error } = await sb.rpc('admin_set_pro', { p_email: email, p_months: months });
        if (error) fail(error);
        const r = (data || [])[0] || {};
        return { name: r.display_name, pro: !!r.is_pro, proUntil: r.pro_until || null };
      },
      async adminListPro() {
        const { data, error } = await sb.rpc('admin_list_pro');
        if (error) fail(error);
        return (data || []).map(r => ({ email: r.email, name: r.display_name, proUntil: r.pro_until, paid: !!r.paid }));
      }
    };
    async function withAuthors(rows) {
      const ids = [...new Set(rows.map(r => r.user_id))];
      let people = [];
      if (ids.length) { const { data } = await sb.from('profiles').select('id, display_name, avatar').in('id', ids); people = data || []; }
      const by = Object.fromEntries(people.map(p => [p.id, { id: p.id, name: p.display_name, avatar: p.avatar || '' }]));
      return rows.map(r => ({ ...r, author: by[r.user_id] || { id: r.user_id, name: 'A PantryPilot cook', avatar: '' } }));
    }
  }
  const fromRow = r => ({ id: r.id, name: r.name, qty: Number(r.qty) || 0, unit: r.unit || '', aisle: r.aisle, from: Array.isArray(r.sources) ? r.sources : [], done: !!r.done });
  const COMMUNITY_COLS ='id, user_id, title, description, category, image, prep_time, cook_time, calories, servings, skill_level, tags, ingredients, steps, source_url, source_kind, published, published_at, created_at';

  /* ---------------- Demo (this browser only) ---------------- */
  function demoBackend() {
    const K = 'pantrypilot-demo:';
    const get = (k, d) => { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
    const set = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch { } };
    const id = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    const code = () => Math.random().toString(36).slice(2, 9).toUpperCase();
    const hash = async s => {
      try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pp-demo:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
      catch { return 'plain:' + s.length + ':' + [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); }
    };
    const wait = (ms = 250) => new Promise(r => setTimeout(r, ms)); // feel like a network call
    const view = u => u && ({ id: u.id, email: u.email, name: u.name, pro: !!u.pro || future(u.bonusUntil), paidPro: !!u.pro, bonusUntil: u.bonusUntil || null, avatar: u.avatar || '', bio: u.bio || '', refCode: u.refCode, since: u.since || null, isAdmin: true });
    const addWeek = t => new Date(Math.max(Date.now(), t ? new Date(t).getTime() : 0) + 7 * 864e5).toISOString();
    let current = null;
    const need = () => { if (!current) throw new Error('Sign in first.'); };
    const users = () => get('users', {});
    // Every person's recipes in this browser, with author details, minus ones hidden by 3+ reports.
    const communityRows = () => {
      const all = get('recipes', {}), people = Object.values(users()), reports = get('recipeReports', []);
      return Object.values(all).flat().filter(r => reports.filter(x => x.recipeId === r.id).length < 3).map(r => {
        const u = people.find(p => p.id === r.user_id);
        return { ...r, author: { id: r.user_id, name: u?.name || 'A PantryPilot cook', avatar: u?.avatar || '' } };
      });
    };
    const saveUser = (fn) => { const all = users(); fn(all[current.email], all); set('users', all); current = view(all[current.email]); emit(current); };

    return {
      mode: 'demo',
      async init() {
        const sid = get('session', null), all = users();
        current = view(Object.values(all).find(x => x.id === sid));
        return current;
      },
      user: () => current,
      onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      async signUp({ email, password, name, ref }) {
        await wait();
        email = email.toLowerCase();
        const all = users();
        if (all[email]) throw new Error(friendly('already registered'));
        const u = { id: id(), email, name, pass: await hash(password), refCode: code(), since: new Date().toISOString() };
        const referrer = ref && Object.values(all).find(x => x.refCode === String(ref).toUpperCase());
        if (referrer) { u.bonusUntil = addWeek(null); referrer.bonusUntil = addWeek(referrer.bonusUntil); }
        all[email] = u;
        set('users', all); set('session', u.id);
        current = view(u);
        emit(current);
        return { needsConfirmation: false };
      },
      async signIn({ email, password }) {
        await wait();
        const u = users()[email.toLowerCase()];
        if (!u || u.pass !== await hash(password)) throw new Error(friendly('invalid login credentials'));
        if (!u.refCode) { const all = users(); all[u.email].refCode = code(); set('users', all); u.refCode = all[u.email].refCode; }
        set('session', u.id); current = view(u); emit(current);
      },
      async signOut() { set('session', null); current = null; emit(null); },
      async resetPassword() { await wait(); throw new Error('Password reset emails need the real server. In demo mode, create a new account instead.'); },
      async updateProfile({ name, avatar, bio }) {
        need();
        saveUser(u => { if (name != null) u.name = name; if (avatar != null) u.avatar = avatar; if (bio != null) u.bio = bio; });
      },
      async updateName(name) { return this.updateProfile({ name }); },
      async getProfile(userId) {
        await wait(100);
        const u = Object.values(users()).find(x => x.id === userId);
        return u && { id: u.id, name: u.name, avatar: u.avatar || '', bio: u.bio || '', since: u.since || null };
      },
      async deleteAccount() {
        need(); await wait();
        const all = users(); delete all[current.email]; set('users', all);
        const data = get('data', {}); delete data[current.id]; set('data', data);
        set('comments', get('comments', []).filter(c => c.userId !== current.id));
        const ratings = get('ratings', {}); Object.values(ratings).forEach(r => delete r[current.id]); set('ratings', ratings);
        set('session', null); current = null; emit(null);
      },

      async loadData() { need(); return get('data', {})[current.id] || null; },
      async saveData(d) { need(); const all = get('data', {}); all[current.id] = { ...(all[current.id] || {}), ...d }; set('data', all); },

      async listComments(recipeId) {
        await wait(120);
        const all = Object.values(users()), reports = get('reports', []);
        return get('comments', []).filter(c => c.recipeId === recipeId && reports.filter(r => r.commentId === c.id).length < 3)
          .map(c => { const u = all.find(x => x.id === c.userId); return { ...c, name: u?.name || 'Cook', avatar: u?.avatar || '' }; });
      },
      async addComment(recipeId, body, extra = {}) {
        need(); await wait();
        if (!body && !extra.photo) throw new Error(friendly('comments_body_check'));
        const all = get('comments', []);
        all.push({ id: id(), recipeId, userId: current.id, body: body || '', photo: extra.photo || null, rating: extra.rating || null, createdAt: new Date().toISOString() });
        set('comments', all);
        if (JSON.stringify(all).length > 4_000_000) throw new Error('This browser is out of space for more photos in demo mode.');
      },
      async deleteComment(cid) { need(); set('comments', get('comments', []).filter(c => !(c.id === cid && c.userId === current.id))); },
      async reportComment(cid, reason) { need(); const r = get('reports', []); if (!r.some(x => x.commentId === cid && x.by === current.id)) r.push({ commentId: cid, by: current.id, reason }); set('reports', r); },
      async listBlocked() { return current ? (get('blocks', {})[current.id] || []) : []; },
      async block(uid) { need(); const b = get('blocks', {}); b[current.id] = [...new Set([...(b[current.id] || []), uid])]; set('blocks', b); },
      async unblock(uid) { need(); const b = get('blocks', {}); b[current.id] = (b[current.id] || []).filter(x => x !== uid); set('blocks', b); },

      async ratingSummary() {
        const all = get('ratings', {});
        return Object.fromEntries(Object.entries(all).filter(([, v]) => Object.keys(v).length).map(([rid, v]) => {
          const s = Object.values(v); return [rid, { average: Math.round(s.reduce((a, b) => a + b, 0) / s.length * 10) / 10, count: s.length }];
        }));
      },
      async myRatings() { if (!current) return {}; const all = get('ratings', {}); return Object.fromEntries(Object.entries(all).filter(([, v]) => v[current.id]).map(([rid, v]) => [rid, v[current.id]])); },
      async rate(recipeId, stars) { need(); const all = get('ratings', {}); (all[recipeId] = all[recipeId] || {})[current.id] = stars; set('ratings', all); },

      async refreshUser() { return current; },
      async startPro(on = true) {
        need(); await wait(500);
        saveUser(u => { u.pro = on; if (!on) u.bonusUntil = null; });
      },
      async manageSubscription() { throw new Error('Subscriptions are managed through Stripe once the app is connected to its server.'); },
      async listRecipes() { need(); return (get('recipes', {})[current.id] || []).slice().reverse(); },
      async saveRecipe(r) {
        need(); const all = get('recipes', {}); const row = { ...r, id: id(), user_id: current.id, created_at: new Date().toISOString(), published_at: r.published ? new Date().toISOString() : null };
        all[current.id] = [...(all[current.id] || []), row];
        set('recipes', all);
        if (JSON.stringify(all).length > 4_000_000) throw new Error('This browser is out of space for more recipes in demo mode.');
        return row;
      },
      async deleteRecipe(rid) { need(); const all = get('recipes', {}); all[current.id] = (all[current.id] || []).filter(r => r.id !== rid); set('recipes', all); },

      /* community recipes */
      async listCommunity({ offset = 0, limit = 24 } = {}) {
        await wait(150);
        return communityRows().filter(r => r.published).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(offset, offset + limit);
      },
      async getRecipesByIds(ids) { await wait(80); return communityRows().filter(r => ids.includes(r.id) && (r.published || r.user_id === current?.id)); },
      async setPublished(rid, on) {
        need(); const all = get('recipes', {});
        const r = (all[current.id] || []).find(x => x.id === rid); if (!r) throw new Error('Recipe not found.');
        r.published = on; if (on) r.published_at = new Date().toISOString();
        set('recipes', all);
        return { published: r.published, published_at: r.published_at };
      },
      async reportRecipe(rid, reason) { need(); const r = get('recipeReports', []); if (!r.some(x => x.recipeId === rid && x.by === current.id)) r.push({ recipeId: rid, by: current.id, reason }); set('recipeReports', r); },

      /* shared household shopping list (demo: shared between accounts in this browser) */
      async getHousehold() {
        if (!current) return null;
        const hs = get('households', {});
        const [hid, h] = Object.entries(hs).find(([, x]) => x.members.includes(current.id)) || [];
        if (!h) return null;
        const people = Object.values(users());
        return { id: hid, code: h.code, people: h.members.map(id => { const u = people.find(p => p.id === id); return { id, name: u?.name || 'Cook', avatar: u?.avatar || '' }; }) };
      },
      async createHousehold() {
        need(); const hs = get('households', {});
        if (!Object.values(hs).some(x => x.members.includes(current.id))) hs[id()] = { code: code().slice(0, 6), members: [current.id] };
        set('households', hs); return this.getHousehold();
      },
      async joinHousehold(c) {
        need(); const hs = get('households', {});
        const entry = Object.entries(hs).find(([, x]) => x.code === String(c).trim().toUpperCase());
        if (!entry) throw new Error('That code doesn’t match a shared list. Check it and try again.');
        Object.values(hs).forEach(x => { x.members = x.members.filter(m => m !== current.id); });
        entry[1].members.push(current.id); set('households', hs); return this.getHousehold();
      },
      async leaveHousehold() { need(); const hs = get('households', {}); Object.values(hs).forEach(x => { x.members = x.members.filter(m => m !== current.id); }); set('households', hs); },
      async listItems(hid) { return Object.values(get('listItems', {})[hid] || {}); },
      async upsertItems(hid, items) { const all = get('listItems', {}); all[hid] = all[hid] || {}; items.forEach(i => { all[hid][i.id] = { ...i }; }); set('listItems', all); },
      async deleteItems(hid, ids) { const all = get('listItems', {}); ids.forEach(i => { delete (all[hid] || {})[i]; }); set('listItems', all); },
      subscribeList(hid, onChange) {
        const fn = e => { if (e.key === K + 'listItems') onChange({ type: 'reload' }); };
        window.addEventListener('storage', fn);
        return () => window.removeEventListener('storage', fn);
      },

      /* moderation (demo: every demo account can try it) */
      async listReports() {
        const cr = get('reports', []), rr = get('recipeReports', []), comments = get('comments', []), people = Object.values(users());
        const recipes = Object.values(get('recipes', {})).flat();
        const cids = [...new Set(cr.map(r => r.commentId))], rids = [...new Set(rr.map(r => r.recipeId))];
        return {
          comments: cids.map(cid => comments.find(c => c.id === cid)).filter(Boolean).map(c => ({ id: c.id, body: c.body, photo: c.photo, hidden: !!c.hidden || cr.filter(r => r.commentId === c.id).length >= 3, recipeId: c.recipeId, createdAt: c.createdAt, author: people.find(p => p.id === c.userId)?.name || 'Unknown', reasons: cr.filter(r => r.commentId === c.id).map(r => r.reason) })),
          recipes: rids.map(rid => recipes.find(r => r.id === rid)).filter(Boolean).map(r => ({ id: r.id, title: r.title, description: r.description, hidden: !!r.hidden, published: !!r.published, reasons: rr.filter(x => x.recipeId === r.id).map(x => x.reason) }))
        };
      },
      async setCommentHidden(cid, hidden) { const all = get('comments', []); const c = all.find(x => x.id === cid); if (c) c.hidden = hidden; set('comments', all); if (!hidden) set('reports', get('reports', []).filter(r => r.commentId !== cid)); },
      async setRecipeHidden(rid, hidden) { const all = get('recipes', {}); Object.values(all).flat().forEach(r => { if (r.id === rid) r.hidden = hidden; }); set('recipes', all); if (!hidden) set('recipeReports', get('recipeReports', []).filter(r => r.recipeId !== rid)); },
      async adminDeleteComment(cid) { set('comments', get('comments', []).filter(c => c.id !== cid)); set('reports', get('reports', []).filter(r => r.commentId !== cid)); },
      async adminDeleteRecipe(rid) { const all = get('recipes', {}); Object.keys(all).forEach(k => { all[k] = all[k].filter(r => r.id !== rid); }); set('recipes', all); set('recipeReports', get('recipeReports', []).filter(r => r.recipeId !== rid)); },
      async dismissReports(kind, xid) { if (kind === 'comment') set('reports', get('reports', []).filter(r => r.commentId !== xid)); else set('recipeReports', get('recipeReports', []).filter(r => r.recipeId !== xid)); },
      async adminSetPro(email, months) {
        need(); await wait();
        const all = users(), u = all[String(email).trim().toLowerCase()];
        if (!u) throw new Error('No PantryPilot account uses that email yet. Ask them to sign up first.');
        u.pro = months !== 0; u.proUntil = months ? new Date(Date.now() + months * 30.44 * 864e5).toISOString() : null;
        set('users', all);
        if (current && u.id === current.id) { current = view(u); emit(current); }
        return { name: u.name, pro: u.pro, proUntil: u.proUntil };
      },
      async adminListPro() {
        need(); await wait();
        return Object.values(users()).filter(u => u.pro).map(u => ({ email: u.email, name: u.name, proUntil: u.proUntil || null, paid: false }));
      },
      async scanReceipt() {
        need(); await wait(1400);
        if (!current.pro) throw Object.assign(new Error('Receipt scanning is part of PantryPilot Pro.'), { code: 'not_pro' });
        // Demo mode can't read photos, so it returns a clearly labelled example receipt.
        return {
          demo: true, store: 'Example Market',
          items: [
            { text: 'GV WHL MLK GAL', name: 'whole milk', match: 'milk' }, { text: 'CILANTRO BNCH', name: 'cilantro', match: 'cilantro' },
            { text: 'BNLS CHKN THGH', name: 'chicken thighs', match: 'chicken thighs' }, { text: 'HASS AVOCADO 3CT', name: 'avocados', match: 'avocado' },
            { text: 'LIMES', name: 'limes', match: 'lime' }, { text: 'CORN TORT 30CT', name: 'corn tortillas', match: 'corn tortillas' },
            { text: 'SPARKLING WTR', name: 'sparkling water', match: '' }, { text: 'SHRP CHEDDAR', name: 'sharp cheddar', match: 'cheddar' }
          ]
        };
      },
      async importRecipe(payload) {
        need(); await wait(1400);
        if (!current.pro) throw Object.assign(new Error('Importing recipes is part of PantryPilot Pro.'), { code: 'not_pro' });
        if (payload.kind === 'link' && !payload.caption && /instagram\.com/.test(payload.url || '')) {
          throw Object.assign(new Error('Instagram didn’t share enough of this post with us. Paste the caption below and try again.'), { code: 'need_caption' });
        }
        // Demo mode can't call Claude, so it returns a clearly labelled example to try the review-and-save flow.
        return {
          demo: true,
          site: payload.kind === 'photo' ? 'Photo' : (() => { try { return new URL(payload.url).hostname.replace(/^www\./, ''); } catch { return 'Pasted text'; } })(),
          recipe: {
            title: 'Example import: Garlic Butter Noodles', description: 'Demo mode can’t read real links or photos yet, so this is a sample recipe showing what an import looks like.',
            category: 'dinner', servings: 2, prep_time: 5, cook_time: 12, calories: 520, skill_level: 'beginner', tags: ['demo', 'quick'],
            ingredients: [{ item: 'spaghetti', quantity: 8, unit: 'oz' }, { item: 'unsalted butter', quantity: 3, unit: 'tbsp' }, { item: 'garlic cloves, minced', quantity: 4, unit: '' }, { item: 'parmesan, grated', quantity: 0.5, unit: 'cup' }, { item: 'chili flakes', quantity: 0.5, unit: 'tsp' }],
            steps: ['Cook the spaghetti in salted water for 10 minutes, saving a cup of pasta water.', 'Melt the butter over medium heat and cook the garlic 1 minute.', 'Toss in the pasta with a splash of pasta water, the parmesan and chili flakes until glossy.'],
            image: null, source_url: payload.url || null, source_kind: payload.kind
          }
        };
      }
    };
  }

  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && !window.supabase?.createClient) console.warn('PantryPilot: Supabase library did not load; running in demo mode.');
  // Add ?demo=1 to the address to try the app in demo mode even when a server is set up (handy for testing).
  let forceDemo = false;
  try { forceDemo = new URLSearchParams(location.search).get('demo') === '1'; } catch { }
  const api = configured && !forceDemo ? supabaseBackend() : demoBackend();
  api.validEmail = validEmail;
  api.clean = clean;
  window.PPBackend = api;
})();
