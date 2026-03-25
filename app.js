/* ═══════════════════════════════════════════════════════════════
   FITTRACK — app.js
   Full application logic.
   No demo data — all data flows through api.js (Store / Google Sheets).
═══════════════════════════════════════════════════════════════ */

/* ── State ── */
let calY, calM;
let volChart = null, nutChart = null, wtChart = null;
let nutMode  = 'calories';
let activeExCatFilter = 'All';  // category filter state

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  calY = now.getFullYear();
  calM = now.getMonth();

  // Header date
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('header-date').textContent =
    `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;

  // Nav
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => goTo(btn.dataset.panel))
  );

  // Tab bars
  document.querySelectorAll('.tab-bar .tab').forEach(tab =>
    tab.addEventListener('click', () => {
      const bar = tab.closest('.tab-bar');
      bar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const pn = tab.dataset.panel;
      document.querySelectorAll(`#panel-${pn} .tab-panel`).forEach(p => p.classList.remove('active'));
      document.getElementById(tab.dataset.tab).classList.add('active');
    })
  );

  // Calendar nav
  document.getElementById('cal-prev').addEventListener('click', () => {
    calM--; if (calM < 0)  { calM = 11; calY--; } buildCal();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calM++; if (calM > 11) { calM = 0;  calY++; } buildCal();
  });

  // Sync button
  document.getElementById('sync-btn').addEventListener('click', syncAll);

  // Modal close on overlay click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Build exercise category filter chips
  buildCatFilterChips();

  // Initial renders
  buildCal();
  renderHome();
  renderDietLog();
  renderFoodsDB();
  renderRecipes();
  renderDietHistory();
  renderExercises();
  renderWorkoutLog();
  renderWorkoutTemplates();
  renderWkHistory();
});

// ─── SYNC ────────────────────────────────────────────────────
async function syncAll() {
  const btn = document.getElementById('sync-btn');
  btn.classList.add('spinning');
  try {
    await Foods.sync();
    await Exercises.sync();
    renderFoodsDB();
    renderExercises();
    showToast('Synced ✓', 'success');
  } catch (e) {
    showToast('Sync failed — offline', 'error');
  } finally {
    btn.classList.remove('spinning');
  }
}

// ─── NAVIGATION ──────────────────────────────────────────────
function goTo(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelector(`.nav-item[data-panel="${name}"]`).classList.add('active');
  document.getElementById('main-content').scrollTop = 0;
  if (name === 'progress') setTimeout(() => {
    renderVolumeChart(); renderNutChart(); renderWtChart();
  }, 80);
}

// ─── DATE HELPERS ─────────────────────────────────────────────
function todayStr() { return dateStr(new Date()); }

/**
 * formatHistoryDate(label)
 * Converts relative labels ("Today", "Yesterday", "X days ago")
 * to a real formatted date string: "24 Mar 2026"
 */
function formatHistoryDate(label) {
  if (!label) return label;
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();

  // Already a YYYY-MM-DD date string
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [y, m, d] = label.split('-').map(Number);
    return `${String(d).padStart(2,'0')} ${MONTHS_SHORT[m-1]} ${y}`;
  }

  const low = label.toLowerCase().trim();
  let offsetDays = 0;

  if (low === 'today') {
    offsetDays = 0;
  } else if (low === 'yesterday') {
    offsetDays = 1;
  } else {
    // "X days ago"
    const m = low.match(/^(\d+)\s+days?\s+ago$/);
    if (m) offsetDays = parseInt(m[1]);
    else return label; // unknown format — return as-is
  }

  const d = new Date(now);
  d.setDate(now.getDate() - offsetDays);
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── HOME ─────────────────────────────────────────────────────
function renderHome() {
  const goals   = Goals.get();
  const todayLog = DietLog.getDay(todayStr());
  const calTotal = todayLog.reduce((s, e) => s + (Number(e.cal)  || 0), 0);
  const protTotal= todayLog.reduce((s, e) => s + (Number(e.prot) || 0), 0);

  // Rings
  const C       = 314.16;
  const calPct  = goals.cal  ? Math.min(1, calTotal  / goals.cal)  : 0;
  const protPct = goals.prot ? Math.min(1, protTotal / goals.prot) : 0;
  setTimeout(() => {
    document.getElementById('ring-cal-fill').style.strokeDashoffset  = C * (1 - calPct);
    document.getElementById('ring-prot-fill').style.strokeDashoffset = C * (1 - protPct);
  }, 300);

  document.getElementById('ring-cal-val').textContent  = calTotal.toLocaleString();
  document.getElementById('ring-prot-val').textContent = protTotal;
  document.getElementById('ring-cal-goal').textContent  = `/ ${(goals.cal  || '—').toLocaleString()} goal`;
  document.getElementById('ring-prot-goal').textContent = `/ ${goals.prot  || '—'}g goal`;

  function setStatus(elId, ratio) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (ratio <= 0)         { el.className = 'ring-status status-below'; el.textContent = 'No data'; }
    else if (ratio < 0.85)  { el.className = 'ring-status status-below'; el.textContent = 'Below Goal ↓'; }
    else if (ratio > 1.05)  { el.className = 'ring-status status-above'; el.textContent = 'Above Goal ↑'; }
    else                    { el.className = 'ring-status status-on';    el.textContent = 'On Track ✓'; }
  }
  setStatus('ring-cal-status',  calPct);
  setStatus('ring-prot-status', protPct);

  // Summary cards
  const calPct100  = goals.cal  ? Math.round((calTotal  / goals.cal)  * 100) : 0;
  const protPct100 = goals.prot ? Math.round((protTotal / goals.prot) * 100) : 0;
  document.getElementById('summary-cal-val').textContent   = `${calTotal.toLocaleString()} kcal`;
  document.getElementById('summary-prot-val').textContent  = `${protTotal}g`;
  document.getElementById('summary-cal-badge').textContent = `${calPct100}%`;
  document.getElementById('summary-prot-badge').textContent= `${protPct100}%`;

  // Workout done?
  const wkHistory = Workouts.getHistory(1);
  const wkToday   = wkHistory.find(h => h.date === todayStr());
  const wkEl   = document.getElementById('summary-workout-val');
  const wkBadge= document.getElementById('summary-workout-badge');
  if (wkToday?.sessions?.length) {
    wkEl.textContent = wkToday.sessions[0].name || 'Done';
    wkBadge.textContent = 'Done'; wkBadge.className = 'summary-badge badge-done';
  } else {
    wkEl.textContent  = 'Not done';
    wkBadge.textContent = '—'; wkBadge.className = 'summary-badge badge-neutral';
  }

  // BMI
  const g = Goals.get();
  if (g.weight && g.height) {
    const bmi = +(g.weight / Math.pow(g.height / 100, 2)).toFixed(1);
    document.getElementById('bmi-weight-val').textContent = g.weight;
    document.getElementById('bmi-val').textContent = bmi;
    let cat = '—';
    if (bmi < 18.5) cat = 'Underweight';
    else if (bmi < 25) cat = 'Normal';
    else if (bmi < 30) cat = 'Overweight';
    else cat = 'Obese';
    document.getElementById('bmi-cat').textContent = cat;
  }

  // Empty state
  const hasData = todayLog.length > 0 || wkToday;
  document.getElementById('home-empty').classList.toggle('hidden', !!hasData);
}

// ─── CALENDAR ────────────────────────────────────────────────
function buildCal() {
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = `${MONTHS[calM]} ${calY}`;

  const wrap      = document.getElementById('calendar-grid');
  const firstDay  = new Date(calY, calM, 1).getDay();
  const totalDays = new Date(calY, calM + 1, 0).getDate();
  const prevDays  = new Date(calY, calM, 0).getDate();
  const today     = new Date();
  const isCurMon  = today.getFullYear() === calY && today.getMonth() === calM;

  // Build activity map for this month
  const actMap = {};
  for (let d = 1; d <= totalDays; d++) {
    const ds  = `${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasDiet = DietLog.getDay(ds).length > 0;
    const hasWk   = (Store.get(`wklog_${ds}`, [])).length > 0;
    if (hasDiet && hasWk)       actMap[d] = 'full';
    else if (hasDiet || hasWk)  actMap[d] = 'active';
  }

  const lbls = document.createElement('div');
  lbls.className = 'cal-day-labels';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const s = document.createElement('span'); s.className = 'cal-day-lbl'; s.textContent = d;
    lbls.appendChild(s);
  });

  const cells = document.createElement('div');
  cells.className = 'cal-cells';

  // Prev month fill
  for (let i = firstDay - 1; i >= 0; i--) {
    const c = document.createElement('div'); c.className = 'cal-cell empty';
    c.textContent = prevDays - i; cells.appendChild(c);
  }
  // Current month
  for (let d = 1; d <= totalDays; d++) {
    const c   = document.createElement('div');
    const act = actMap[d] || '';
    const isT = isCurMon && d === today.getDate();
    c.className = `cal-cell${act ? ' ' + act : ''}${isT ? ' today' : ''}`;
    c.textContent = d;
    c.addEventListener('click', () => {
      const msg = act === 'full'   ? '💪🥗 Workout + Diet' :
                  act === 'active' ? '✓ Activity logged'   : 'No activity';
      showToast(`${d} ${MONTHS[calM]}: ${msg}`);
    });
    cells.appendChild(c);
  }
  // Next month fill
  const rem = (firstDay + totalDays) % 7;
  if (rem) for (let i = 1; i <= 7 - rem; i++) {
    const c = document.createElement('div'); c.className = 'cal-cell empty';
    c.textContent = i; cells.appendChild(c);
  }

  wrap.innerHTML = '';
  wrap.appendChild(lbls);
  wrap.appendChild(cells);
}

// ─── DIET: LOG ────────────────────────────────────────────────
function renderDietLog(date = todayStr()) {
  const entries = DietLog.getDay(date);
  const el      = document.getElementById('diet-log-list');
  const empty   = document.getElementById('diet-log-empty');
  el.innerHTML  = '';

  const calTotal  = entries.reduce((s, e) => s + (Number(e.cal)  || 0), 0);
  const protTotal = entries.reduce((s, e) => s + (Number(e.prot) || 0), 0);
  document.getElementById('log-total-cal').textContent  = calTotal.toLocaleString();
  document.getElementById('log-total-prot').textContent = protTotal;

  if (!entries.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  entries.forEach((f, i) => {
    const c = document.createElement('div'); c.className = 'entry-card'; c.style.animationDelay = (i * .04) + 's';
    c.innerHTML = `
      <div class="entry-card-header" onclick="toggleCard(this)">
        <div class="entry-card-left">
          <span class="entry-card-name">${f.name}</span>
          <span class="entry-card-meta">${f.qty || ''} ${f.prot ? '— ' + f.prot + 'g protein' : ''}</span>
        </div>
        <div class="entry-card-right">
          <span class="entry-card-value">${Math.round(f.cal)} kcal</span>
          <button class="delete-btn" onclick="event.stopPropagation();removeDietEntry('${date}','${f.id}')">
            <i class="ph ph-x"></i>
          </button>
        </div>
      </div>
      <div class="entry-card-body">
        <div style="display:flex;gap:16px;font-size:.8rem;color:var(--t3)">
          <span><b style="color:var(--t2)">${Math.round(f.cal)}</b> kcal</span>
          ${f.prot  ? `<span><b style="color:var(--t2)">${f.prot}g</b> protein</span>`  : ''}
          ${f.carb  ? `<span><b style="color:var(--t2)">${f.carb}g</b> carbs</span>`    : ''}
          ${f.fat   ? `<span><b style="color:var(--t2)">${f.fat}g</b> fat</span>`       : ''}
        </div>
      </div>`;
    el.appendChild(c);
  });
}

function removeDietEntry(date, id) {
  DietLog.removeEntry(date, id);
  renderDietLog(date);
  renderHome();
  buildCal();
  showToast('Entry removed');
}

// ─── DIET: FOODS DB ───────────────────────────────────────────
function renderFoodsDB(q = '') {
  const all  = Foods.getAll().filter(f => f.name.toLowerCase().includes(q.toLowerCase()));
  const el   = document.getElementById('foods-db-list');
  const empty= document.getElementById('foods-empty');
  el.innerHTML = '';

  if (!all.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  all.forEach((f, i) => {
    const c = document.createElement('div'); c.className = 'entry-card'; c.style.animationDelay = (i * .03) + 's';
    c.innerHTML = `
      <div class="entry-card-header" onclick="toggleCard(this)">
        <div class="entry-card-left">
          <span class="entry-card-name">${f.name}</span>
          <span class="entry-card-meta">Per ${f.base || '100g'}</span>
        </div>
        <div class="entry-card-right">
          <span class="entry-card-value">${f.cal} kcal</span>
          <button class="delete-btn" onclick="event.stopPropagation();Foods.remove('${f.id}').then(()=>{renderFoodsDB();showToast('Deleted')})">
            <i class="ph ph-x"></i>
          </button>
        </div>
      </div>
      <div class="entry-card-body">
        <div style="display:flex;gap:16px;font-size:.8rem;color:var(--t3)">
          ${f.prot ? `<span><b style="color:var(--t2)">${f.prot}g</b> protein</span>` : ''}
          ${f.carb ? `<span><b style="color:var(--t2)">${f.carb}g</b> carbs</span>`   : ''}
          ${f.fat  ? `<span><b style="color:var(--t2)">${f.fat}g</b> fat</span>`      : ''}
        </div>
      </div>`;
    el.appendChild(c);
  });
}
function filterFoodsDB(q) { renderFoodsDB(q); }

// ─── DIET: RECIPES ────────────────────────────────────────────
function renderRecipes() {
  const list  = Store.get('recipes', []);
  const el    = document.getElementById('recipes-list');
  const empty = document.getElementById('recipes-empty');
  el.innerHTML = '';

  if (!list.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  list.forEach((r, i) => {
    const c = document.createElement('div'); c.className = 'entry-card'; c.style.animationDelay = (i * .06) + 's';
    const ings = (r.ingredients || []).map(x =>
      `<div class="ingredient-row"><span class="ingredient-name">${x.name}</span><span class="ingredient-qty">${x.qty || ''} ${x.cal ? '· ' + x.cal + ' kcal' : ''}</span></div>`
    ).join('');
    c.innerHTML = `
      <div class="entry-card-header" onclick="toggleCard(this)">
        <div class="entry-card-left">
          <span class="entry-card-name">${r.name}</span>
          <span class="entry-card-meta">${r.prot || 0}g protein · ${(r.ingredients||[]).length} ingredients</span>
        </div>
        <div class="entry-card-right"><span class="entry-card-value">${r.cal || 0} kcal</span></div>
      </div>
      <div class="entry-card-body">${ings}
        <button style="margin-top:10px;width:100%;padding:9px;background:var(--lime-dim);border:1px solid var(--lime-bd);border-radius:var(--r10);color:var(--lime);font-size:.8125rem;font-weight:600;cursor:pointer;font-family:var(--ffd)"
          onclick="logRecipeToday('${r.name}',${r.cal||0},${r.prot||0})">
          <i class="ph ph-plus"></i> Log this recipe
        </button>
      </div>`;
    el.appendChild(c);
  });
}

async function logRecipeToday(name, cal, prot) {
  await DietLog.addEntry({ date: todayStr(), name, cal, prot, qty: '1 serving' });
  renderDietLog();
  renderHome();
  showToast(`${name} logged ✓`, 'success');
}

// ─── DIET: HISTORY ────────────────────────────────────────────
function renderDietHistory() {
  const hist  = DietLog.getHistory(30);
  const el    = document.getElementById('diet-history-list');
  const empty = document.getElementById('diet-history-empty');
  el.innerHTML = '';

  if (!hist.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  hist.forEach((day, i) => {
    const calTotal  = day.entries.reduce((s, e) => s + (Number(e.cal)  || 0), 0);
    const protTotal = day.entries.reduce((s, e) => s + (Number(e.prot) || 0), 0);
    const formattedDate = formatHistoryDate(day.date);  // ← REAL DATE

    const c = document.createElement('div'); c.className = 'history-day'; c.style.animationDelay = (i * .04) + 's';
    const rows = day.entries.map(e =>
      `<div class="history-item">
        <span class="history-item-name">${e.name}</span>
        <span class="history-item-vals">${Math.round(e.cal)} kcal${e.prot ? ' · ' + e.prot + 'g P' : ''}</span>
      </div>`
    ).join('');
    c.innerHTML = `
      <div class="history-day-header" onclick="toggleHistDay(this)">
        <div>
          <div class="history-day-title">${formattedDate}</div>
          <div class="history-day-meta">${protTotal}g protein · ${day.entries.length} items</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:.875rem;font-weight:700;color:var(--lime);font-family:var(--ffd)">${calTotal.toLocaleString()} kcal</span>
          <i class="ph ph-caret-down" style="color:var(--t3);font-size:1rem;transition:transform .2s"></i>
        </div>
      </div>
      <div class="history-day-body">${rows}</div>`;
    el.appendChild(c);
  });
}

// ─── WORKOUT: LOG ─────────────────────────────────────────────
let _activeSession = { name: '', exercises: [] };

function renderWorkoutLog() {
  const el    = document.getElementById('wk-log-exercises');
  const empty = document.getElementById('wk-log-empty');
  const saveBtn = document.getElementById('save-workout-btn');
  el.innerHTML = '';

  if (!_activeSession.exercises.length) {
    empty?.classList.remove('hidden');
    saveBtn?.classList.add('hidden');
    return;
  }
  empty?.classList.add('hidden');
  saveBtn?.classList.remove('hidden');

  _activeSession.exercises.forEach((ex, ei) => {
    const vol  = ex.sets.reduce((s, r) => s + ((r.w || 0) * (r.r || 0)), 0);
    const rows = ex.sets.map((s, i) => `
      <tr>
        <td><span class="set-num">${i + 1}</span></td>
        <td><input class="set-input" type="number" value="${s.w || ''}" placeholder="kg"
            oninput="_activeSession.exercises[${ei}].sets[${i}].w=parseFloat(this.value)||0" style="width:62px"/></td>
        <td><input class="set-input" type="number" value="${s.r || ''}" placeholder="reps"
            oninput="_activeSession.exercises[${ei}].sets[${i}].r=parseInt(this.value)||0" style="width:62px"/></td>
        <td><span class="set-prev">${s.prev || '—'}</span></td>
      </tr>`).join('');

    const c = document.createElement('div'); c.className = 'exercise-log-card';
    c.innerHTML = `
      <div class="exercise-log-header">
        <span class="exercise-log-name">${ex.name}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:.8rem;font-weight:700;color:var(--lime);font-family:var(--ffd)">${vol.toLocaleString()} kg</span>
          <button class="delete-btn" onclick="removeExFromSession(${ei})"><i class="ph ph-x"></i></button>
        </div>
      </div>
      <table class="sets-table">
        <thead><tr><th>Set</th><th>kg</th><th>Reps</th><th>Prev</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="add-set-btn" onclick="addSetToEx(${ei})"><i class="ph ph-plus"></i> Add Set</button>`;
    el.appendChild(c);
  });
}

function addExerciseToLog(name) {
  _activeSession.exercises.push({ name, sets: [{ w: '', r: '', prev: '' }] });
  renderWorkoutLog();
}
function removeExFromSession(idx) {
  _activeSession.exercises.splice(idx, 1);
  renderWorkoutLog();
}
function addSetToEx(idx) {
  _activeSession.exercises[idx].sets.push({ w: '', r: '', prev: '' });
  renderWorkoutLog();
}

async function saveWorkout() {
  const name = document.getElementById('workout-name-inp').value.trim() || 'Workout';
  if (!_activeSession.exercises.length) { showToast('Add at least one exercise', 'error'); return; }
  const session = { name, date: todayStr(), exercises: _activeSession.exercises };
  await Workouts.logSession(session);
  _activeSession = { name: '', exercises: [] };
  document.getElementById('workout-name-inp').value = '';
  renderWorkoutLog();
  renderHome();
  buildCal();
  showToast('Workout saved! 💪', 'success');
}

// ─── EXERCISES: FILTER CHIPS ──────────────────────────────────
const EX_CATEGORIES = ['All','Chest','Back','Legs','Shoulders','Arms','Core','Cardio','Other'];

function buildCatFilterChips() {
  const row = document.getElementById('cat-filter-row');
  if (!row) return;
  row.innerHTML = '';

  EX_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-chip${cat === activeExCatFilter ? ' active' : ''}`;
    btn.textContent = cat;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', cat === activeExCatFilter ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeExCatFilter = cat;
      row.querySelectorAll('.cat-chip').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      const q = document.getElementById('ex-search-inp')?.value || '';
      renderExercises(q);
    });
    row.appendChild(btn);
  });
}

// ─── EXERCISES: LIST ──────────────────────────────────────────
function renderExercises(q = '') {
  const all   = Exercises.getAll();
  const el    = document.getElementById('exercises-list');
  const empty = document.getElementById('exercises-empty');
  el.innerHTML = '';

  // Apply both search and category filter
  const filtered = all.filter(e => {
    const matchQ   = !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.cat.toLowerCase().includes(q.toLowerCase());
    const matchCat = activeExCatFilter === 'All' || e.cat === activeExCatFilter;
    return matchQ && matchCat;
  });

  if (!filtered.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  // Group by category (only when not filtering a specific one)
  if (activeExCatFilter === 'All') {
    const cats = {};
    filtered.forEach(e => { if (!cats[e.cat]) cats[e.cat] = []; cats[e.cat].push(e); });
    Object.entries(cats).forEach(([cat, exs]) => {
      const lbl = document.createElement('div');
      lbl.className = 'ex-cat-label';
      lbl.textContent = cat;
      el.appendChild(lbl);
      exs.forEach(ex => el.appendChild(buildExItem(ex)));
    });
  } else {
    filtered.forEach(ex => el.appendChild(buildExItem(ex)));
  }
}

function buildExItem(ex) {
  const c = document.createElement('div'); c.className = 'exercise-item';
  c.innerHTML = `
    <span class="exercise-name">${ex.name}</span>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="exercise-cat cat-${(ex.cat||'other').toLowerCase()}">${ex.cat}</span>
      <button class="delete-btn" onclick="event.stopPropagation();deleteExercise('${ex.id}')">
        <i class="ph ph-x"></i>
      </button>
    </div>`;
  // Tap to add to active workout log
  c.addEventListener('click', e => {
    if (e.target.closest('.delete-btn')) return;
    addExerciseToLog(ex.name);
    goTo('workout');
    showToast(`${ex.name} added to log`, 'success');
  });
  return c;
}

function filterExercises(q) { renderExercises(q); }

async function deleteExercise(id) {
  await Exercises.remove(id);
  renderExercises(document.getElementById('ex-search-inp')?.value || '');
  showToast('Exercise deleted');
}

// ─── WORKOUT TEMPLATES ────────────────────────────────────────
function renderWorkoutTemplates() {
  const list  = Workouts.getTemplates();
  const el    = document.getElementById('workout-templates-list');
  const empty = document.getElementById('workouts-empty');
  el.innerHTML = '';

  if (!list.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  list.forEach((t, i) => {
    const c = document.createElement('div'); c.className = 'template-card'; c.style.animationDelay = (i * .05) + 's';
    c.innerHTML = `
      <div>
        <div class="template-name">${t.name}</div>
        <div class="template-meta">${(t.exercises||[]).length} exercises</div>
      </div>
      <button class="template-load-btn" onclick="loadTemplate('${t.id}')">Load</button>`;
    el.appendChild(c);
  });
}

function loadTemplate(id) {
  const t = Workouts.getTemplates().find(x => x.id === id);
  if (!t) return;
  _activeSession.name = t.name;
  _activeSession.exercises = (t.exercises || []).map(name => ({ name, sets: [{ w: '', r: '', prev: '' }] }));
  document.getElementById('workout-name-inp').value = t.name;
  renderWorkoutLog();
  goTo('workout');
  showToast(`${t.name} loaded ✓`, 'success');
}

// ─── WORKOUT: HISTORY ─────────────────────────────────────────
function renderWkHistory() {
  const hist  = Workouts.getHistory(60);
  const el    = document.getElementById('wk-history-list');
  const empty = document.getElementById('wk-history-empty');
  el.innerHTML = '';

  if (!hist.length) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  let idx = 0;
  hist.forEach(day => {
    day.sessions.forEach(w => {
      const hasVol       = w.exercises?.some(e => e.sets?.some(s => s.w && s.r));
      const totalVol     = w.exercises?.reduce((total, e) =>
        total + (e.sets||[]).reduce((s, r) => s + ((r.w||0) * (r.r||0)), 0), 0) || 0;
      const totalSets    = w.exercises?.reduce((s, e) => s + (e.sets||[]).length, 0) || 0;
      const formattedDate= formatHistoryDate(day.date);  // ← REAL DATE

      const exRows = (w.exercises || []).map(ex => {
        const noMetrics = !ex.sets?.some(s => s.w || s.r);
        if (noMetrics) {
          return `<div class="wk-hist-ex-row">
            <span class="wk-hist-ex-name">${ex.name}</span>
            <span class="wk-hist-ex-val">${(ex.sets||[]).length} sets</span>
          </div>`;
        }
        const avgKg   = ex.sets?.filter(s=>s.w).map(s=>s.w).reduce((a,b,_,arr)=>(a+b)/arr.length, 0).toFixed(1) || 0;
        const avgReps = ex.sets?.filter(s=>s.r).map(s=>s.r).reduce((a,b,_,arr)=>(Math.round((a+b)/arr.length)), 0) || 0;
        const vol     = ex.sets?.reduce((s,r)=>s+((r.w||0)*(r.r||0)),0) || 0;
        return `<div class="wk-hist-ex-row">
          <span class="wk-hist-ex-name">${ex.name}</span>
          <span class="wk-hist-ex-val">
            <b>${(ex.sets||[]).length}×${avgReps}</b>
            <span class="wk-hist-sep">·</span>
            <b>${avgKg}kg</b>
            ${vol ? `<span class="wk-hist-sep">·</span><span class="wk-hist-vol">${vol.toLocaleString()} vol</span>` : ''}
          </span>
        </div>`;
      }).join('');

      const c = document.createElement('div'); c.className = 'history-day'; c.style.animationDelay = (idx * .04) + 's'; idx++;
      c.innerHTML = `
        <div class="history-day-header" onclick="toggleHistDay(this)">
          <div>
            <div class="history-day-title">${formattedDate}</div>
            <div class="history-day-meta">${w.name} · ${totalSets} sets${totalVol ? ' · ' + totalVol.toLocaleString() + ' kg total' : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${totalVol
              ? `<span class="wk-hist-badge">${totalVol.toLocaleString()}<span class="wk-hist-badge-unit">kg</span></span>`
              : `<span style="font-size:.75rem;color:var(--t3);font-weight:600">Cardio</span>`}
            <i class="ph ph-caret-down" style="color:var(--t3);font-size:1rem;transition:transform .2s"></i>
          </div>
        </div>
        <div class="history-day-body">
          <div class="wk-hist-ex-list">${exRows}</div>
        </div>`;
      el.appendChild(c);
    });
  });
}

// ─── CHARTS ───────────────────────────────────────────────────
const CHART_CFG = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#181828', borderColor: 'rgba(200,251,75,0.2)', borderWidth: 1,
      titleColor: '#eeeef7', bodyColor: '#8888aa', padding: 10, cornerRadius: 8,
      titleFont: { family: 'Space Grotesk', weight: '700', size: 12 },
      bodyFont:  { family: 'Inter', size: 11 },
    }
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#4a4a6a', font: { family: 'Inter', size: 10 }, maxTicksLimit: 7 }, border: { display: false } },
    y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#4a4a6a', font: { family: 'Inter', size: 10 } }, border: { display: false } },
  },
  animation: { duration: 700, easing: 'easeInOutQuart' }
};

function renderVolumeChart() {
  const sel = document.getElementById('volume-exercise-select');
  const exName = sel?.value;
  if (!exName) return;

  const hist = Workouts.getHistory(60);
  const points = [];
  hist.reverse().forEach(day => {
    day.sessions.forEach(s => {
      const ex = (s.exercises || []).find(e => e.name === exName);
      if (ex) {
        const vol = ex.sets.reduce((t, r) => t + ((r.w||0)*(r.r||0)), 0);
        if (vol) points.push({ date: formatHistoryDate(day.date), vol });
      }
    });
  });

  const badge = document.getElementById('volume-change');
  if (points.length < 2) {
    badge.textContent = points.length ? 'First session' : 'No data yet';
    badge.className = 'chart-change-badge change-flat';
  } else {
    const chg = ((points[points.length-1].vol - points[points.length-2].vol) / points[points.length-2].vol * 100).toFixed(1);
    badge.textContent = `${chg > 0 ? '+' : ''}${chg}% vs last`;
    badge.className = 'chart-change-badge ' + (parseFloat(chg) >= 0 ? 'change-up' : 'change-down');
  }

  const ctx = document.getElementById('volume-chart').getContext('2d');
  if (volChart) volChart.destroy();
  volChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [{ data: points.map(p => p.vol), borderColor: '#c8fb4b', backgroundColor: 'rgba(200,251,75,0.07)', borderWidth: 2, pointBackgroundColor: '#c8fb4b', pointBorderColor: '#090912', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.4 }]
    },
    options: { ...CHART_CFG, scales: { ...CHART_CFG.scales, y: { ...CHART_CFG.scales.y, ticks: { ...CHART_CFG.scales.y.ticks, callback: v => v.toLocaleString() + ' kg' } } } }
  });
}

function populateVolumeExSelect() {
  const sel = document.getElementById('volume-exercise-select');
  const exs = Exercises.getAll();
  sel.innerHTML = '<option value="">Select exercise…</option>';
  exs.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.name; opt.textContent = e.name;
    sel.appendChild(opt);
  });
}

function renderNutChart() {
  const goals = Goals.get();
  const hist  = DietLog.getHistory(7).reverse();
  const labels = [], calVals = [], protVals = [];

  hist.forEach(day => {
    labels.push(formatHistoryDate(day.date));
    calVals.push(day.entries.reduce((s, e) => s + (Number(e.cal)  || 0), 0));
    protVals.push(day.entries.reduce((s, e) => s + (Number(e.prot) || 0), 0));
  });

  const isCal = nutMode === 'calories';
  const vals  = isCal ? calVals : protVals;
  const goal  = isCal ? goals.cal : goals.prot;
  const col   = isCal ? '#c8fb4b' : '#60a5fa';
  const avg   = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;

  document.getElementById('nut-avg').textContent = isCal ? avg.toLocaleString() : avg + 'g';
  const sl = document.getElementById('nut-status-lbl');
  const r  = goal ? avg / goal : 0;
  if (!avg)         { sl.textContent = '—';          sl.style.color = 'var(--t3)'; }
  else if (r < 0.9) { sl.textContent = 'Below Goal'; sl.style.color = 'var(--red)'; }
  else if (r > 1.1) { sl.textContent = 'Above Goal'; sl.style.color = 'var(--orange)'; }
  else              { sl.textContent = 'On Track';   sl.style.color = 'var(--lime)'; }

  const ctx = document.getElementById('nutrition-chart').getContext('2d');
  if (nutChart) nutChart.destroy();
  nutChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: isCal ? 'Calories' : 'Protein', data: vals, borderColor: col, backgroundColor: col + '12', borderWidth: 2, pointBackgroundColor: col, pointBorderColor: '#090912', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.4 },
        { label: 'Goal', data: Array(vals.length).fill(goal || 0), borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false }
      ]
    },
    options: {
      ...CHART_CFG,
      plugins: { ...CHART_CFG.plugins, legend: { display: true, labels: { color: '#4a4a6a', boxWidth: 12, font: { family: 'Inter', size: 11 } } } },
      scales: { ...CHART_CFG.scales, y: { ...CHART_CFG.scales.y, ticks: { ...CHART_CFG.scales.y.ticks, callback: v => isCal ? v.toLocaleString() : v + 'g' } } }
    }
  });
}

function switchNutChart(mode, btn) {
  nutMode = mode;
  document.querySelectorAll('#panel-progress .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNutChart();
}

function renderWtChart() {
  const all    = WeightLog.getAll();
  const recent = all.slice(-30);
  const labels = recent.map(w => formatHistoryDate(w.date));
  const vals   = recent.map(w => w.kg);

  if (recent.length) {
    const cur  = vals[vals.length - 1];
    const prev = vals.length > 7 ? vals[vals.length - 8] : vals[0];
    const diff = (cur - prev).toFixed(1);
    document.getElementById('wt-current').textContent = cur + ' kg';
    document.getElementById('wt-change').textContent  = (diff > 0 ? '+' : '') + diff + ' kg';
    document.getElementById('wt-change').style.color  = diff <= 0 ? 'var(--lime)' : 'var(--red)';
    document.getElementById('wt-trend').textContent   = diff <= 0 ? '↓ Down' : '↑ Up';
    document.getElementById('wt-trend').style.color   = diff <= 0 ? 'var(--lime)' : 'var(--red)';
  }

  const ctx = document.getElementById('weight-chart').getContext('2d');
  if (wtChart) wtChart.destroy();
  if (!vals.length) return;

  wtChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Weight', data: vals, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.07)', borderWidth: 2, pointBackgroundColor: '#a78bfa', pointBorderColor: '#090912', pointBorderWidth: 2, pointRadius: (cx) => (cx.dataIndex === vals.length-1 || cx.dataIndex % 5 === 0) ? 4 : 0, pointHoverRadius: 6, fill: true, tension: 0.4 }]
    },
    options: {
      ...CHART_CFG,
      scales: { ...CHART_CFG.scales, y: { ...CHART_CFG.scales.y, min: Math.min(...vals) - 0.5, max: Math.max(...vals) + 0.5, ticks: { ...CHART_CFG.scales.y.ticks, callback: v => v + ' kg' } } }
    }
  });
}

// ─── MODALS ───────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Log Food
function openFoodModal() {
  const foods = Foods.getAll();
  const opts  = foods.map(f => `<option value="${f.id}">${f.name} (${f.cal} kcal / ${f.base || '100g'})</option>`).join('');
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Log Food</p>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">Food name</label>
        <input type="text" class="form-input" id="m-food-name" placeholder="e.g. Chicken Breast" autocomplete="off"/>
      </div>
      ${opts ? `<div class="form-group"><label class="form-label">Or choose from saved</label>
        <select class="form-select" id="m-food-sel" onchange="fillFoodFromDB()">
          <option value="">— Select —</option>${opts}
        </select></div>` : ''}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Calories</label>
          <input type="number" class="form-input" id="m-food-cal" placeholder="kcal" inputmode="numeric"/>
        </div>
        <div class="form-group">
          <label class="form-label">Protein (g)</label>
          <input type="number" class="form-input" id="m-food-prot" placeholder="g" inputmode="decimal"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Serving / Qty</label>
        <input type="text" class="form-input" id="m-food-qty" placeholder="e.g. 200g"/>
      </div>
      <button class="form-btn form-btn-primary" onclick="doLogFood()"><i class="ph ph-plus"></i> Add to Log</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function fillFoodFromDB() {
  const sel = document.getElementById('m-food-sel');
  if (!sel?.value) return;
  const f = Foods.getAll().find(x => x.id == sel.value);
  if (!f) return;
  document.getElementById('m-food-name').value = f.name;
  document.getElementById('m-food-cal').value  = f.cal;
  document.getElementById('m-food-prot').value = f.prot || '';
  document.getElementById('m-food-qty').value  = f.base || '';
}
async function doLogFood() {
  const name = document.getElementById('m-food-name')?.value.trim();
  const cal  = parseFloat(document.getElementById('m-food-cal')?.value)  || 0;
  const prot = parseFloat(document.getElementById('m-food-prot')?.value) || 0;
  const qty  = document.getElementById('m-food-qty')?.value.trim() || '';
  if (!name) { showToast('Enter a food name', 'error'); return; }
  await DietLog.addEntry({ date: todayStr(), name, cal, prot, qty });
  closeModal();
  renderDietLog();
  renderHome();
  buildCal();
  showToast(`${name} logged ✓`, 'success');
}

// Add Food to DB
function openAddFoodModal() {
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Add Food</p>
    <div class="modal-form">
      <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="af-name" placeholder="e.g. Chicken Breast" autocapitalize="words"/></div>
      <div class="form-group"><label class="form-label">Serving size</label><input type="text" class="form-input" id="af-base" placeholder="e.g. 100g"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Calories</label><input type="number" class="form-input" id="af-cal" placeholder="kcal" inputmode="numeric"/></div>
        <div class="form-group"><label class="form-label">Protein (g)</label><input type="number" class="form-input" id="af-prot" placeholder="g" inputmode="decimal"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Carbs (g)</label><input type="number" class="form-input" id="af-carb" placeholder="g" inputmode="decimal"/></div>
        <div class="form-group"><label class="form-label">Fat (g)</label><input type="number" class="form-input" id="af-fat" placeholder="g" inputmode="decimal"/></div>
      </div>
      <button class="form-btn form-btn-primary" onclick="doAddFood()"><i class="ph ph-plus"></i> Save Food</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function doAddFood() {
  const name = document.getElementById('af-name')?.value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  await Foods.add({
    name, base: document.getElementById('af-base')?.value.trim() || '100g',
    cal:  parseFloat(document.getElementById('af-cal')?.value)  || 0,
    prot: parseFloat(document.getElementById('af-prot')?.value) || 0,
    carb: parseFloat(document.getElementById('af-carb')?.value) || 0,
    fat:  parseFloat(document.getElementById('af-fat')?.value)  || 0,
  });
  closeModal(); renderFoodsDB(); showToast(`${name} saved ✓`, 'success');
}

// Create Recipe
function openCreateRecipeModal() {
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Create Recipe</p>
    <div class="modal-form">
      <div class="form-group"><label class="form-label">Recipe name</label><input type="text" class="form-input" id="rec-name" placeholder="e.g. Muscle Bowl" autocapitalize="words"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Total Calories</label><input type="number" class="form-input" id="rec-cal" placeholder="kcal" inputmode="numeric"/></div>
        <div class="form-group"><label class="form-label">Protein (g)</label><input type="number" class="form-input" id="rec-prot" placeholder="g" inputmode="decimal"/></div>
      </div>
      <button class="form-btn form-btn-primary" onclick="doCreateRecipe()"><i class="ph ph-plus"></i> Save Recipe</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function doCreateRecipe() {
  const name = document.getElementById('rec-name')?.value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  Store.update('recipes', list => {
    const a = list || [];
    a.push({ id: `r_${Date.now()}`, name, cal: parseFloat(document.getElementById('rec-cal')?.value)||0, prot: parseFloat(document.getElementById('rec-prot')?.value)||0, ingredients: [] });
    return a;
  }, []);
  closeModal(); renderRecipes(); showToast(`${name} saved ✓`, 'success');
}

// Workout modal
function openWorkoutModal() {
  const templates = Workouts.getTemplates();
  const opts = templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Start Workout</p>
    <div class="modal-form">
      ${opts ? `<div class="form-group"><label class="form-label">Load a routine</label>
        <select class="form-select" id="m-wk-sel"><option value="">— Select —</option>${opts}</select></div>` : ''}
      <div class="form-group"><label class="form-label">Workout name</label>
        <input type="text" class="form-input" id="m-wk-name" placeholder="e.g. Push Day" autocapitalize="words"/></div>
      <button class="form-btn form-btn-primary" onclick="doStartWk()"><i class="ph ph-play"></i> Start</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function doStartWk() {
  const sel  = document.getElementById('m-wk-sel');
  const name = document.getElementById('m-wk-name')?.value.trim() || sel?.options[sel.selectedIndex]?.text || '';
  if (!name) { showToast('Enter a workout name', 'error'); return; }
  if (sel?.value) loadTemplate(sel.value);
  else {
    _activeSession = { name, exercises: [] };
    document.getElementById('workout-name-inp').value = name;
    renderWorkoutLog();
  }
  closeModal(); goTo('workout'); showToast(`${name} started! 💪`, 'success');
}

// Add exercise to library
function openAddExerciseModal() {
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Add Exercise</p>
    <div class="modal-form">
      <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="ae-name" placeholder="e.g. Bench Press" autocapitalize="words"/></div>
      <div class="form-group"><label class="form-label">Category</label>
        <select class="form-select" id="ae-cat">
          <option>Chest</option><option>Back</option><option>Legs</option>
          <option>Shoulders</option><option>Arms</option><option>Core</option>
          <option>Cardio</option><option>Other</option>
        </select>
      </div>
      <button class="form-btn form-btn-primary" onclick="doAddExercise()"><i class="ph ph-plus"></i> Add</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function doAddExercise() {
  const name = document.getElementById('ae-name')?.value.trim();
  const cat  = document.getElementById('ae-cat')?.value || 'Other';
  if (!name) { showToast('Enter a name', 'error'); return; }
  await Exercises.add({ name, cat });
  closeModal(); renderExercises(); buildCatFilterChips(); showToast(`${name} added ✓`, 'success');
}

// Add exercise prompt (from log tab)
function addExercisePrompt() {
  const exs = Exercises.getAll();
  const opts = exs.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Add Exercise to Log</p>
    <div class="modal-form">
      ${opts ? `<div class="form-group"><label class="form-label">Pick from library</label>
        <select class="form-select" id="add-ex-sel"><option value="">— Select —</option>${opts}</select></div>` : ''}
      <div class="form-group"><label class="form-label">Or type a name</label>
        <input type="text" class="form-input" id="add-ex-name" placeholder="e.g. Bench Press" autocapitalize="words"/></div>
      <button class="form-btn form-btn-primary" onclick="doAddExFromModal()"><i class="ph ph-plus"></i> Add</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function doAddExFromModal() {
  const sel  = document.getElementById('add-ex-sel');
  const name = document.getElementById('add-ex-name')?.value.trim() || sel?.value;
  if (!name) { showToast('Enter or select an exercise', 'error'); return; }
  addExerciseToLog(name);
  closeModal();
}

// Create workout template
function openCreateWorkoutModal() {
  const exs  = Exercises.getAll();
  const opts = exs.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Create Workout</p>
    <div class="modal-form">
      <div class="form-group"><label class="form-label">Workout name</label>
        <input type="text" class="form-input" id="wt-name" placeholder="e.g. Push Day" autocapitalize="words"/></div>
      ${opts ? `<div class="form-group"><label class="form-label">Exercises</label>
        <select class="form-select" id="wt-ex-sel" multiple style="height:120px">${opts}</select>
        <span style="font-size:.68rem;color:var(--t3);margin-top:4px;display:block">Hold Ctrl / Cmd to select multiple</span></div>` : ''}
      <button class="form-btn form-btn-primary" onclick="doCreateWorkout()"><i class="ph ph-plus"></i> Save</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function doCreateWorkout() {
  const name = document.getElementById('wt-name')?.value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  const sel = document.getElementById('wt-ex-sel');
  const exs = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
  await Workouts.addTemplate({ name, exercises: exs });
  closeModal(); renderWorkoutTemplates(); showToast(`${name} saved ✓`, 'success');
}

// Weight modal
function openWeightModal() {
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Log Weight</p>
    <div class="modal-form">
      <div class="form-group"><label class="form-label">Weight (kg)</label>
        <input type="number" class="form-input" id="wt-val" placeholder="e.g. 74.5" step="0.1" inputmode="decimal" autofocus/></div>
      <div class="form-group"><label class="form-label">Height (cm) — for BMI</label>
        <input type="number" class="form-input" id="wt-height" placeholder="e.g. 180" inputmode="numeric"
          value="${Goals.get().height || ''}"/></div>
      <button class="form-btn form-btn-primary" onclick="doLogWeight()"><i class="ph ph-check"></i> Log</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function doLogWeight() {
  const kg     = parseFloat(document.getElementById('wt-val')?.value);
  const height = parseFloat(document.getElementById('wt-height')?.value) || 0;
  if (!kg || kg <= 0) { showToast('Enter a valid weight', 'error'); return; }
  await WeightLog.add({ kg });
  const g = Goals.get(); g.weight = kg; if (height) g.height = height; Goals.set(g);
  closeModal(); renderHome(); renderWtChart(); showToast(`${kg} kg logged ✓`, 'success');
}

// Goals quick-set (called from home if no goals set)
function openGoalsModal() {
  const g = Goals.get();
  openModal(`
    <div class="modal-handle"></div>
    <p class="modal-title">Daily Goals</p>
    <div class="modal-form">
      <div class="form-group"><label class="form-label">Calorie goal (kcal)</label>
        <input type="number" class="form-input" id="goal-cal" value="${g.cal || ''}" placeholder="e.g. 2000" inputmode="numeric"/></div>
      <div class="form-group"><label class="form-label">Protein goal (g)</label>
        <input type="number" class="form-input" id="goal-prot" value="${g.prot || ''}" placeholder="e.g. 150" inputmode="numeric"/></div>
      <button class="form-btn form-btn-primary" onclick="doSaveGoals()"><i class="ph ph-check"></i> Save</button>
      <button class="form-btn form-btn-ghost" onclick="closeModal()">Cancel</button>
    </div>`);
}
function doSaveGoals() {
  const g = Goals.get();
  g.cal  = parseInt(document.getElementById('goal-cal')?.value)  || g.cal;
  g.prot = parseInt(document.getElementById('goal-prot')?.value) || g.prot;
  Goals.set(g);
  closeModal(); renderHome(); showToast('Goals saved ✓', 'success');
}

// ─── ACCORDIONS ──────────────────────────────────────────────
function toggleCard(h)     { h.nextElementSibling.classList.toggle('open'); }
function toggleHistDay(h)  {
  const b  = h.nextElementSibling;
  const ic = h.querySelector('i.ph-caret-down') || h.querySelector('i[class*="caret-down"]');
  const o  = b.classList.contains('open');
  b.classList.toggle('open', !o);
  b.style.display = o ? 'none' : 'block';
  if (ic) ic.style.transform = o ? '' : 'rotate(180deg)';
}

// ─── TOAST ───────────────────────────────────────────────────
let _tt;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 2600);
}
