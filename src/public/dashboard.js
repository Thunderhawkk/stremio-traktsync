// src/public/dashboard.js
// Stable dashboard with: Lists + DnD, Filters (sort/order/genre/year/rating),
// Validate/Preview, Addon copy/QR, Trakt connect/status (cancel/gate),
// density toggle, logout.

document.addEventListener('DOMContentLoaded', () => { init(); });

/* ========== Accordion: single-open, safe summary clicks ========== */
document.addEventListener('click', (e) => {
  const summary = e.target.closest('details.list-row > summary');
  if (!summary) return;
  if (e.target.closest('button,a,input,select,textarea,label')) return;
  e.preventDefault();
  const row = summary.parentElement;
  const willOpen = !row.open;
  document.querySelectorAll('#lists details.list-row[open]').forEach(d => { if (d !== row) d.open = false; });
  row.open = willOpen;
});

/* ========== Normalize expanded rows to 12-col grid ========== */
document.addEventListener('toggle', (e) => {
  const row = e.target.closest('details.list-row');
  if (!row || !row.open) return;
  try { normalizeExpandedRow(row); } catch {}
});

function normalizeExpandedRow(row) {
  const body = row.querySelector(':scope > .collapser') || row;
  let fields = body.querySelector(':scope > .list-fields');
  if (!fields) {
    fields = document.createElement('div');
    fields.className = 'list-fields';
    while (body.firstChild) fields.appendChild(body.firstChild);
    body.appendChild(fields);
  }
  const ensureField = (selector, cls) => {
    const ctrl = fields.querySelector(selector);
    if (!ctrl) return null;
    let wrap = ctrl.closest('.field');
    if (wrap && wrap.parentElement === fields) { wrap.classList.add(cls); return wrap; }
    wrap = document.createElement('div');
    wrap.className = `field ${cls}`;
    const prev = ctrl.previousElementSibling;
    if (prev && prev.tagName === 'LABEL') { fields.insertBefore(wrap, prev); wrap.appendChild(prev); wrap.appendChild(ctrl); }
    else { fields.insertBefore(wrap, ctrl); wrap.appendChild(ctrl); }
    return wrap;
  };
  ensureField('.nameInput',      'field--name');
  ensureField('.typeSelect',     'field--type');
  ensureField('.urlInput',       'field--url');
  ensureField('.sortSelect',     'field--sort');
  ensureField('.orderSelect',    'field--order');
  ensureField('.genreInput',     'field--genre');
  ensureField('.yearMinInput',   'field--yearmin');
  ensureField('.yearMaxInput',   'field--yearmax');
  ensureField('.ratingMinInput', 'field--ratingmin');
  ensureField('.ratingMaxInput', 'field--ratingmax');

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'field field--actions';
  fields.querySelectorAll('.validateBtn, .previewBtn, .deleteBtn').forEach(btn => actionsWrap.appendChild(btn));
  fields.appendChild(actionsWrap);

  const status = fields.querySelector('.statusMsg');
  if (status) {
    const statusWrap = document.createElement('div');
    statusWrap.className = 'field field--status';
    statusWrap.appendChild(status);
    fields.appendChild(statusWrap);
  }
}

/* ---------- Utilities ---------- */
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
function flashToast(text) { const t = document.getElementById('toast'); if (t) { t.textContent = text; setTimeout(() => { t.textContent = ''; }, 1500); } }

/* ---------- Trakt expiry window ---------- */
const TRAKT_SOON_HOURS = Number(document.documentElement.getAttribute('data-trakt-soon-hrs') || '2');
const TRAKT_SOON_MS = Math.max(0, TRAKT_SOON_HOURS) * 60 * 60 * 1000;

function formatLeft(ms) {
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / (60*60*1000));
  const m = Math.floor((ms % (60*60*1000)) / (60*1000));
  if (h >= 1) return `${h}h ${m}m`;
  const s = Math.floor((ms % (60*1000)) / 1000);
  if (m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
}

function applyEntrances(){
  try{
    document.querySelectorAll('.auth-card, .card, .tabs-sticky, .card-title').forEach((el,i)=>{
      el.style.animationDelay = (i * 40) + 'ms';
    });
  }catch{}
}

/* ========== Init ========== */
async function init() {
  const meRes = await fetch(`/api/auth/me?ts=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (!meRes.ok) { window.location = '/login'; return; }
  const me = await meRes.json().catch(()=>({}));
  if (!me?.user) { window.location = '/login'; return; }

  const savedDensity = localStorage.getItem('ui-density') || 'cozy';
  document.documentElement.setAttribute('data-density', savedDensity);

  ensurePanelViews();        // deterministic tabs + flatten lists shell
  wireTabs();
  wireActions();
  applyEntrances();
  showAddonSkeleton();

  await Promise.allSettled([ fetchLists(), fetchAddonInfo(), traktStatus() ]);

  window.addEventListener('load', () => {
    document.querySelectorAll('details.list-row[open]').forEach((row) => { try { normalizeExpandedRow(row); } catch {} });
  });
}

/* ========== Self-repair: ensure #listsView / #addonView and flatten Lists shell ========== */
function ensurePanelViews(){
  const panelLists = document.getElementById('panel-lists') || document.getElementById('listsPanel') || document.querySelector('#lists')?.closest('.panel');
  const panelAddon = document.getElementById('panel-addon') || document.getElementById('addonPanel') || document.querySelector('#addonInfo')?.closest('.panel');

  // Tag the lists shell so CSS can flatten the outer panel
  if (panelLists) panelLists.classList.add('lists-shell');

  // Wrap #lists into #listsView inside panel-lists
  if (panelLists) {
    let listsView = document.getElementById('listsView');
    const lists = document.getElementById('lists');
    if (lists && (!listsView || !listsView.contains(lists))) {
      if (!listsView) {
        listsView = document.createElement('div');
        listsView.id = 'listsView';
        panelLists.appendChild(listsView);
      }
      listsView.appendChild(lists);
    }
  }

  // Wrap #addonInfo into #addonView inside host
  const addonHost = panelAddon || panelLists || document.querySelector('#lists')?.closest('.panel');
  if (addonHost) {
    let addonView = document.getElementById('addonView');
    if (!addonView) {
      addonView = document.createElement('div');
      addonView.id = 'addonView';
      addonView.style.display = 'none';
      addonHost.appendChild(addonView);
    }
    let addonInfo = document.getElementById('addonInfo');
    if (!addonInfo) {
      addonInfo = document.createElement('div');
      addonInfo.id = 'addonInfo';
      addonView.appendChild(addonInfo);
    }
    if (!addonView.contains(addonInfo)) addonView.appendChild(addonInfo);
  }
}

/* ---------- Actions ---------- */
function wireActions() {
  on(document.getElementById('addListBtn'), 'click', onAddList);
  on(document.getElementById('saveBtn'), 'click', onSaveChanges);

  on(document.getElementById('copyManifestBtn'), 'click', onCopyManifest);
  on(document.getElementById('qrManifestBtn'),   'click', onShowQr);
  on(document.getElementById('closeQrBtn'),      'click', closeQr);
  on(document.getElementById('qrModal'), 'click', (e) => { if (e.target && e.target.id === 'qrModal') closeQr(); });

  on(document.getElementById('logoutBtn'), 'click', async () => {
    try {
      const r = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (r.ok) window.location = '/login'; else flashToast('Logout failed');
    } catch { flashToast('Logout error'); }
  });

  on(document.getElementById('densityToggle'), 'click', () => {
    const cur  = document.documentElement.getAttribute('data-density') || 'cozy';
    const next = cur === 'compact' ? 'cozy' : 'compact';
    document.documentElement.setAttribute('data-density', next);
    localStorage.setItem('ui-density', next);
    flashToast(`Density: ${next}`);
  });

  // Trakt
  on(document.getElementById('traktConnectBtn'),    'click', traktConnectStart);
  on(document.getElementById('traktRefreshBtn'),    'click', traktRefresh);
  on(document.getElementById('traktDisconnectBtn'), 'click', traktDisconnect);
  on(document.getElementById('traktCheckBtn'),      'click', traktStatus);
  on(document.getElementById('bannerRefreshBtn'),   'click', traktRefresh);

  // Trakt modal helpers
  on(document.getElementById('traktCloseBtn'), 'click', traktCloseModal);
  on(document.getElementById('copyCodeBtn'),  'click', () => copyText(document.getElementById('traktUserCode')?.textContent || ''));
  on(document.getElementById('copyUrlBtn'),   'click', () => copyText(document.getElementById('traktVerifyLink')?.href || ''));
}

/* ========== Tabs: explicit views + on-demand Addon populate ========== */
let addonLoadedOnce = false;
function wireTabs(){
  // Robustly find tab buttons by ID, data attribute, or visible text
  const btnLists = document.getElementById('tab-lists')
    || document.querySelector('[data-tab="lists"]')
    || [...document.querySelectorAll('.tab,.chip,button')].find(b => (b.textContent||'').trim().toLowerCase() === 'lists');

  const btnAddon = document.getElementById('tab-addon')
    || document.querySelector('[data-tab="addon"]')
    || [...document.querySelectorAll('.tab,.chip,button')].find(b => (b.textContent||'').trim().toLowerCase() === 'addon');

  const listsView = document.getElementById('listsView');
  const addonView = document.getElementById('addonView');

  const ensureAddonContent = async () => {
    let box = document.getElementById('addonInfo');
    if (!box) {
      const host = document.getElementById('addonView') || addonView || document.body;
      box = document.createElement('div');
      box.id = 'addonInfo';
      host.appendChild(box);
    }
    if (!addonLoadedOnce || !box.childElementCount) {
      await fetchAddonInfo();
      // Fallback if API fails: show a minimal help note
      if (!box.childElementCount) {
        box.innerHTML = '<div class="small">Addon info not available — try Check/Refresh or copy manifest from server settings.</div>';
      }
      addonLoadedOnce = true;
    }
  };

  const setActive = async (name) => {
    if (btnLists) btnLists.classList.toggle('active', name==='lists');
    if (btnAddon) btnAddon.classList.toggle('active', name==='addon');

    if (listsView) listsView.style.display = (name==='lists') ? '' : 'none';
    if (addonView) addonView.style.display = (name==='addon') ? '' : 'none';

    if (name === 'addon') await ensureAddonContent();
  };

  if (btnLists) btnLists.addEventListener('click', () => setActive('lists'));
  if (btnAddon) btnAddon.addEventListener('click', () => setActive('addon'));
  setActive('lists');
}

/* ---------- Addon info + Copy/QR ---------- */
let manifestUrl = '';

function showAddonSkeleton() {
  const box = document.getElementById('addonInfo');
  if (box) box.innerHTML = '<div class="skeleton" style="height:102px; border-radius:10px;"></div>';
}

async function fetchAddonInfo() {
  try {
    const r = await fetch('/api/addon-info', { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    manifestUrl = data.manifestUrl || '';
    const box = document.getElementById('addonInfo');
    if (!box) return;
    box.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = `Manifest URL:\n${data.manifestUrl}\n\nEnabled catalogs: ${data.enabledCatalogs}`;
    const a = document.createElement('a');
    a.href = data.stremioLink; a.textContent = 'Install in Stremio'; a.style.marginTop = '8px';
    box.appendChild(pre); box.appendChild(a);
  } catch {}
}

async function onCopyManifest() {
  if (!manifestUrl) await fetchAddonInfo();
  try {
    await navigator.clipboard.writeText(manifestUrl);
    const stamp = document.getElementById('copyStamp');
    if (stamp) stamp.textContent = `Copied at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    flashToast(`Copied ✓`);
  } catch { flashToast('Copy failed'); }
}

function onShowQr() {
  if (!manifestUrl) { flashToast('No manifest URL'); return; }
  const modal = document.getElementById('qrModal'); if (!modal) return;
  modal.style.display = 'flex';
  setTimeout(() => modal.querySelector('.modal')?.classList.add('open'), 0);
  drawQr(manifestUrl);
}
function closeQr() {
  const modal = document.getElementById('qrModal'); if (!modal) return;
  modal.querySelector('.modal')?.classList.remove('open');
  setTimeout(() => { modal.style.display = 'none'; }, 180);
}
function copyText(s){ if (!s) return; navigator.clipboard.writeText(String(s)).then(()=>flashToast('Copied')).catch(()=>flashToast('Copy failed')); }
function drawQr(text) {
  const canvas = document.getElementById('qrCanvas'); if (!canvas) return;
  const size = 320, ctx = canvas.getContext('2d');
  if (window.SimpleQR) {
    const matrix = window.SimpleQR.encode(text);
    const n = matrix.length;
    const scale = Math.floor(size / (n + 8));
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle = '#000';
    const offset = Math.floor((size - n * scale) / 2);
    for (let y=0; y<n; y++) for (let x=0; x<n; x++) if (matrix[y][x]) ctx.fillRect(offset+x*scale, offset+y*scale, scale, scale);
  } else {
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle = '#000'; ctx.font = '16px system-ui'; ctx.fillText('QR module not loaded', 70, size/2);
  }
}

/* ---------- Lists + Filters ---------- */
async function fetchLists() {
  try {
    const r = await fetch(`/api/config?ts=${Date.now()}`, {
      credentials: 'include',
      cache:'no-store',
      headers:{'Cache-Control':'no-cache'}
    });
    if (!r.ok) return;
    const data = await r.json();
    const box = document.getElementById('lists');
    const empty = document.getElementById('listsEmpty');
    if (!box) return;
    box.innerHTML = '';
    (data.lists || []).forEach((l) => {
      const row = renderListRow(l);
      box.appendChild(row);
      enhanceListRow(row);
    });
    if (empty) empty.style.display = (box.children.length === 0) ? '' : 'none';
    enableDnD(box);
  } catch {}
}

function renderListRow(l) {
  l = l || {};
  const root = document.createElement('details');
  root.className = 'list-row';
  root.dataset.id = l.id || '';
  root.draggable = true;

  const summary = document.createElement('summary');
  summary.style.cursor = 'grab';
  summary.innerHTML = `
    <div class="row-between" style="gap:12px; align-items:center;">
      <div style="min-width:0;">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(l.name || '')}</div>
        <div class="small urlLine" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(l.url || '')}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="badge">${(l.type === 'series') ? 'Series' : 'Movies'}</span>
        <label class="switch" title="Toggle enabled">
          <input type="checkbox" class="enabledToggle" ${l.enabled !== false ? 'checked' : ''}/>
          <span class="knob"></span><span class="track"></span>
        </label>
      </div>
    </div>`;
  root.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'collapser';
  body.innerHTML = `
    <div class="grid">
      <div><label>Name</label><input class="nameInput" value="${escapeAttr(l.name || '')}" /></div>
      <div><label>URL (Trakt/mdblist or username/lists/slug)</label><input class="urlInput" value="${escapeAttr(l.url || '')}" /></div>
      <div><label>Type</label>
        <select class="typeSelect">
          <option value="movie" ${(l.type || 'movie') === 'movie' ? 'selected' : ''}>Movies</option>
          <option value="series"${(l.type || 'movie') === 'series' ? ' selected' : ''}>Series</option>
        </select>
      </div>
    </div>

    <div class="grid" style="margin-top:8px;">
      <div>
        <label>Sort</label>
        <select class="sortSelect">
          <option value="">—</option>
          <option value="rating" ${l.sortBy === 'rating' ? 'selected' : ''}>Rating</option>
          <option value="year"   ${l.sortBy === 'year'   ? 'selected' : ''}>Year</option>
          <option value="runtime"${l.sortBy === 'runtime'? 'selected' : ''}>Runtime</option>
          <option value="name"   ${l.sortBy === 'name'   ? 'selected' : ''}>Name</option>
        </select>
      </div>
      <div>
        <label>Order</label>
        <select class="orderSelect">
          <option value="desc" ${(l.sortOrder || 'desc') === 'desc' ? 'selected' : ''}>Desc</option>
          <option value="asc"  ${(l.sortOrder || 'desc') === 'asc'  ? 'selected' : ''}>Asc</option>
        </select>
      </div>
      <div><label>Genre filter</label><input class="genreInput" placeholder="e.g., Comedy" value="${escapeAttr(l.genre || '')}" /></div>
      <div>
        <label>Year range</label>
        <div class="row" style="display:flex; gap:8px;">
          <input class="yearMinInput" placeholder="From" value="${escapeAttr(l.yearMin || '')}" />
          <input class="yearMaxInput" placeholder="To"   value="${escapeAttr(l.yearMax || '')}" />
        </div>
      </div>
      <div><label>Rating min</label><input class="ratingMinInput" placeholder="e.g., 7.0" value="${escapeAttr(l.ratingMin || '')}" /></div>
      <div><label>Rating max</label><input class="ratingMaxInput" placeholder="e.g., 8.5" value="${escapeAttr(l.ratingMax || '')}" /></div>
    </div>

    <div class="actions" style="margin-top:12px;">
      <button type="button" class="validateBtn">Validate</button>
      <button type="button" class="secondary previewBtn">Preview</button>
      <button type="button" class="secondary danger deleteBtn" style="margin-left:auto;">Delete</button>
    </div>
    <div class="small statusMsg" style="min-height:1.2em; margin-top:6px;" aria-live="polite"></div>
  `;
  root.appendChild(body);

  body.querySelector('.validateBtn').addEventListener('click', () => validateListRow(root));
  body.querySelector('.previewBtn').addEventListener('click',  () => previewListRow(root));
  body.querySelector('.deleteBtn').addEventListener('click',   () => deleteListRow(root));
  attachUrlValidation(root);

  root.addEventListener('toggle', () => {
    if (!root.open) return;
    const bar = body.querySelector('.actions');
    if (!bar) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { bar.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); } catch { bar.scrollIntoView(); }
  });

  return root;
}

function enhanceListRow(row){
  const collapser = row.querySelector('.collapser');
  if (!collapser) return;

  if (!row.hasAttribute('open')) {
    row.dataset.open = 'false';
    collapser.style.height = '0px';
    collapser.style.opacity = '0';
  } else {
    row.dataset.open = 'true';
  }

  let lastHeight = 0;
  const animateTo = (targetPx, fadeTo, cb) => {
    collapser.style.willChange = 'height, opacity';
    collapser.style.height = `${Math.max(0, lastHeight)}px`;
    collapser.style.opacity = String(fadeTo === 1 ? 0 : 1);
    requestAnimationFrame(() => {
      collapser.style.transition = 'height 260ms var(--ease), opacity 160ms var(--ease)';
      collapser.style.height = `${Math.max(0, targetPx)}px`;
      collapser.style.opacity = String(fadeTo);
    });
    const done = () => {
      collapser.removeEventListener('transitionend', done);
      collapser.style.transition = '';
      collapser.style.willChange = '';
      if (fadeTo === 1) { collapser.style.height = 'auto'; lastHeight = collapser.scrollHeight; }
      else { lastHeight = 0; }
      if (typeof cb === 'function') cb();
    };
    collapser.addEventListener('transitionend', done);
  };

  row.addEventListener('toggle', () => {
    const reduce  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const opening = row.open;
    if (opening) {
      row.dataset.open = 'true';
      const target = collapser.scrollHeight || collapser.getBoundingClientRect().height || 0;
      lastHeight = 0;
      if (reduce) { collapser.style.height = 'auto'; collapser.style.opacity = '1'; focusActions(row); }
      else { animateTo(target, 1, () => focusActions(row)); }
    } else {
      const current = collapser.scrollHeight || collapser.getBoundingClientRect().height || 0;
      lastHeight = current;
      if (reduce) { collapser.style.height = '0px'; collapser.style.opacity = '0'; row.dataset.open = 'false'; }
      else { animateTo(0, 0, () => { row.dataset.open = 'false'; }); }
    }
  });

  if (row.open) { collapser.style.height = 'auto'; collapser.style.opacity = '1'; lastHeight = collapser.scrollHeight; }
}

function focusActions(row){
  const bar = row.querySelector('.actions');
  const first = bar?.querySelector('button');
  if (!bar) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { bar.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); } catch { bar.scrollIntoView(); }
  if (first) first.focus({ preventScroll: true });
}

function isValidListUrlOrSlug(v){
  const s=String(v||'').trim();
  if(s.length<3) return false;
  if(/^https?:\/\/(?:www\.)?trakt\.tv\/users\/[A-Za-z0-9_-]+\/lists\/[A-Za-z0-9-]+\/?$/i.test(s)) return true;
  if(/^https?:\/\/(?:www\.)?trakt\.tv\/lists\/[A-Za-z0-9-]+\/?$/i.test(s)) return true;
  if(/^https?:\/\/(?:www\.)?mdblist\.com\/lists\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\/?$/i.test(s)) return true;
  if(/^[A-Za-z0-9_-]+\/lists\/[A-Za-z0-9-]+$/i.test(s)) return true;
  return false;
}

function attachUrlValidation(row){
  const urlInput    = row.querySelector('.urlInput');
  const msg         = row.querySelector('.statusMsg');
  const validateBtn = row.querySelector('.validateBtn');
  if(!urlInput) return;
  const check=()=>{
    const ok = isValidListUrlOrSlug(urlInput.value);
    if(!ok){
      if(msg) msg.textContent='Enter a valid Trakt/mdblist URL or username/lists/slug';
      if(validateBtn) validateBtn.disabled=true;
      urlInput.style.borderColor='rgba(255,107,107,.6)';
    }else{
      if(msg) msg.textContent='';
      if(validateBtn) validateBtn.disabled=false;
      urlInput.style.borderColor='';
    }
  };
  urlInput.addEventListener('input', check);
  check();
}

function getRowExtras(row){
  return {
    sort: row.querySelector('.sortSelect')?.value || '',
    order: row.querySelector('.orderSelect')?.value || 'desc',
    genre: row.querySelector('.genreInput')?.value?.trim() || '',
    yearMin: row.querySelector('.yearMinInput')?.value?.trim() || '',
    yearMax: row.querySelector('.yearMaxInput')?.value?.trim() || '',
    ratingMin: row.querySelector('.ratingMinInput')?.value?.trim() || '',
    ratingMax: row.querySelector('.ratingMaxInput')?.value?.trim() || ''
  };
}

function enableDnD(container){
  if(!container) return;
  let dragEl=null;
  container.addEventListener('dragstart',(e)=>{ dragEl=e.target.closest('.list-row'); if(!dragEl) return; e.dataTransfer.effectAllowed='move'; dragEl.classList.add('dragging'); });
  container.addEventListener('dragend',()=>{ const t=document.getElementById('toast'); if(t){ t.textContent='Order updated — remember to Save changes'; setTimeout(()=>t.textContent='',1500);} if(dragEl) dragEl.classList.remove('dragging'); dragEl=null; });
  container.addEventListener('dragover',(e)=>{ e.preventDefault(); if(!dragEl) return; const after=getDragAfterElement(container,e.clientY); if(after==null) container.appendChild(dragEl); else container.insertBefore(dragEl,after); });
  function getDragAfterElement(cont,y){
    const els=[...cont.querySelectorAll('.list-row:not(.dragging)')];
    return els.reduce((closest,child)=>{ const box=child.getBoundingClientRect(); const offset=y-box.top-box.height/2; if(offset<0 && offset>closest.offset) return { offset, element: child }; else return closest; }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
}

function collectListsFromDOM(){
  return Array.from(document.querySelectorAll('.list-row')).map((row,idx)=>({
    id: row.dataset.id || undefined,
    name: row.querySelector('.nameInput')?.value?.trim() || 'List',
    url: row.querySelector('.urlInput')?.value?.trim() || '',
    type: row.querySelector('.typeSelect')?.value || 'movie',
    enabled: row.querySelector('.enabledToggle')?.checked !== false,
    order: idx,
    sortBy: row.querySelector('.sortSelect')?.value || undefined,
    sortOrder: row.querySelector('.orderSelect')?.value || undefined
  }));
}

async function onSaveChanges(){
  try{
    const lists=collectListsFromDOM();
    const r=await fetch('/api/config',{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ lists })
    });
    if (r.ok){
      await fetchLists();
      flashToast('Saved');
    } else {
      flashToast('Save failed');
    }
  }catch{ flashToast('Save error'); }
}

function onAddList(){
  const box=document.getElementById('lists'); if(!box) return;
  const row=renderListRow({ id:'', name:'New list', url:'', type:'movie', enabled:true });
  row.open=true; box.prepend(row);
  const empty=document.getElementById('listsEmpty'); if(empty) empty.style.display='none';
  enhanceListRow(row);
}

async function deleteListRow(row){
  const id=row.dataset.id;
  const msg=row.querySelector('.statusMsg');
  if(!id){ row.remove(); maybeShowEmpty(); return; }
  try{
    const r=await fetch(`/api/config/${encodeURIComponent(id)}`,{ method:'DELETE', credentials:'include' });
    if(r.ok){
      row.remove(); maybeShowEmpty();
      flashToast('Deleted');
    } else { if(msg){ msg.textContent='Delete failed'; setTimeout(()=>msg.textContent='',1500); } }
  }catch{ if(msg){ msg.textContent='Delete error'; setTimeout(()=>msg.textContent='',1500);} }
}
function maybeShowEmpty(){
  const box=document.getElementById('lists');
  const empty=document.getElementById('listsEmpty');
  if(box && empty) empty.style.display = (box.children.length===0) ? '' : 'none';
}

async function validateListRow(row){
  const url=row.querySelector('.urlInput').value.trim();
  const type=row.querySelector('.typeSelect').value;
  const msg=row.querySelector('.statusMsg');
  const extras=getRowExtras(row);
  if(msg) msg.textContent='Validating…';
  const r=await fetch('/api/validate-list',{ method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url, type, extras }) });
  const data=await r.json().catch(()=>({}));
  if(msg){
    msg.textContent = (r.ok && data?.ok) ? 'Valid' : (data?.error || 'Invalid');
    setTimeout(()=>{ msg.textContent=''; },1500);
  }
}

async function previewListRow(row){
  const url=row.querySelector('.urlInput').value.trim();
  const type=row.querySelector('.typeSelect').value;
  const msg=row.querySelector('.statusMsg');
  const extras=getRowExtras(row);
  if(msg) msg.textContent='Loading preview…';
  const r=await fetch('/api/preview-list',{ method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url, type, extras }) });
  const data=await r.json().catch(()=>({}));
  if(msg){
    msg.textContent = (r.ok && Array.isArray(data?.previews)) ? `Found ${data.previews.length} sample item(s)` : (data?.error || 'Preview failed');
    setTimeout(()=>{ msg.textContent=''; },2000);
  }
}

/* ---------- Trakt status (cancel + gate + final settle) ---------- */
let traktStatusSeq = 0;
let traktFetchCtrl = null;
let traktLast = null;

function getEl(id){ try{ return document.getElementById(id); }catch{ return null; } }

function setTraktBadge(state, extraText) {
  const badge = getEl('traktBadge');
  const line  = getEl('traktStatusLine') || getEl('accountStatusText');
  const header= getEl('traktHeader');
  const textMap = {
    connected:    { pill: 'Connected',    line: extraText || 'Trakt is connected' },
    pending:      { pill: 'Authorizing…', line: extraText || 'Waiting for authorization…' },
    checking:     { pill: 'Checking',     line: extraText || 'Checking connection…' },
    disconnected: { pill:'Disconnected',  line: extraText || 'Not connected to Trakt' }
  };
  const t = textMap[state] || textMap.disconnected;

  if (badge){
    badge.dataset.state = state;
    if (state === 'connected')    { badge.className='pill ok';   badge.textContent=t.pill; }
    else if (state === 'pending') { badge.className='pill warn'; badge.innerHTML='<span class="spinner" aria-hidden="true"></span> '+t.pill; }
    else if (state === 'checking'){ badge.className='pill warn'; badge.innerHTML='<span class="spinner" aria-hidden="true"></span> '+t.pill; }
    else                          { badge.className='pill err';  badge.textContent=t.pill; }
  }
  if (line)   line.textContent = t.line;
  if (!line && header) header.textContent = t.line;
}

function applyTraktUI(data){
  const banner=getEl('traktExpiryBanner');
  const text  =getEl('traktExpiryText');
  const auto  =getEl('traktAutoLine');

  if (!data || !data.connected){
    setTraktBadge('disconnected');
    if (banner) banner.style.display='none';
    if (auto) auto.textContent='';
    return;
  }
  const exp = data.expires_at ? new Date(data.expires_at) : null;
  if (!exp){
    setTraktBadge('connected','Token active');
    if (banner) banner.style.display='none';
    if (auto && data.last_auto_refresh_at){ auto.textContent = `Auto‑refreshed at ${new Date(data.last_auto_refresh_at).toLocaleString()}`; }
    return;
  }
  const msLeft = exp.getTime() - Date.now();
  setTraktBadge('connected', `Token expires: ${exp.toLocaleString()}`);
  if (auto){
    const a = data.last_auto_refresh_at ? new Date(data.last_auto_refresh_at) : null;
    auto.textContent = a ? `Auto‑refreshed at ${a.toLocaleString()}` : '';
  }
  const soonMs = Number.isFinite(TRAKT_SOON_MS) ? TRAKT_SOON_MS : 2*60*60*1000;
  if (msLeft > 0 && msLeft <= soonMs){
    if (text) text.textContent = `Token expiring in ${formatLeft(msLeft)} (${exp.toLocaleString()})`;
    if (banner) banner.style.display='';
  } else {
    if (banner) banner.style.display='none';
  }
}

async function traktStatus(){
  const mySeq = ++traktStatusSeq;
  try { if (traktFetchCtrl) traktFetchCtrl.abort(); } catch {}
  traktFetchCtrl = new AbortController();
  let settled = false;

  if (mySeq === traktStatusSeq) setTraktBadge('checking');

  try {
    const r = await fetch(`/api/trakt/token/status?ts=${Date.now()}`, {
      credentials:'include',
      cache:'no-store',
      headers:{ 'Cache-Control':'no-store' },
      signal: traktFetchCtrl.signal
    });
    if (mySeq !== traktStatusSeq) return;
    if (!r.ok) { applyTraktUI(null); settled = true; return; }

    const data = await r.json();
    if (mySeq !== traktStatusSeq) return;
    traktLast = data;
    applyTraktUI(data);
    settled = true;
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    applyTraktUI(null);
    settled = true;
  } finally {
    if (mySeq === traktStatusSeq && !settled) {
      if (traktLast) applyTraktUI(traktLast); else applyTraktUI(null);
    }
    const badge=getEl('traktBadge');
    if (badge && badge.dataset.state === 'checking') {
      if (traktLast) applyTraktUI(traktLast); else applyTraktUI(null);
    }
  }
}

function traktOpenModal(){ const m=document.getElementById('traktModal'); if(!m) return; m.style.display='flex'; setTimeout(()=>m.querySelector('.modal')?.classList.add('open'),0); }
function traktCloseModal(){ const m=document.getElementById('traktModal'); if(!m) return; m.querySelector('.modal')?.classList.remove('open'); setTimeout(()=>{ m.style.display='none'; },180); clearInterval(traktPollTimer); traktPollTimer=null; }

let traktPollTimer = null;

async function traktConnectStart(){
  try{
    setTraktBadge('checking','Starting device authorization…');
    const r=await fetch('/api/trakt/auth/init',{ method:'POST', credentials:'include' });
    if(!r.ok){ setTraktBadge('disconnected','Failed to start auth'); return; }
    const data=await r.json();
    const codeEl=document.getElementById('traktUserCode');
    const linkEl=document.getElementById('traktVerifyLink');
    const msg=document.getElementById('traktPollMsg');
    if(codeEl) codeEl.textContent=data.user_code || '—';
    if(linkEl){ const v=data.verification_url || 'https://trakt.tv/activate'; linkEl.href=v; linkEl.textContent='Open verification'; }
    if(msg) msg.textContent='Waiting for authorization…';
    traktOpenModal();

    setTraktBadge('pending');
    const intervalMs=Math.max(5000,(data.interval||5)*1000);
    let expiresAt=Date.now()+(data.expires_in||600)*1000;
    const device_code=data.device_code;
    clearInterval(traktPollTimer);
    traktPollTimer=setInterval(async ()=>{
      if(Date.now()>expiresAt){
        if(msg) msg.textContent='Code expired. Close and try again.';
        setTraktBadge('disconnected','Code expired'); clearInterval(traktPollTimer); traktPollTimer=null; return;
      }
      const rr=await fetch('/api/trakt/auth/poll',{ method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ device_code }) });
      if(rr.status===202){ if(msg) msg.textContent='Waiting for authorization…'; return; }
      const out=await rr.json().catch(()=>({}));
      if(rr.ok && out.authorized){
        if(msg) msg.textContent='Authorized!';
        setTraktBadge('connected', out.expires_at ? `Token expires: ${new Date(out.expires_at).toLocaleString()}` : 'Token active');
        clearInterval(traktPollTimer); traktPollTimer=null; setTimeout(traktCloseModal, 600);
        traktStatus();
      }else{
        if(msg) msg.textContent='Authorization failed';
        setTraktBadge('disconnected','Authorization failed');
        clearInterval(traktPollTimer); traktPollTimer=null;
      }
    }, intervalMs);
  }catch{ setTraktBadge('disconnected','Failed to start auth'); }
}

async function traktRefresh(){
  setTraktBadge('checking','Refreshing token…');
  try{
    const r=await fetch('/api/trakt/token/refresh',{ method:'POST', credentials:'include' });
    const d=await r.json().catch(()=>({}));
    setTraktBadge(r.ok ? 'connected' : 'disconnected', r.ok && d?.expires_at ? `Token expires: ${new Date(d.expires_at).toLocaleString()}` : (r.ok ? 'Token refreshed' : 'Refresh failed'));
    traktStatus();
  }catch{ applyTraktUI(null); }
}

async function traktDisconnect(){
  setTraktBadge('checking','Disconnecting…');
  try{
    await fetch('/api/trakt/token/clear',{ method:'POST', credentials:'include' });
    applyTraktUI(null);
    traktStatus();
  }catch{ applyTraktUI(null); }
}
