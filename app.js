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
let draggedClubId = null;
let selectedClubId = null;

const save = () => localStorage.setItem('slsnzPodBuilder', JSON.stringify({ clubs, pods }));
const loadSaved = () => {
  const saved = localStorage.getItem('slsnzPodBuilder');
  if (!saved) return false;
  try {
    const state = JSON.parse(saved);
    clubs = state.clubs;
    pods = (state.pods || pods).filter(p => p.id !== 'unassigned').slice(0, MAX_PODS);
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
        <div class="scoreBadge ${score < 70 ? 'bad' : score < 84 ? 'warn' : 'ok'}">${score}%</div>
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
      <details class="whyBox"><summary>Why?</summary><ul>${obs.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul></details>`;
    el.appendChild(card);
  });
}
function renderAll(){ renderMarkers(); renderBoard(); renderSummary(); renderClubDetails(); }

document.getElementById('searchInput').addEventListener('input', renderAll);
document.getElementById('sortSelect').addEventListener('change', renderBoard);
document.getElementById('toggleFiltersBtn').addEventListener('click', () => {
  const bar = document.getElementById('filterBar');
  bar.hidden = !bar.hidden;
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if(confirm('Clear local pod changes and reload original data?')) { localStorage.removeItem('slsnzPodBuilder'); location.reload(); }
});
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ pods, clubs }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'slsnz-pod-builder-save-file.json';
  a.click();
});
document.getElementById('importInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const state = JSON.parse(await file.text());
  pods = (state.pods || pods).filter(p => p.id !== 'unassigned').slice(0, MAX_PODS);
  clubs = state.clubs || state;
  save();
  renderAll();
});
document.getElementById('addPodBtn').addEventListener('click', () => {
  if (pods.length >= MAX_PODS) { alert('This version is limited to 10 pods. Rename or repurpose an existing pod instead.'); return; }
  pods.push({id:`pod-${Date.now()}`, name:`New Pod ${pods.length + 1}`, color:'#2F80ED'});
  save();
  renderAll();
});

function refreshMapSize() { setTimeout(() => map?.invalidateSize(), 150); }

document.getElementById('toggleMapBtn').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('map-hidden');
  document.getElementById('toggleMapBtn').textContent = hidden ? 'Show Map' : 'Hide Map';
  refreshMapSize();
});

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
  if (!loadSaved()) { clubs = await fetch('clubs.json').then(r => r.json()); }
  selectedClubId = clubs[0]?.id || null;
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
    <div class="reportMeta">Club Support Model Designer<br>Generated ${reportDate()}</div>
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
function buildReportMapSvg() {
  const valid = clubs.filter(c => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)));
  const minLat = Math.min(...valid.map(c => Number(c.lat))) - 1.1;
  const maxLat = Math.max(...valid.map(c => Number(c.lat))) + 1.1;
  const minLng = Math.min(...valid.map(c => Number(c.lng))) - 1.3;
  const maxLng = Math.max(...valid.map(c => Number(c.lng))) + 1.3;
  const width = 1120;
  const height = 620;
  const x = lng => ((Number(lng) - minLng) / (maxLng - minLng)) * width;
  const y = lat => height - ((Number(lat) - minLat) / (maxLat - minLat)) * height;

  const gridLines = [];
  for (let i = 1; i < 6; i++) {
    gridLines.push(`<line x1="${i * width / 6}" y1="0" x2="${i * width / 6}" y2="${height}" />`);
    gridLines.push(`<line x1="0" y1="${i * height / 6}" x2="${width}" y2="${i * height / 6}" />`);
  }

  const points = valid.map(c => {
    const pod = podFor(c);
    return `<circle cx="${x(c.lng).toFixed(1)}" cy="${y(c.lat).toFixed(1)}" r="6" fill="${pod.color}" stroke="white" stroke-width="2"><title>${escapeHtml(c.name)} - ${escapeHtml(pod.name)}</title></circle>`;
  }).join('');

  const labelPoints = valid.filter((_, i) => i % 4 === 0).map(c => {
    const px = x(c.lng), py = y(c.lat);
    return `<text x="${(px + 8).toFixed(1)}" y="${(py - 5).toFixed(1)}">${escapeHtml(c.name.replace(' SLSC','').replace(' SLSP','').replace(' SLS',''))}</text>`;
  }).join('');

  return `<svg class="reportMapSvg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pod allocation map">
    <rect width="${width}" height="${height}" fill="#e8f6fb" />
    <g stroke="#c8d9e6" stroke-width="1">${gridLines.join('')}</g>
    <path d="M760 48 C823 85 851 147 823 209 C797 266 789 318 828 369 C875 431 857 527 763 583 C693 622 616 584 596 516 C572 437 619 389 583 319 C550 256 586 185 642 145 C681 117 711 77 760 48Z" fill="#d9ead3" stroke="#8bbf8a" stroke-width="2" opacity="0.75" />
    <path d="M443 199 C512 239 516 321 479 376 C440 433 413 478 428 548 C369 590 284 560 259 489 C235 419 276 365 318 318 C355 278 362 222 443 199Z" fill="#d9ead3" stroke="#8bbf8a" stroke-width="2" opacity="0.75" />
    <text x="770" y="95" class="islandLabel">North Island</text>
    <text x="295" y="545" class="islandLabel">South Island</text>
    <g font-family="Arial, sans-serif" font-size="8" fill="#334e68" opacity="0.85">${labelPoints}</g>
    <g>${points}</g>
  </svg>`;
}

function buildLegendHtml() {
  return `<div class="reportLegend">${visiblePods().map(p => `<div class="legendItem"><span class="legendSwatch" style="background:${p.color}"></span><span>${escapeHtml(p.name)}</span></div>`).join('')}</div>`;
}

function buildCompositionPages() {
  const reportPods = visiblePods();
  const chunks = [reportPods.slice(0, 5), reportPods.slice(5, 10)];
  return chunks.filter(chunk => chunk.length).map((chunk, index) => `<section class="reportPage">
    ${reportHeader(`Pod Composition${chunks.length > 1 ? ` ${index + 1}` : ''}`, 'Club groupings by current pod allocation')}
    <div class="reportCompositionGrid">
      ${chunk.map(pod => {
        const list = clubs.filter(c => podFor(c).name === pod.name).sort((a,b) => a.name.localeCompare(b.name));
        return `<div class="reportPodBox" style="--pod:${pod.color}">
          <h2><span>${escapeHtml(pod.name)}</span><span>${list.length}</span></h2>
          <ul>${list.map(c => `<li>${escapeHtml(c.name)}</li>`).join('')}</ul>
        </div>`;
      }).join('')}
    </div>
  </section>`).join('');
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
      <td>${score}%</td>
      <td>${escapeHtml(t.geo.label)}<br><small>${fmt(t.geo.maxKm)} km max</small></td>
      <td>${escapeHtml(obs)}</td>
    </tr>`;
  }).join('');
  return `<section class="reportPage">
    ${reportHeader('Pod Summary', 'Current totals based on the active support model allocation')}
    <table class="reportSummaryTable">
      <thead><tr><th>Pod</th><th>Clubs</th><th>Primary Members</th><th>Other Members</th><th>Patrol Volunteers</th><th>Volunteer Hrs</th><th>PLS Hrs</th><th>Nationals Entries</th><th>Balance</th><th>Travel Spread</th><th>Observations</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="reportNote">Balance is an objective comparison between pods using the current metrics. It does not attempt to judge club health or capability need.</p>
  </section>`;
}
function buildPdfReport() {
  const report = document.getElementById('reportPages') || document.getElementById('reportView');
  report.innerHTML = `<section class="reportPage">
    ${reportHeader('Club Support Model Designer', 'Pod allocation map')}
    <div class="reportMapWrap">${buildReportMapSvg()}</div>
    ${buildLegendHtml()}
  </section>
  ${buildCompositionPages()}
  ${buildSummaryPage()}`;
}

function openReportPreview() {
  buildPdfReport();
  const overlay = document.getElementById('reportView');
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeReportPreview() {
  const overlay = document.getElementById('reportView');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

function exportPdf() {
  openReportPreview();
} 

document.getElementById('pdfBtn')?.addEventListener('click', exportPdf);
document.getElementById('printReportBtn')?.addEventListener('click', () => window.print());
document.getElementById('closeReportBtn')?.addEventListener('click', closeReportPreview);
