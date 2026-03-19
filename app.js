
/* ══════════════════════════════════════════════════════════
   FITTRACK — app.js
   All data is entered by the user.
   Persists in localStorage. Set SHEETS_URL to sync to Sheets.
══════════════════════════════════════════════════════════ */

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyoCG-wmPKXAvz2HzWlFQbKW-sCZse4Zxk4ms6KjZ8rXwFLEpwTFN6VOuGrrBGRxNqHKA/exec'; // ← paste your Web App URL here


/* ════════ STORAGE ════════ */
const LS = {
  get:    k      => { try { return JSON.parse(localStorage.getItem('ft_' + k)); } catch { return null; } },
  set:    (k, v) => localStorage.setItem('ft_' + k, JSON.stringify(v)),
  update: (k, f) => { LS.set(k, f(LS.get(k))); },
};

/* ════════ GLOBAL STATE ════════ */
let curView = 'home';
let calYear, calMonth;
let wtChart, nutChart, wkfChart;
let wtF = '30D', nutF = '30D', wkfF = '8W';
let activeSession = null;

/* ════════════════════════════════════════════════════════
   ONBOARDING
════════════════════════════════════════════════════════ */
function obNext(step) {
  if (step === 1) {
    const name = document.getElementById('ob-name').value.trim();
    if (!name) { toast('Please enter your name'); return; }
    LS.set('userName', name);
  }
  if (step === 2) {
    const h = parseFloat(document.getElementById('ob-height').value) || 0;
    const w = parseFloat(document.getElementById('ob-weight').value) || 0;
    const t = parseFloat(document.getElementById('ob-target').value) || 0;
    LS.update('goals', g => ({ ...(g || {}), height: h, weight: w, targetWeight: t }));
  }
  document.getElementById('ob-step-' + step).classList.remove('active');
  document.getElementById('ob-step-' + (step + 1)).classList.add('active');
  document.getElementById('ob-dot-' + step).classList.remove('active');
  document.getElementById('ob-dot-' + (step + 1)).classList.add('active');
}

function obBack(step) {
  document.getElementById('ob-step-' + step).classList.remove('active');
  document.getElementById('ob-step-' + (step - 1)).classList.add('active');
  document.getElementById('ob-dot-' + step).classList.remove('active');
  document.getElementById('ob-dot-' + (step - 1)).classList.add('active');
}

function obFinish() {
  const cal   = parseInt(document.getElementById('ob-cal').value)   || 2000;
  const prot  = parseInt(document.getElementById('ob-prot').value)  || 150;
  const water = parseInt(document.getElementById('ob-water').value) || 2500;
  LS.update('goals', g => ({ ...(g || {}), cal, prot, water }));
  LS.set('onboarded', true);
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('shell').style.display = '';
  initApp();
}

/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (LS.get('onboarded')) {
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('shell').style.display = '';
    initApp();
  }
});

function initApp() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();

  const td = toDateStr(now);
  document.getElementById('session-date').value = td;
  document.getElementById('diet-date').value    = td;

  updateGreeting();
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

  if (SHEETS_URL) {
    sheetsGet('goals').then(d => {
      if (d && (d.cal || d.prot)) {
        LS.update('goals', g => ({ ...(g || {}), ...d }));
        refreshGoalsUI(); refreshHomeRings(); refreshWaterUI();
      }
    });
  }
}

/* ════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════ */
function goTo(view) {
  if (view === curView) return;
  document.getElementById('view-' + curView).classList.remove('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  curView = view;
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('on');
  if (view === 'progress') setTimeout(buildCharts, 80);
}

function switchTab(section, tab, btn) {
  const pfx = section === 'workout' ? 'wk' : 'diet';
  document.querySelectorAll('#view-' + section + ' .tab-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('#view-' + section + ' .sub-view').forEach(v => v.classList.remove('on'));
  document.getElementById(pfx + '-' + tab).classList.add('on');
}

/* ════════════════════════════════════════════════════════
   DATE HELPERS
════════════════════════════════════════════════════════ */
function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function todayStr() { return toDateStr(new Date()); }
function fmtDate(ds) {
  if (!ds) return '';
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}
function updateGreeting() {
  const name  = LS.get('userName') || '';
  const hr    = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent = name ? greet + ', ' + name + '!' : greet + '!';
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('home-date-lbl').textContent = MONTHS[new Date().getMonth()] + ' ' + new Date().getFullYear();
}

/* ════════════════════════════════════════════════════════
   CALENDAR
════════════════════════════════════════════════════════ */
function calShift(d) {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth <  0) { calMonth = 11; calYear--; }
  buildCal();
}

function buildCal() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-label').textContent = MONTHS[calMonth] + ' ' + calYear;

  const sessions = LS.get('sessions')  || {};
  const creatine = LS.get('creatine')  || {};
  const waterLog = LS.get('waterLog')  || {};
  const dietLog  = LS.get('dietLog')   || {};
  const goals    = LS.get('goals')     || {};
  const wGoal    = goals.water || 2500;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayFull   = toDateStr(new Date());
  const grid        = document.getElementById('cal-grid');
  grid.innerHTML    = '';

  for (let i = 0; i < firstDay; i++) {
    grid.insertAdjacentHTML('beforeend', '<div class="cal-day"></div>');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const isToday = ds === todayFull;
    const dots    = [];
    if (sessions[ds]?.length)             dots.push('var(--accent)');
    if ((waterLog[ds] || 0) >= wGoal)     dots.push('var(--blue)');
    if (creatine[ds])                     dots.push('var(--purple)');
    if (dietLog[ds]?.length)              dots.push('var(--orange)');

    const dotsHtml = dots.length
      ? '<div class="cal-dots">' + dots.map(c => '<div class="cal-dot" style="background:' + c + '"></div>').join('') + '</div>'
      : '';
    grid.insertAdjacentHTML('beforeend',
      '<div class="cal-day cur' + (isToday ? ' today' : '') + '">' + d + dotsHtml + '</div>');
  }
}

/* ════════════════════════════════════════════════════════
   CREATINE
════════════════════════════════════════════════════════ */
function toggleCreatine() {
  const log  = LS.get('creatine') || {};
  const td   = todayStr();
  log[td]    = !log[td];
  LS.set('creatine', log);
  refreshCreatineUI();
  buildCal();
  refreshStreaks();
  toast(log[td] ? '💊 Creatine logged!' : 'Unmarked');
  sheetsPost('creatine', { date: td, taken: log[td] });
}

function refreshCreatineUI() {
  const log    = LS.get('creatine') || {};
  const taken  = !!log[todayStr()];
  const streak = calcStreak(log);
  document.getElementById('cr-cb').classList.toggle('on', taken);
  document.getElementById('cr-row').setAttribute('aria-checked', taken);
  document.getElementById('creatine-card').style.borderColor = taken ? 'rgba(155,141,255,.4)' : '';
  document.getElementById('cr-meta').textContent = taken ? '✅ Taken today' : '⬜ Not taken today';
  document.getElementById('cr-streak-badge').textContent = '🔥 ' + streak + ' day' + (streak !== 1 ? 's' : '');
}

function calcStreak(obj) {
  if (!obj) return 0;
  let streak = 0, d = new Date();
  while (obj[toDateStr(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ════════════════════════════════════════════════════════
   WATER
════════════════════════════════════════════════════════ */
function addWater(ml) {
  const log  = LS.get('waterLog') || {};
  const td   = todayStr();
  log[td]    = (log[td] || 0) + ml;
  LS.set('waterLog', log);
  refreshWaterUI(); buildCal(); refreshStreaks();
  toast('+' + ml + ' ml 💧');
  sheetsPost('water', { date: td, total_ml: log[td] });
}

function openCustomWaterModal() {
  openModal('<div class="modal-title">💧 Custom Amount</div>' +
    '<div class="form-grp"><label class="form-lbl">Amount (ml)</label>' +
    '<input id="cw-inp" type="number" class="inp" placeholder="e.g. 330" inputmode="numeric" autofocus/></div>' +
    '<button class="btn btn-accent" onclick="addCustomWater()">Add</button>');
}
function addCustomWater() {
  const v = parseInt(document.getElementById('cw-inp').value);
  if (!v || v <= 0) { toast('Enter a valid amount'); return; }
  closeModal(); addWater(v);
}

function openWaterEditModal() {
  const goals    = LS.get('goals')    || {};
  const waterLog = LS.get('waterLog') || {};
  const td       = todayStr();
  openModal('<div class="modal-title">💧 Water Settings</div>' +
    '<div class="form-grp"><label class="form-lbl">Daily Goal (ml)</label>' +
    '<input id="wg-inp" type="number" class="inp" value="' + (goals.water || 2500) + '" inputmode="numeric"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Today\'s intake — edit directly (ml)</label>' +
    '<input id="wi-inp" type="number" class="inp" value="' + (waterLog[td] || 0) + '" inputmode="numeric"/></div>' +
    '<button class="btn btn-accent" onclick="saveWaterSettings()">Save</button>');
}
function saveWaterSettings() {
  const goals    = LS.get('goals')    || {};
  const waterLog = LS.get('waterLog') || {};
  const td       = todayStr();
  goals.water    = parseInt(document.getElementById('wg-inp').value) || goals.water || 2500;
  waterLog[td]   = parseInt(document.getElementById('wi-inp').value) || 0;
  LS.set('goals', goals); LS.set('waterLog', waterLog);
  closeModal(); refreshWaterUI(); refreshGoalsUI(); buildCal(); refreshStreaks();
  toast('Water settings saved');
  sheetsPost('goals', goals);
}

function refreshWaterUI() {
  const goals    = LS.get('goals')    || {};
  const waterLog = LS.get('waterLog') || {};
  const td   = todayStr();
  const cur  = waterLog[td] || 0;
  const goal = goals.water  || 2500;
  const pct  = Math.min(100, (cur / goal) * 100);
  document.getElementById('water-fill').style.width = pct + '%';
  document.getElementById('water-val').textContent  = cur >= 1000 ? (cur/1000).toFixed(1).replace(/\.0$/, '') + 'L' : cur + ' ml';
  document.getElementById('water-lbl').textContent  = cur.toLocaleString() + ' / ' + goal.toLocaleString() + ' ml';
  document.getElementById('water-meta').textContent = pct >= 100 ? '✅ Goal reached!' : Math.round(pct) + '% of daily goal';
}

/* ════════════════════════════════════════════════════════
   HOME RINGS
════════════════════════════════════════════════════════ */
function refreshHomeRings() {
  const goals   = LS.get('goals')   || {};
  const dietLog = LS.get('dietLog') || {};
  const entries = dietLog[todayStr()] || [];
  const totalCal  = Math.round(entries.reduce((s, e) => s + (Number(e.cal)  || 0), 0));
  const totalProt = Math.round(entries.reduce((s, e) => s + (Number(e.prot) || 0), 0));
  const goalCal   = goals.cal  || 2000;
  const goalProt  = goals.prot || 150;
  const C = 2 * Math.PI * 35;

  document.getElementById('ring-cal-val').textContent  = totalCal >= 1000 ? (totalCal/1000).toFixed(1) + 'k' : totalCal;
  document.getElementById('ring-pro-val').textContent  = totalProt;
  document.getElementById('ring-cal-goal').textContent = 'Goal: ' + (goalCal >= 1000 ? (goalCal/1000).toFixed(1) + 'k' : goalCal) + ' kcal';
  document.getElementById('ring-pro-goal').textContent = 'Goal: ' + goalProt + 'g';

  setTimeout(() => {
    document.getElementById('cal-ring').style.strokeDasharray = (Math.min(1, totalCal / goalCal) * C) + ' ' + C;
    document.getElementById('pro-ring').style.strokeDasharray = (Math.min(1, totalProt / goalProt) * C) + ' ' + C;
  }, 200);
}

/* ════════════════════════════════════════════════════════
   WORKOUT — SESSION
════════════════════════════════════════════════════════ */
function startBlankSession() {
  activeSession = { name: 'Workout', date: todayStr(), exercises: [] };
  showSessionUI();
}

function startTemplateSession(tmplId) {
  const tmpls = LS.get('templates') || [];
  const tmpl  = tmpls.find(t => t.id === tmplId);
  if (!tmpl) return;
  activeSession = { name: tmpl.name, date: todayStr(), exercises: tmpl.exercises.map(n => ({ name: n, sets: [{ kg: '', reps: '' }] })) };
  goTo('workout');
  document.querySelectorAll('#view-workout .tab-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
  document.querySelectorAll('#view-workout .sub-view').forEach((v, i) => v.classList.toggle('on', i === 0));
  showSessionUI();
}

function showSessionUI() {
  document.getElementById('wk-start-card').style.display = 'none';
  document.getElementById('wk-session').style.display    = '';
  document.getElementById('session-name').value = activeSession.name;
  document.getElementById('session-date').value = activeSession.date;
  updateSessionDateLabel();
  renderExCards();
  updateSaveBtn();
}

function hideSessionUI() {
  activeSession = null;
  document.getElementById('wk-start-card').style.display = '';
  document.getElementById('wk-session').style.display    = 'none';
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
  if (activeSession && activeSession.exercises.length) {
    openConfirm('Discard workout?', 'Your unsaved session will be lost.', '⚠️', () => { closeConfirm(); hideSessionUI(); });
  } else { hideSessionUI(); }
}

function showExSugg(q) {
  const drop = document.getElementById('ex-sugg');
  if (!q.trim()) { drop.classList.remove('show'); return; }
  const lib  = LS.get('exercises') || [];
  let hits   = lib.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  if (!lib.find(e => e.name.toLowerCase() === q.toLowerCase())) hits.push({ name: q.trim(), cat: 'New', _new: true });
  drop.innerHTML = hits.map(e =>
    '<div class="sugg-item" onclick="pickExFromSugg(\'' + e.name.replace(/'/g, "\\'") + '\')">' +
    '<span class="sugg-name">' + e.name + '</span>' +
    '<span class="sugg-cat">' + (e._new ? '+ add new' : e.cat) + '</span></div>').join('');
  drop.classList.toggle('show', hits.length > 0);
}

function pickExFromSugg(name) {
  document.getElementById('ex-search-inp').value = name;
  document.getElementById('ex-sugg').classList.remove('show');
}

function addExToSession() {
  const inp  = document.getElementById('ex-search-inp');
  const name = inp.value.trim();
  if (!name)          { toast('Type an exercise name first'); return; }
  if (!activeSession) return;

  // Auto-add to library if it doesn't exist
  const lib = LS.get('exercises') || [];
  if (!lib.find(e => e.name.toLowerCase() === name.toLowerCase())) {
    lib.push({ name, cat: 'Other' });
    LS.set('exercises', lib);
    buildExLib();
  }

  activeSession.exercises.push({ name, sets: [{ kg: '', reps: '' }] });
  inp.value = '';
  document.getElementById('ex-sugg').classList.remove('show');
  renderExCards();
  updateSaveBtn();
}

function renderExCards() {
  if (!activeSession) return;
  const list = document.getElementById('ex-cards-list');
  const hint = document.getElementById('no-ex-hint');
  list.innerHTML = activeSession.exercises.map((ex, ei) => buildExCard(ex, ei)).join('');
  hint.style.display = activeSession.exercises.length ? 'none' : '';
  bindExCardEvents();
}

function buildExCard(ex, ei) {
  const rows = ex.sets.map((s, si) =>
    '<div class="set-row" data-ei="' + ei + '" data-si="' + si + '">' +
    '<div class="set-num">S' + (si+1) + '</div>' +
    '<input class="set-inp" type="number" value="' + (s.kg||'') + '" placeholder="kg" inputmode="decimal" data-ei="' + ei + '" data-si="' + si + '" data-f="kg"/>' +
    '<input class="set-inp" type="number" value="' + (s.reps||'') + '" placeholder="reps" inputmode="numeric" data-ei="' + ei + '" data-si="' + si + '" data-f="reps"/>' +
    '<button class="del-set-btn" data-ei="' + ei + '" data-si="' + si + '">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
    '</button></div>').join('');

  return '<div class="ex-card"><div class="ex-head"><div class="ex-title">' + ex.name + '</div>' +
    '<button class="del-ex-btn" data-ei="' + ei + '">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg> Remove</button></div>' +
    '<div class="sets-hdr"><div class="set-lbl">Set</div><div class="set-lbl">kg</div><div class="set-lbl">Reps</div><div></div></div>' +
    '<div class="sets-body">' + rows + '</div>' +
    '<button class="add-set-btn" data-ei="' + ei + '">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Set</button></div>';
}

function bindExCardEvents() {
  document.querySelectorAll('.set-inp').forEach(inp => {
    inp.addEventListener('change', () => {
      if (activeSession) activeSession.exercises[+inp.dataset.ei].sets[+inp.dataset.si][inp.dataset.f] = inp.value;
    });
  });
  document.querySelectorAll('.del-set-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ei = +btn.dataset.ei, si = +btn.dataset.si;
      if (!activeSession) return;
      activeSession.exercises[ei].sets.splice(si, 1);
      if (!activeSession.exercises[ei].sets.length) activeSession.exercises[ei].sets.push({ kg: '', reps: '' });
      renderExCards();
    });
  });
  document.querySelectorAll('.add-set-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (activeSession) { activeSession.exercises[+btn.dataset.ei].sets.push({ kg: '', reps: '' }); renderExCards(); }
    });
  });
  document.querySelectorAll('.del-ex-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (activeSession) { activeSession.exercises.splice(+btn.dataset.ei, 1); renderExCards(); updateSaveBtn(); }
    });
  });
}

function updateSaveBtn() {
  document.getElementById('save-session-btn').style.display = activeSession?.exercises.length ? '' : 'none';
}

function saveSession() {
  if (!activeSession) return;
  activeSession.name = document.getElementById('session-name').value.trim() || 'Workout';
  activeSession.date = document.getElementById('session-date').value || todayStr();
  activeSession.savedAt = Date.now();
  // Capture any unsaved DOM changes
  document.querySelectorAll('.set-inp').forEach(inp => {
    const ei = +inp.dataset.ei, si = +inp.dataset.si;
    if (activeSession.exercises[ei]) activeSession.exercises[ei].sets[si][inp.dataset.f] = inp.value;
  });
  const sessions = LS.get('sessions') || {};
  if (!sessions[activeSession.date]) sessions[activeSession.date] = [];
  sessions[activeSession.date].push({ ...activeSession });
  LS.set('sessions', sessions);
  toast('Session saved! 🔥');
  hideSessionUI(); buildHistory(); buildTemplates(); buildCal(); refreshStreaks(); updateWeekCount();
  sheetsPost('sessions', activeSession);
}

/* ════════════════════════════════════════════════════════
   WORKOUT — TEMPLATES
════════════════════════════════════════════════════════ */
function buildTemplates() {
  const tmpls = LS.get('templates') || [];

  // Templates tab
  const tmplEl = document.getElementById('tmpl-list');
  if (!tmpls.length) {
    tmplEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No templates yet.<br>Create one to speed up your logging.</p></div>';
  } else {
    tmplEl.innerHTML = tmpls.map((t, i) =>
      '<div class="tmpl-item" style="animation-delay:' + (i*.04) + 's">' +
        '<div class="tmpl-body" onclick="startTemplateSession(\'' + t.id + '\')">' +
          '<div class="tmpl-name">' + t.name + '</div>' +
          '<div class="tmpl-meta">' + t.exercises.length + ' exercise' + (t.exercises.length!==1?'s':'') +
            (t.exercises.length ? ' · ' + t.exercises.slice(0,2).join(', ') + (t.exercises.length>2?'…':'') : '') + '</div>' +
        '</div>' +
        '<div class="tmpl-actions">' +
          '<button class="chip" onclick="event.stopPropagation();openEditTemplateModal(\'' + t.id + '\')">Edit</button>' +
          '<button class="icon-btn" onclick="event.stopPropagation();deleteTmpl(\'' + t.id + '\')">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>').join('');
  }

  // Quick-start list on Log tab
  const qlEl = document.getElementById('wk-quick-tmpls');
  if (!tmpls.length) {
    qlEl.innerHTML = '<div class="empty-state" style="padding:16px 0 8px"><div class="empty-icon" style="font-size:1.5rem">📋</div><p>No templates yet — create one in the Templates tab</p></div>';
  } else {
    qlEl.innerHTML = '<div class="sh" style="padding-top:8px"><h2 class="sh-title">Quick Start</h2></div>' +
      tmpls.map(t =>
        '<div class="tmpl-item mb8" onclick="startTemplateSession(\'' + t.id + '\')">' +
          '<div class="tmpl-body">' +
            '<div class="tmpl-name">' + t.name + '</div>' +
            '<div class="tmpl-meta">' + t.exercises.length + ' exercise' + (t.exercises.length!==1?'s':'') +
              (t.exercises.length ? ' · ' + t.exercises.slice(0,2).join(', ') + (t.exercises.length>2?'…':'') : '') + '</div>' +
          '</div>' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>').join('');
  }
}

function openCreateTemplateModal() { openTemplateModal(null); }
function openEditTemplateModal(id) { openTemplateModal(id); }

function openTemplateModal(editId) {
  const tmpls = LS.get('templates') || [];
  const edit  = editId ? tmpls.find(t => t.id === editId) : null;
  const isNew = !edit;
  let   sel   = edit ? [...edit.exercises] : [];
  const lib   = LS.get('exercises') || [];

  const rSel = () => {
    const el = document.getElementById('tmpl-sel-list'); if (!el) return;
    el.innerHTML = sel.length
      ? sel.map((n, i) =>
          '<div class="tmpl-sel-row"><span>' + n + '</span>' +
          '<button onclick="window.__tRm(' + i + ')" class="icon-btn">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button></div>').join('')
      : '<p style="color:var(--t3);font-size:.875rem;padding:4px 0 8px">No exercises added yet</p>';
  };

  window.__tRm  = i => { sel.splice(i, 1); rSel(); };
  window.__tAdd = n => {
    if (!n?.trim()) return;
    if (sel.includes(n)) { toast('Already added'); return; }
    sel.push(n); rSel();
  };
  window.__tSave = () => {
    const name = document.getElementById('tmpl-name-inp')?.value?.trim();
    if (!name)         { toast('Enter a template name'); return; }
    if (!sel.length)   { toast('Add at least one exercise'); return; }
    if (isNew) { tmpls.push({ id: 't' + Date.now(), name, exercises: [...sel] }); }
    else       { edit.name = name; edit.exercises = [...sel]; }
    LS.set('templates', tmpls);
    buildTemplates(); closeModal();
    toast(isNew ? 'Template created ✅' : 'Template updated ✅');
    sheetsPost('templates', tmpls);
  };

  openModal(
    '<div class="modal-title">' + (isNew ? '✨ New Template' : '✏️ Edit Template') + '</div>' +
    '<div class="form-grp"><label class="form-lbl">Name</label>' +
    '<input id="tmpl-name-inp" type="text" class="inp" value="' + (edit?.name||'') + '" placeholder="e.g. Push Day" autocapitalize="words"/></div>' +
    '<label class="form-lbl">Exercises in template</label>' +
    '<div id="tmpl-sel-list" style="margin-bottom:14px"></div>' +
    (lib.length ? '<label class="form-lbl">Pick from library</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px">' +
      lib.map(e =>
        '<button onclick="window.__tAdd(\'' + e.name.replace(/'/g,"\\'") + '\')"' +
        ' style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--pill);padding:7px 13px;color:var(--t2);font-family:var(--ff);font-size:.8125rem;font-weight:600;cursor:pointer;transition:all .12s"' +
        ' onmouseover="this.style.borderColor=\'var(--accent)\';this.style.color=\'var(--accent)\'"' +
        ' onmouseout="this.style.borderColor=\'\';this.style.color=\'var(--t2)\'">' + e.name + '</button>').join('') +
      '</div>' : '') +
    '<label class="form-lbl">Or type a name</label>' +
    '<div class="inp-row mb16">' +
    '<input id="tmpl-ex-inp" type="text" class="inp" placeholder="Exercise name…" style="flex:1" autocapitalize="words"' +
    ' onkeydown="if(event.key===\'Enter\'){window.__tAdd(this.value.trim());this.value=\'\'}"/>' +
    '<button class="btn btn-ghost btn-sm" onclick="const i=document.getElementById(\'tmpl-ex-inp\');window.__tAdd(i.value.trim());i.value=\'\'">Add</button></div>' +
    '<div style="display:flex;gap:9px">' +
    '<button class="btn btn-ghost" onclick="closeModal()" style="flex:1">Cancel</button>' +
    '<button class="btn btn-accent" onclick="window.__tSave()" style="flex:2">' + (isNew?'Create':'Save') + '</button></div>'
  );
  setTimeout(rSel, 10);
}

function deleteTmpl(id) {
  openConfirm('Delete template?', 'This cannot be undone.', '🗑️', () => {
    LS.update('templates', ts => (ts||[]).filter(t => t.id !== id));
    buildTemplates(); closeConfirm(); toast('Template deleted');
    sheetsPost('templates', LS.get('templates'));
  });
}

/* ════════════════════════════════════════════════════════
   WORKOUT — EXERCISE LIBRARY
════════════════════════════════════════════════════════ */
function buildExLib() { renderExLib(LS.get('exercises') || []); }

function renderExLib(list) {
  const el = document.getElementById('ex-lib-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏋️</div><p>Your library is empty.<br>Add an exercise above to get started.</p></div>';
    return;
  }
  const cats = {};
  list.forEach(e => { if (!cats[e.cat]) cats[e.cat] = []; cats[e.cat].push(e); });
  el.innerHTML = Object.entries(cats).map(([cat, items]) =>
    '<div style="margin-bottom:16px"><div class="meal-grp-hdr">' + cat + '</div>' +
    items.map((e, i) =>
      '<div class="lib-item" style="animation-delay:' + (i*.025) + 's">' +
      '<div><div class="lib-name">' + e.name + '</div></div>' +
      '<button class="icon-btn" onclick="deleteExFromLib(\'' + e.name.replace(/'/g,"\\'") + '\')">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>' +
      '</button></div>').join('') + '</div>').join('');
}

function filterExLib(q) {
  const lib = LS.get('exercises') || [];
  renderExLib(q ? lib.filter(e => e.name.toLowerCase().includes(q.toLowerCase()) || e.cat.toLowerCase().includes(q.toLowerCase())) : lib);
}

function addExerciseToLib() {
  const name = document.getElementById('new-ex-name').value.trim();
  const cat  = document.getElementById('new-ex-cat').value;
  if (!name) { toast('Enter a name'); return; }
  const lib  = LS.get('exercises') || [];
  if (lib.find(e => e.name.toLowerCase() === name.toLowerCase())) { toast('Already in library'); return; }
  lib.push({ name, cat }); LS.set('exercises', lib);
  document.getElementById('new-ex-name').value = '';
  buildExLib(); toast(name + ' added ✅');
}

function deleteExFromLib(name) {
  openConfirm('Remove "' + name + '"?', 'Removes from the exercise library.', '🗑️', () => {
    LS.update('exercises', lib => (lib||[]).filter(e => e.name !== name));
    buildExLib(); closeConfirm(); toast(name + ' removed');
  });
}

/* ════════════════════════════════════════════════════════
   WORKOUT — HISTORY
════════════════════════════════════════════════════════ */
function buildHistory() {
  const sessions = LS.get('sessions') || {};
  const all = [];
  Object.entries(sessions).forEach(([date, arr]) => arr.forEach(s => all.push({ ...s, date })));
  all.sort((a, b) => b.date.localeCompare(a.date));

  const el = document.getElementById('wk-hist-list');
  if (!all.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No workouts logged yet.<br>Start a session to see your history!</p></div>';
    return;
  }
  el.innerHTML = all.map((s, i) => {
    const id    = 'hd-' + i;
    const names = (s.exercises || []).map(e => e.name);
    const detail = (s.exercises || []).map(ex => {
      const validSets = (ex.sets || []).filter(st => st.kg || st.reps);
      return '<div style="margin-bottom:12px"><div class="hist-ex-name">' + ex.name + '</div>' +
        (validSets.length
          ? validSets.map((st, si) =>
              '<div class="hist-set-row"><span>S' + (si+1) + '</span><span>' + (st.kg ? st.kg+'kg' : '—') + '</span><span>' + (st.reps ? st.reps+' reps' : '—') + '</span></div>').join('')
          : '<div style="font-size:.8125rem;color:var(--t3)">No sets recorded</div>') + '</div>';
    }).join('');
    return '<div class="hist-item" style="animation-delay:' + (i*.04) + 's">' +
      '<div class="hist-top" onclick="toggleHistDet(\'' + id + '\')">' +
        '<div><div class="hist-date">' + fmtDate(s.date) + '</div>' +
        '<div class="hist-meta">📋 ' + s.name + ' · ' + (s.exercises?.length||0) + ' exercises</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<div class="hist-pill">' + (s.exercises?.length||0) + ' ex</div>' +
          '<button class="icon-btn" onclick="event.stopPropagation();deleteSession(\'' + s.date + '\',' + (s.savedAt||0) + ')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="hist-tags">' + names.map(n => '<div class="htag">' + n + '</div>').join('') + '</div>' +
      '<div class="hist-det" id="' + id + '">' + (detail || '<p style="color:var(--t3);font-size:.875rem">No details recorded</p>') + '</div>' +
    '</div>';
  }).join('');
}

function toggleHistDet(id) {
  const el = document.getElementById(id);
  const open = el.classList.contains('open');
  el.classList.toggle('open', !open);
  el.style.display = open ? 'none' : 'block';
}

function deleteSession(date, savedAt) {
  openConfirm('Delete session?', 'This workout will be permanently removed.', '🗑️', () => {
    LS.update('sessions', sessions => {
      if (!sessions?.[date]) return sessions;
      sessions[date] = sessions[date].filter(s => s.savedAt !== savedAt);
      if (!sessions[date].length) delete sessions[date];
      return sessions;
    });
    buildHistory(); buildCal(); refreshStreaks(); updateWeekCount(); closeConfirm(); toast('Session deleted');
  });
}

/* ════════════════════════════════════════════════════════
   DIET — LOG
════════════════════════════════════════════════════════ */
function setDietToday() {
  document.getElementById('diet-date').value = todayStr();
  document.getElementById('diet-date-lbl').textContent = 'Today';
  refreshDietLog();
}

function changeDietDate() {
  const v = document.getElementById('diet-date').value;
  document.getElementById('diet-date-lbl').textContent = v === todayStr() ? 'Today' : fmtDate(v);
  refreshDietLog();
}

function openLogFoodModal() {
  const db      = LS.get('foodDB')  || [];
  const recipes = LS.get('recipes') || [];
  const all = [
    ...db.map(f      => ({ label: f.name + ' (' + f.cal + ' kcal' + (f.qty ? ' / ' + f.qty : '') + ')', data: { name: f.name, cal: f.cal, prot: f.prot, qty: f.qty } })),
    ...recipes.map(r => ({ label: '🍳 ' + r.name + ' (' + r.cal + ' kcal)', data: { name: r.name, cal: r.cal, prot: r.prot, qty: '1 serving' } })),
  ];

  openModal('<div class="modal-title">🍽️ Log Food</div>' +
    '<div class="form-grp"><label class="form-lbl">Meal</label>' +
    '<select id="lf-meal" class="inp inp-select"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snacks</option></select></div>' +
    (all.length ?
      '<div class="form-grp"><label class="form-lbl">From your database</label>' +
      '<select id="lf-db-sel" class="inp inp-select" onchange="fillLogFromDB()">' +
      '<option value="">— Select food or recipe —</option>' +
      all.map((f, i) => '<option value="' + i + '">' + f.label + '</option>').join('') +
      '</select></div>' : '') +
    '<div class="form-grp"><label class="form-lbl">Food name</label>' +
    '<input id="lf-name" type="text" class="inp" placeholder="e.g. Chicken breast" autocapitalize="words"/></div>' +
    '<div class="form-row">' +
    '<div class="form-grp"><label class="form-lbl">Calories</label><input id="lf-cal" type="number" class="inp" placeholder="kcal" inputmode="numeric"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Protein (g)</label><input id="lf-prot" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>' +
    '</div>' +
    '<div class="form-grp"><label class="form-lbl">Qty / Serving</label><input id="lf-qty" type="text" class="inp" placeholder="e.g. 200g"/></div>' +
    '<button class="btn btn-accent" onclick="confirmLogFood()">+ Add to Log</button>');

  // Store all options for fillLogFromDB
  window.__lfAll = all;
}

function fillLogFromDB() {
  const idx = parseInt(document.getElementById('lf-db-sel')?.value);
  if (isNaN(idx) || !window.__lfAll) return;
  const f = window.__lfAll[idx]?.data; if (!f) return;
  document.getElementById('lf-name').value = f.name || '';
  document.getElementById('lf-cal').value  = f.cal  || '';
  document.getElementById('lf-prot').value = f.prot || '';
  document.getElementById('lf-qty').value  = f.qty  || '';
}

function confirmLogFood() {
  const meal = document.getElementById('lf-meal').value;
  const name = document.getElementById('lf-name').value.trim();
  const cal  = parseFloat(document.getElementById('lf-cal').value)  || 0;
  const prot = parseFloat(document.getElementById('lf-prot').value) || 0;
  const qty  = document.getElementById('lf-qty').value.trim();
  if (!name) { toast('Enter a food name'); return; }

  const date    = document.getElementById('diet-date').value || todayStr();
  const dietLog = LS.get('dietLog') || {};
  if (!dietLog[date]) dietLog[date] = [];
  const entry = { id: Date.now(), meal, name, qty, cal, prot };
  dietLog[date].push(entry);
  LS.set('dietLog', dietLog);
  closeModal(); refreshDietLog(); refreshHomeRings(); buildCal();
  toast(name + ' logged ✅');
  sheetsPost('dietlog', { date, entry });
}

function refreshDietLog() {
  const date    = document.getElementById('diet-date')?.value || todayStr();
  const dietLog = LS.get('dietLog') || {};
  const goals   = LS.get('goals')   || {};
  const entries = dietLog[date] || [];
  const totalCal  = Math.round(entries.reduce((s, e) => s + (Number(e.cal)  || 0), 0));
  const totalProt = Math.round(entries.reduce((s, e) => s + (Number(e.prot) || 0), 0));

  document.getElementById('diet-total-cal').textContent     = totalCal.toLocaleString();
  document.getElementById('diet-total-prot').textContent    = totalProt;
  document.getElementById('diet-cal-goal-lbl').textContent  = goals.cal  ? 'of ' + goals.cal.toLocaleString()  + ' kcal goal' : '';
  document.getElementById('diet-prot-goal-lbl').textContent = goals.prot ? 'of ' + goals.prot + 'g goal' : '';

  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  const grouped = {};
  entries.forEach(e => { if (!grouped[e.meal]) grouped[e.meal] = []; grouped[e.meal].push(e); });

  let html = '';
  MEALS.forEach(meal => {
    const items = grouped[meal]; if (!items?.length) return;
    const mCal = Math.round(items.reduce((s, e) => s + (Number(e.cal)||0), 0));
    html += '<div class="meal-grp">' +
      '<div class="meal-grp-hdr"><span>' + meal + '</span><span style="color:var(--accent)">' + mCal + ' kcal</span></div>' +
      items.map(e =>
        '<div class="log-entry">' +
        '<div class="log-body"><div class="log-name">' + e.name + '</div><div class="log-sub">' + (e.qty||'') + '</div></div>' +
        '<div class="log-right" style="margin-right:8px"><div class="log-cal">' + Math.round(e.cal) + ' kcal</div><div class="log-prot">' + Math.round(e.prot) + 'g</div></div>' +
        '<button class="icon-btn" onclick="deleteLogEntry(\'' + date + '\',' + e.id + ')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>' +
        '</button></div>').join('') + '</div>';
  });

  document.getElementById('diet-log-list').innerHTML = html ||
    '<div class="empty-state"><div class="empty-icon">🍽️</div><p>Nothing logged yet.<br>Tap &ldquo;+ Log Food&rdquo; to start.</p></div>';
}

function deleteLogEntry(date, id) {
  LS.update('dietLog', log => { if (log?.[date]) log[date] = log[date].filter(e => e.id !== id); return log; });
  refreshDietLog(); refreshHomeRings(); buildCal();
}

/* ════════════════════════════════════════════════════════
   DIET — FOOD DATABASE
════════════════════════════════════════════════════════ */
function buildFoodDB() { renderFoodDB(LS.get('foodDB') || []); }

function renderFoodDB(list) {
  const el = document.getElementById('food-db-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🥗</div><p>Your food database is empty.<br>Add your common foods to log them quickly.</p></div>';
    return;
  }
  el.innerHTML = list.map((f, i) =>
    '<div class="food-item" style="animation-delay:' + (i*.03) + 's">' +
    '<div class="food-body"><div class="food-name">' + f.name + '</div>' +
    '<div class="food-macros"><span class="ca">' + f.cal + ' kcal</span> · <span class="pr">' + f.prot + 'g protein</span>' +
    (f.carb ? ' · ' + f.carb + 'g carbs' : '') + (f.fat ? ' · ' + f.fat + 'g fat' : '') +
    (f.qty ? ' <span style="color:var(--t4)">/ ' + f.qty + '</span>' : '') + '</div></div>' +
    '<div style="display:flex;gap:6px">' +
    '<button class="icon-btn" onclick="openEditFoodModal(\'' + f.name.replace(/'/g,"\\'") + '\')">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
    '<button class="icon-btn" onclick="deleteFoodFromDB(\'' + f.name.replace(/'/g,"\\'") + '\')">' +
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>' +
    '</div></div>').join('');
}

function filterFoodDB(q) {
  const db = LS.get('foodDB') || [];
  renderFoodDB(q ? db.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : db);
}

function _foodFormHtml(f) {
  return '<div class="form-grp"><label class="form-lbl">Food Name</label>' +
    '<input id="af-name" type="text" class="inp" value="' + (f?.name||'') + '" placeholder="e.g. Chicken Breast" autocapitalize="words"/></div>' +
    '<div class="form-row">' +
    '<div class="form-grp"><label class="form-lbl">Calories</label><input id="af-cal" type="number" class="inp" value="' + (f?.cal||'') + '" placeholder="kcal" inputmode="numeric"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Protein (g)</label><input id="af-prot" type="number" class="inp" value="' + (f?.prot||'') + '" placeholder="g" inputmode="decimal"/></div>' +
    '</div><div class="form-row">' +
    '<div class="form-grp"><label class="form-lbl">Carbs (g)</label><input id="af-carb" type="number" class="inp" value="' + (f?.carb||'') + '" placeholder="g" inputmode="decimal"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Fat (g)</label><input id="af-fat" type="number" class="inp" value="' + (f?.fat||'') + '" placeholder="g" inputmode="decimal"/></div>' +
    '</div><div class="form-grp"><label class="form-lbl">Serving Size</label>' +
    '<input id="af-qty" type="text" class="inp" value="' + (f?.qty||'') + '" placeholder="e.g. 100g, 1 cup"/></div>';
}

function openAddFoodModal() {
  openModal('<div class="modal-title">🥗 Add Food</div>' + _foodFormHtml(null) +
    '<button class="btn btn-accent" onclick="saveFood(null)">Add Food</button>');
}

function openEditFoodModal(name) {
  const food = (LS.get('foodDB')||[]).find(f => f.name === name);
  if (!food) return;
  openModal('<div class="modal-title">✏️ Edit Food</div>' + _foodFormHtml(food) +
    '<button class="btn btn-accent" onclick="saveFood(\'' + name.replace(/'/g,"\\'") + '\')">Save Changes</button>');
}

function saveFood(originalName) {
  const name = document.getElementById('af-name').value.trim();
  const cal  = parseFloat(document.getElementById('af-cal').value)  || 0;
  const prot = parseFloat(document.getElementById('af-prot').value) || 0;
  const carb = parseFloat(document.getElementById('af-carb').value) || 0;
  const fat  = parseFloat(document.getElementById('af-fat').value)  || 0;
  const qty  = document.getElementById('af-qty').value.trim();
  if (!name) { toast('Enter a food name'); return; }
  LS.update('foodDB', db => {
    const arr = db || [];
    if (originalName) {
      const idx = arr.findIndex(f => f.name === originalName);
      if (idx > -1) arr[idx] = { name, cal, prot, carb, fat, qty };
      else arr.push({ name, cal, prot, carb, fat, qty });
    } else {
      arr.push({ name, cal, prot, carb, fat, qty });
    }
    return arr;
  });
  buildFoodDB(); closeModal(); toast(name + ' saved ✅');
  sheetsPost('foods', { name, cal, prot, carb, fat, qty });
}

function deleteFoodFromDB(name) {
  openConfirm('Delete "' + name + '"?', 'Removes from your food database.', '🗑️', () => {
    LS.update('foodDB', db => (db||[]).filter(f => f.name !== name));
    buildFoodDB(); closeConfirm(); toast(name + ' deleted');
  });
}

/* ════════════════════════════════════════════════════════
   DIET — RECIPES
════════════════════════════════════════════════════════ */
function buildRecipes() {
  const recipes = LS.get('recipes') || [];
  const el      = document.getElementById('recipe-list');
  if (!recipes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍🍳</div><p>No recipes yet.<br>Build a recipe to log it as a single entry.</p></div>';
    return;
  }
  el.innerHTML = recipes.map((r, i) => {
    const id = 'rec-' + i;
    return '<div class="recipe-item" style="animation-delay:' + (i*.04) + 's">' +
      '<div class="recipe-head" onclick="toggleRecipe(\'' + id + '\')">' +
        '<div><div class="recipe-name">' + r.name + '</div>' +
        '<div class="recipe-macros">' + r.cal + ' kcal · ' + r.prot + 'g protein · ' + r.ingredients.length + ' ingredients</div></div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<svg id="' + id + '-arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2.5" style="transition:transform var(--mid)"><polyline points="9 18 15 12 9 6"/></svg>' +
          '<button class="icon-btn" onclick="event.stopPropagation();deleteRecipe(' + i + ')">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="recipe-body" id="' + id + '" style="display:none">' +
        r.ingredients.map(g => '<div class="recipe-ing">' + g + '</div>').join('') +
        '<button class="btn btn-ghost btn-sm" style="margin-top:12px;width:100%" onclick="logRecipeNow(' + i + ')">+ Log as Meal</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function toggleRecipe(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById(id + '-arr');
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  el.classList.toggle('open', !open);
  if (arr) arr.style.transform = open ? '' : 'rotate(90deg)';
}

function openCreateRecipeModal() {
  let ings = [];
  const rI = () => {
    const el = document.getElementById('rec-ing-list'); if (!el) return;
    el.innerHTML = ings.length
      ? ings.map((g, i) =>
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;background:var(--s2);border-radius:var(--r14);padding:10px 14px">' +
          '<span style="flex:1;font-size:.9375rem">' + g + '</span>' +
          '<button onclick="window.__rRm(' + i + ')" class="icon-btn">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>').join('')
      : '<p style="color:var(--t3);font-size:.875rem;padding:4px 0 8px">No ingredients yet</p>';
  };
  window.__rRm  = i => { ings.splice(i, 1); rI(); };
  window.__rAdd = () => {
    const v = document.getElementById('rec-ing-inp')?.value?.trim();
    if (!v) return;
    ings.push(v); document.getElementById('rec-ing-inp').value = ''; rI();
  };
  window.__rSave = () => {
    const name = document.getElementById('rec-name')?.value?.trim();
    const cal  = parseFloat(document.getElementById('rec-cal')?.value)  || 0;
    const prot = parseFloat(document.getElementById('rec-prot')?.value) || 0;
    if (!name) { toast('Enter a recipe name'); return; }
    LS.update('recipes', rs => { const arr = rs || []; arr.push({ name, cal, prot, ingredients: [...ings] }); return arr; });
    buildRecipes(); closeModal(); toast(name + ' saved ✅');
    sheetsPost('recipes', { name, cal, prot, ingredients: ings });
  };

  openModal('<div class="modal-title">👨‍🍳 Create Recipe</div>' +
    '<div class="form-grp"><label class="form-lbl">Recipe Name</label><input id="rec-name" type="text" class="inp" placeholder="e.g. Muscle Bowl" autocapitalize="words"/></div>' +
    '<div class="form-row">' +
    '<div class="form-grp"><label class="form-lbl">Total Calories</label><input id="rec-cal" type="number" class="inp" placeholder="kcal" inputmode="numeric"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Protein (g)</label><input id="rec-prot" type="number" class="inp" placeholder="g" inputmode="decimal"/></div>' +
    '</div>' +
    '<label class="form-lbl">Ingredients</label>' +
    '<div id="rec-ing-list" style="margin-bottom:10px"></div>' +
    '<div class="inp-row mb16">' +
    '<input id="rec-ing-inp" type="text" class="inp" placeholder="e.g. Chicken breast 200g" style="flex:1" autocapitalize="words"' +
    ' onkeydown="if(event.key===\'Enter\')window.__rAdd()"/>' +
    '<button class="btn btn-ghost btn-sm" onclick="window.__rAdd()">Add</button></div>' +
    '<div style="display:flex;gap:9px">' +
    '<button class="btn btn-ghost" onclick="closeModal()" style="flex:1">Cancel</button>' +
    '<button class="btn btn-accent" onclick="window.__rSave()" style="flex:2">Save Recipe</button></div>');
  setTimeout(rI, 10);
}

function deleteRecipe(idx) {
  openConfirm('Delete recipe?', 'This cannot be undone.', '🗑️', () => {
    LS.update('recipes', rs => { if (rs) rs.splice(idx, 1); return rs || []; });
    buildRecipes(); closeConfirm(); toast('Recipe deleted');
  });
}

function logRecipeNow(idx) {
  const recipes = LS.get('recipes') || [];
  const r = recipes[idx]; if (!r) return;
  const date    = document.getElementById('diet-date')?.value || todayStr();
  const dietLog = LS.get('dietLog') || {};
  if (!dietLog[date]) dietLog[date] = [];
  dietLog[date].push({ id: Date.now(), meal: 'Dinner', name: r.name, qty: '1 serving', cal: r.cal, prot: r.prot });
  LS.set('dietLog', dietLog);
  refreshDietLog(); refreshHomeRings(); buildCal();
  toast(r.name + ' logged ✅');
  goTo('diet');
  document.querySelectorAll('#view-diet .tab-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
  document.querySelectorAll('#view-diet .sub-view').forEach((v, i) => v.classList.toggle('on', i === 0));
}

/* ════════════════════════════════════════════════════════
   PROGRESS — GOALS & BMI
════════════════════════════════════════════════════════ */
function openGoalsModal() {
  const g = LS.get('goals') || {};
  const n = LS.get('userName') || '';
  openModal('<div class="modal-title">⚙️ Profile & Goals</div>' +
    '<div class="form-grp"><label class="form-lbl">Your Name</label>' +
    '<input id="g-name" type="text" class="inp" value="' + n + '" placeholder="Your name" autocapitalize="words"/></div>' +
    '<div class="form-lbl" style="margin:6px 0 12px">Body Metrics</div>' +
    '<div class="form-row">' +
    '<div class="form-grp"><label class="form-lbl">Height (cm)</label><input id="g-h"  type="number" class="inp" value="' + (g.height||'')  + '" inputmode="numeric"  placeholder="e.g. 178"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Weight (kg)</label><input id="g-w"  type="number" class="inp" value="' + (g.weight||'')  + '" inputmode="decimal"  step="0.1" placeholder="e.g. 80"/></div>' +
    '</div><div class="form-grp"><label class="form-lbl">Target Weight (kg)</label>' +
    '<input id="g-tw" type="number" class="inp" value="' + (g.targetWeight||'') + '" inputmode="decimal" step="0.1" placeholder="optional"/></div>' +
    '<div class="form-lbl" style="margin:6px 0 12px">Daily Targets</div>' +
    '<div class="form-grp"><label class="form-lbl">🔥 Calories (kcal)</label><input id="g-c"  type="number" class="inp" value="' + (g.cal||'')   + '" inputmode="numeric"  placeholder="e.g. 2000"/></div>' +
    '<div class="form-row">' +
    '<div class="form-grp"><label class="form-lbl">💪 Protein (g)</label><input id="g-p"  type="number" class="inp" value="' + (g.prot||'')  + '" inputmode="numeric"  placeholder="e.g. 150"/></div>' +
    '<div class="form-grp"><label class="form-lbl">💧 Water (ml)</label> <input id="g-wt" type="number" class="inp" value="' + (g.water||'') + '" inputmode="numeric"  placeholder="e.g. 2500"/></div>' +
    '</div><button class="btn btn-accent" onclick="saveGoals()">Save</button>');
}

function saveGoals() {
  const name = document.getElementById('g-name')?.value?.trim();
  const g = {
    height:       parseFloat(document.getElementById('g-h').value)   || 0,
    weight:       parseFloat(document.getElementById('g-w').value)   || 0,
    targetWeight: parseFloat(document.getElementById('g-tw').value)  || 0,
    cal:          parseInt(document.getElementById('g-c').value)     || 0,
    prot:         parseInt(document.getElementById('g-p').value)     || 0,
    water:        parseInt(document.getElementById('g-wt').value)    || 0,
  };
  if (name) LS.set('userName', name);
  LS.set('goals', g);
  closeModal(); refreshGoalsUI(); refreshHomeRings(); refreshWaterUI(); refreshDietLog(); buildCal(); updateGreeting();
  toast('Goals saved ✅');
  sheetsPost('goals', g);
}

function refreshGoalsUI() {
  const g = LS.get('goals') || {};
  document.getElementById('g-disp-cal').textContent   = g.cal   ? g.cal.toLocaleString() + ' kcal' : '—';
  document.getElementById('g-disp-prot').textContent  = g.prot  ? g.prot + ' g'                    : '—';
  document.getElementById('g-disp-water').textContent = g.water ? g.water.toLocaleString() + ' ml'  : '—';
  document.getElementById('g-disp-tw').textContent    = g.targetWeight ? g.targetWeight + ' kg'     : '—';
  if (g.height && g.weight) {
    const bmi = +(g.weight / Math.pow(g.height / 100, 2)).toFixed(1);
    document.getElementById('bmi-h-val').textContent = g.height;
    document.getElementById('bmi-w-val').textContent = g.weight;
    document.getElementById('bmi-val').textContent   = bmi;
    document.getElementById('bmi-marker').style.left = Math.max(2, Math.min(97, ((bmi - 15) / 25) * 100)) + '%';
    const st = document.getElementById('bmi-status');
    st.className = 'bmi-status';
    if      (bmi < 18.5) { st.textContent = '⬇️ Underweight (< 18.5)';        st.classList.add('yellow'); }
    else if (bmi < 25)   { st.textContent = '✅ Healthy weight (18.5 – 24.9)'; st.classList.add('green');  }
    else if (bmi < 30)   { st.textContent = '⚠️ Overweight (25 – 29.9)';       st.classList.add('yellow'); }
    else                 { st.textContent = '❌ Obese (BMI ≥ 30)';              st.classList.add('red');    }
  }
}

/* ════════════════════════════════════════════════════════
   PROGRESS — WEIGHT LOG
════════════════════════════════════════════════════════ */
function openLogWeightModal() {
  openModal('<div class="modal-title">⚖️ Log Body Weight</div>' +
    '<div class="form-grp"><label class="form-lbl">Date</label>' +
    '<input id="wt-date" type="date" class="inp" value="' + todayStr() + '" style="color-scheme:dark"/></div>' +
    '<div class="form-grp"><label class="form-lbl">Weight (kg)</label>' +
    '<input id="wt-val-inp" type="number" class="inp" placeholder="e.g. 80.5" step="0.1" inputmode="decimal" autofocus/></div>' +
    '<button class="btn btn-accent" onclick="saveWeight()">Log Weight</button>');
}

function saveWeight() {
  const date = document.getElementById('wt-date').value || todayStr();
  const val  = parseFloat(document.getElementById('wt-val-inp').value);
  if (!val || val <= 0) { toast('Enter a valid weight'); return; }
  LS.update('weightLog', log => { const l = log || {}; l[date] = val; return l; });
  if (date === todayStr()) LS.update('goals', g => { g.weight = val; return g; });
  closeModal(); refreshGoalsUI();
  if (wtChart) buildWtChart();
  toast(val + ' kg logged ✅');
  sheetsPost('weight', { date, kg: val });
}

/* ════════════════════════════════════════════════════════
   PROGRESS — STREAKS & WEEK COUNT
════════════════════════════════════════════════════════ */
function refreshStreaks() {
  const crLog    = LS.get('creatine')  || {};
  const waterLog = LS.get('waterLog')  || {};
  const sessions = LS.get('sessions')  || {};
  const wGoal    = (LS.get('goals') || {}).water || 2500;
  const wkMet    = Object.fromEntries(Object.keys(sessions).map(d => [d, !!sessions[d]?.length]));
  const waterMet = Object.fromEntries(Object.entries(waterLog).map(([d, v]) => [d, v >= wGoal]));
  document.getElementById('streak-wk').textContent = calcStreak(wkMet);
  document.getElementById('streak-cr').textContent = calcStreak(crLog);
  document.getElementById('streak-wt').textContent = calcStreak(waterMet);
}

function updateWeekCount() {
  const sessions  = LS.get('sessions') || {};
  const now       = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    if (sessions[toDateStr(d)]?.length) count++;
  }
  document.getElementById('wk-count').textContent = count;
}

/* ════════════════════════════════════════════════════════
   PROGRESS — CHARTS
════════════════════════════════════════════════════════ */
const CD = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(16,16,20,.98)', titleColor: '#ededf1', bodyColor: '#9292a0',
      borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, cornerRadius: 12, padding: 12,
      titleFont: { family: 'Syne',  weight: '700', size: 12 },
      bodyFont:  { family: 'Inter', weight: '500', size: 11 },
    },
  },
  scales: {
    x: { ticks: { color: '#525260', font: { size: 10, family: 'Inter' }, maxRotation: 0, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.04)' }, border: { color: 'transparent' } },
    y: { ticks: { color: '#525260', font: { size: 10, family: 'Inter' } },                                   grid: { color: 'rgba(255,255,255,.04)' }, border: { color: 'transparent' } },
  },
  animation: { duration: 400, easing: 'easeInOutQuart' },
};

function buildCharts() { buildWtChart(); buildNutChart(); buildWkfChart(); }

function setFilter(ch, f, btn) {
  document.querySelectorAll('#' + ch + '-filters .cf-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  if (ch === 'wt')  { wtF  = f; buildWtChart();  }
  if (ch === 'nut') { nutF = f; buildNutChart(); }
  if (ch === 'wkf') { wkfF = f; buildWkfChart(); }
}

function buildWtChart() {
  const wlog = LS.get('weightLog') || {};
  const n    = wtF === '7D' ? 7 : wtF === '30D' ? 30 : 90;
  const labels = [], data = [];
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    labels.push(d.getDate() + '/' + (d.getMonth()+1));
    data.push(wlog[toDateStr(d)] ?? null);
  }
  if (wtChart) wtChart.destroy();
  const canvas = document.getElementById('wt-chart'); if (!canvas) return;
  wtChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Weight (kg)', data, borderColor: '#9b8dff', backgroundColor: 'rgba(155,141,255,.07)', pointBackgroundColor: '#9b8dff', pointRadius: 4, pointHoverRadius: 7, spanGaps: true, tension: .4, fill: true, borderWidth: 2 }] },
    options: CD,
  });
}

function buildNutChart() {
  const dietLog = LS.get('dietLog') || {};
  const n = nutF === '7D' ? 7 : nutF === '30D' ? 30 : 90;
  const labels = [], calD = [], protD = [];
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    labels.push(d.getDate() + '/' + (d.getMonth()+1));
    const ents = dietLog[ds] || [];
    const c = Math.round(ents.reduce((s, e) => s + (Number(e.cal)||0), 0));
    const p = Math.round(ents.reduce((s, e) => s + (Number(e.prot)||0), 0));
    calD.push(c || null); protD.push(p || null);
  }
  if (nutChart) nutChart.destroy();
  const canvas = document.getElementById('nut-chart'); if (!canvas) return;
  nutChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Calories', data: calD,  backgroundColor: 'rgba(200,251,75,.45)', borderColor: '#c8fb4b', borderWidth: 1.5, borderRadius: 4, yAxisID: 'y' },
      { label: 'Protein',  data: protD, backgroundColor: 'rgba(90,174,255,.45)',  borderColor: '#5aaeff', borderWidth: 1.5, borderRadius: 4, yAxisID: 'y1' },
    ]},
    options: { ...CD, scales: { x: { ...CD.scales.x }, y: { ...CD.scales.y, position: 'left' }, y1: { ...CD.scales.y, position: 'right', grid: { display: false } } } },
  });
}

function buildWkfChart() {
  const sessions = LS.get('sessions') || {};
  const weeks    = wkfF === '4W' ? 4 : wkfF === '8W' ? 8 : 12;
  const labels = [], data = [];
  for (let w = weeks-1; w >= 0; w--) {
    const start = new Date(); start.setDate(start.getDate() - start.getDay() - w*7);
    let count = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      if (sessions[toDateStr(day)]?.length) count++;
    }
    labels.push(start.getDate() + '/' + (start.getMonth()+1));
    data.push(count);
  }
  if (wkfChart) wkfChart.destroy();
  const canvas = document.getElementById('wkf-chart'); if (!canvas) return;
  wkfChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Workouts', data, backgroundColor: 'rgba(200,251,75,.45)', borderColor: '#c8fb4b', borderWidth: 1.5, borderRadius: 6 }] },
    options: { ...CD, scales: { ...CD.scales, y: { ...CD.scales.y, ticks: { ...CD.scales.y.ticks, stepSize: 1 } } } },
  });
}

/* ════════════════════════════════════════════════════════
   MODAL / CONFIRM / TOAST
════════════════════════════════════════════════════════ */
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }

function openConfirm(title, msg, icon, cb) {
  document.getElementById('conf-icon').textContent  = icon || '⚠️';
  document.getElementById('conf-title').textContent = title;
  document.getElementById('conf-msg').textContent   = msg;
  document.getElementById('conf-ok').onclick = cb || null;
  document.getElementById('confirm-overlay').classList.add('show');
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('show'); }

let _tt;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ════════════════════════════════════════════════════════
   GOOGLE SHEETS SYNC
════════════════════════════════════════════════════════ */
async function sheetsPost(sheet, data) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sheet, data }),
    });
  } catch (e) { console.warn('[Sheets POST]', e); }
}

async function sheetsGet(sheet) {
  if (!SHEETS_URL) return null;
  try {
    const r = await fetch(SHEETS_URL + '?sheet=' + encodeURIComponent(sheet));
    const j = await r.json();
    return j.data ?? j;
  } catch (e) { console.warn('[Sheets GET]', e); return null; }
}
