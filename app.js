const DEFAULT_PODS = [
  { id: 'pod-1', name: 'North 1', color: '#0072B2' },
  { id: 'pod-2', name: 'North 2', color: '#00B050' },
  { id: 'pod-3', name: 'North 3', color: '#00B0F0' },
  { id: 'pod-4', name: 'Coromandel', color: '#FF3300' },
  { id: 'pod-5', name: 'Bay of Plenty', color: '#FFC000' },
  { id: 'pod-6', name: 'East Coast', color: '#CC00CC' },
  { id: 'pod-7', name: 'Upper Ctrl', color: '#92D050' },
  { id: 'pod-8', name: 'Lower Ctrl', color: '#F4B183' },
  { id: 'pod-9', name: 'Canterbury', color: '#00A65A' },
  { id: 'pod-10', name: 'South excl Chch', color: '#7030A0' }
];

const UNASSIGNED_POD = { id: 'unassigned', name: 'Unassigned', color: '#6B7280' };
const MAX_PODS = 10;
const FILTER_FIELDS = [
  ['clubSize', 'Club size'],
  ['totalPatrolHoursCategory', 'Patrol hours'],
  ['locationType', 'Location type'],
  ['clubMaturity', 'Club maturity'],
  ['operationalEffectiveness', 'Operational effectiveness'],
  ['sarCapability', 'SAR capability'],
  ['lsSport', 'LS sport']
];

let clubs = [];
let pods = structuredClone(DEFAULT_PODS);
let markers = new Map();
let map;
let reportMap = null;
let reportMapMarkers = [];
let draggedClubId = null;
let selectedClubId = null;
let podNotes = {};
let scenarios = [];
let activeScenarioId = 'current';
let layoutSettings = { leftPercent: 50, topPercent: 42 };
let scenarioMeta = { name: 'Current Allocation', description: 'Baseline working scenario', createdBy: '', created: new Date().toISOString(), updated: new Date().toISOString() };

function currentScenarioSnapshot() {
  return {
    id: activeScenarioId,
    meta: { ...scenarioMeta, updated: new Date().toISOString() },
    clubs: structuredClone(clubs),
    pods: structuredClone(pods).filter(p => p.id !== 'unassigned').slice(0, MAX_PODS),
    podNotes: structuredClone(podNotes || {})
  };
}
function applyScenario(scenario) {
  if (!scenario) return;
  activeScenarioId = scenario.id;
  scenarioMeta = { ...scenario.meta };
  clubs = structuredClone(scenario.clubs || clubs);
  pods = structuredClone(scenario.pods || pods).filter(p => p.id !== 'unassigned').slice(0, MAX_PODS);
  podNotes = structuredClone(scenario.podNotes || {});
  selectedClubId = clubs[0]?.id || selectedClubId;
}
function updateActiveScenario() {
  const snap = currentScenarioSnapshot();
  const index = scenarios.findIndex(s => s.id === activeScenarioId);
  if (index >= 0) scenarios[index] = snap;
  else scenarios.unshift(snap);
}
const save = () => {
  if (clubs.length) updateActiveScenario();
  localStorage.setItem('slsnzPodBuilder', JSON.stringify({ version: 11, activeScenarioId, scenarios, layoutSettings }));
  if (typeof renderScenarioPanel === 'function') renderScenarioPanel();
};
const loadSaved = () => {
  const saved = localStorage.getItem('slsnzPodBuilder');
  if (!saved) return false;
  try {
    const state = JSON.parse(saved);
    layoutSettings = state.layoutSettings || layoutSettings;
    applyLayoutSettings();
    if (Array.isArray(state.scenarios) && state.scenarios.length) {
      scenarios = state.scenarios;
      applyScenario(scenarios.find(s => s.id === state.activeScenarioId) || scenarios[0]);
      return true;
    }
    clubs = state.clubs;
    pods = (state.pods || pods).filter(p => p.id !== 'unassigned').slice(0, MAX_PODS);
    podNotes = state.podNotes || {};
    scenarios = [currentScenarioSnapshot()];
    return true;
  } catch { return false; }
};

const visiblePods = () => {
  const hasUnassigned = clubs.some(c => !pods.some(p => p.name === c.pod || p.id === c.pod));
  return hasUnassigned ? [...pods, UNASSIGNED_POD] : pods;
};

const podFor = club => pods.find(p => p.name === club.pod || p.id === club.pod) || UNASSIGNED_POD;
const markerIcon = color => L.divIcon({ className: 'clubMarker', html: `<span style="background:${color};"></span>`, iconSize: [16,16], iconAnchor: [8,8] });
const fmt = value => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const pct = value => `${Math.round((Number(value) || 0) * 100)}%`;

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([-41.2, 172.6], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
}

function currentFilters() {
  const filters = {};
  FILTER_FIELDS.forEach(([field]) => {
    const el = document.getElementById(`filter-${field}`);
    if (el && el.value) filters[field] = el.value;
  });
  return filters;
}

function filteredClubs() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filters = currentFilters();
  return clubs.filter(c => {
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || String(c.region || '').toLowerCase().includes(q) || String(c.regionalArea || '').toLowerCase().includes(q);
    const matchesFilters = Object.entries(filters).every(([field, value]) => String(c[field] || '') === value);
    return matchesSearch && matchesFilters;
  });
}

function sortClubList(list) {
  const sort = document.getElementById('sortSelect')?.value || 'name';
  const copy = [...list];
  if (sort === 'primaryMembersDesc') copy.sort((a,b) => (b.primaryMembers || 0) - (a.primaryMembers || 0) || a.name.localeCompare(b.name));
  else if (sort === 'volunteerPatrolHoursDesc') copy.sort((a,b) => (b.volunteerPatrolHours || 0) - (a.volunteerPatrolHours || 0) || a.name.localeCompare(b.name));
  else if (sort === 'plsPatrolHoursDesc') copy.sort((a,b) => (b.plsPatrolHours || 0) - (a.plsPatrolHours || 0) || a.name.localeCompare(b.name));
  else if (sort === 'clubSize') copy.sort((a,b) => String(a.clubSize || '').localeCompare(String(b.clubSize || '')) || a.name.localeCompare(b.name));
  else copy.sort((a,b) => a.name.localeCompare(b.name));
  return copy;
}

function renderMarkers() {
  markers.forEach(m => m.remove());
  markers.clear();
  const visibleIds = new Set(filteredClubs().map(c => c.id));
  clubs.forEach(club => {
    if (!visibleIds.has(club.id)) return;
    const pod = podFor(club);
    const marker = L.marker([club.lat, club.lng], { icon: markerIcon(pod.color) })
      .bindPopup(`<strong>${club.name}</strong><br>Pod: ${pod.name}<br><button onclick="focusClub('${club.id}')">Find on board</button>`)
      .on('click', () => selectClub(club.id, false))
      .addTo(map);
    markers.set(club.id, marker);
  });
}

window.focusClub = id => {
  selectClub(id, true);
  document.querySelector(`[data-club-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
};

function selectClub(id, panMap = true) {
  selectedClubId = id;
  const club = clubs.find(c => c.id === id);
  if (club && panMap && map) {
    map.setView([club.lat, club.lng], Math.max(map.getZoom(), 10));
    markers.get(club.id)?.openPopup();
  }
  renderClubDetails();
  document.querySelectorAll('.clubCard').forEach(card => card.classList.toggle('is-selected', card.dataset.clubId === id));
}

function renderClubDetails() {
  const el = document.getElementById('clubDetails');
  if (!el) return;
  const club = clubs.find(c => c.id === selectedClubId) || clubs[0];
  if (!club) { el.innerHTML = '<p class="emptyState">Select a club on the map or planner to see details.</p>'; return; }
  const pod = podFor(club);
  selectedClubId = club.id;
  el.style.setProperty('--pod', pod.color);
  el.innerHTML = `<h3>${club.name}</h3>
    <div class="podBadge">${pod.name}</div>
    <div class="detailGrid">
      <div class="detailItem"><span>Club size</span><b>${club.clubSize || '—'}</b></div>
      <div class="detailItem"><span>Total patrol hours</span><b>${club.totalPatrolHoursCategory || '—'}</b></div>
      <div class="detailItem"><span>Location type</span><b>${club.locationType || '—'}</b></div>
      <div class="detailItem"><span>Club maturity</span><b>${club.clubMaturity || '—'}</b></div>
      <div class="detailItem"><span>Operational effectiveness</span><b>${club.operationalEffectiveness || '—'}</b></div>
      <div class="detailItem"><span>SAR capability</span><b>${club.sarCapability || '—'}</b></div>
      <div class="detailItem"><span>LS sport</span><b>${club.lsSport || '—'}</b></div>
      <div class="detailItem"><span>Primary memberships</span><b>${fmt(club.primaryMembers)}</b></div>
      <div class="detailItem"><span>Other memberships</span><b>${fmt(club.otherMembers)}</b></div>
      <div class="detailItem"><span>Patrolling volunteers</span><b>${fmt(club.patrollingVolunteers)}</b></div>
      <div class="detailItem"><span>Volunteer hours</span><b>${fmt(club.volunteerPatrolHours)}</b></div>
      <div class="detailItem"><span>PLS hours</span><b>${fmt(club.plsPatrolHours)}</b></div>
      <div class="detailItem"><span>Nationals Entries</span><b>${fmt(club.nationsEntries)}</b></div>
    </div>`;
}

function renderFilterBar() {
  const el = document.getElementById('filterBar');
  if (!el || el.dataset.ready) return;
  el.innerHTML = FILTER_FIELDS.map(([field, label]) => {
    const values = [...new Set(clubs.map(c => c[field]).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b)));
    return `<label>${label}<select id="filter-${field}"><option value="">All</option>${values.map(v => `<option value="${String(v).replaceAll('"','&quot;')}">${v}</option>`).join('')}</select></label>`;
  }).join('') + '<button class="clearFiltersBtn" id="clearFiltersBtn">Clear filters</button>';
  el.dataset.ready = '1';
  FILTER_FIELDS.forEach(([field]) => document.getElementById(`filter-${field}`).addEventListener('change', renderAll));
  document.getElementById('clearFiltersBtn').addEventListener('click', () => { FILTER_FIELDS.forEach(([field]) => document.getElementById(`filter-${field}`).value = ''); renderAll(); });
}

function renderBoard() {
  renderFilterBar();
  const board = document.getElementById('board');
  const boardPods = visiblePods();
  const visibleFilteredClubs = filteredClubs();
  const visibleIds = new Set(visibleFilteredClubs.map(c => c.id));
  board.style.setProperty('--pod-count', boardPods.length);
  document.getElementById('summary')?.style.setProperty('--pod-count', boardPods.length);
  board.innerHTML = '';

  boardPods.forEach(pod => {
    const col = document.createElement('div');
    col.className = 'podColumn';
    col.style.setProperty('--pod', pod.color);
    col.dataset.pod = pod.name;

    const podClubs = sortClubList(clubs.filter(c => podFor(c).name === pod.name && visibleIds.has(c.id)));
    const allPodClubs = clubs.filter(c => podFor(c).name === pod.name);
    const canRemove = pod.id !== 'unassigned' && allPodClubs.length === 0;
    const titleControl = pod.id === 'unassigned'
      ? `<span class="fixedPodName">${pod.name}</span>`
      : `<input value="${pod.name}" data-pod-name="${pod.id}" title="Rename pod">`;
    const removeControl = canRemove ? `<button class="removePodBtn" data-remove-pod="${pod.id}" title="Remove empty pod">×</button>` : '';

    col.innerHTML = `<div class="podTitle">${titleControl}<span class="count">${podClubs.length}</span>${removeControl}</div>`;

    podClubs.forEach(club => {
      const card = document.createElement('div');
      card.className = 'clubCard';
      if (club.id === selectedClubId) card.classList.add('is-selected');
      card.draggable = true;
      card.dataset.clubId = club.id;
      card.style.setProperty('--pod', pod.color);
      card.innerHTML = `${club.name}<small>${club.clubSize || club.locationType || 'Club'}</small>`;
      card.addEventListener('dragstart', () => draggedClubId = club.id);
      card.addEventListener('click', () => selectClub(club.id, true));
      col.appendChild(card);
    });

    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('dropTarget'); });
    col.addEventListener('dragleave', () => col.classList.remove('dropTarget'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('dropTarget');
      const club = clubs.find(c => c.id === draggedClubId);
      if (club) { club.pod = pod.name; selectedClubId = club.id; save(); renderAll(); }
    });

    board.appendChild(col);
  });

  document.querySelectorAll('[data-pod-name]').forEach(input => input.addEventListener('change', e => {
    const pod = pods.find(p => p.id === e.target.dataset.podName);
    const oldName = pod.name;
    pod.name = e.target.value.trim() || oldName;
    clubs.filter(c => c.pod === oldName).forEach(c => c.pod = pod.name);
    save();
    renderAll();
  }));

  document.querySelectorAll('[data-remove-pod]').forEach(button => button.addEventListener('click', e => {
    const pod = pods.find(p => p.id === e.currentTarget.dataset.removePod);
    if (!pod) return;
    const clubCount = clubs.filter(c => podFor(c).id === pod.id).length;
    if (clubCount > 0) { alert('This pod still contains clubs. Move them first, then remove the pod.'); return; }
    if (confirm(`Remove empty pod "${pod.name}"?`)) { pods = pods.filter(p => p.id !== pod.id); save(); renderAll(); }
  }));
}

function sum(list, field) { return list.reduce((t, c) => t + (Number(c[field]) || 0), 0); }
function avg(list, field) { return list.length ? Math.round(sum(list, field) / list.length) : 0; }

function haversineKm(a, b) {
  const R = 6371;
  const toRad = deg => Number(deg) * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function geographyStats(list) {
  const valid = list.filter(c => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)));
  if (valid.length < 2) return { maxKm: 0, avgKm: 0, pair: '', label: 'Compact', level: 'ok' };
  let maxKm = 0, total = 0, count = 0, pair = '';
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const km = haversineKm(valid[i], valid[j]);
      total += km; count++;
      if (km > maxKm) { maxKm = km; pair = `${valid[i].name} ↔ ${valid[j].name}`; }
    }
  }
  const avgKm = count ? total / count : 0;
  const label = maxKm >= 450 ? 'Very wide' : maxKm >= 250 ? 'Wide' : maxKm >= 120 ? 'Moderate' : 'Compact';
  const level = maxKm >= 450 ? 'bad' : maxKm >= 250 ? 'warn' : 'ok';
  return { maxKm: Math.round(maxKm), avgKm: Math.round(avgKm), pair, label, level };
}

function allPodTotals() {
  return visiblePods().map(pod => podTotals(pod));
}

function metricLevel(value, values) {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return 'ok';
  const avgValue = nums.reduce((a,b)=>a+b,0) / nums.length;
  if (!avgValue) return 'ok';
  const ratio = value / avgValue;
  if (ratio >= 1.35) return 'bad';
  if (ratio >= 1.15) return 'warn';
  return 'ok';
}

function levelLabel(level) { return level === 'bad' ? 'High' : level === 'warn' ? 'Elevated' : 'Balanced'; }
function levelDot(level) { return `<span class="trafficDot ${level}"></span>`; }
function noteForPod(pod) { return podNotes[pod.id] || podNotes[pod.name] || ''; }

function podObservations(total, totals) {
  const metrics = [
    ['primaryMembers', 'largest primary membership'],
    ['patrollingVolunteers', 'highest patrol volunteer count'],
    ['volunteerPatrolHours', 'highest volunteer patrol workload'],
    ['plsPatrolHours', 'highest PLS commitment'],
    ['nationsEntries', 'highest Nationals entries'],
    ['clubs', 'highest club count']
  ];
  const obs = [];
  metrics.forEach(([field, text]) => {
    const max = Math.max(...totals.map(t => Number(t[field]) || 0));
    if (max > 0 && (Number(total[field]) || 0) === max) obs.push(`Contains the ${text}.`);
  });
  if (total.geo.level === 'bad') obs.push(`Very wide geographic footprint: ${total.geo.maxKm} km between furthest clubs.`);
  else if (total.geo.level === 'warn') obs.push(`Wide geographic footprint: ${total.geo.maxKm} km between furthest clubs.`);
  if (!obs.length) obs.push('No major outliers based on the current metrics.');
  return obs.slice(0, 3);
}

function balanceScore(total, totals) {
  const fields = ['clubs','primaryMembers','patrollingVolunteers','volunteerPatrolHours','plsPatrolHours','nationsEntries'];
  const penalties = fields.map(field => {
    const vals = totals.map(t => Number(t[field]) || 0);
    const avgValue = vals.reduce((a,b)=>a+b,0) / Math.max(vals.length, 1);
    if (!avgValue) return 0;
    return Math.min(Math.abs((Number(total[field]) || 0) - avgValue) / avgValue, 1);
  });
  penalties.push(total.geo.level === 'bad' ? .55 : total.geo.level === 'warn' ? .25 : 0);
  const avgPenalty = penalties.reduce((a,b)=>a+b,0) / penalties.length;
  return Math.max(0, Math.round((1 - avgPenalty) * 100));
}

function balanceLabel(score) {
  if (score >= 84) return 'Balanced';
  if (score >= 70) return 'Moderately balanced';
  return 'Needs review';
}


function renderSummary() {
  const el = document.getElementById('summary');
  el.innerHTML = '';
  el.style.setProperty('--pod-count', visiblePods().length);
  const totals = allPodTotals();
  const metricValues = Object.fromEntries(['clubs','primaryMembers','patrollingVolunteers','volunteerPatrolHours','plsPatrolHours','nationsEntries'].map(f => [f, totals.map(t => Number(t[f]) || 0)]));

  totals.forEach(total => {
    const pod = total.pod;
    const score = balanceScore(total, totals);
    const obs = podObservations(total, totals);
    const card = document.createElement('div');
    card.className = 'summaryCard summaryCardV2';
    card.style.setProperty('--pod', pod.color);
    card.innerHTML = `<div class="summaryTop">
        <div><strong>${pod.name}</strong><span>${total.clubs} clubs</span></div>
        <div class="scoreBadgeWrap" title="Balance Score compares this pod against the average across all pods using club count, primary members, patrol volunteers, volunteer hours, PLS hours, Nationals entries and geographic spread.">
          <span>Balance Score</span>
          <div class="scoreBadge ${score < 70 ? 'bad' : score < 84 ? 'warn' : 'ok'}">${score}%</div>
          <small>${balanceLabel(score)}</small>
        </div>
      </div>
      <div class="summaryGrid summaryGridV2">
        <span>Primary Members <b>${fmt(total.primaryMembers)}</b></span>
        <span>Other Members <b>${fmt(total.otherMembers)}</b></span>
        <span>Patrol Volunteers <b>${fmt(total.patrollingVolunteers)}</b></span>
        <span>Volunteer Hours <b>${fmt(total.volunteerPatrolHours)}</b></span>
        <span>PLS Hours <b>${fmt(total.plsPatrolHours)}</b></span>
        <span>Nationals Entries <b>${fmt(total.nationsEntries)}</b></span>
      </div>
      <div class="balanceRows">
        <div>${levelDot(metricLevel(total.primaryMembers, metricValues.primaryMembers))} Primary Members <b>${levelLabel(metricLevel(total.primaryMembers, metricValues.primaryMembers))}</b></div>
        <div>${levelDot(metricLevel(total.volunteerPatrolHours, metricValues.volunteerPatrolHours))} Volunteer Hours <b>${levelLabel(metricLevel(total.volunteerPatrolHours, metricValues.volunteerPatrolHours))}</b></div>
        <div>${levelDot(total.geo.level)} Geographic Spread <b>${total.geo.label}</b></div>
      </div>
      <div class="geoInsight">Furthest clubs: <b>${total.geo.maxKm ? `${fmt(total.geo.maxKm)} km` : '—'}</b>${total.geo.pair ? `<small>${escapeHtml(total.geo.pair)}</small>` : ''}</div>
      <div class="summaryActions">
        <details class="insightBox"><summary>Insights</summary><ul><li><b>Balance Score:</b> ${balanceLabel(score)}. This compares the pod against all other pods using club count, Primary Members, Patrol Volunteers, Volunteer Hours, PLS Hours, Nationals Entries and geographic spread. It is not a club health or capability score.</li>${obs.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul></details>
        <button class="noteBtn" data-note-pod="${pod.id}" type="button">${noteForPod(pod) ? 'Edit notes' : 'Add notes'}</button>
      </div>
      ${noteForPod(pod) ? `<div class="podNotePreview"><b>Notes</b><span>${escapeHtml(noteForPod(pod)).replace(/\n/g, '<br>')}</span></div>` : ''}`;
    el.appendChild(card);
  });
  document.querySelectorAll('[data-note-pod]').forEach(button => button.addEventListener('click', () => openPodNoteEditor(button.dataset.notePod)));
}

function openPodNoteEditor(podId) {
  const pod = pods.find(p => p.id === podId) || visiblePods().find(p => p.id === podId);
  if (!pod) return;
  let modal = document.getElementById('noteModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'noteModal';
    modal.className = 'noteModal';
    modal.innerHTML = `<div class="noteModalCard">
      <div class="noteModalHeader"><h3 id="noteModalTitle">Pod notes</h3><button id="closeNoteModal" type="button">×</button></div>
      <p>These notes are saved in the scenario file and included in the PDF export.</p>
      <textarea id="podNoteText" rows="8" placeholder="Add context, assumptions, risks, discussion points or decisions for this pod..."></textarea>
      <div class="noteModalActions"><button id="clearPodNote" type="button">Clear note</button><button id="savePodNote" type="button">Save note</button></div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('closeNoteModal').addEventListener('click', closePodNoteEditor);
    modal.addEventListener('click', e => { if (e.target === modal) closePodNoteEditor(); });
  }
  modal.dataset.podId = pod.id;
  document.getElementById('noteModalTitle').textContent = `${pod.name} notes`;
  document.getElementById('podNoteText').value = noteForPod(pod);
  document.getElementById('savePodNote').onclick = () => {
    const text = document.getElementById('podNoteText').value.trim();
    if (text) podNotes[pod.id] = text;
    else delete podNotes[pod.id];
    save();
    closePodNoteEditor();
    renderSummary();
  };
  document.getElementById('clearPodNote').onclick = () => {
    delete podNotes[pod.id];
    save();
    closePodNoteEditor();
    renderSummary();
  };
  modal.classList.add('is-open');
  document.getElementById('podNoteText').focus();
}

function closePodNoteEditor() {
  document.getElementById('noteModal')?.classList.remove('is-open');
}


function scenarioLabel(scenario = { meta: scenarioMeta }) {
  return scenario?.meta?.name || 'Untitled Scenario';
}
function renderScenarioPanel() {
  const el = document.getElementById('scenarioPanel');
  if (!el) return;
  const active = scenarios.find(s => s.id === activeScenarioId) || currentScenarioSnapshot();
  const updated = active.meta?.updated ? new Date(active.meta.updated).toLocaleString('en-NZ', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
  el.innerHTML = `<div class="scenarioInfo"><label>Scenario<select id="scenarioSelect">${scenarios.map(s => `<option value="${s.id}" ${s.id === activeScenarioId ? 'selected' : ''}>${escapeHtml(scenarioLabel(s))}</option>`).join('')}</select></label><div class="scenarioText"><b>${escapeHtml(scenarioLabel(active))}</b><span>${escapeHtml(active.meta?.description || 'No description added yet.')}</span><small>Last updated ${updated}</small></div></div><div class="scenarioActions"><button id="newScenarioBtn" class="secondaryBtn">New</button><button id="duplicateScenarioBtn" class="secondaryBtn">Duplicate</button><button id="renameScenarioBtn" class="secondaryBtn">Edit info</button><button id="deleteScenarioBtn" class="secondaryBtn">Delete</button></div>`;
  document.getElementById('scenarioSelect').addEventListener('change', e => { updateActiveScenario(); const target = scenarios.find(s => s.id === e.target.value); applyScenario(target); save(); renderAll(); alert(`Scenario loaded: ${scenarioLabel(target)}`); });
  document.getElementById('newScenarioBtn').addEventListener('click', createNewScenario);
  document.getElementById('duplicateScenarioBtn').addEventListener('click', duplicateScenario);
  document.getElementById('renameScenarioBtn').addEventListener('click', editScenarioInfo);
  document.getElementById('deleteScenarioBtn').addEventListener('click', deleteScenario);
}
function promptScenarioInfo(defaultName, defaultDescription = '') {
  const name = prompt('Scenario name', defaultName || 'New Scenario');
  if (name === null) return null;
  const description = prompt('Scenario description', defaultDescription || '') ?? '';
  return { name: name.trim() || 'Untitled Scenario', description: description.trim() };
}
function createNewScenario() { const info = promptScenarioInfo(`Scenario ${scenarios.length + 1}`, ''); if (!info) return; updateActiveScenario(); const now = new Date().toISOString(); const scenario = { id: `scenario-${Date.now()}`, meta: { ...info, created: now, updated: now }, clubs: structuredClone(clubs), pods: structuredClone(pods), podNotes: {} }; scenarios.unshift(scenario); applyScenario(scenario); save(); renderAll(); }
function duplicateScenario() { const info = promptScenarioInfo(`${scenarioMeta.name || 'Scenario'} copy`, scenarioMeta.description || ''); if (!info) return; updateActiveScenario(); const scenario = currentScenarioSnapshot(); scenario.id = `scenario-${Date.now()}`; scenario.meta = { ...scenario.meta, ...info, created: new Date().toISOString(), updated: new Date().toISOString() }; scenarios.unshift(scenario); applyScenario(scenario); save(); renderAll(); }
function editScenarioInfo() { const info = promptScenarioInfo(scenarioMeta.name, scenarioMeta.description || ''); if (!info) return; scenarioMeta = { ...scenarioMeta, ...info, updated: new Date().toISOString() }; save(); renderAll(); }
function deleteScenario() { if (scenarios.length <= 1) { alert('At least one scenario is required.'); return; } if (!confirm(`Delete scenario "${scenarioMeta.name}"?`)) return; scenarios = scenarios.filter(s => s.id !== activeScenarioId); applyScenario(scenarios[0]); save(); renderAll(); }
async function downloadJson(payload, suggestedName) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); if (window.showSaveFilePicker) { try { const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] }); const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); return; } catch (err) { if (err?.name === 'AbortError') return; } } const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = suggestedName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function safeFileName(name) { return String(name || 'scenario').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scenario'; }
async function exportCurrentScenario() { updateActiveScenario(); const scenario = scenarios.find(s => s.id === activeScenarioId) || currentScenarioSnapshot(); await downloadJson({ fileType: 'slsnz-pod-scenario', version: 11, scenario }, `${safeFileName(scenarioLabel(scenario))}.json`); }
async function exportWorkspace() { updateActiveScenario(); await downloadJson({ fileType: 'slsnz-pod-workspace', version: 11, activeScenarioId, scenarios, layoutSettings }, `club-support-model-pod-designer-workspace.json`); }
async function importScenarioFile(file) { const state = JSON.parse(await file.text()); if (state.fileType === 'slsnz-pod-workspace' || Array.isArray(state.scenarios)) { const count = (state.scenarios || []).length; if (!confirm(`Import workspace with ${count} scenario${count === 1 ? '' : 's'}? This will replace the scenarios and settings currently saved in this browser.`)) return; scenarios = state.scenarios || []; layoutSettings = state.layoutSettings || layoutSettings; applyLayoutSettings(); applyScenario(scenarios.find(s => s.id === state.activeScenarioId) || scenarios[0]); save(); renderAll(); alert(`Workspace loaded: ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}.`); return; } const scenario = state.fileType === 'slsnz-pod-scenario' ? state.scenario : { id: `scenario-${Date.now()}`, meta: { name: file.name.replace(/\.json$/i,''), description: '', created: new Date().toISOString(), updated: new Date().toISOString() }, clubs: state.clubs || state, pods: state.pods || pods, podNotes: state.podNotes || {} }; if (!confirm(`Import scenario "${scenarioLabel(scenario)}"? It will be added to your scenario list and loaded now.`)) return; scenario.id = `scenario-${Date.now()}`; scenarios.unshift(scenario); applyScenario(scenario); save(); renderAll(); alert(`Scenario loaded: ${scenarioLabel(scenario)}`); }
function applyLayoutSettings() { const main = document.getElementById('appMain'); if (!main) return; main.style.setProperty('--left-w', `${layoutSettings.leftPercent || 50}%`); main.style.setProperty('--top-h', `${layoutSettings.topPercent || 42}%`); }
function initResizableLayout() { applyLayoutSettings(); const main = document.getElementById('appMain'); const v = document.getElementById('verticalSplitter'); const h = document.getElementById('horizontalSplitter'); if (!main || !v || !h) return; v.addEventListener('pointerdown', e => { if (document.body.classList.contains('map-hidden')) return; e.preventDefault(); v.setPointerCapture(e.pointerId); const move = ev => { const rect = main.getBoundingClientRect(); const pct = Math.max(35, Math.min(72, ((ev.clientX - rect.left) / rect.width) * 100)); layoutSettings.leftPercent = Math.round(pct * 10) / 10; applyLayoutSettings(); refreshMapSize(); }; const up = () => { save(); v.removeEventListener('pointermove', move); v.removeEventListener('pointerup', up); }; v.addEventListener('pointermove', move); v.addEventListener('pointerup', up); }); h.addEventListener('pointerdown', e => { e.preventDefault(); h.setPointerCapture(e.pointerId); const move = ev => { const rect = main.getBoundingClientRect(); const pct = Math.max(28, Math.min(68, ((ev.clientY - rect.top) / rect.height) * 100)); layoutSettings.topPercent = Math.round(pct * 10) / 10; applyLayoutSettings(); refreshMapSize(); }; const up = () => { save(); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); }; h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); }); }
function updateMapToggleLabels() { const hidden = document.body.classList.contains('map-hidden'); document.getElementById('toggleMapBtn').textContent = hidden ? 'Show Map' : 'Hide Map'; document.getElementById('toggleMapBtnLocal').textContent = hidden ? 'Show Map' : 'Hide Map'; }
function toggleMapVisibility() { document.body.classList.toggle('map-hidden'); updateMapToggleLabels(); refreshMapSize(); }

function renderAll(){ renderMarkers(); renderBoard(); renderSummary(); renderClubDetails(); renderScenarioPanel(); const addBtn = document.getElementById('addPodBtn'); if (addBtn) addBtn.hidden = pods.length >= MAX_PODS; }

document.getElementById('searchInput').addEventListener('input', renderAll);
document.getElementById('sortSelect').addEventListener('change', renderBoard);
document.getElementById('resetBtn').addEventListener('click', () => {
  if(confirm('Clear local scenarios/settings and reload original data?')) { localStorage.removeItem('slsnzPodBuilder'); location.reload(); }
});
document.getElementById('exportMenuBtn')?.addEventListener('click', e => { e.stopPropagation(); const menu = document.getElementById('exportMenu'); menu.hidden = !menu.hidden; });
document.addEventListener('click', () => { const menu = document.getElementById('exportMenu'); if (menu) menu.hidden = true; });
document.getElementById('exportScenarioBtn')?.addEventListener('click', exportCurrentScenario);
document.getElementById('exportWorkspaceBtn')?.addEventListener('click', exportWorkspace);
document.getElementById('importInput').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { await importScenarioFile(file); } catch (err) { alert('That file could not be imported. Please check it is a valid scenario or workspace JSON file.'); console.error(err); } e.target.value = ''; });
document.getElementById('addPodBtn').addEventListener('click', () => { if (pods.length >= MAX_PODS) { alert('This version is limited to 10 pods. Rename or repurpose an existing pod instead.'); return; } pods.push({id:`pod-${Date.now()}`, name:`New Pod ${pods.length + 1}`, color:'#2F80ED'}); save(); renderAll(); });
function refreshMapSize() { setTimeout(() => map?.invalidateSize(), 150); }
document.getElementById('toggleMapBtn')?.addEventListener('click', toggleMapVisibility);
document.getElementById('toggleMapBtnLocal')?.addEventListener('click', toggleMapVisibility);
document.querySelectorAll('.expandBtn').forEach(button => button.addEventListener('click', e => {
  const panel = document.getElementById(e.currentTarget.dataset.panel);
  const isFull = panel.classList.toggle('is-fullscreen');
  document.body.classList.toggle('panel-fullscreen', isFull);
  document.querySelectorAll('.panel').forEach(p => { if (p !== panel) p.classList.toggle('hidden-while-fullscreen', isFull); });
  e.currentTarget.textContent = isFull ? 'Collapse' : 'Full Screen';
  refreshMapSize();
}));

(async function start(){
  initMap();
  initResizableLayout();
  if (!loadSaved()) { clubs = await fetch('clubs.json').then(r => r.json()); scenarios = [currentScenarioSnapshot()]; save(); }
  if (!scenarios.length) scenarios = [currentScenarioSnapshot()];
  selectedClubId = clubs[0]?.id || null;
  applyLayoutSettings();
  updateMapToggleLabels();
  renderAll();
})();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}

function reportDate() {
  return new Date().toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

function reportHeader(title, subtitle = '') {
  return `<div class="reportHeader">
    <div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>
    <div class="reportMeta">Club Support Model Pod Designer<br>${escapeHtml(scenarioMeta.name || 'Current scenario')}<br>Generated ${reportDate()}</div>
  </div>`;
}

function podTotals(pod) {
  const list = clubs.filter(c => podFor(c).name === pod.name);
  const geo = geographyStats(list);
  return {
    pod,
    list,
    clubs: list.length,
    primaryMembers: sum(list, 'primaryMembers'),
    otherMembers: sum(list, 'otherMembers'),
    volunteerPatrolHours: sum(list, 'volunteerPatrolHours'),
    plsPatrolHours: sum(list, 'plsPatrolHours'),
    patrollingVolunteers: sum(list, 'patrollingVolunteers'),
    nationsEntries: sum(list, 'nationsEntries'),
    geo
  };
}
function buildReportMapHtml() {
  return `<div class="reportMapWrap"><div id="reportLeafletMap" class="reportLeafletMap"></div></div>`;
}

function renderReportLeafletMap() {
  const el = document.getElementById('reportLeafletMap');
  if (!el || !window.L) return;
  if (reportMap) { reportMap.remove(); reportMap = null; reportMapMarkers = []; }

  reportMap = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    crossOrigin: true
  }).addTo(reportMap);

  const valid = clubs.filter(c => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)));
  const bounds = [];
  valid.forEach(club => {
    const pod = podFor(club);
    const marker = L.marker([club.lat, club.lng], { icon: markerIcon(pod.color), interactive: false }).addTo(reportMap);
    reportMapMarkers.push(marker);
    bounds.push([club.lat, club.lng]);
  });

  if (bounds.length) reportMap.fitBounds(bounds, { padding: [8, 8], maxZoom: 6 });
  setTimeout(() => reportMap?.invalidateSize(), 250);
}

function buildLegendHtml() {
  return `<div class="reportLegend">${visiblePods().map(p => `<div class="legendItem"><span class="legendSwatch" style="background:${p.color}"></span><span>${escapeHtml(p.name)}</span></div>`).join('')}</div>`;
}

function buildCompositionPages() {
  const reportPods = visiblePods();
  return `<section class="reportPage reportCompositionPage">
    ${reportHeader('Pod Composition', 'Club groupings by current pod allocation')}
    <div class="reportCompositionGrid">
      ${reportPods.map(pod => {
        const list = clubs.filter(c => podFor(c).name === pod.name).sort((a,b) => a.name.localeCompare(b.name));
        return `<div class="reportPodBox" style="--pod:${pod.color}">
          <h2><span>${escapeHtml(pod.name)}</span><span>${list.length}</span></h2>
          <ul>${list.map(c => `<li>${escapeHtml(c.name)}</li>`).join('')}</ul>
          ${noteForPod(pod) ? `<div class="reportPodNote"><b>Notes</b><br>${escapeHtml(noteForPod(pod)).replace(/\n/g, '<br>')}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function buildSummaryPage() {
  const totals = allPodTotals();
  const rows = totals.map(t => {
    const score = balanceScore(t, totals);
    const obs = podObservations(t, totals).join(' ');
    return `<tr style="--pod:${t.pod.color}">
      <td class="reportColourCell">${escapeHtml(t.pod.name)}</td>
      <td>${t.clubs}</td>
      <td>${fmt(t.primaryMembers)}</td>
      <td>${fmt(t.otherMembers)}</td>
      <td>${fmt(t.patrollingVolunteers)}</td>
      <td>${fmt(t.volunteerPatrolHours)}</td>
      <td>${fmt(t.plsPatrolHours)}</td>
      <td>${fmt(t.nationsEntries)}</td>
      <td><b>${score}%</b><br><small>${balanceLabel(score)}</small></td>
      <td>${escapeHtml(t.geo.label)}<br><small>${fmt(t.geo.maxKm)} km max</small></td>
      <td>${escapeHtml(obs)}${noteForPod(t.pod) ? `<div class="reportObsNote"><b>Notes:</b><br>${escapeHtml(noteForPod(t.pod)).replace(/\n/g, '<br>')}</div>` : ''}</td>
    </tr>`;
  }).join('');
  return `<section class="reportPage">
    ${reportHeader('Pod Summary', 'Current totals based on the active support model allocation')}
    <table class="reportSummaryTable">
      <thead><tr><th>Pod</th><th>Clubs</th><th>Primary Members</th><th>Other Members</th><th>Patrol Volunteers</th><th>Volunteer Hrs</th><th>PLS Hrs</th><th>Nationals Entries</th><th>Balance</th><th>Travel Spread</th><th>Observations / Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="reportNote"><b>Balance Score:</b> objective comparison between pods using club count, primary members, patrol volunteers, volunteer hours, PLS hours, Nationals entries and geographic spread. It does not attempt to judge club health or capability need.</p>
  </section>`;
}
function buildPdfReport() {
  const overlay = document.getElementById('reportView');
  overlay.className = 'reportOverlay';
  overlay.innerHTML = `<div class="reportToolbar">
    <div><strong>PDF report preview</strong><span>Review the pages, then use Print / Save PDF.</span></div>
    <div class="reportToolbarActions"><button id="printReportBtn" type="button">Print / Save PDF</button><button id="closeReportBtn" type="button">Close</button></div>
  </div>
  <div id="reportPages" class="reportPages">
    <section class="reportPage reportMapPage">
      ${reportHeader('Club Support Model Pod Designer', 'Pod allocation map')}
      ${buildReportMapHtml()}
      ${buildLegendHtml()}
    </section>
    ${buildCompositionPages()}
    ${buildSummaryPage()}
  </div>`;
}

function openReportPreview() {
  buildPdfReport();
  const overlay = document.getElementById('reportView');
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('printReportBtn')?.addEventListener('click', () => {
    reportMap?.invalidateSize();
    setTimeout(() => window.print(), 250);
  });
  document.getElementById('closeReportBtn')?.addEventListener('click', closeReportPreview);
  setTimeout(renderReportLeafletMap, 100);
}

function closeReportPreview() {
  const overlay = document.getElementById('reportView');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  if (reportMap) { reportMap.remove(); reportMap = null; reportMapMarkers = []; }
}

function exportPdf() {
  openReportPreview();
}

window.addEventListener('beforeprint', () => reportMap?.invalidateSize());
window.addEventListener('afterprint', () => reportMap?.invalidateSize());

document.getElementById('pdfBtn')?.addEventListener('click', exportPdf);
