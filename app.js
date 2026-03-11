/* ═══════════════════════════════════════════════
   FITTRACK — app.js
   Offline-first with Google Sheets sync
═══════════════════════════════════════════════ */

// ─── CONFIG ───────────────────────────────────
// Paste your Google Apps Script Web App URL here after deployment:
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbznrF0dA3hmqeJ_5xeejz_OS2EueHfC2U8XED4xh0kHd2VDc4Rq2w5jwznOeSmOA-BHPQ/exec';   // e.g. 'https://script.google.com/macros/s/ABC.../exec'

// ─── DEMO / SEED DATA ─────────────────────────
const EXERCISE_LIB_DEFAULT = [
  { name: 'Bench Press',      cat: 'Chest' },
  { name: 'Incline DB Press', cat: 'Chest' },
  { name: 'Cable Fly',        cat: 'Chest' },
  { name: 'Back Squat',       cat: 'Legs'  },
  { name: 'Romanian Deadlift',cat: 'Legs'  },
  { name: 'Leg Press',        cat: 'Legs'  },
  { name: 'Deadlift',         cat: 'Back'  },
  { name: 'Pull-ups',         cat: 'Back'  },
  { name: 'Cable Row',        cat: 'Back'  },
  { name: 'Overhead Press',   cat: 'Shoulders' },
  { name: 'Lateral Raises',   cat: 'Shoulders' },
  { name: 'Barbell Curl',     cat: 'Arms'  },
  { name: 'Tricep Pushdown',  cat: 'Arms'  },
  { name: 'Plank',            cat: 'Core'  },
];

let EXERCISE_LIB = JSON.parse(localStorage.getItem('ft_lib') || 'null') || [...EXERCISE_LIB_DEFAULT];

let TEMPLATES = JSON.parse(localStorage.getItem('ft_templates') || 'null') || [
  { id: 't1', name: 'Push Day 💪', exercises: ['Bench Press','Incline DB Press','Overhead Press','Lateral Raises','Tricep Pushdown'] },
  { id: 't2', name: 'Pull Day 🏋️', exercises: ['Deadlift','Pull-ups','Cable Row','Barbell Curl'] },
  { id: 't3', name: 'Leg Day 🦵',  exercises: ['Back Squat','Romanian Deadlift','Leg Press','Plank'] },
];
let tmplSeq = parseInt(localStorage.getItem('ft_tmplseq') || '4');

const HISTORY_DATA = [
  { date: 'Wed, Mar 5',  tmpl: 'Push Day',  exs: ['Bench Press','Incline DB Press','Tricep Pushdown'],
    detail: [{ n:'Bench Press',    sets:[{w:'80kg',r:8},{w:'82.5kg',r:7},{w:'82.5kg',r:6}] },
             { n:'Incline DB Press',sets:[{w:'28kg',r:10},{w:'28kg',r:9}] }] },
  { date: 'Mon, Mar 3',  tmpl: 'Leg Day',   exs: ['Back Squat','Romanian Deadlift','Leg Press'],
    detail: [{ n:'Back Squat',     sets:[{w:'100kg',r:6},{w:'102.5kg',r:5}] },
             { n:'Romanian Deadlift',sets:[{w:'80kg',r:10},{w:'80kg',r:10}] }] },
  { date: 'Sat, Mar 1',  tmpl: 'Pull Day',  exs: ['Deadlift','Pull-ups','Cable Row'],
    detail: [{ n:'Deadlift',       sets:[{w:'140kg',r:4},{w:'130kg',r:5}] },
             { n:'Pull-ups',       sets:[{w:'BW',r:12},{w:'+5kg',r:8}] }] },
  { date: 'Thu, Feb 27', tmpl: 'Push Day',  exs: ['Bench Press','Overhead Press','Lateral Raises'],
    detail: [{ n:'Bench Press',    sets:[{w:'80kg',r:8},{w:'80kg',r:8}] }] },
];

const FOODS = [
  { name:'Chicken Breast', cal:165, prot:31, qty:'100g' },
  { name:'Brown Rice',     cal:216, prot:5,  qty:'100g' },
  { name:'Whole Eggs',     cal:155, prot:13, qty:'100g' },
  { name:'Greek Yogurt',   cal:59,  prot:10, qty:'100g' },
  { name:'Oats',           cal:389, prot:17, qty:'100g' },
  { name:'Salmon',         cal:208, prot:20, qty:'100g' },
  { name:'Whey Protein',   cal:120, prot:25, qty:'30g'  },
  { name:'Banana',         cal:89,  prot:1,  qty:'100g' },
  { name:'Almonds',        cal:579, prot:21, qty:'100g' },
];

const RECIPES = [
  { name:'Muscle Bowl 🍗', ings:['Chicken Breast 200g','Brown Rice 150g','Sweet Potato 100g'], cal:680, prot:74 },
  { name:'Breakfast Power 🥣', ings:['Oats 80g','Whey Protein 30g','Banana 1 unit','Whole Eggs 2'], cal:620, prot:51 },
  { name:'Salmon & Rice 🐟', ings:['Salmon 180g','Brown Rice 120g'], cal:634, prot:48 },
];

const FOOD_LOG = {
  Breakfast: [{ name:'Oats',        qty:'80g',       cal:311, prot:14 },
              { name:'Whey Protein', qty:'30g',       cal:120, prot:25 },
              { name:'Banana',       qty:'1 unit',    cal:89,  prot:1  }],
  Lunch:     [{ name:'Muscle Bowl', qty:'1 serving', cal:680, prot:74 }],
  Dinner:    [{ name:'Salmon',      qty:'180g',      cal:374, prot:36 },
              { name:'Brown Rice',  qty:'120g',      cal:259, prot:6  }],
  Snacks:    [{ name:'Greek Yogurt',qty:'150g',      cal:89,  prot:15 }],
};

// ─── CHART DATA (90 days) ──────────────────────
function genSeries(n, base, variance, trend = 0) {
  const labels = [], data = [];
  const ref = new Date(2025, 2, 5);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    labels.push(`${d.toLocaleString('default',{month:'short'})} ${d.getDate()}`);
    data.push(+(base + trend * (n-1-i) + (Math.random() - .5) * variance * 2).toFixed(1));
  }
  return { labels, data };
}
const EX90  = { bench:genSeries(90,1800,180,5.8), squat:genSeries(90,2000,220,7), deadlift:genSeries(90,1700,190,8.2), ohp:genSeries(90,900,110,4) };
const CAL90 = genSeries(90, 2060, 280);
const PRO90 = genSeries(90, 147, 22);
const WT90  = genSeries(90, 84.5, 0.9, -3.3/90);

// Calendar demo data
const WK_DATES = new Set(['2025-03-05','2025-03-03','2025-03-01','2025-02-27','2025-02-25','2025-02-22','2025-02-20','2025-02-18','2025-02-15','2025-02-13','2025-02-11','2025-02-08']);
const CR_DATES = new Set(['2025-03-05','2025-03-04','2025-03-03','2025-03-02','2025-03-01','2025-02-28','2025-02-27','2025-02-26','2025-02-25','2025-02-24','2025-02-23','2025-02-22']);
const DT_DATES = new Set(['2025-03-05','2025-03-04','2025-03-03','2025-03-01','2025-02-28','2025-02-27','2025-02-26','2025-02-25','2025-02-24','2025-02-22','2025-02-21','2025-02-20']);
const WA_DATES = new Set(['2025-03-05','2025-03-04','2025-03-03','2025-03-02','2025-03-01','2025-02-28','2025-02-27','2025-02-26','2025-02-25','2025-02-24','2025-02-23','2025-02-22']);

// ─── STATE ────────────────────────────────────
let curView    = 'home';
let calYear    = 2025, calMonth = 2;
let creatineOn = true;
let waterMl    = 2300, waterGoal = 4000;
let exChart, nutChart, wtChart;
let exFilter = '30D', nutFilter = '30D', wtFilter = '30D';
let chartsBuilt = false;

// ─── NAVIGATION ───────────────────────────────
function goTo(view) {
  if (view === curView) return;
  document.getElementById('view-' + curView).classList.remove('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  curView = view;
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('on');
  if (view === 'progress') setTimeout(buildCharts, 60);
}

function switchTab(section, tab, btn) {
  const pfx = section === 'workout' ? 'wk' : 'diet';
  document.querySelectorAll(`#view-${section} .tab`).forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll(`#view-${section} .sub`).forEach(v => v.classList.remove('on'));
  document.getElementById(`${pfx}-${tab}`).classList.add('on');
}

// ─── CALENDAR ─────────────────────────────────
function calShift(d) {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  buildCal();
}

function buildCal() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-label').textContent = `${MONTHS[calMonth]} ${calYear}`;
  document.getElementById('home-date').textContent  = `${MONTHS[calMonth].slice(0,3)} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-day' }));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el  = document.createElement('div');
    el.className = 'cal-day cur';
    if (d === 5 && calMonth === 2 && calYear === 2025) el.classList.add('today');
    el.appendChild(document.createTextNode(d));

    const colors = [];
    if (WK_DATES.has(ds)) colors.push('var(--accent)');
    if (WA_DATES.has(ds)) colors.push('var(--blue)');
    if (CR_DATES.has(ds)) colors.push('var(--purple)');
    if (DT_DATES.has(ds)) colors.push('var(--orange)');

    if (colors.length) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      colors.slice(0, 4).forEach(c => {
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dot.style.background = c;
        dots.appendChild(dot);
      });
      el.appendChild(dots);
    }
    grid.appendChild(el);
  }
}

// ─── CREATINE ────────────────────────────────
function toggleCreatine() {
  creatineOn = !creatineOn;
  document.getElementById('cr-cb').classList.toggle('on', creatineOn);
  document.getElementById('creatine-card').style.borderColor = creatineOn ? 'var(--purple-bd)' : '';
  toast(creatineOn ? 'Creatine logged! 💊' : 'Creatine unmarked');
  if (SHEETS_URL) syncToSheets('creatine', { date: todayStr(), taken: creatineOn });
}

// ─── WATER ───────────────────────────────────
function addWater(ml) {
  waterMl = Math.min(waterGoal + 1000, waterMl + ml);
  updateWaterUI();
  toast(`+${ml} ml added 💧`);
  if (SHEETS_URL) syncToSheets('water', { date: todayStr(), ml: waterMl });
}

function updateWaterUI() {
  const pct = Math.min(100, (waterMl / waterGoal) * 100);
  const l   = (waterMl / 1000).toFixed(1);
  const gl  = (waterGoal / 1000).toFixed(0);
  document.getElementById('water-fill').style.width = pct + '%';
  document.getElementById('water-val').innerHTML  = `${l}L <span class="water-goal">/ ${gl}L</span>`;
  document.getElementById('water-meta').textContent = `${waterMl.toLocaleString()} / ${waterGoal.toLocaleString()} ml`;
}

function openWaterModal() {
  openModal(`
    <div class="modal-title">💧 Edit Water Intake</div>
    <div class="form-grp">
      <label class="form-lbl">Amount (ml)</label>
      <input id="wi" type="number" class="inp" value="${waterMl}" inputmode="numeric" style="font-size:1.2rem;font-weight:700"/>
    </div>
    <button class="btn btn-accent" onclick="saveWater()">Save</button>
  `);
  setTimeout(() => document.getElementById('wi')?.select(), 100);
}

function saveWater() {
  const v = parseInt(document.getElementById('wi').value) || 0;
  waterMl = Math.max(0, v);
  updateWaterUI();
  closeModal();
  toast('Water updated! 💧');
  if (SHEETS_URL) syncToSheets('water', { date: todayStr(), ml: waterMl });
}

// ─── NUTRITION RINGS ─────────────────────────
function animateRings() {
  const C = 2 * Math.PI * 38;
  setTimeout(() => {
    document.getElementById('cal-ring').style.strokeDasharray = `${(1642/2200)*C} ${C}`;
    document.getElementById('pro-ring').style.strokeDasharray = `${(142/170)*C} ${C}`;
  }, 650);
}

// ─── TEMPLATES ───────────────────────────────
function saveTemplates() {
  localStorage.setItem('ft_templates', JSON.stringify(TEMPLATES));
  localStorage.setItem('ft_tmplseq', tmplSeq);
}

function buildTemplates() {
  // Exercises tab
  const tl = document.getElementById('template-list');
  tl.innerHTML = TEMPLATES.length
    ? TEMPLATES.map(t => `
        <div class="tmpl-item" style="animation:slideIn .2s ease both">
          <div class="tmpl-body">
            <div class="tmpl-name">${t.name}</div>
            <div class="tmpl-meta">${t.exercises.length} exercises · ${t.exercises.slice(0,2).join(', ')}${t.exercises.length>2?'…':''}</div>
          </div>
          <div class="tmpl-actions">
            <button class="edit-pill" onclick="event.stopPropagation();openEditTmpl('${t.id}')">Edit</button>
            <button class="icon-btn del" onclick="event.stopPropagation();deleteTmpl('${t.id}')" aria-label="Delete template">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </div>`).join('')
    : `<p style="font-size:.86rem;color:var(--t3);padding:4px 2px 12px">No templates yet — tap + New to create one.</p>`;

  // Logger quick-start
  const ql = document.getElementById('quick-tmpl-list');
  ql.innerHTML = TEMPLATES.length
    ? TEMPLATES.map(t => `
        <div class="tmpl-item" onclick="loadTmpl('${t.id}')">
          <div class="tmpl-body">
            <div class="tmpl-name">${t.name}</div>
            <div class="tmpl-meta">${t.exercises.length} exercises · ${t.exercises.slice(0,2).join(', ')}${t.exercises.length>2?'…':''}</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`).join('')
    : `<p style="font-size:.86rem;color:var(--t3);padding:4px 2px">Create a template in the Exercises tab.</p>`;
}

function loadTmpl(id) {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  document.getElementById('start-card').style.display  = 'none';
  document.getElementById('logger-body').style.display = 'block';
  document.getElementById('save-session-btn').style.display = '';
  document.getElementById('ex-list').innerHTML = t.exercises.map(name =>
    buildExCard(name, [{ w:'', r:'' }, { w:'', r:'' }])
  ).join('');
  toast(`${t.name} loaded! 💪`);
}

function startEmpty() {
  document.getElementById('start-card').style.display  = 'none';
  document.getElementById('logger-body').style.display = 'block';
  document.getElementById('ex-list').innerHTML = '';
  document.getElementById('save-session-btn').style.display = 'none';
}

function deleteTmpl(id) {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  openConfirm(`Delete "${t.name}"?`, 'This template will be permanently removed.', () => {
    TEMPLATES = TEMPLATES.filter(x => x.id !== id);
    saveTemplates();
    buildTemplates();
    toast('Template deleted');
  });
}

// Template editor
function openCreateTmpl() { openEditTmpl(null); }

function openEditTmpl(id) {
  const isNew = !id;
  const tmpl  = isNew ? { id:null, name:'', exercises:[] } : TEMPLATES.find(t => t.id === id);
  if (!tmpl) return;
  let eds = [...tmpl.exercises];

  function renderList() {
    const ul = document.getElementById('tmpl-ed-list');
    if (!ul) return;
    ul.innerHTML = eds.length
      ? eds.map((ex, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border-radius:var(--r12);padding:12px 14px;margin-bottom:7px;animation:slideIn .14s ease both">
            <span style="font-size:.95rem;font-weight:600">${ex}</span>
            <button onclick="window._rmEx(${i})" style="background:none;border:none;color:var(--t3);cursor:pointer;padding:5px;display:flex;border-radius:var(--r8);transition:color var(--t-fast)"
              onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--t3)'" aria-label="Remove ${ex}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`).join('')
      : `<p style="font-size:.84rem;color:var(--t3);padding:8px 2px">No exercises added yet.</p>`;
  }

  window._rmEx = i => { eds.splice(i, 1); renderList(); };
  window._addEx = name => {
    name = name.trim();
    if (!name) return;
    if (eds.includes(name)) { toast('Already in template'); return; }
    eds.push(name); renderList();
  };
  window._saveTmpl = () => {
    const nameEl = document.getElementById('tmpl-name-inp');
    const name   = nameEl.value.trim();
    if (!name) { nameEl.focus(); toast('Enter a template name'); return; }
    if (!eds.length) { toast('Add at least one exercise'); return; }
    if (isNew) {
      TEMPLATES.push({ id: 't' + (tmplSeq++), name, exercises: [...eds] });
    } else {
      tmpl.name = name; tmpl.exercises = [...eds];
    }
    saveTemplates(); buildTemplates(); closeModal();
    toast(isNew ? 'Template created! ✅' : 'Saved! ✅');
  };
  window._searchTmplEx = val => {
    const b = document.getElementById('tmpl-sugg');
    if (!val.trim()) { b.classList.remove('open'); return; }
    const m = EXERCISE_LIB.filter(e => e.name.toLowerCase().includes(val.toLowerCase())).slice(0, 6);
    if (!m.length) { b.classList.remove('open'); return; }
    b.innerHTML = m.map(e => `
      <div class="sugg-item" onclick="window._addEx('${e.name.replace(/'/g,'&apos;')}');document.getElementById('tmpl-ex-inp').value='';document.getElementById('tmpl-sugg').classList.remove('open');renderList()">
        <span class="sugg-name">${e.name}</span><span class="sugg-cat">${e.cat}</span>
      </div>`).join('');
    b.classList.add('open');
  };
  window.renderList = renderList;

  openModal(`
    <div class="modal-title">${isNew ? '✨ New Template' : '✏️ Edit Template'}</div>
    <div class="form-grp">
      <label class="form-lbl">Template Name</label>
      <input id="tmpl-name-inp" type="text" class="inp" value="${tmpl.name}" placeholder="e.g. Push Day, Upper Body…" autocapitalize="words"/>
    </div>

    <div class="form-grp">
      <label class="form-lbl">Current Exercises</label>
      <div id="tmpl-ed-list" style="margin-bottom:4px"></div>
    </div>

    <div class="form-grp">
      <label class="form-lbl">Add Exercise</label>
      <div style="position:relative;margin-bottom:12px">
        <div style="display:flex;gap:8px">
          <input id="tmpl-ex-inp" type="text" class="inp" placeholder="Search or type…" style="flex:1"
            oninput="window._searchTmplEx(this.value)" autocapitalize="words" autocomplete="off"
            onkeydown="if(event.key==='Enter'){window._addEx(this.value);this.value='';document.getElementById('tmpl-sugg').classList.remove('open')}"/>
          <button onclick="const i=document.getElementById('tmpl-ex-inp');window._addEx(i.value);i.value='';document.getElementById('tmpl-sugg').classList.remove('open')"
            class="btn btn-accent btn-sm">Add</button>
        </div>
        <div class="sugg-box" id="tmpl-sugg"></div>
      </div>
      <label class="form-lbl" style="margin-bottom:9px">Tap to add from library</label>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${EXERCISE_LIB.map(e => `
          <button onclick="window._addEx('${e.name.replace(/'/g,'&apos;')}');window.renderList()"
            style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--pill);padding:7px 13px;color:var(--t2);font-family:var(--ff);font-size:.8rem;font-weight:600;cursor:pointer;transition:all var(--t-fast)"
            onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
            onmouseout="this.style.borderColor='';this.style.color='var(--t2)'">${e.name}</button>`).join('')}
      </div>
    </div>

    <div style="display:flex;gap:9px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal()" style="flex:1">Cancel</button>
      <button class="btn btn-accent" onclick="window._saveTmpl()" style="flex:2">${isNew ? 'Create' : 'Save Changes'}</button>
    </div>
  `);
  setTimeout(renderList, 12);
}

// ─── EXERCISE LOG CARDS ───────────────────────
function buildExCard(name, sets) {
  const vol = sets.reduce((s, { w, r }) => s + (parseFloat(w)||0) * (parseFloat(r)||0), 0);
  const rows = sets.map((s, i) => `
    <div class="set-row">
      <div class="set-badge">S${i+1}</div>
      <input class="set-inp" type="number" value="${s.w}" placeholder="kg" inputmode="decimal"/>
      <input class="set-inp" type="number" value="${s.r}" placeholder="reps" inputmode="numeric"/>
      <button class="del-set-btn" aria-label="Remove set">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');

  return `
    <div class="ex-card">
      <div class="ex-head">
        <div>
          <div class="ex-title">${name}</div>
          ${vol > 0 ? `<div class="ex-vol-lbl">Volume: ${Math.round(vol)} kg</div>` : ''}
        </div>
        <button class="del-ex-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          Remove
        </button>
      </div>
      <div class="sets-hdr">
        <div class="set-col-lbl">Set</div><div class="set-col-lbl">kg</div><div class="set-col-lbl">Reps</div><div></div>
      </div>
      <div class="sets-body">${rows}</div>
      <button class="add-set-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Set
      </button>
    </div>`;
}

function showExSugg(q) {
  const b = document.getElementById('ex-sugg');
  if (!q.trim()) { b.classList.remove('open'); return; }
  const m = EXERCISE_LIB.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  if (!m.length) { b.classList.remove('open'); return; }
  b.innerHTML = m.map(e => `
    <div class="sugg-item" onclick="pickExSugg('${e.name.replace(/'/g,"&apos;")}')">
      <span class="sugg-name">${e.name}</span><span class="sugg-cat">${e.cat}</span>
    </div>`).join('');
  b.classList.add('open');
}

function pickExSugg(name) {
  document.getElementById('ex-search').value = name;
  document.getElementById('ex-sugg').classList.remove('open');
  addExFromSearch();
}

function addExFromSearch() {
  const inp  = document.getElementById('ex-search');
  const name = inp.value.trim();
  if (!name) return;
  document.getElementById('ex-list').insertAdjacentHTML('beforeend', buildExCard(name, [{ w:'',r:'' },{ w:'',r:'' }]));
  inp.value = '';
  document.getElementById('ex-sugg').classList.remove('open');
  document.getElementById('save-session-btn').style.display = '';
  toast(`${name} added!`);
}

function addNewExercise() {
  const inp  = document.getElementById('new-ex-inp');
  const name = inp.value.trim();
  if (!name) return;
  if (EXERCISE_LIB.find(e => e.name.toLowerCase() === name.toLowerCase())) {
    toast('Exercise already in library'); return;
  }
  EXERCISE_LIB.push({ name, cat: 'Custom' });
  localStorage.setItem('ft_lib', JSON.stringify(EXERCISE_LIB));
  buildLib(); inp.value = '';
  toast(`${name} added to library!`);
}

function saveSession() {
  toast('Session saved! 🔥');
  if (SHEETS_URL) {
    // Collect sets from DOM and sync
    const exCards = document.querySelectorAll('#ex-list .ex-card');
    const exercises = [];
    exCards.forEach(card => {
      const name = card.querySelector('.ex-title')?.textContent || '';
      const sets = [];
      card.querySelectorAll('.set-row').forEach(row => {
        const inputs = row.querySelectorAll('.set-inp');
        sets.push({ weight: inputs[0]?.value || '', reps: inputs[1]?.value || '' });
      });
      exercises.push({ name, sets });
    });
    syncToSheets('workout', { date: todayStr(), exercises });
  }
}

// Date helpers
function todayStr() { return new Date().toISOString().slice(0,10); }
function updateLogDate() {
  const v = document.getElementById('log-date')?.value;
  document.getElementById('log-date-lbl').textContent = v
    ? new Date(v + 'T00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
    : 'Today';
}
function setTodayDate() {
  const el = document.getElementById('log-date');
  if (el) { el.value = todayStr(); updateLogDate(); }
}

// ─── EXERCISE LIBRARY ────────────────────────
function buildLib() {
  document.getElementById('lib-count').textContent = `${EXERCISE_LIB.length} exercises`;
  document.getElementById('lib-list').innerHTML = EXERCISE_LIB.map((e, i) => `
    <div class="lib-item" style="animation-delay:${i * .025}s">
      <div>
        <div class="lib-name">${e.name}</div>
        <div class="lib-cat">${e.cat}</div>
      </div>
      <div style="display:flex;gap:7px;align-items:center">
        <button class="use-btn" onclick="toast('${e.name.replace(/'/g,"\\'")} ready to log!')">Use</button>
        <button class="icon-btn del" aria-label="Delete ${e.name}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function filterLib(q) {
  document.querySelectorAll('#lib-list .lib-item').forEach((el, i) => {
    el.style.display = EXERCISE_LIB[i]?.name.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

// ─── HISTORY ────────────────────────────────
function buildHistory() {
  document.getElementById('hist-list').innerHTML = HISTORY_DATA.map((s, i) => {
    const detId  = `hd-${i}`;
    const detail = s.detail.map(ex => `
      <div style="margin-bottom:12px">
        <div class="hist-ex-name">${ex.n}</div>
        ${ex.sets.map((st, si) => `<div class="hist-set"><span>S${si+1}</span><span>${st.w}</span><span>${st.r} reps</span></div>`).join('')}
      </div>`).join('');
    return `
      <div class="hist-item" style="animation-delay:${i*.04}s">
        <div class="hist-top" onclick="toggleHD('${detId}')">
          <div>
            <div class="hist-date">${s.date}</div>
            <div class="hist-meta">📋 ${s.tmpl} · ${s.exs.length} exercises</div>
          </div>
          <div class="hist-pill">${s.exs.length} ex</div>
        </div>
        <div class="hist-tags">${s.exs.map(e => `<span class="htag">${e}</span>`).join('')}</div>
        <div class="hist-detail" id="${detId}">${detail}</div>
      </div>`;
  }).join('');
}

function toggleHD(id) {
  const el = document.getElementById(id);
  const open = el.classList.toggle('open');
  el.style.display = open ? 'block' : 'none';
}

// ─── FOOD DATABASE ───────────────────────────
function buildFoodDB() {
  document.getElementById('food-list').innerHTML = FOODS.map((f, i) => `
    <div class="food-item" style="animation-delay:${i*.03}s">
      <div class="food-body">
        <div class="food-name">${f.name}</div>
        <div class="food-macros"><span class="accent">${f.cal} kcal</span> · <span class="blue">${f.prot}g protein</span> per ${f.qty}</div>
      </div>
      <div style="display:flex;gap:5px">
        <button class="icon-btn" aria-label="Edit ${f.name}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn del" aria-label="Delete ${f.name}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function buildRecipes() {
  document.getElementById('recipe-list').innerHTML = RECIPES.map((r, i) => {
    const id = `ri-${i}`;
    return `
      <div class="recipe-item" style="animation-delay:${i*.04}s">
        <div class="recipe-head" onclick="toggleRecipe('${id}')">
          <div>
            <div class="recipe-name">${r.name}</div>
            <div class="recipe-macros">${r.cal} kcal · ${r.prot}g protein</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <svg id="${id}-arr" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2.5" style="transition:transform var(--t-mid)"><polyline points="9 18 15 12 9 6"/></svg>
            <button class="icon-btn del" onclick="event.stopPropagation()" aria-label="Delete recipe">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
        <div class="recipe-body" id="${id}">
          ${r.ings.map(g => `<div class="recipe-ing">${g}</div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function toggleRecipe(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById(id + '-arr');
  const now = el.classList.toggle('open');
  el.style.display = now ? 'block' : 'none';
  if (arr) arr.style.transform = now ? 'rotate(90deg)' : '';
}

function buildFoodLog() {
  document.getElementById('food-log-list').innerHTML = Object.entries(FOOD_LOG).map(([meal, items]) => `
    <div class="meal-grp">
      <div class="meal-hdr">${meal}</div>
      ${items.map((it, i) => `
        <div class="log-entry" style="animation-delay:${i*.03}s">
          <div class="log-entry-body">
            <div class="log-entry-name">${it.name}</div>
            <div class="log-entry-sub">${it.qty}</div>
          </div>
          <div class="log-entry-right" style="margin-right:8px">
            <div class="log-cal">${it.cal} kcal</div>
            <div class="log-prot">${it.prot}g prot</div>
          </div>
          <button class="icon-btn del" aria-label="Remove ${it.name}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>`).join('')}
    </div>`).join('');
}

// ─── CHARTS ──────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(20,20,22,.97)',
      titleColor: '#f0f0f4', bodyColor: '#a0a0ae',
      borderColor: 'rgba(255,255,255,.12)', borderWidth: 1,
      cornerRadius: 12, padding: 13,
      titleFont: { family: 'Syne', weight: '700', size: 12 },
      bodyFont:  { family: 'DM Sans', size: 11.5 },
    }
  },
  scales: {
    x: {
      ticks:  { color: '#5c5c6a', font:{ size:10.5, family:'DM Sans' }, maxRotation:0, maxTicksLimit:7 },
      grid:   { color: 'rgba(255,255,255,.04)' },
      border: { color: 'transparent' }
    },
    y: {
      ticks:  { color: '#5c5c6a', font:{ size:10.5, family:'DM Sans' } },
      grid:   { color: 'rgba(255,255,255,.04)' },
      border: { color: 'transparent' }
    }
  },
  animation: { duration: 500, easing: 'easeInOutQuart' }
};

function sliceData(full, f) {
  const n = f === '7D' ? 7 : f === '30D' ? 30 : 90;
  return { labels: full.labels.slice(-n), data: full.data.slice(-n) };
}

function buildCharts() {
  if (chartsBuilt) return;
  chartsBuilt = true;
  renderExChart(); renderNutChart(); renderWtChart();
}

function renderExChart() {
  const key = document.getElementById('ex-select').value;
  const { labels, data } = sliceData(EX90[key], exFilter);
  const ctx = document.getElementById('ex-chart');
  if (exChart) exChart.destroy();
  exChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label:'Volume', data,
      borderColor:'#c8fb4b', backgroundColor:'rgba(200,251,75,.07)',
      pointBackgroundColor:'#c8fb4b', pointRadius:3, pointHoverRadius:6,
      tension:.4, fill:true, borderWidth:2 }] },
    options: CHART_DEFAULTS
  });
}

function renderNutChart() {
  const cd = sliceData(CAL90, nutFilter);
  const pd = sliceData(PRO90, nutFilter);
  const ctx = document.getElementById('nut-chart');
  if (nutChart) nutChart.destroy();
  nutChart = new Chart(ctx, {
    type: 'line',
    data: { labels: cd.labels, datasets: [
      { label:'Calories', data:cd.data, borderColor:'#c8fb4b', backgroundColor:'rgba(200,251,75,.06)',
        pointBackgroundColor:'#c8fb4b', pointRadius:2, pointHoverRadius:5, tension:.4, fill:true, borderWidth:2, yAxisID:'y' },
      { label:'Cal Goal', data:cd.labels.map(()=>2200), borderColor:'rgba(200,251,75,.45)',
        backgroundColor:'transparent', borderDash:[7,5], pointRadius:0, borderWidth:1.5, tension:0, yAxisID:'y' },
      { label:'Protein',  data:pd.data, borderColor:'#5bb0ff', backgroundColor:'rgba(91,176,255,.06)',
        pointBackgroundColor:'#5bb0ff', pointRadius:2, pointHoverRadius:5, tension:.4, fill:true, borderWidth:2, yAxisID:'y1' },
      { label:'Pro Goal', data:pd.labels.map(()=>170), borderColor:'rgba(91,176,255,.45)',
        backgroundColor:'transparent', borderDash:[7,5], pointRadius:0, borderWidth:1.5, tension:0, yAxisID:'y1' }
    ]},
    options: { ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins,
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, filter: i => i.datasetIndex===0||i.datasetIndex===2 }
      },
      scales: { x:{ ...CHART_DEFAULTS.scales.x },
        y:  { ...CHART_DEFAULTS.scales.y, position:'left' },
        y1: { ...CHART_DEFAULTS.scales.y, position:'right', grid:{ display:false } }
      }
    }
  });
}

function renderWtChart() {
  const { labels, data } = sliceData(WT90, wtFilter);
  const ctx = document.getElementById('wt-chart');
  if (wtChart) wtChart.destroy();
  wtChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label:'Weight kg', data,
      borderColor:'#9d8dff', backgroundColor:'rgba(157,141,255,.07)',
      pointBackgroundColor:'#9d8dff', pointRadius:3, pointHoverRadius:6,
      tension:.4, fill:true, borderWidth:2 }] },
    options: CHART_DEFAULTS
  });
}

function setFilter(ch, f, btn) {
  document.querySelectorAll(`#${ch}-filters .fil-btn`).forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  if (ch === 'ex')  { exFilter  = f; renderExChart();  }
  if (ch === 'nut') { nutFilter = f; renderNutChart(); }
  if (ch === 'wt')  { wtFilter  = f; renderWtChart();  }
}

// ─── GOALS MODAL ─────────────────────────────
function openGoalsModal() {
  openModal(`
    <div class="modal-title">⚙️ Goals & Profile</div>
    <p style="font-size:.73rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Body Metrics</p>
    <div class="form-2col">
      <div class="form-grp"><label class="form-lbl">Height (cm)</label><input type="number" class="inp" value="178" inputmode="numeric"/></div>
      <div class="form-grp"><label class="form-lbl">Weight (kg)</label><input type="number" class="inp" value="81.2" step="0.1" inputmode="decimal"/></div>
    </div>
    <p style="font-size:.73rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin:4px 0 12px">Daily Goals</p>
    <div class="form-grp"><label class="form-lbl">🔥 Calorie Goal (kcal)</label><input type="number" class="inp" value="2200" inputmode="numeric"/></div>
    <div class="form-2col">
      <div class="form-grp"><label class="form-lbl">💪 Protein (g)</label><input type="number" class="inp" value="170" inputmode="numeric"/></div>
      <div class="form-grp"><label class="form-lbl">💧 Water (ml)</label><input type="number" class="inp" value="4000" inputmode="numeric"/></div>
    </div>
    <button class="btn btn-accent" style="margin-top:8px" onclick="closeModal();toast('Goals saved! ✅')">Save Goals</button>
  `);
}

// ─── MODAL / CONFIRM / TOAST ─────────────────
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }

let _confCb = null;
function openConfirm(title, msg, cb) {
  _confCb = cb;
  document.getElementById('conf-title').textContent = title;
  document.getElementById('conf-msg').textContent   = msg;
  document.getElementById('conf-btn').onclick = () => { closeConfirm(); if (_confCb) _confCb(); };
  document.getElementById('confirm-overlay').classList.add('show');
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('show'); }

let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
}

// ─── GOOGLE SHEETS SYNC ──────────────────────
async function syncToSheets(action, payload) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
  } catch (e) {
    console.warn('Sheets sync failed:', e);
  }
}

async function loadFromSheets() {
  if (!SHEETS_URL) return;
  try {
    const res  = await fetch(SHEETS_URL + '?action=getAll');
    const data = await res.json();
    if (data.templates) { TEMPLATES = data.templates; buildTemplates(); }
    if (data.exercises) { EXERCISE_LIB = data.exercises; buildLib(); }
    // Add more data loading as needed
    toast('Synced with Google Sheets ✅');
  } catch (e) {
    console.warn('Sheets load failed:', e);
  }
}

// ─── INIT ────────────────────────────────────
buildCal();
animateRings();
buildTemplates();
buildLib();
buildHistory();
buildFoodDB();
buildRecipes();
buildFoodLog();

// Attempt to load cloud data on startup (if URL is configured)
if (SHEETS_URL) loadFromSheets();
