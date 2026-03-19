/* ══════════════════════════════════════════════════════════════
   FITTRACK  —  app.js
   ──────────────────────────────────────────────────────────────
   All data is stored in localStorage so nothing is lost on
   refresh. Paste your Google Apps Script Web App URL into
   SHEETS_URL to enable cloud sync.
══════════════════════════════════════════════════════════════ */

const SHEETS_URL = ''; // ← paste your Web App URL here

/* ════════════════════════════════════
   STORAGE HELPERS
════════════════════════════════════ */
const LS = {
  get:    key       => { try { return JSON.parse(localStorage.getItem('ft_' + key)); } catch { return null; } },
  set:    (key, v)  => localStorage.setItem('ft_' + key, JSON.stringify(v)),
  update: (key, fn) => { const v = LS.get(key); LS.set(key, fn(v)); },
};

/* ════════════════════════════════════
   DEFAULT DATA STRUCTURES
════════════════════════════════════ */
const DEFAULT_GOALS = { cal: 2200, prot: 170, water: 3000, height: 0, weight: 0, targetWeight: 0 };

const DEFAULT_EXERCISES = [
  {name:'Bench Press',cat:'Chest'},{name:'Incline DB Press',cat:'Chest'},{name:'Cable Fly',cat:'Chest'},
  {name:'Back Squat',cat:'Legs'},{name:'Romanian Deadlift',cat:'Legs'},{name:'Leg Press',cat:'Legs'},
  {name:'Deadlift',cat:'Back'},{name:'Pull-ups',cat:'Back'},{name:'Barbell Row',cat:'Back'},{name:'Cable Row',cat:'Back'},
  {name:'Overhead Press',cat:'Shoulders'},{name:'Lateral Raises',cat:'Shoulders'},{name:'Front Raises',cat:'Shoulders'},
  {name:'Barbell Curl',cat:'Arms'},{name:'Hammer Curl',cat:'Arms'},{name:'Tricep Pushdown',cat:'Arms'},{name:'Skull Crushers',cat:'Arms'},
  {name:'Plank',cat:'Core'},{name:'Hanging Leg Raise',cat:'Core'},{name:'Cable Crunch',cat:'Core'},
  {name:'Running',cat:'Cardio'},{name:'Cycling',cat:'Cardio'},{name:'Jump Rope',cat:'Cardio'},
];

/* ════════════════════════════════════
   STATE
════════════════════════════════════ */
let curView = 'home';
let calYear, calMonth;
let wtChart, nutChart, wkfChart;
let wtF = '30D', nutF = '30D', wkfF = '8W';

/* active session state */
let activeSession = null; // null = no active session

/* ════════════════════════════════════
   INIT
════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* seed exercise library if empty */
  if (!LS.get('exercises')) LS.set('exercises', DEFAULT_EXERCISES);
  /* seed goals if empty */
  if (!LS.get('goals')) LS.set('goals', DEFAULT_GOALS);

  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();

  const todayStr = toDateStr(now);
  document.getElementById('session-date').value = todayStr;
  document.getElementById('diet-date').value     = todayStr;

  updateHomeDate();
  buildCal();
  refreshCreatineUI();
  refreshWaterUI();
  refreshHomeRings();
  buildExLib();
  buildTemplates();
  buildHistory();
  buildFoodDB();
  buildRecipes();
  refreshDietLog();
  refreshGoalsUI();
  refreshStreaks();
  updateWeekCount();

  /* pull goals from sheets on load */
  if (SHEETS_URL) sheetsGet('goals').then(d => { if (d && d.cal) { LS.set('goals', d); refreshGoalsUI(); refreshHomeRings(); } });
});

/* ════════════════════════════════════
   NAVIGATION
════════════════════════════════════ */
function goTo(view) {
  if (view === curView) return;
  document.getElementById('view-' + curView).classList.remove('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  curView = view;
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-'  + view).classList.add('on');
  if (view === 'progress') setTimeout(buildCharts, 80);
}

function switchTab(section, tab, btn) {
  const prefix = section === 'workout' ? 'wk' : 'diet';
  document.querySelectorAll(`#view-${section} .tab-btn`).forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll(`#view-${section} .sub-view`).forEach(v => v.classList.remove('on'));
  document.getElementById(`${prefix}-${tab}`).classList.add('on');
}

/* ════════════════════════════════════
   DATE UTILITIES
════════════════════════════════════ */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr()  { return toDateStr(new Date()); }
function fmtDate(ds) {
  if (!ds) return '';
  const [y,m,d] = ds.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short', year:'numeric'});
}

function updateHomeDate() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('home-date-lbl').textContent = MONTHS[new Date().getMonth()] + ' ' + new Date().getFullYear();
}

/* ════════════════════════════════════
   CALENDAR
════════════════════════════════════ */
function calShift(d) {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth <  0) { calMonth = 11; calYear--; }
  buildCal();
}

function buildCal() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-label').textContent = `${MONTHS[calMonth]} ${calYear}`;

  const sessions  = LS.get('sessions')  || {};
  const creatine  = LS.get('creatine')  || {};
  const waterLog  = LS.get('waterLog')  || {};
  const dietLog   = LS.get('dietLog')   || {};
  const goals     = LS.get('goals')     || DEFAULT_GOALS;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayFull   = toDateStr(new Date());
  const grid        = document.getElementById('cal-grid');
  grid.innerHTML    = '';

  for (let i = 0; i < firstDay; i++) grid.insertAdjacentHTML('beforeend', '<div class="cal-day"></div>');

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = ds === todayFull;
    const dots = [];
    if (sessions[ds]?.length) dots.push('var(--accent)');
    if (waterLog[ds] >= goals.water) dots.push('var(--blue)');
    if (creatine[ds]) dots.push('var(--purple)');
    if (dietLog[ds]?.length) dots.push('var(--orange)');

    const dotsHtml = dots.length
      ? `<div class="cal-dots">${dots.map(c=>`<div class="cal-dot" style="background:${c}"></div>`).join('')}</div>` : '';

    grid.insertAdjacentHTML('beforeend',
      `<div class="cal-day cur${isToday?' today':''}">${d}${dotsHtml}</div>`);
  }
}

/* ════════════════════════════════════
   CREATINE
════════════════════════════════════ */
function toggleCreatine() {
  const crLog = LS.get('creatine') || {};
  const today = todayStr();
  crLog[today] = !crLog[today];
  LS.set('creatine', crLog);
  refreshCreatineUI();
  buildCal();
  refreshStreaks();
  toast(crLog[today] ? '💊 Creatine logged!' : 'Creatine unmarked');
  sheetsPost('creatine', { date: today, taken: crLog[today] });
}

function refreshCreatineUI() {
  const crLog   = LS.get('creatine') || {};
  const today   = todayStr();
  const takenToday = !!crLog[today];
  const streak  = calcStreak(crLog);

  document.getElementById('cr-cb').classList.toggle('on', takenToday);
  document.getElementById('cr-row').setAttribute('aria-checked', takenToday);
  document.getElementById('creatine-card').style.borderColor = takenToday ? 'rgba(155,141,255,.35)' : '';
  document.getElementById('cr-meta').textContent  = takenToday ? '✅ Taken today' : '⬜ Not taken today';
  document.getElementById('cr-streak-badge').textContent = `🔥 ${streak}`;
}

function calcStreak(logObj) {
  if (!logObj) return 0;
  let streak = 0, d = new Date();
  while (true) {
    const s = toDateStr(d);
    if (logObj[s]) { streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

/* ════════════════════════════════════
   WATER
════════════════════════════════════ */
function addWater(ml) {
  const waterLog = LS.get('waterLog') || {};
  const today    = todayStr();
  waterLog[today] = (waterLog[today] || 0) + ml;
  LS.set('waterLog', waterLog);
  refreshWaterUI();
  buildCal();
  refreshStreaks();
  toast(`+${ml} ml 💧`);
  sheetsPost('water', { date: today, total_ml: waterLog[today] });
}

function openWaterEditModal() {
  const goals = LS.get('goals') || DEFAULT_GOALS;
  const waterLog = LS.get('waterLog') || {};
  const today = todayStr();
  openModal(`
    <div class="modal-title">💧 Water Settings</div>
    <div class="form-grp">
      <label class="form-lbl">Daily Goal (ml)</label>
      <input id="wg-inp" type="number" class="inp" value="${goals.water}" inputmode="numeric" placeholder="e.g. 3000"/>
    </div>
    <div class="form-grp">
      <label class="form-lbl">Today's Intake (ml)</label>
      <input id="wi-inp" type="number" class="inp" value="${waterLog[today] || 0}" inputmode="numeric"/>
    </div>
    <button class="btn btn-accent" onclick="saveWaterSettings()">Save</button>
  `);
}
function saveWaterSettings() {
  const goals    = LS.get('goals') || DEFAULT_GOALS;
  const waterLog = LS.get('waterLog') || {};
  const today    = todayStr();
  goals.water    = parseInt(document.getElementById('wg-inp').value) || goals.water;
  waterLog[today] = parseInt(document.getElementById('wi-inp').value) || 0;
  LS.set('goals', goals);
  LS.set('waterLog', waterLog);
  closeModal();
  refreshWaterUI();
  refreshGoalsUI();
  buildCal();
  toast('Water settings saved 💧');
  sheetsPost('goals', goals);
}

function refreshWaterUI() {
  const goals    = LS.get('goals')    || DEFAULT_GOALS;
  const waterLog = LS.get('waterLog') || {};
  const today    = todayStr();
  const cur  = waterLog[today] || 0;
  const goal = goals.water || 3000;
  const pct  = Math.min(100, (cur / goal) * 100);
  document.getElementById('water-fill').style.width = pct + '%';
  document.getElementById('water-val').textContent  = `${cur.toLocaleString()} ml`;
  document.getElementById('water-lbl').textContent  = `${cur.toLocaleString()} / ${goal.toLocaleString()} ml`;
}

/* ════════════════════════════════════
   HOME RINGS (nutrition summary)
════════════════════════════════════ */
function refreshHomeRings() {
  const goals   = LS.get('goals')   || DEFAULT_GOALS;
  const dietLog = LS.get('dietLog') || {};
  const today   = todayStr();
  const entries = dietLog[today] || [];

  const totalCal  = entries.reduce((s, e) => s + (e.cal  || 0), 0);
  const totalProt = entries.reduce((s, e) => s + (e.prot || 0), 0);

  const C = 2 * Math.PI * 35; // circumference for r=35
  document.getElementById('ring-cal-val').textContent  = totalCal.toLocaleString();
  document.getElementById('ring-pro-val').textContent  = Math.round(totalProt);
  document.getElementById('ring-cal-goal').textContent = `Goal: ${goals.cal.toLocaleString()}`;
  document.getElementById('ring-pro-goal').textContent = `Goal: ${goals.prot}g`;

  setTimeout(() => {
    const calPct = Math.min(1, totalCal  / (goals.cal  || 2200));
    const proPct = Math.min(1, totalProt / (goals.prot || 170));
    document.getElementById('cal-ring').style.strokeDasharray = `${calPct * C} ${C}`;
    document.getElementById('pro-ring').style.strokeDasharray = `${proPct * C} ${C}`;
  }, 300);
}

/* ════════════════════════════════════
   WORKOUT — SESSION
════════════════════════════════════ */
function startBlankSession() {
  activeSession = { name: 'Morning Workout', date: todayStr(), exercises: [] };
  showSessionUI();
}

function startTemplateSession(tmplId) {
  const tmpls = LS.get('templates') || [];
  const tmpl  = tmpls.find(t => t.id === tmplId);
  if (!tmpl) return;
  activeSession = { name: tmpl.name, date: todayStr(), exercises: tmpl.exercises.map(n => ({ name: n, sets: [{ kg: '', reps: '' }] })) };
  showSessionUI();
  goTo('workout');
  // Switch to log tab
  document.querySelectorAll('#view-workout .tab-btn').forEach((b,i) => b.classList.toggle('on', i===0));
  document.querySelectorAll('#view-workout .sub-view').forEach((v,i) => v.classList.toggle('on', i===0));
}

function showSessionUI() {
  document.getElementById('wk-start-card').style.display  = 'none';
  document.getElementById('wk-session').style.display     = 'block';
  document.getElementById('session-name').value = activeSession.name;
  document.getElementById('session-date').value = activeSession.date;
  updateSessionDateLabel();
  renderExCards();
  updateSaveBtn();
}

function hideSessionUI() {
  document.getElementById('wk-start-card').style.display = 'block';
  document.getElementById('wk-session').style.display    = 'none';
  activeSession = null;
}

function updateSessionDateLabel() {
  const v = document.getElementById('session-date').value;
  document.getElementById('session-date-lbl').textContent = v === todayStr() ? 'Today' : fmtDate(v);
  if (activeSession) activeSession.date = v;
}

function setSessionToday() {
  document.getElementById('session-date').value = todayStr();
  updateSessionDateLabel();
}

function confirmCancelSession() {
  openConfirm('Discard Workout?', 'Your unsaved session will be lost.', '⚠️', () => { closeModal(); hideSessionUI(); });
}

/* exercise suggestion */
function showExSugg(q) {
  const drop = document.getElementById('ex-sugg');
  if (!q.trim()) { drop.classList.remove('show'); return; }
  const lib  = LS.get('exercises') || DEFAULT_EXERCISES;
  const hits  = lib.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 7);
  if (!hits.length) { drop.classList.remove('show'); return; }
  drop.innerHTML = hits.map(e =>
    `<div class="sugg-item" onclick="pickExFromSugg('${e.name.replace(/'/g,"\\'")}')">
      <span class="sugg-name">${e.name}</span><span class="sugg-cat">${e.cat}</span>
    </div>`).join('');
  drop.classList.add('show');
}

function pickExFromSugg(name) {
  document.getElementById('ex-search-inp').value = name;
  document.getElementById('ex-sugg').classList.remove('show');
  addExToSession();
}

function addExToSession() {
  const inp  = document.getElementById('ex-search-inp');
  const name = inp.value.trim();
  if (!name) return;
  if (!activeSession) return;
  activeSession.exercises.push({ name, sets: [{ kg: '', reps: '' }] });
  inp.value = '';
  document.getElementById('ex-sugg').classList.remove('show');
  renderExCards();
  updateSaveBtn();
  toast(`${name} added`);
}

function renderExCards() {
  if (!activeSession) return;
  const list = document.getElementById('ex-cards-list');
  list.innerHTML = activeSession.exercises.map((ex, ei) => buildExCard(ex, ei)).join('');
  bindExCardEvents();
}

function buildExCard(ex, ei) {
  const rows = ex.sets.map((s, si) => `
    <div class="set-row" data-ei="${ei}" data-si="${si}">
      <div class="set-num">S${si+1}</div>
      <input class="set-inp set-kg"   type="number" value="${s.kg}"   placeholder="kg"   inputmode="decimal"  data-ei="${ei}" data-si="${si}" data-field="kg"/>
      <input class="set-inp set-reps" type="number" value="${s.reps}" placeholder="reps" inputmode="numeric"  data-ei="${ei}" data-si="${si}" data-field="reps"/>
      <button class="del-set-btn" data-ei="${ei}" data-si="${si}" aria-label="Remove set">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');

  return `<div class="ex-card">
    <div class="ex-head">
      <div class="ex-title">${ex.name}</div>
      <button class="del-ex-btn" data-ei="${ei}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        Remove
      </button>
    </div>
    <div class="sets-hdr">
      <div class="set-lbl">Set</div><div class="set-lbl">kg</div><div class="set-lbl">Reps</div><div></div>
    </div>
    <div class="sets-body">${rows}</div>
    <button class="add-set-btn" data-ei="${ei}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Set
    </button>
  </div>`;
}

function bindExCardEvents() {
  /* live-save set inputs */
  document.querySelectorAll('.set-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      const ei = +inp.dataset.ei, si = +inp.dataset.si, f = inp.dataset.field;
      if (activeSession) activeSession.exercises[ei].sets[si][f] = inp.value;
    });
  });
  /* remove set */
  document.querySelectorAll('.del-set-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ei = +btn.dataset.ei, si = +btn.dataset.si;
      if (!activeSession) return;
      activeSession.exercises[ei].sets.splice(si, 1);
      if (!activeSession.exercises[ei].sets.length)
        activeSession.exercises[ei].sets.push({ kg: '', reps: '' });
      renderExCards();
    });
  });
  /* add set */
  document.querySelectorAll('.add-set-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ei = +btn.dataset.ei;
      if (!activeSession) return;
      activeSession.exercises[ei].sets.push({ kg: '', reps: '' });
      renderExCards();
    });
  });
  /* remove exercise */
  document.querySelectorAll('.del-ex-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ei = +btn.dataset.ei;
      if (!activeSession) return;
      activeSession.exercises.splice(ei, 1);
      renderExCards();
      updateSaveBtn();
    });
  });
}

function updateSaveBtn() {
  document.getElementById('save-session-btn').style.display =
    activeSession && activeSession.exercises.length ? '' : 'none';
}

function saveSession() {
  if (!activeSession) return;
  activeSession.name = document.getElementById('session-name').value.trim() || 'Workout';
  activeSession.date = document.getElementById('session-date').value || todayStr();

  const sessions = LS.get('sessions') || {};
  if (!sessions[activeSession.date]) sessions[activeSession.date] = [];
  sessions[activeSession.date].push({ ...activeSession, savedAt: Date.now() });
  LS.set('sessions', sessions);

  toast('Session saved! 🔥');
  hideSessionUI();
  buildHistory();
  buildCal();
  refreshStreaks();
  updateWeekCount();
  sheetsPost('sessions', activeSession);
}

/* ════════════════════════════════════
   WORKOUT — TEMPLATES
════════════════════════════════════ */
function buildTemplates() {
  const tmpls = LS.get('templates') || [];
  /* render in workout tab */
  const tmplList = document.getElementById('tmpl-list');
  if (!tmpls.length) {
    tmplList.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No templates yet. Create one!</p></div>';
  } else {
    tmplList.innerHTML = tmpls.map((t, i) => `
      <div class="tmpl-item" style="animation-delay:${i*.04}s">
        <div class="tmpl-body" onclick="startTemplateSession('${t.id}')">
          <div class="tmpl-name">${t.name}</div>
          <div class="tmpl-meta">${t.exercises.length} exercises · ${t.exercises.slice(0,2).join(', ')}${t.exercises.length>2?'…':''}</div>
        </div>
        <div class="tmpl-actions">
          <button class="chip" onclick="event.stopPropagation();openEditTemplateModal('${t.id}')">Edit</button>
          <button class="icon-btn" onclick="event.stopPropagation();deleteTmpl('${t.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </div>`).join('');
  }
  /* quick-start list */
  const ql = document.getElementById('wk-quick-tmpls');
  ql.innerHTML = tmpls.map(t => `
    <div class="tmpl-item mb8" style="cursor:pointer" onclick="startTemplateSession('${t.id}')">
      <div class="tmpl-body">
        <div class="tmpl-name">${t.name}</div>
        <div class="tmpl-meta">${t.exercises.length} exercises · ${t.exercises.slice(0,2).join(', ')}${t.exercises.length>2?'…':''}</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('');
}

function openCreateTemplateModal()   { openTemplateModal(null); }
function openEditTemplateModal(id)   { openTemplateModal(id); }

function openTemplateModal(editId) {
  const tmpls  = LS.get('templates') || [];
  const edit   = editId ? tmpls.find(t => t.id === editId) : null;
  const isNew  = !edit;
  let selEx    = edit ? [...edit.exercises] : [];
  const lib    = LS.get('exercises') || DEFAULT_EXERCISES;

  const renderSel = () => {
    const el = document.getElementById('tmpl-selected');
    if (!el) return;
    el.innerHTML = selEx.length
      ? selEx.map((n, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border-radius:var(--r14);padding:11px 14px;margin-bottom:7px">
            <span style="font-size:.9375rem;font-weight:600">${n}</span>
            <button onclick="window.__tmplRmEx(${i})" style="background:none;border:none;color:var(--t3);cursor:pointer;padding:4px;font-size:1rem;border-radius:8px" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--t3)'">✕</button>
          </div>`).join('')
      : `<p style="font-size:.875rem;color:var(--t3);padding:4px 0 10px">No exercises added yet.</p>`;
  };

  window.__tmplRmEx  = i => { selEx.splice(i,1); renderSel(); };
  window.__tmplAddEx = name => {
    if (!name?.trim()) return;
    if (selEx.includes(name)) { toast('Already added'); return; }
    selEx.push(name); renderSel();
  };
  window.__tmplSave  = () => {
    const name = document.getElementById('tmpl-name-inp')?.value?.trim();
    if (!name) { toast('Enter a template name'); return; }
    if (!selEx.length) { toast('Add at least one exercise'); return; }
    if (isNew) {
      const newT = { id: 't' + Date.now(), name, exercises: [...selEx] };
      tmpls.push(newT);
    } else {
      edit.name = name; edit.exercises = [...selEx];
    }
    LS.set('templates', tmpls);
    buildTemplates();
    closeModal();
    toast(isNew ? 'Template created! ✅' : 'Template updated ✅');
    sheetsPost('templates', tmpls);
  };

  openModal(`
    <div class="modal-title">${isNew ? '✨ New Template' : '✏️ Edit Template'}</div>
    <div class="form-grp">
      <label class="form-lbl">Template Name</label>
      <input id="tmpl-name-inp" type="text" class="inp" value="${edit?.name||''}" placeholder="e.g. Push Day, Upper Body…" autocapitalize="words"/>
    </div>
    <label class="form-lbl">Exercises in this template</label>
    <div id="tmpl-selected" style="margin-bottom:14px"></div>
    <label class="form-lbl">Add from library</label>
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px">
      ${lib.map(e=>`<button onclick="window.__tmplAddEx('${e.name.replace(/'/g,"\\'")}')"
        style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--pill);padding:7px 14px;color:var(--t2);font-family:var(--ff);font-size:.8125rem;font-weight:600;cursor:pointer;transition:all .12s"
        onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
        onmouseout="this.style.borderColor='';this.style.color='var(--t2)'">${e.name}</button>`).join('')}
    </div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-ghost" onclick="closeModal()" style="flex:1">Cancel</button>
      <button class="btn btn-accent" onclick="window.__tmplSave()" style="flex:2">${isNew?'Create':'Save'}</button>
    </div>
  `);
  setTimeout(renderSel, 10);
}

function deleteTmpl(id) {
  openConfirm('Delete Template?', 'This cannot be undone.', '🗑️', () => {
    LS.update('templates', ts => (ts||[]).filter(t=>t.id!==id));
    buildTemplates();
    toast('Template deleted');
    closeModal();
    sheetsPost('templates', LS.get('templates'));
  });
}

/* ════════════════════════════════════
   WORKOUT — EXERCISE LIBRARY
════════════════════════════════════ */
function buildExLib() {
  const lib = LS.get('exercises') || DEFAULT_EXERCISES;
  renderExLib(lib);
}
function renderExLib(list) {
  const el = document.getElementById('ex-lib-list');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏋️</div><p>No exercises found</p></div>'; return; }
  el.innerHTML = list.map((e, i) => `
    <div class="lib-item" style="animation-delay:${i*.025}s">
      <div><div class="lib-name">${e.name}</div><div class="lib-cat">${e.cat}</div></div>
      <button class="icon-btn" onclick="deleteExFromLib('${e.name.replace(/'/g,"\\'")}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>`).join('');
}
function filterExLib(q) {
  const lib = LS.get('exercises') || DEFAULT_EXERCISES;
  renderExLib(q ? lib.filter(e => e.name.toLowerCase().includes(q.toLowerCase()) || e.cat.toLowerCase().includes(q.toLowerCase())) : lib);
}
function addExerciseToLib() {
  const name = document.getElementById('new-ex-name').value.trim();
  const cat  = document.getElementById('new-ex-cat').value;
  if (!name) { toast('Enter an exercise name'); return; }
  const lib = LS.get('exercises') || DEFAULT_EXERCISES;
  if (lib.find(e => e.name.toLowerCase() === name.toLowerCase())) { toast('Already in library'); return; }
  lib.push({ name, cat });
  LS.set('exercises', lib);
  document.getElementById('new-ex-name').value = '';
  buildExLib();
  toast(`${name} added ✅`);
}
function deleteExFromLib(name) {
  openConfirm(`Remove "${name}"?`, 'Remove from the exercise library.', '🗑️', () => {
    LS.update('exercises', lib => (lib||[]).filter(e=>e.name!==name));
    buildExLib();
    closeModal();
    toast(`${name} removed`);
  });
}

/* ════════════════════════════════════
   WORKOUT — HISTORY
════════════════════════════════════ */
function buildHistory() {
  const sessions = LS.get('sessions') || {};
  const all = [];
  Object.entries(sessions).forEach(([date, sessArr]) => {
    sessArr.forEach(s => all.push({ ...s, date }));
  });
  all.sort((a, b) => b.date.localeCompare(a.date));

  const el = document.getElementById('wk-hist-list');
  if (!all.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No workouts logged yet.<br>Start your first session!</p></div>';
    return;
  }
  el.innerHTML = all.map((s, i) => {
    const id = `hd-${i}`;
    const exNames = s.exercises.map(e=>e.name);
    const detail  = s.exercises.map(ex =>
      `<div style="margin-bottom:12px">
         <div class="hist-ex-name">${ex.name}</div>
         ${ex.sets.filter(st=>st.kg||st.reps).map((st,si)=>
           `<div class="hist-set-row"><span>S${si+1}</span><span>${st.kg?st.kg+'kg':'—'}</span><span>${st.reps?st.reps+' reps':'—'}</span></div>`
         ).join('')}
       </div>`).join('');
    return `
      <div class="hist-item" style="animation-delay:${i*.04}s">
        <div class="hist-top" onclick="toggleHistDet('${id}')">
          <div>
            <div class="hist-date">${fmtDate(s.date)}</div>
            <div class="hist-meta">📋 ${s.name} · ${s.exercises.length} exercises</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="hist-pill">${s.exercises.length} ex</div>
            <button class="icon-btn" onclick="event.stopPropagation();deleteSession('${s.date}',${s.savedAt||0})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
        <div class="hist-tags">${exNames.map(n=>`<div class="htag">${n}</div>`).join('')}</div>
        <div class="hist-det" id="${id}">${detail || '<p style="color:var(--t3);font-size:.875rem">No set data recorded</p>'}</div>
      </div>`;
  }).join('');
}

function toggleHistDet(id) {
  const el = document.getElementById(id);
  const isOpen = el.classList.contains('open');
  el.classList.toggle('open', !isOpen);
  el.style.display = isOpen ? 'none' : 'block';
}

function deleteSession(date, savedAt) {
  openConfirm('Delete Session?', 'This workout will be permanently removed.', '🗑️', () => {
    LS.update('sessions', sessions => {
      if (!sessions || !sessions[date]) return sessions;
      sessions[date] = sessions[date].filter(s => s.savedAt !== savedAt);
      if (!sessions[date].length) delete sessions[date];
      return sessions;
    });
    buildHistory();
    buildCal();
    refreshStreaks();
    updateWeekCount();
    closeModal();
    toast('Session deleted');
  });
}

/* ════════════════════════════════════
   DIET — LOG FOOD
════════════════════════════════════ */
function changeDietDate() {
  const v = document.getElementById('diet-date').value;
  document.getElementById('diet-date-lbl').textContent = v === todayStr() ? 'Today' : fmtDate(v);
  refreshDietLog();
}
function setDietToday() {
  document.getElementById('diet-date').value = todayStr();
  document.getElementById('diet-date-lbl').textContent = 'Today';
  refreshDietLog();
}

function openLogFoodModal() {
  const db = LS.get('foodDB') || [];
  const recipes = LS.get('recipes') || [];
  const all = [
    ...db.map(f => ({ ...f, type: 'food' })),
    ...recipes.map(r => ({ name: r.name, cal: r.cal, prot: r.prot, type: 'recipe', qty: '1 serving' }))
  ];

  openModal(`
    <div class="modal-title">🍽️ Log Food</div>
    <div class="form-grp">
      <label class="form-lbl">Meal</label>
      <select id="log-meal" class="inp inp-select">
        <option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snacks</option>
      </select>
    </div>
    <div class="form-grp">
      <label class="form-lbl">Food / Recipe</label>
      <select id="log-food-sel" class="inp inp-select" onchange="updateLogFoodFields()">
        <option value="">— Custom entry —</option>
        ${all.map(f=>`<option value="${encodeURIComponent(JSON.stringify(f))}">${f.name} (${f.cal} kcal)</option>`).join('')}
      </select>
    </div>
    <div id="log-food-fields">
      <div class="form-row">
        <div class="form-grp"><label class="form-lbl">Name</label><input id="log-name" type="text" class="inp" placeholder="Food name" autocapitalize="words"/></div>
        <div class="form-grp"><label class="form-lbl">Qty / Serving</label><input id="log-qty" type="text" class="inp" placeholder="e.g. 100g"/></div>
      </div>
      <div class="form-row">
        <div class="form-grp"><label class="form-lbl">Calories</label><input id="log-cal" type="number" class="inp" placeholder="kcal" inputmode="numeric"/></div>
        <div class="form-grp"><label class="form-lbl">Protein (g)</label><input id="log-prot" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>
      </div>
    </div>
    <button class="btn btn-accent" onclick="confirmLogFood()">+ Add to Log</button>
  `);
}
function updateLogFoodFields() {
  const raw = document.getElementById('log-food-sel').value;
  if (!raw) return;
  try {
    const f = JSON.parse(decodeURIComponent(raw));
    document.getElementById('log-name').value = f.name;
    document.getElementById('log-qty').value  = f.qty || '';
    document.getElementById('log-cal').value  = f.cal;
    document.getElementById('log-prot').value = f.prot;
  } catch {}
}
function confirmLogFood() {
  const meal = document.getElementById('log-meal').value;
  const name = document.getElementById('log-name').value.trim();
  const qty  = document.getElementById('log-qty').value.trim();
  const cal  = parseFloat(document.getElementById('log-cal').value) || 0;
  const prot = parseFloat(document.getElementById('log-prot').value) || 0;
  if (!name) { toast('Enter a food name'); return; }

  const date = document.getElementById('diet-date').value || todayStr();
  const dietLog = LS.get('dietLog') || {};
  if (!dietLog[date]) dietLog[date] = [];
  const entry = { id: Date.now(), meal, name, qty, cal, prot };
  dietLog[date].push(entry);
  LS.set('dietLog', dietLog);
  closeModal();
  refreshDietLog();
  refreshHomeRings();
  buildCal();
  toast(`${name} logged ✅`);
  sheetsPost('dietlog', { date, entry });
}

function refreshDietLog() {
  const date    = document.getElementById('diet-date').value || todayStr();
  const dietLog = LS.get('dietLog') || {};
  const goals   = LS.get('goals')   || DEFAULT_GOALS;
  const entries = dietLog[date] || [];

  const totalCal  = entries.reduce((s,e) => s + (e.cal||0),  0);
  const totalProt = entries.reduce((s,e) => s + (e.prot||0), 0);

  document.getElementById('diet-total-cal').textContent   = Math.round(totalCal).toLocaleString();
  document.getElementById('diet-total-prot').textContent  = Math.round(totalProt);
  document.getElementById('diet-cal-goal-lbl').textContent = `/ ${goals.cal.toLocaleString()} goal`;
  document.getElementById('diet-prot-goal-lbl').textContent = `/ ${goals.prot}g goal`;

  const meals = ['Breakfast','Lunch','Dinner','Snacks'];
  const el = document.getElementById('diet-log-list');
  const grouped = {};
  entries.forEach(e => { if (!grouped[e.meal]) grouped[e.meal] = []; grouped[e.meal].push(e); });

  let html = '';
  meals.forEach(meal => {
    const items = grouped[meal] || [];
    if (!items.length) return;
    const mealCal = items.reduce((s,e)=>s+(e.cal||0),0);
    html += `
      <div class="meal-grp">
        <div class="meal-grp-hdr">
          <span>${meal}</span>
          <span style="color:var(--accent);font-size:.75rem">${Math.round(mealCal)} kcal</span>
        </div>
        ${items.map(e=>`
          <div class="log-entry">
            <div class="log-body">
              <div class="log-name">${e.name}</div>
              <div class="log-sub">${e.qty||''}</div>
            </div>
            <div class="log-right" style="margin-right:8px">
              <div class="log-cal">${Math.round(e.cal)} kcal</div>
              <div class="log-prot">${Math.round(e.prot)}g prot</div>
            </div>
            <button class="icon-btn" onclick="deleteLogEntry('${date}',${e.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>`).join('')}
      </div>`;
  });
  el.innerHTML = html || '<div class="empty-state"><div class="empty-icon">🍽️</div><p>Nothing logged yet.<br>Tap "+ Log Food" to start.</p></div>';
}

function deleteLogEntry(date, id) {
  LS.update('dietLog', log => {
    if (log && log[date]) log[date] = log[date].filter(e => e.id !== id);
    return log;
  });
  refreshDietLog();
  refreshHomeRings();
  buildCal();
}

/* ════════════════════════════════════
   DIET — FOOD DATABASE
════════════════════════════════════ */
function buildFoodDB() { renderFoodDB(LS.get('foodDB') || []); }
function renderFoodDB(list) {
  const el = document.getElementById('food-db-list');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🥗</div><p>No foods yet.<br>Add your common foods!</p></div>'; return; }
  el.innerHTML = list.map((f,i) => `
    <div class="food-item" style="animation-delay:${i*.03}s">
      <div class="food-body">
        <div class="food-name">${f.name}</div>
        <div class="food-macros"><span class="ca">${f.cal} kcal</span> · <span class="pr">${f.prot}g protein</span> per ${f.qty||'serving'}</div>
      </div>
      <button class="icon-btn" onclick="deleteFoodFromDB('${f.name.replace(/'/g,"\\'")}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>`).join('');
}
function filterFoodDB(q) {
  const db = LS.get('foodDB') || [];
  renderFoodDB(q ? db.filter(f=>f.name.toLowerCase().includes(q.toLowerCase())) : db);
}
function openAddFoodModal() {
  openModal(`
    <div class="modal-title">🥗 Add Food to Database</div>
    <div class="form-grp"><label class="form-lbl">Food Name</label><input id="af-name" type="text" class="inp" placeholder="e.g. Chicken Breast" autocapitalize="words"/></div>
    <div class="form-row">
      <div class="form-grp"><label class="form-lbl">Calories</label><input id="af-cal" type="number" class="inp" placeholder="kcal" inputmode="numeric"/></div>
      <div class="form-grp"><label class="form-lbl">Protein (g)</label><input id="af-prot" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>
    </div>
    <div class="form-row">
      <div class="form-grp"><label class="form-lbl">Carbs (g)</label><input id="af-carb" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>
      <div class="form-grp"><label class="form-lbl">Fat (g)</label><input id="af-fat" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>
    </div>
    <div class="form-grp"><label class="form-lbl">Serving Size</label><input id="af-qty" type="text" class="inp" placeholder="e.g. 100g, 1 cup, 1 piece"/></div>
    <button class="btn btn-accent" onclick="saveNewFood()">Add to Database</button>
  `);
}
function saveNewFood() {
  const name = document.getElementById('af-name').value.trim();
  const cal  = parseFloat(document.getElementById('af-cal').value)  || 0;
  const prot = parseFloat(document.getElementById('af-prot').value) || 0;
  const carb = parseFloat(document.getElementById('af-carb').value) || 0;
  const fat  = parseFloat(document.getElementById('af-fat').value)  || 0;
  const qty  = document.getElementById('af-qty').value.trim();
  if (!name) { toast('Enter a food name'); return; }
  const db = LS.get('foodDB') || [];
  db.push({ name, cal, prot, carb, fat, qty });
  LS.set('foodDB', db);
  buildFoodDB();
  closeModal();
  toast(`${name} added ✅`);
  sheetsPost('foods', { name, cal, prot, carb, fat, qty });
}
function deleteFoodFromDB(name) {
  openConfirm(`Delete "${name}"?`, 'Remove from your food database.', '🗑️', () => {
    LS.update('foodDB', db => (db||[]).filter(f=>f.name!==name));
    buildFoodDB();
    closeModal();
    toast(`${name} removed`);
  });
}

/* ════════════════════════════════════
   DIET — RECIPES
════════════════════════════════════ */
function buildRecipes() {
  const recipes = LS.get('recipes') || [];
  const el = document.getElementById('recipe-list');
  if (!recipes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍🍳</div><p>No recipes yet.<br>Create your first recipe!</p></div>';
    return;
  }
  el.innerHTML = recipes.map((r,i) => {
    const id = `rec-${i}`;
    return `
      <div class="recipe-item" style="animation-delay:${i*.04}s">
        <div class="recipe-head" onclick="toggleRecipe('${id}')">
          <div>
            <div class="recipe-name">${r.name}</div>
            <div class="recipe-macros">${r.cal} kcal · ${r.prot}g protein · ${r.ingredients.length} ingredients</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <svg id="${id}-arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2.5" style="transition:transform var(--mid)"><polyline points="9 18 15 12 9 6"/></svg>
            <button class="icon-btn" onclick="event.stopPropagation();deleteRecipe(${i})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
        <div class="recipe-body" id="${id}">
          ${r.ingredients.map(g=>`<div class="recipe-ing">${g}</div>`).join('')}
          <button class="btn btn-ghost btn-sm" style="margin-top:12px;width:100%" onclick="event.stopPropagation();logRecipeToday(${i})">Log as Meal</button>
        </div>
      </div>`;
  }).join('');
}
function toggleRecipe(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById(id+'-arr');
  const open = el.classList.contains('open');
  el.classList.toggle('open', !open);
  el.style.display = open ? 'none' : 'block';
  if (arr) arr.style.transform = open ? '' : 'rotate(90deg)';
}
function openCreateRecipeModal() {
  let ings = [];
  const renderIngs = () => {
    const el = document.getElementById('rec-ings-list');
    if (!el) return;
    el.innerHTML = ings.length
      ? ings.map((g,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px"><span style="flex:1;font-size:.9375rem;color:var(--t2)">${g}</span><button onclick="window.__recRmIng(${i})" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:1.1rem">✕</button></div>`).join('')
      : '<p style="font-size:.875rem;color:var(--t3);margin-bottom:10px">No ingredients added yet.</p>';
  };
  window.__recRmIng = i => { ings.splice(i,1); renderIngs(); };
  window.__recSave  = () => {
    const name = document.getElementById('rec-name')?.value?.trim();
    const cal  = parseFloat(document.getElementById('rec-cal')?.value)  || 0;
    const prot = parseFloat(document.getElementById('rec-prot')?.value) || 0;
    if (!name) { toast('Enter a recipe name'); return; }
    const recipes = LS.get('recipes') || [];
    recipes.push({ name, cal, prot, ingredients: [...ings] });
    LS.set('recipes', recipes);
    buildRecipes();
    closeModal();
    toast(`${name} saved ✅`);
    sheetsPost('recipes', { name, cal, prot, ingredients: ings });
  };
  window.__recAddIng = () => {
    const v = document.getElementById('rec-ing-inp')?.value?.trim();
    if (!v) return;
    ings.push(v);
    document.getElementById('rec-ing-inp').value = '';
    renderIngs();
  };
  openModal(`
    <div class="modal-title">👨‍🍳 Create Recipe</div>
    <div class="form-grp"><label class="form-lbl">Recipe Name</label><input id="rec-name" type="text" class="inp" placeholder="e.g. Muscle Bowl" autocapitalize="words"/></div>
    <div class="form-row">
      <div class="form-grp"><label class="form-lbl">Total Calories</label><input id="rec-cal" type="number" class="inp" placeholder="kcal" inputmode="numeric"/></div>
      <div class="form-grp"><label class="form-lbl">Protein (g)</label><input id="rec-prot" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>
    </div>
    <label class="form-lbl">Ingredients</label>
    <div id="rec-ings-list" style="margin-bottom:10px"></div>
    <div style="display:flex;gap:8px;margin-bottom:18px">
      <input id="rec-ing-inp" type="text" class="inp" placeholder="e.g. Chicken breast 200g" style="flex:1" onkeydown="if(event.key==='Enter')window.__recAddIng()"/>
      <button class="btn btn-ghost btn-sm" onclick="window.__recAddIng()">Add</button>
    </div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-ghost" onclick="closeModal()" style="flex:1">Cancel</button>
      <button class="btn btn-accent" onclick="window.__recSave()" style="flex:2">Save Recipe</button>
    </div>
  `);
  setTimeout(renderIngs, 10);
}
function deleteRecipe(idx) {
  openConfirm('Delete Recipe?', 'This recipe will be removed.', '🗑️', () => {
    LS.update('recipes', rs => { if(rs) rs.splice(idx,1); return rs||[]; });
    buildRecipes();
    closeModal();
    toast('Recipe deleted');
  });
}
function logRecipeToday(idx) {
  const recipes = LS.get('recipes') || [];
  const r = recipes[idx]; if (!r) return;
  const date = document.getElementById('diet-date').value || todayStr();
  const dietLog = LS.get('dietLog') || {};
  if (!dietLog[date]) dietLog[date] = [];
  dietLog[date].push({ id: Date.now(), meal: 'Dinner', name: r.name, qty: '1 serving', cal: r.cal, prot: r.prot });
  LS.set('dietLog', dietLog);
  refreshDietLog();
  refreshHomeRings();
  buildCal();
  toast(`${r.name} logged ✅`);
  goTo('diet');
  // switch to log tab
  document.querySelectorAll('#view-diet .tab-btn').forEach((b,i) => b.classList.toggle('on', i===0));
  document.querySelectorAll('#view-diet .sub-view').forEach((v,i) => v.classList.toggle('on', i===0));
}

/* ════════════════════════════════════
   PROGRESS — GOALS & BMI
════════════════════════════════════ */
function openGoalsModal() {
  const g = LS.get('goals') || DEFAULT_GOALS;
  openModal(`
    <div class="modal-title">⚙️ Goals & Profile</div>
    <div class="form-lbl" style="margin-bottom:12px">Body Metrics</div>
    <div class="form-row">
      <div class="form-grp"><label class="form-lbl">Height (cm)</label><input id="g-h"  type="number" class="inp" value="${g.height||''}" inputmode="numeric" placeholder="e.g. 178"/></div>
      <div class="form-grp"><label class="form-lbl">Weight (kg)</label> <input id="g-w"  type="number" class="inp" value="${g.weight||''}" inputmode="decimal" step="0.1" placeholder="e.g. 80"/></div>
    </div>
    <div class="form-grp"><label class="form-lbl">Target Weight (kg)</label><input id="g-tw" type="number" class="inp" value="${g.targetWeight||''}" inputmode="decimal" step="0.1" placeholder="e.g. 75"/></div>
    <div class="form-lbl" style="margin-bottom:12px;margin-top:4px">Daily Targets</div>
    <div class="form-grp"><label class="form-lbl">🔥 Calories (kcal)</label><input id="g-c" type="number" class="inp" value="${g.cal}" inputmode="numeric"/></div>
    <div class="form-row">
      <div class="form-grp"><label class="form-lbl">💪 Protein (g)</label><input id="g-p"  type="number" class="inp" value="${g.prot}"  inputmode="numeric"/></div>
      <div class="form-grp"><label class="form-lbl">💧 Water (ml)</label>  <input id="g-wt" type="number" class="inp" value="${g.water}" inputmode="numeric"/></div>
    </div>
    <button class="btn btn-accent" onclick="saveGoals()">Save Goals</button>
  `);
}
function saveGoals() {
  const g = {
    height:       parseFloat(document.getElementById('g-h').value)  || 0,
    weight:       parseFloat(document.getElementById('g-w').value)  || 0,
    targetWeight: parseFloat(document.getElementById('g-tw').value) || 0,
    cal:          parseInt(document.getElementById('g-c').value)    || 2200,
    prot:         parseInt(document.getElementById('g-p').value)    || 170,
    water:        parseInt(document.getElementById('g-wt').value)   || 3000,
  };
  LS.set('goals', g);
  closeModal();
  refreshGoalsUI();
  refreshHomeRings();
  refreshWaterUI();
  buildCal();
  toast('Goals saved ✅');
  sheetsPost('goals', g);
}
function refreshGoalsUI() {
  const g = LS.get('goals') || DEFAULT_GOALS;
  document.getElementById('g-disp-cal').textContent   = g.cal.toLocaleString() + ' kcal';
  document.getElementById('g-disp-prot').textContent  = g.prot + ' g';
  document.getElementById('g-disp-water').textContent = g.water.toLocaleString() + ' ml';
  document.getElementById('g-disp-tw').textContent    = g.targetWeight ? g.targetWeight + ' kg' : '—';

  if (g.height && g.weight) {
    const bmi = +(g.weight / Math.pow(g.height/100, 2)).toFixed(1);
    document.getElementById('bmi-h-val').textContent  = g.height;
    document.getElementById('bmi-w-val').textContent  = g.weight;
    document.getElementById('bmi-val').textContent    = bmi;
    document.getElementById('bmi-marker').style.left  = Math.max(2, Math.min(97, ((bmi-15)/25)*100)) + '%';
    const st = document.getElementById('bmi-status');
    st.className = 'bmi-status';
    if (bmi < 18.5)     { st.textContent='⬇️ Underweight (< 18.5)';        st.classList.add('yellow'); }
    else if (bmi < 25)  { st.textContent='✅ Healthy weight (18.5–24.9)';   st.classList.add('green');  }
    else if (bmi < 30)  { st.textContent='⚠️ Overweight (25–29.9)';         st.classList.add('yellow'); }
    else                { st.textContent='❌ Obese (BMI ≥ 30)';              st.classList.add('red');    }
  }
}

/* ════════════════════════════════════
   PROGRESS — LOG WEIGHT
════════════════════════════════════ */
function openLogWeightModal() {
  openModal(`
    <div class="modal-title">⚖️ Log Body Weight</div>
    <div class="form-grp">
      <label class="form-lbl">Date</label>
      <input id="wt-date" type="date" class="inp" value="${todayStr()}" style="color-scheme:dark"/>
    </div>
    <div class="form-grp">
      <label class="form-lbl">Weight (kg)</label>
      <input id="wt-val-inp" type="number" class="inp" placeholder="e.g. 80.5" step="0.1" inputmode="decimal"/>
    </div>
    <button class="btn btn-accent" onclick="saveWeight()">Log Weight</button>
  `);
}
function saveWeight() {
  const date = document.getElementById('wt-date').value || todayStr();
  const val  = parseFloat(document.getElementById('wt-val-inp').value);
  if (!val) { toast('Enter a weight'); return; }
  const wlog = LS.get('weightLog') || {};
  wlog[date] = val;
  LS.set('weightLog', wlog);
  /* also update goals current weight */
  LS.update('goals', g => { if (date === todayStr()) g.weight = val; return g; });
  closeModal();
  refreshGoalsUI();
  if (wtChart) buildCharts();
  toast(`${val} kg logged ✅`);
  sheetsPost('weight', { date, kg: val });
}

/* ════════════════════════════════════
   PROGRESS — STREAKS & WEEK COUNT
════════════════════════════════════ */
function refreshStreaks() {
  const crLog   = LS.get('creatine')  || {};
  const waterLog= LS.get('waterLog')  || {};
  const sessions= LS.get('sessions')  || {};
  const goals   = LS.get('goals')     || DEFAULT_GOALS;

  const crStreak = calcStreak(crLog);
  /* water streak: days where intake >= goal */
  const waterGoal = goals.water || 3000;
  const waterMet  = Object.fromEntries(Object.entries(waterLog).map(([d,v]) => [d, v >= waterGoal]));
  const waterStreak = calcStreak(waterMet);
  /* workout streak */
  const wkMet = Object.fromEntries(Object.keys(sessions).map(d => [d, sessions[d]?.length > 0]));
  const wkStreak = calcStreak(wkMet);

  document.getElementById('streak-cr').textContent = crStreak;
  document.getElementById('streak-wt').textContent = waterStreak;
  document.getElementById('streak-wk').textContent = wkStreak;
  document.getElementById('cr-streak-badge').textContent = `🔥 ${crStreak}`;
}

function updateWeekCount() {
  const sessions = LS.get('sessions') || {};
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const ds = toDateStr(d);
    if (sessions[ds]?.length) count++;
  }
  document.getElementById('wk-count').textContent = count;
}

/* ════════════════════════════════════
   PROGRESS — CHARTS
════════════════════════════════════ */
const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor:'rgba(16,16,20,.98)',titleColor:'#ededf1',bodyColor:'#9292a0',
      borderColor:'rgba(255,255,255,.12)',borderWidth:1,cornerRadius:12,padding:12,
      titleFont:{family:'Syne',weight:'700',size:12},bodyFont:{family:'Inter',weight:'500',size:11},
    },
  },
  scales: {
    x: { ticks:{color:'#525260',font:{size:10,family:'Inter'},maxRotation:0,maxTicksLimit:8}, grid:{color:'rgba(255,255,255,.04)'}, border:{color:'transparent'} },
    y: { ticks:{color:'#525260',font:{size:10,family:'Inter'}},                              grid:{color:'rgba(255,255,255,.04)'}, border:{color:'transparent'} },
  },
  animation:{duration:400,easing:'easeInOutQuart'},
};

let chartsBuilt = false;
function buildCharts() {
  chartsBuilt = true;
  buildWtChart();
  buildNutChart();
  buildWkfChart();
}
function setFilter(ch, f, btn) {
  document.querySelectorAll(`#${ch}-filters .cf-btn`).forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  if (ch==='wt')  { wtF=f;   buildWtChart(); }
  if (ch==='nut') { nutF=f;  buildNutChart(); }
  if (ch==='wkf') { wkfF=f; buildWkfChart(); }
}

function buildWtChart() {
  const wlog = LS.get('weightLog') || {};
  const n = wtF==='7D'?7:wtF==='30D'?30:90;
  const labels=[], data=[];
  for (let i=n-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=toDateStr(d);
    labels.push(`${d.getDate()}/${d.getMonth()+1}`);
    data.push(wlog[ds] || null);
  }
  if (wtChart) wtChart.destroy();
  wtChart = new Chart(document.getElementById('wt-chart'), {
    type:'line',
    data:{labels,datasets:[{label:'Weight kg',data,borderColor:'#9b8dff',backgroundColor:'rgba(155,141,255,.07)',
      pointBackgroundColor:'#9b8dff',pointRadius:4,pointHoverRadius:7,
      spanGaps:true,tension:.4,fill:true,borderWidth:2}]},
    options:CHART_DEFAULTS,
  });
}

function buildNutChart() {
  const dietLog = LS.get('dietLog') || {};
  const n = nutF==='7D'?7:nutF==='30D'?30:90;
  const labels=[],calData=[],protData=[];
  for (let i=n-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=toDateStr(d);
    labels.push(`${d.getDate()}/${d.getMonth()+1}`);
    const entries = dietLog[ds]||[];
    calData.push( entries.reduce((s,e)=>s+(e.cal||0),0) || null);
    protData.push(entries.reduce((s,e)=>s+(e.prot||0),0) || null);
  }
  if (nutChart) nutChart.destroy();
  nutChart = new Chart(document.getElementById('nut-chart'), {
    type:'bar',
    data:{labels,datasets:[
      {label:'Calories',data:calData, backgroundColor:'rgba(200,251,75,.5)', borderColor:'#c8fb4b',borderWidth:1.5,borderRadius:4,yAxisID:'y'},
      {label:'Protein', data:protData,backgroundColor:'rgba(90,174,255,.5)',  borderColor:'#5aaeff',borderWidth:1.5,borderRadius:4,yAxisID:'y1'},
    ]},
    options:{...CHART_DEFAULTS,plugins:{...CHART_DEFAULTS.plugins,tooltip:{...CHART_DEFAULTS.plugins.tooltip}},
      scales:{
        x:{...CHART_DEFAULTS.scales.x},
        y:{...CHART_DEFAULTS.scales.y,position:'left'},
        y1:{...CHART_DEFAULTS.scales.y,position:'right',grid:{display:false}},
      }},
  });
}

function buildWkfChart() {
  const sessions = LS.get('sessions') || {};
  const weeks = wkfF==='4W'?4:wkfF==='8W'?8:12;
  const labels=[], data=[];
  for (let w=weeks-1;w>=0;w--) {
    const start=new Date(); start.setDate(start.getDate()-start.getDay()-w*7);
    let count=0;
    for (let d=0;d<7;d++) {
      const day=new Date(start); day.setDate(start.getDate()+d);
      if (sessions[toDateStr(day)]?.length) count++;
    }
    const label=`${start.getDate()}/${start.getMonth()+1}`;
    labels.push(label); data.push(count);
  }
  if (wkfChart) wkfChart.destroy();
  wkfChart = new Chart(document.getElementById('wkf-chart'), {
    type:'bar',
    data:{labels,datasets:[{label:'Workouts',data,backgroundColor:'rgba(200,251,75,.5)',borderColor:'#c8fb4b',borderWidth:1.5,borderRadius:6}]},
    options:{...CHART_DEFAULTS,scales:{...CHART_DEFAULTS.scales,y:{...CHART_DEFAULTS.scales.y,ticks:{...CHART_DEFAULTS.scales.y.ticks,stepSize:1}}}},
  });
}

/* ════════════════════════════════════
   MODAL / CONFIRM / TOAST
════════════════════════════════════ */
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

function openConfirm(title, msg, icon, cb) {
  document.getElementById('conf-icon').textContent  = icon || '⚠️';
  document.getElementById('conf-title').textContent = title;
  document.getElementById('conf-msg').textContent   = msg;
  document.getElementById('conf-ok').onclick = () => { if (cb) cb(); };
  document.getElementById('confirm-overlay').classList.add('show');
}
function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('show');
}

let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ════════════════════════════════════
   GOOGLE SHEETS SYNC
   ─────────────────────────────────
   POST:  append / overwrite rows
   GET:   read rows back
════════════════════════════════════ */
async function sheetsPost(sheet, data) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet, data }),
    });
  } catch (e) { console.warn('[Sheets POST]', e); }
}

async function sheetsGet(sheet) {
  if (!SHEETS_URL) return null;
  try {
    const res  = await fetch(`${SHEETS_URL}?sheet=${encodeURIComponent(sheet)}`);
    const json = await res.json();
    return json.data ?? json;
  } catch (e) { console.warn('[Sheets GET]', e); return null; }
}
