/* ═══════════════════════════════════════════════════════════════
   FITTRACK — app.js
   Storage: Google Sheets (via Apps Script Web App) + IndexedDB fallback
   The app always writes to IndexedDB instantly (offline-first),
   then syncs to Google Sheets in the background when online.
═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────
   CONFIGURATION  ← PUT YOUR GOOGLE APPS SCRIPT URL HERE
   See SETUP-GUIDE.md for instructions
───────────────────────────────────────────────── */
const SHEETS_URL = ''; // e.g. 'https://script.google.com/macros/s/AKfy.../exec'

/* ─────────────────────────────────────────────────
   INDEXEDDB
───────────────────────────────────────────────── */
const DB_NAME  = 'FitTrackDB';
const DB_VER   = 2;
const STORE_SESSIONS   = 'sessions';
const STORE_EXERCISES  = 'exercises';
const STORE_SYNC_QUEUE = 'syncQueue';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_SESSIONS)) {
        d.createObjectStore(STORE_SESSIONS, { keyPath: 'date' });
      }
      if (!d.objectStoreNames.contains(STORE_EXERCISES)) {
        const exStore = d.createObjectStore(STORE_EXERCISES, { keyPath: 'id', autoIncrement: true });
        exStore.createIndex('name', 'name', { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        d.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(); };
    req.onerror   = ()  => reject(req.error);
  });
}

// Generic IDB helpers
function idbGetAll(storeName) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function idbPut(storeName, record) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(record);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function idbDelete(storeName, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

function idbClear(storeName) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

/* ─────────────────────────────────────────────────
   GOOGLE SHEETS SYNC
   The Apps Script exposes a Web App that accepts:
     GET  ?action=get         → returns all data as JSON
     POST body: { action, payload }  → write / delete operations
───────────────────────────────────────────────── */
const syncEnabled = () => SHEETS_URL.length > 0;

function showSyncBar(msg) {
  const bar = document.getElementById('sync-bar');
  document.getElementById('sync-text').textContent = msg;
  bar.classList.add('show');
}

function hideSyncBar() {
  document.getElementById('sync-bar').classList.remove('show');
}

function setSyncIcon(icon) {
  document.getElementById('sync-status-icon').textContent = icon;
}

async function sheetsRequest(method, body) {
  if (!syncEnabled() || !navigator.onLine) return null;
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const url = method === 'GET' ? SHEETS_URL + '?action=get' : SHEETS_URL;
    const res  = await fetch(url, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('[FitTrack] Sheets request failed:', err.message);
    return null;
  }
}

// Push one session to Google Sheets (writes one row per set)
async function pushSessionToSheets(session) {
  if (!syncEnabled()) return;
  const rows = [];
  session.exercises.forEach(ex => {
    ex.sets.forEach((set, si) => {
      rows.push({
        date:     session.date,
        exercise: ex.name,
        setNum:   si + 1,
        weight:   set.weight || '',
        reps:     set.reps   || ''
      });
    });
  });
  await sheetsRequest('POST', { action: 'upsertSession', date: session.date, rows });
}

// Delete all rows for a date from Google Sheets
async function deleteSessionFromSheets(date) {
  if (!syncEnabled()) return;
  await sheetsRequest('POST', { action: 'deleteSession', date });
}

// Push exercise library entry
async function pushExerciseToSheets(ex) {
  if (!syncEnabled()) return;
  await sheetsRequest('POST', { action: 'upsertExercise', exercise: ex });
}

// Delete exercise from Sheets
async function deleteExerciseFromSheets(id) {
  if (!syncEnabled()) return;
  await sheetsRequest('POST', { action: 'deleteExercise', id });
}

// Full sync: pull everything from Sheets and merge into IDB
async function fullSyncFromSheets() {
  if (!syncEnabled() || !navigator.onLine) return;
  showSyncBar('Syncing with Google Sheets…');
  setSyncIcon('🔄');
  try {
    const data = await sheetsRequest('GET');
    if (!data) throw new Error('No data');

    // Merge sessions
    if (data.sessions) {
      await idbClear(STORE_SESSIONS);
      for (const s of data.sessions) {
        await idbPut(STORE_SESSIONS, s);
        logs[s.date] = s;
      }
    }

    // Merge exercise library
    if (data.exercises) {
      await idbClear(STORE_EXERCISES);
      exerciseLibrary = [];
      for (const ex of data.exercises) {
        const id = await idbPut(STORE_EXERCISES, ex);
        exerciseLibrary.push({ ...ex, id: ex.id || id });
      }
    }

    setSyncIcon('☁️');
    hideSyncBar();
    renderCurrentView();
  } catch (err) {
    console.warn('[FitTrack] Full sync failed:', err.message);
    setSyncIcon('⚠️');
    hideSyncBar();
  }
}

/* ─────────────────────────────────────────────────
   APP STATE
───────────────────────────────────────────────── */
let logs             = {};   // { "2025-01-15": { date, exercises: [{name, sets}] } }
let exerciseLibrary  = [];   // [{ id, name, category }]
let currentView      = 'home';
let prevView         = 'home';
let selectedDate     = todayStr();
let detailDate       = null;
let calYear, calMonth;
let activeCategory   = '';

/* ─────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────── */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function sortedDates() {
  return Object.keys(logs).sort((a, b) => b.localeCompare(a));
}

let toastTimer;
function toast(msg, emoji = '') {
  const el = document.getElementById('toast');
  el.textContent = (emoji ? emoji + '  ' : '') + msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ─────────────────────────────────────────────────
   CONFIRM BOTTOM SHEET
───────────────────────────────────────────────── */
function askConfirm(title, msg, cb) {
  document.getElementById('sheet-title').textContent = title;
  document.getElementById('sheet-msg').textContent   = msg;
  document.getElementById('sheet-confirm').onclick   = () => { cb(); closeSheet(); };
  document.getElementById('sheet-overlay').classList.add('show');
}

function closeSheet() {
  document.getElementById('sheet-overlay').classList.remove('show');
}

document.getElementById('sheet-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('sheet-overlay')) closeSheet();
});

/* ─────────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────────── */
function goTo(view, opts = {}) {
  if (view === currentView && !opts.date && !opts.force) return;

  const prevEl = document.getElementById('view-' + currentView);
  const nextEl = document.getElementById('view-' + view);
  if (!nextEl) return;

  const isBack = (view === 'home' || view === 'history' || view === 'exercises')
                 && currentView === 'detail';

  prevEl.classList.remove('active');
  if (isBack) prevEl.classList.add('slide-back');

  prevView    = currentView;
  currentView = view;

  if (opts.date) {
    if (view === 'log')    selectedDate = opts.date;
    if (view === 'detail') detailDate   = opts.date;
  }

  requestAnimationFrame(() => {
    nextEl.classList.add('active');
    nextEl.scrollTop = 0;
    setTimeout(() => prevEl.classList.remove('slide-back'), 300);
  });

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navEl = document.getElementById('nav-' + view);
  if (navEl) navEl.classList.add('active');

  // Render the target view
  if (view === 'home')      renderHome();
  if (view === 'log')       renderLog();
  if (view === 'exercises') renderExercises();
  if (view === 'history')   renderHistory();
  if (view === 'detail')    renderDetail();
}

function renderCurrentView() {
  if (currentView === 'home')      renderHome();
  if (currentView === 'log')       renderLog();
  if (currentView === 'exercises') renderExercises();
  if (currentView === 'history')   renderHistory();
  if (currentView === 'detail')    renderDetail();
}

/* ─────────────────────────────────────────────────
   CALENDAR
───────────────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function renderCalendar() {
  const todayISO = todayStr();
  document.getElementById('cal-month-label').textContent =
    `${MONTHS[calMonth]} ${calYear}`;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mo      = String(calMonth + 1).padStart(2, '0');
    const dy      = String(d).padStart(2, '0');
    const dateStr = `${calYear}-${mo}-${dy}`;
    const el      = document.createElement('div');
    el.className  = 'cal-day cur-month';
    el.textContent = d;

    if (dateStr === selectedDate)      el.classList.add('selected');
    else if (logs[dateStr])            el.classList.add('has-session');
    if (dateStr === todayISO && dateStr !== selectedDate) el.classList.add('today');

    el.addEventListener('click', () => {
      selectedDate = dateStr;
      renderCalendar();
    });
    grid.appendChild(el);
  }
  renderCalInfo();
}

function renderCalInfo() {
  document.getElementById('cal-sel-date').textContent = formatDate(selectedDate);
  const session = logs[selectedDate];
  const sub     = document.getElementById('cal-sel-sub');
  const btn     = document.getElementById('cal-log-btn');
  if (session) {
    const n = session.exercises.length;
    sub.textContent  = `${n} exercise${n !== 1 ? 's' : ''} logged`;
    sub.className    = 'cal-info-sub has';
    btn.textContent  = 'Edit';
  } else {
    sub.textContent  = selectedDate === todayStr() ? 'No session yet today' : 'No session this day';
    sub.className    = 'cal-info-sub';
    btn.textContent  = 'Log';
  }
}

/* ─────────────────────────────────────────────────
   HOME
───────────────────────────────────────────────── */
function renderHome() {
  const sd  = sortedDates();
  const now = new Date();
  const thisWeek  = sd.filter(d => (now - new Date(d + 'T00:00:00')) / 86400000 < 7).length;
  const thisMonth = sd.filter(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  }).length;

  document.getElementById('wk-count').textContent    = thisWeek;
  document.getElementById('stat-week').textContent   = thisWeek;
  document.getElementById('stat-month').textContent  = thisMonth;
  document.getElementById('stat-total').textContent  = sd.length;
  renderCalendar();
}

/* ─────────────────────────────────────────────────
   LOG PAGE
───────────────────────────────────────────────── */
function renderLog() {
  document.getElementById('log-date-input').value        = selectedDate;
  document.getElementById('ds-date-label').textContent   = formatDate(selectedDate);
  document.getElementById('del-day-btn').style.display   = logs[selectedDate] ? '' : 'none';
  document.getElementById('new-ex-input').value          = '';
  hideSuggestions();

  const session = logs[selectedDate] || { exercises: [] };
  const list    = document.getElementById('exercises-list');
  list.innerHTML = '';

  document.getElementById('log-empty').style.display = session.exercises.length === 0 ? '' : 'none';
  document.getElementById('save-btn').style.display  = session.exercises.length > 0  ? '' : 'none';

  session.exercises.forEach((ex, eIdx) => {
    const card = document.createElement('div');
    card.className = 'ex-card';

    const setsRows = ex.sets.map((s, sIdx) => `
      <div class="set-row">
        <div class="set-badge">S${sIdx + 1}</div>
        <input class="set-inp" type="number" min="0" step="0.5" inputmode="decimal"
          placeholder="0" value="${esc(s.weight || '')}"
          onchange="updateSet(${eIdx},${sIdx},'weight',this.value)"/>
        <input class="set-inp" type="number" min="0" inputmode="numeric"
          placeholder="0" value="${esc(s.reps || '')}"
          onchange="updateSet(${eIdx},${sIdx},'reps',this.value)"/>
        ${ex.sets.length > 1
          ? `<button class="del-set-btn" onclick="removeSet(${eIdx},${sIdx})">✕</button>`
          : '<div></div>'}
      </div>`).join('');

    card.innerHTML = `
      <div class="ex-head">
        <div class="ex-name">${esc(ex.name)}</div>
        <button class="ex-del-btn" onclick="removeExercise(${eIdx})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
          Delete
        </button>
      </div>
      <div class="sets-head">
        <div class="sh-label">Set</div>
        <div class="sh-label">kg</div>
        <div class="sh-label">Reps</div>
        <div></div>
      </div>
      <div class="sets-body">${setsRows}</div>
      <button class="add-set-btn" onclick="addSet(${eIdx})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Set
      </button>`;
    list.appendChild(card);
  });
}

/* ─────────────────────────────────────────────────
   EXERCISE SUGGESTIONS (autocomplete)
───────────────────────────────────────────────── */
function showSuggestions(query) {
  const box = document.getElementById('ex-suggestions');
  const q   = query.trim().toLowerCase();

  if (!q) { hideSuggestions(); return; }

  const matches = exerciseLibrary.filter(e =>
    e.name.toLowerCase().includes(q)
  ).slice(0, 8);

  if (matches.length === 0) { hideSuggestions(); return; }

  box.innerHTML = matches.map(e => `
    <div class="suggestion-item" onclick="selectSuggestion('${esc(e.name)}')">
      <span class="sug-name">${esc(e.name)}</span>
      ${e.category ? `<span class="sug-cat">${esc(e.category)}</span>` : ''}
    </div>`).join('');

  box.classList.add('show');
}

function hideSuggestions() {
  document.getElementById('ex-suggestions').classList.remove('show');
}

function selectSuggestion(name) {
  document.getElementById('new-ex-input').value = name;
  hideSuggestions();
  addExerciseFromInput();
}

/* ─────────────────────────────────────────────────
   EXERCISE ACTIONS (Log page)
───────────────────────────────────────────────── */
function addExerciseFromInput() {
  const inp  = document.getElementById('new-ex-input');
  const name = inp.value.trim();
  if (!name) { inp.focus(); return; }

  const session = logs[selectedDate] || { date: selectedDate, exercises: [] };
  if (session.exercises.find(e => e.name.toLowerCase() === name.toLowerCase())) {
    toast('Already added!', '⚠️'); return;
  }

  session.exercises.push({ name, sets: [{ weight: '', reps: '' }] });
  logs[selectedDate] = session;

  idbPut(STORE_SESSIONS, session);
  pushSessionToSheets(session).catch(console.warn);

  inp.value = '';
  inp.focus();
  hideSuggestions();
  renderLog();
}

function addSet(eIdx) {
  const session = logs[selectedDate]; if (!session) return;
  const last    = session.exercises[eIdx].sets.slice(-1)[0];
  session.exercises[eIdx].sets.push({ weight: last?.weight || '', reps: '' });
  idbPut(STORE_SESSIONS, session);
  pushSessionToSheets(session).catch(console.warn);
  renderLog();
}

function removeSet(eIdx, sIdx) {
  const session = logs[selectedDate]; if (!session) return;
  session.exercises[eIdx].sets.splice(sIdx, 1);
  idbPut(STORE_SESSIONS, session);
  pushSessionToSheets(session).catch(console.warn);
  renderLog();
}

function updateSet(eIdx, sIdx, field, val) {
  const session = logs[selectedDate]; if (!session) return;
  session.exercises[eIdx].sets[sIdx][field] = val;
  idbPut(STORE_SESSIONS, session);
  pushSessionToSheets(session).catch(console.warn);
}

function removeExercise(eIdx) {
  const session = logs[selectedDate];
  const name    = session?.exercises[eIdx]?.name;
  askConfirm('Delete Exercise', `Remove "${name}" and all its sets?`, () => {
    session.exercises.splice(eIdx, 1);
    if (session.exercises.length === 0) {
      delete logs[selectedDate];
      idbDelete(STORE_SESSIONS, selectedDate);
      deleteSessionFromSheets(selectedDate).catch(console.warn);
    } else {
      idbPut(STORE_SESSIONS, session);
      pushSessionToSheets(session).catch(console.warn);
    }
    toast('Exercise removed', '🗑️');
    renderLog();
  });
}

function removeExerciseFromDetail(eIdx) {
  const session = logs[detailDate];
  const name    = session?.exercises[eIdx]?.name;
  askConfirm('Delete Exercise', `Remove "${name}" and all its sets?`, () => {
    session.exercises.splice(eIdx, 1);
    if (session.exercises.length === 0) {
      delete logs[detailDate];
      idbDelete(STORE_SESSIONS, detailDate);
      deleteSessionFromSheets(detailDate).catch(console.warn);
      toast('Exercise removed', '🗑️');
      goTo('history');
    } else {
      idbPut(STORE_SESSIONS, session);
      pushSessionToSheets(session).catch(console.warn);
      toast('Exercise removed', '🗑️');
      renderDetail();
    }
  });
}

/* ─────────────────────────────────────────────────
   DELETE DAY
───────────────────────────────────────────────── */
function deleteDayHandler() { deleteDayPrompt(selectedDate); }

function deleteDayPrompt(date) {
  askConfirm('Delete Session', `Delete entire session for ${formatDate(date)}?`, () => {
    delete logs[date];
    idbDelete(STORE_SESSIONS, date);
    deleteSessionFromSheets(date).catch(console.warn);
    toast('Session deleted', '🗑️');
    if (currentView === 'log' || currentView === 'detail') goTo('history');
    else renderHome();
  });
}

/* ─────────────────────────────────────────────────
   SAVE SESSION
───────────────────────────────────────────────── */
function saveSession() {
  toast('Session saved!', '🔥');
  goTo('home');
}

/* ─────────────────────────────────────────────────
   EXERCISE LIBRARY PAGE
───────────────────────────────────────────────── */
async function addToLibrary() {
  const nameInput = document.getElementById('lib-ex-name');
  const catInput  = document.getElementById('lib-ex-cat');
  const name      = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  // Prevent duplicate names
  if (exerciseLibrary.find(e => e.name.toLowerCase() === name.toLowerCase())) {
    toast('Exercise already exists!', '⚠️'); return;
  }

  const ex = { name, category: catInput.value };
  const id = await idbPut(STORE_EXERCISES, ex);
  ex.id    = id;
  exerciseLibrary.push(ex);

  // Sync to Sheets
  pushExerciseToSheets(ex).catch(console.warn);

  nameInput.value = '';
  catInput.value  = '';
  toast('Exercise saved!', '✅');
  renderExercises();
}

async function deleteFromLibrary(id) {
  const ex = exerciseLibrary.find(e => e.id === id);
  askConfirm('Delete Exercise', `Remove "${ex?.name}" from your library?`, async () => {
    exerciseLibrary = exerciseLibrary.filter(e => e.id !== id);
    await idbDelete(STORE_EXERCISES, id);
    deleteExerciseFromSheets(id).catch(console.warn);
    toast('Removed from library', '🗑️');
    renderExercises();
  });
}

function useExerciseInLog(name) {
  selectedDate = todayStr();
  goTo('log', { date: selectedDate });
  // After navigation, inject name and add
  setTimeout(() => {
    document.getElementById('new-ex-input').value = name;
    addExerciseFromInput();
  }, 80);
}

function renderExercises() {
  const searchVal = (document.getElementById('lib-search')?.value || '').toLowerCase();
  const list      = document.getElementById('lib-list');
  list.innerHTML  = '';

  const filtered = exerciseLibrary.filter(e => {
    const matchCat  = !activeCategory || e.category === activeCategory;
    const matchName = !searchVal || e.name.toLowerCase().includes(searchVal);
    return matchCat && matchName;
  });

  document.getElementById('ex-lib-count').textContent = exerciseLibrary.length;
  document.getElementById('lib-empty').style.display  = filtered.length === 0 ? '' : 'none';

  filtered.forEach((ex, i) => {
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.style.animationDelay = `${i * 0.03}s`;
    item.innerHTML = `
      <div class="lib-item-left">
        <div class="lib-item-name">${esc(ex.name)}</div>
        ${ex.category ? `<div class="lib-item-cat">${esc(ex.category)}</div>` : ''}
      </div>
      <div class="lib-item-right">
        <button class="lib-use-btn" onclick="useExerciseInLog('${esc(ex.name)}')">Use</button>
        <button class="lib-del-btn" onclick="deleteFromLibrary(${ex.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </div>`;
    list.appendChild(item);
  });
}

/* ─────────────────────────────────────────────────
   HISTORY PAGE
───────────────────────────────────────────────── */
function renderHistory() {
  const sd   = sortedDates();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  document.getElementById('hist-empty').style.display = sd.length === 0 ? '' : 'none';

  sd.forEach((d, i) => {
    const tags = logs[d].exercises.map(e =>
      `<div class="tag">${esc(e.name)}</div>`
    ).join('');

    const item = document.createElement('div');
    item.className = 'hist-item';
    item.style.animationDelay = `${i * 0.04}s`;
    item.innerHTML = `
      <div class="hist-top" onclick="goTo('detail',{date:'${d}'})">
        <div class="hist-date">${formatDate(d)}</div>
        <div class="hist-right">
          <div class="hist-ex-count">${logs[d].exercises.length} ex</div>
          <button class="hist-del"
            onclick="event.stopPropagation();deleteDayPrompt('${d}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="hist-tags">${tags}</div>`;
    list.appendChild(item);
  });
}

/* ─────────────────────────────────────────────────
   DETAIL PAGE
───────────────────────────────────────────────── */
function renderDetail() {
  if (!detailDate || !logs[detailDate]) { goTo(prevView || 'home'); return; }

  document.getElementById('detail-title').textContent   = formatDate(detailDate);
  document.getElementById('detail-edit-btn').onclick    = () => goTo('log', { date: detailDate });
  document.getElementById('del-day-detail-btn').onclick = () => deleteDayPrompt(detailDate);

  const cont = document.getElementById('detail-exercises');
  cont.innerHTML = '';

  logs[detailDate].exercises.forEach((ex, i) => {
    const rows = ex.sets.map((s, si) => `
      <div class="det-set-row">
        <div class="det-set-num">S${si + 1}</div>
        <div class="det-val${!s.weight ? ' empty' : ''}">${s.weight ? s.weight + ' kg' : '—'}</div>
        <div class="det-val${!s.reps   ? ' empty' : ''}">${s.reps || '—'}</div>
      </div>`).join('');

    const card = document.createElement('div');
    card.className = 'det-card';
    card.style.animationDelay = `${i * 0.05}s`;
    card.innerHTML = `
      <div class="det-head">
        <div class="det-name">${esc(ex.name)}</div>
        <button class="det-del-btn" onclick="removeExerciseFromDetail(${i})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
          Delete
        </button>
      </div>
      <div class="det-set-header">
        <div class="dsh-col">Set</div>
        <div class="dsh-col">Weight</div>
        <div class="dsh-col">Reps</div>
      </div>
      <div class="det-sets">${rows}</div>`;
    cont.appendChild(card);
  });
}

/* ─────────────────────────────────────────────────
   PWA INSTALL
───────────────────────────────────────────────── */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner').classList.add('show');
});

document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('install-banner').classList.remove('show');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').classList.remove('show');
  toast('App installed!', '🎉');
});

function dismissBanner() {
  document.getElementById('install-banner').classList.remove('show');
}

/* ─────────────────────────────────────────────────
   ONLINE / OFFLINE
───────────────────────────────────────────────── */
window.addEventListener('online', () => {
  toast('Back online — syncing…', '🌐');
  fullSyncFromSheets();
});

window.addEventListener('offline', () => {
  toast('Offline — changes saved locally', '📴');
  setSyncIcon('📴');
});

/* ─────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────── */
async function init() {
  // Open IndexedDB
  await openDB();

  // Load sessions
  const allSessions = await idbGetAll(STORE_SESSIONS);
  allSessions.forEach(s => { logs[s.date] = s; });

  // Load exercise library
  const allExercises = await idbGetAll(STORE_EXERCISES);
  exerciseLibrary    = allExercises;

  // Calendar init
  const now  = new Date();
  calYear    = now.getFullYear();
  calMonth   = now.getMonth();

  // Calendar navigation
  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  // Calendar LOG button
  document.getElementById('cal-log-btn').addEventListener('click', () => {
    goTo('log', { date: selectedDate });
  });

  // Log page — date input
  document.getElementById('log-date-input').addEventListener('change', e => {
    selectedDate = e.target.value;
    renderLog();
  });

  // Log page — Today button
  document.getElementById('log-today-btn').addEventListener('click', () => {
    selectedDate = todayStr();
    renderLog();
  });

  // Log page — exercise input (type to filter suggestions)
  const newExInput = document.getElementById('new-ex-input');
  newExInput.addEventListener('input', e => showSuggestions(e.target.value));
  newExInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addExerciseFromInput(); }
    if (e.key === 'Escape') hideSuggestions();
  });
  // Close suggestions on outside tap
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-input-wrap')) hideSuggestions();
  });
  // Scroll input into view when keyboard opens
  newExInput.addEventListener('focus', () => {
    setTimeout(() => newExInput.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  });

  // Exercise library — search
  document.getElementById('lib-search').addEventListener('input', () => renderExercises());

  // Exercise library — Enter to save
  document.getElementById('lib-ex-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addToLibrary();
  });

  // Category chips
  document.getElementById('cat-chips').addEventListener('click', e => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCategory = chip.dataset.cat;
    renderExercises();
  });

  // Render home
  renderHome();

  // Sync from Google Sheets (background, non-blocking)
  if (syncEnabled() && navigator.onLine) {
    setTimeout(fullSyncFromSheets, 800);
  }

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
