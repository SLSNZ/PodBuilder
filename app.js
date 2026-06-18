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
      <div class="detailItem"><span>Nationals entries %</span><b>${pct(club.nationalsPercent)}</b></div>
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

function renderSummary() {
  const el = document.getElementById('summary');
  el.innerHTML = '';
  el.style.setProperty('--pod-count', visiblePods().length);
  visiblePods().forEach(pod => {
    const list = clubs.filter(c => podFor(c).name === pod.name);
    const card = document.createElement('div');
    card.className = 'summaryCard';
    card.style.setProperty('--pod', pod.color);
    card.innerHTML = `<strong>${pod.name}</strong><div class="summaryGrid">
      <span>Clubs: <b>${list.length}</b></span>
      <span>Members: <b>${sum(list,'primaryMembers').toLocaleString()}</b></span>
      <span>Other members: <b>${sum(list,'otherMembers').toLocaleString()}</b></span>
      <span>Volunteer hrs: <b>${sum(list,'volunteerPatrolHours').toLocaleString()}</b></span>
      <span>PLS hrs: <b>${sum(list,'plsPatrolHours').toLocaleString()}</b></span>
      <span>Patrol volunteers: <b>${sum(list,'patrollingVolunteers').toLocaleString()}</b></span>
      <span>Avg Māori %: <b>${avg(list,'maoriPercent')}%</b></span>
    </div>`;
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
