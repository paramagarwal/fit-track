/* ═══════════════════════════════════════════════════════════════
   FITTRACK — api.js
   Google Apps Script backend + localStorage caching
   Set SHEETS_URL to your deployed Apps Script Web App URL.
═══════════════════════════════════════════════════════════════ */

// ─── CONFIG ──────────────────────────────────────────────────
// Paste your Google Apps Script Web App URL here after deployment.
// Leave empty to run fully offline (localStorage only).
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwYNUuUkLJ4W3h14oYS5T298sPY2uLxIf1xta5wt9S3u657-wDEHEJQ6paltmw1eea5/exec';

const CACHE_TTL = {
  foods:     5  * 60 * 1000,   // 5 min
  dietLog:   2  * 60 * 1000,   // 2 min
  exercises: 10 * 60 * 1000,   // 10 min
  workouts:  10 * 60 * 1000,   // 10 min
  weight:    5  * 60 * 1000,   // 5 min
  goals:     30 * 60 * 1000,   // 30 min
};

// ─── LOCAL STORAGE ───────────────────────────────────────────
const Store = {
  _p: 'ft_',

  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this._p + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },

  set(key, val) {
    try { localStorage.setItem(this._p + key, JSON.stringify(val)); }
    catch (e) { console.warn('[Store] write failed:', e); }
  },

  update(key, fn, fallback = null) {
    const current = this.get(key, fallback);
    const updated = fn(current);
    this.set(key, updated);
    return updated;
  },

  remove(key) {
    try { localStorage.removeItem(this._p + key); }
    catch (e) { /* ignore */ }
  }
};

// ─── CACHE ───────────────────────────────────────────────────
const Cache = {
  _key: k  => `ft_cache_${k}`,
  _tsKey: k => `ft_ctime_${k}`,

  get(key) {
    try {
      const ts  = parseInt(localStorage.getItem(this._tsKey(key)) || '0');
      const ttl = CACHE_TTL[key] || 60_000;
      if (Date.now() - ts > ttl) return null;
      const raw = localStorage.getItem(this._key(key));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  set(key, data) {
    try {
      localStorage.setItem(this._key(key),  JSON.stringify(data));
      localStorage.setItem(this._tsKey(key), Date.now().toString());
    } catch (e) { console.warn('[Cache] write failed:', e); }
  },

  clear(key) {
    localStorage.removeItem(this._key(key));
    localStorage.removeItem(this._tsKey(key));
  }
};

// ─── HTTP ─────────────────────────────────────────────────────
async function _fetch(action, params = {}, method = 'GET', body = null) {
  if (!SHEETS_URL) return null;

  const url = new URL(SHEETS_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (method === 'POST' && body) opts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── GOALS ───────────────────────────────────────────────────
const Goals = {
  get() {
    return Store.get('goals', { cal: 2000, prot: 150, height: 0, weight: 0 });
  },
  set(data) {
    Store.set('goals', data);
    _fetch('setGoals', {}, 'POST', data).catch(() => {});
  }
};

// ─── FOODS ───────────────────────────────────────────────────
const Foods = {
  getAll() {
    return Store.get('foods', []);
  },

  async sync() {
    const cached = Cache.get('foods');
    if (cached) return cached;
    try {
      const res = await _fetch('getFoods');
      if (res?.foods) { Store.set('foods', res.foods); Cache.set('foods', res.foods); return res.foods; }
    } catch (e) { console.warn('[Foods.sync]', e); }
    return Store.get('foods', []);
  },

  async add(food) {
    const id   = food.id || `f_${Date.now()}`;
    const item = { ...food, id };
    Store.update('foods', list => { const a = list || []; a.push(item); return a; }, []);
    Cache.clear('foods');
    try { await _fetch('addFood', {}, 'POST', item); } catch (e) { console.warn('[Foods.add]', e); }
    return item;
  },

  async remove(id) {
    Store.update('foods', list => (list || []).filter(f => f.id !== id), []);
    Cache.clear('foods');
    try { await _fetch('deleteFood', { id }, 'POST', { id }); } catch (e) { console.warn('[Foods.remove]', e); }
  }
};

// ─── DIET LOG ─────────────────────────────────────────────────
const DietLog = {
  _key(date) { return `dietlog_${date}`; },

  getDay(date) {
    return Store.get(this._key(date), []);
  },

  async addEntry(entry) {
    const id   = entry.id || `le_${Date.now()}`;
    const item = { ...entry, id };
    Store.update(this._key(entry.date), list => { const a = list || []; a.push(item); return a; }, []);
    try { await _fetch('logFood', {}, 'POST', item); } catch (e) { console.warn('[DietLog.addEntry]', e); }
    return item;
  },

  removeEntry(date, id) {
    Store.update(this._key(date), list => (list || []).filter(e => e.id !== id), []);
  },

  getHistory(days = 30) {
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds      = dateStr(d);
      const entries = Store.get(this._key(ds), []);
      if (entries.length) result.push({ date: ds, entries });
    }
    return result;
  }
};

// ─── EXERCISES ────────────────────────────────────────────────
const Exercises = {
  getAll() {
    return Store.get('exercises', []);
  },

  async sync() {
    const cached = Cache.get('exercises');
    if (cached) return cached;
    try {
      const res = await _fetch('getExercises');
      if (res?.exercises) { Store.set('exercises', res.exercises); Cache.set('exercises', res.exercises); return res.exercises; }
    } catch (e) { console.warn('[Exercises.sync]', e); }
    return Store.get('exercises', []);
  },

  async add(ex) {
    const id   = ex.id || `e_${Date.now()}`;
    const item = { ...ex, id };
    Store.update('exercises', list => { const a = list || []; a.push(item); return a; }, []);
    Cache.clear('exercises');
    try { await _fetch('addExercise', {}, 'POST', item); } catch (e) { console.warn('[Exercises.add]', e); }
    return item;
  },

  async remove(id) {
    Store.update('exercises', list => (list || []).filter(e => e.id !== id), []);
    Cache.clear('exercises');
    try { await _fetch('deleteExercise', { id }, 'POST', { id }); } catch (e) { console.warn('[Exercises.remove]', e); }
  }
};

// ─── WORKOUTS ─────────────────────────────────────────────────
const Workouts = {
  getTemplates() {
    return Store.get('workout_templates', []);
  },

  async addTemplate(t) {
    const id   = t.id || `wt_${Date.now()}`;
    const item = { ...t, id };
    Store.update('workout_templates', list => { const a = list || []; a.push(item); return a; }, []);
    try { await _fetch('addWorkoutTemplate', {}, 'POST', item); } catch (e) { console.warn('[Workouts.addTemplate]', e); }
    return item;
  },

  async removeTemplate(id) {
    Store.update('workout_templates', list => (list || []).filter(t => t.id !== id), []);
    try { await _fetch('deleteWorkoutTemplate', { id }, 'POST', { id }); } catch (e) { console.warn('[Workouts.removeTemplate]', e); }
  },

  getHistory(days = 60) {
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds   = dateStr(d);
      const logs = Store.get(`wklog_${ds}`, []);
      if (logs.length) result.push({ date: ds, sessions: logs });
    }
    return result;
  },

  async logSession(session) {
    const ds   = session.date || dateStr(new Date());
    const id   = session.id || `ws_${Date.now()}`;
    const item = { ...session, id, date: ds };
    Store.update(`wklog_${ds}`, list => { const a = list || []; a.push(item); return a; }, []);
    try { await _fetch('logWorkout', {}, 'POST', item); } catch (e) { console.warn('[Workouts.logSession]', e); }
    return item;
  }
};

// ─── WEIGHT ───────────────────────────────────────────────────
const WeightLog = {
  getAll() {
    return Store.get('weight_log', []);
  },

  async add(entry) {
    const item = { date: entry.date || dateStr(new Date()), kg: entry.kg };
    Store.update('weight_log', list => {
      const a = list || [];
      const idx = a.findIndex(x => x.date === item.date);
      if (idx > -1) a[idx] = item; else a.push(item);
      a.sort((a, b) => a.date.localeCompare(b.date));
      return a;
    }, []);
    try { await _fetch('logWeight', {}, 'POST', item); } catch (e) { console.warn('[WeightLog.add]', e); }
    return item;
  }
};

// ─── UTILITY ──────────────────────────────────────────────────
function dateStr(d = new Date()) {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}
