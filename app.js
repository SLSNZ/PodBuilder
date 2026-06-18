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

let clubs = [];
let pods = structuredClone(DEFAULT_PODS);
let markers = new Map();
let map;
let draggedClubId = null;

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

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([-41.2, 172.6], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
}

function renderMarkers() {
  markers.forEach(m => m.remove());
  markers.clear();
  clubs.forEach(club => {
    const pod = podFor(club);
    const marker = L.marker([club.lat, club.lng], { icon: markerIcon(pod.color) })
      .bindPopup(`<strong>${club.name}</strong><br>Pod: ${pod.name}<br><button onclick="focusClub('${club.id}')">Find on board</button>`)
      .addTo(map);
    markers.set(club.id, marker);
  });
}

window.focusClub = id => {
  document.querySelector(`[data-club-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
};

function renderBoard() {
  const board = document.getElementById('board');
  const q = document.getElementById('searchInput').value.toLowerCase();
  const boardPods = visiblePods();
  board.style.setProperty('--pod-count', boardPods.length);
  document.getElementById('summary')?.style.setProperty('--pod-count', boardPods.length);
  board.innerHTML = '';

  boardPods.forEach(pod => {
    const col = document.createElement('div');
    col.className = 'podColumn';
    col.style.setProperty('--pod', pod.color);
    col.dataset.pod = pod.name;

    const podClubs = clubs.filter(c => podFor(c).name === pod.name && c.name.toLowerCase().includes(q));
    const allPodClubs = clubs.filter(c => podFor(c).name === pod.name);
    const canRemove = pod.id !== 'unassigned' && allPodClubs.length === 0;
    const titleControl = pod.id === 'unassigned'
      ? `<span class="fixedPodName">${pod.name}</span>`
      : `<input value="${pod.name}" data-pod-name="${pod.id}" title="Rename pod">`;
    const removeControl = canRemove ? `<button class="removePodBtn" data-remove-pod="${pod.id}" title="Remove empty pod">×</button>` : '';

    col.innerHTML = `<div class="podTitle">${titleControl}<span class="count">${podClubs.length}</span>${removeControl}</div>`;

    podClubs.sort((a,b) => a.name.localeCompare(b.name)).forEach(club => {
      const card = document.createElement('div');
      card.className = 'clubCard';
      card.draggable = true;
      card.dataset.clubId = club.id;
      card.style.setProperty('--pod', pod.color);
      card.innerHTML = `${club.name}<small>${club.regionalArea || club.region || 'Club'}</small>`;
      card.addEventListener('dragstart', () => draggedClubId = club.id);
      card.addEventListener('click', () => { map.setView([club.lat, club.lng], 10); markers.get(club.id)?.openPopup(); });
      col.appendChild(card);
    });

    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('dropTarget'); });
    col.addEventListener('dragleave', () => col.classList.remove('dropTarget'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('dropTarget');
      const club = clubs.find(c => c.id === draggedClubId);
      if (club) { club.pod = pod.name; save(); renderAll(); }
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
    if (clubCount > 0) {
      alert('This pod still contains clubs. Move them first, then remove the pod.');
      return;
    }
    if (confirm(`Remove empty pod "${pod.name}"?`)) {
      pods = pods.filter(p => p.id !== pod.id);
      save();
      renderAll();
    }
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
      <span>Nations: <b>${sum(list,'nationsEntries').toLocaleString()}</b></span>
      <span>Avg Māori %: <b>${avg(list,'maoriPercent')}%</b></span>
    </div>`;
    el.appendChild(card);
  });
}

function renderAll(){ renderMarkers(); renderBoard(); renderSummary(); }

document.getElementById('searchInput').addEventListener('input', renderBoard);
document.getElementById('resetBtn').addEventListener('click', () => {
  if(confirm('Clear local pod changes and reload original data?')) {
    localStorage.removeItem('slsnzPodBuilder');
    location.reload();
  }
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
  if (pods.length >= MAX_PODS) {
    alert('This version is limited to 10 pods. Rename or repurpose an existing pod instead.');
    return;
  }
  pods.push({id:`pod-${Date.now()}`, name:`New Pod ${pods.length + 1}`, color:'#2F80ED'});
  save();
  renderAll();
});

function refreshMapSize() {
  setTimeout(() => map?.invalidateSize(), 150);
}

document.getElementById('toggleMapBtn').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('map-hidden');
  document.getElementById('toggleMapBtn').textContent = hidden ? 'Show Map' : 'Hide Map';
  refreshMapSize();
});

document.querySelectorAll('.expandBtn').forEach(button => button.addEventListener('click', e => {
  const panel = document.getElementById(e.currentTarget.dataset.panel);
  const isFull = panel.classList.toggle('is-fullscreen');
  document.body.classList.toggle('panel-fullscreen', isFull);
  document.querySelectorAll('.panel').forEach(p => {
    if (p !== panel) p.classList.toggle('hidden-while-fullscreen', isFull);
  });
  e.currentTarget.textContent = isFull ? 'Collapse' : 'Full Screen';
  refreshMapSize();
}));

(async function start(){
  initMap();
  if (!loadSaved()) { clubs = await fetch('clubs.json').then(r => r.json()); }
  renderAll();
})();
