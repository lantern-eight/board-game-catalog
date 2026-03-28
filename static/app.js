/* ===================================================================
   Board Game Catalog - Frontend
   =================================================================== */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let games = [];
let filteredGames = [];
let config = {};
let filters = {};

let activeFilters = {
  players: new Set(),
  time: new Set(),
  age: new Set(),
  style: new Set(),
  type: new Set(),
  tags: new Set(),
  favorite: false,
};
let searchTerm = '';
let sortKey = 'date_added';
let sortAsc = false;

// Image cycling
let globalImageCycle = 0;
let gameImageAdjust = {};  // slug -> offset

// Modal state
let modalGame = null;
let modalImageIndex = 0;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function fetchConfig() {
  config = await api('GET', '/api/config');
  document.documentElement.setAttribute('data-theme', config.theme || 'dark-blue-teal');
  filters = config.filters || {};
}

async function fetchGames() {
  const data = await api('GET', '/api/games');
  games = data.games || [];
}

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------
function applyFilters() {
  filteredGames = games.filter(g => {
    // Search
    if (searchTerm && !g.name.toLowerCase().includes(searchTerm)) return false;

    // Favorites
    if (activeFilters.favorite && !g.favorite) return false;

    // Players (OR within)
    if (activeFilters.players.size > 0) {
      const gPlayers = (g.players || []).map(String);
      const match = [...activeFilters.players].some(p => gPlayers.includes(String(p)));
      if (!match) return false;
    }

    // Time (OR within)
    if (activeFilters.time.size > 0 && !activeFilters.time.has(g.time)) return false;

    // Age (OR within)
    if (activeFilters.age.size > 0 && !activeFilters.age.has(g.age)) return false;

    // Style (OR within)
    if (activeFilters.style.size > 0) {
      const match = (g.style || []).some(s => activeFilters.style.has(s));
      if (!match) return false;
    }

    // Type (OR within)
    if (activeFilters.type.size > 0) {
      const match = (g.type || []).some(t => activeFilters.type.has(t));
      if (!match) return false;
    }

    // Tags (OR within)
    if (activeFilters.tags.size > 0) {
      const match = (g.tags || []).some(t => activeFilters.tags.has(t));
      if (!match) return false;
    }

    return true;
  });

  // Sort
  filteredGames.sort((a, b) => {
    let va, vb;
    if (sortKey === 'name') {
      va = a.name.toLowerCase();
      vb = b.name.toLowerCase();
    } else if (sortKey === 'players_min') {
      va = a.players_min ?? 99;
      vb = b.players_min ?? 99;
    } else if (sortKey === 'time_order') {
      va = a.time_order ?? 99;
      vb = b.time_order ?? 99;
    } else {
      // date_added
      va = a.date_added || '';
      vb = b.date_added || '';
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------
function buildFilterPills() {
  const container = document.getElementById('filter-pills');
  container.innerHTML = '';

  const addLabel = (text) => {
    const el = document.createElement('span');
    el.className = 'pill-label';
    el.textContent = text;
    container.appendChild(el);
  };

  const addPill = (text, group, value) => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.textContent = text;
    if (group === 'favorite') {
      btn.classList.add('favorite-pill');
      if (activeFilters.favorite) btn.classList.add('active');
      btn.addEventListener('click', () => {
        activeFilters.favorite = !activeFilters.favorite;
        renderAll();
      });
    } else {
      if (activeFilters[group].has(value)) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (activeFilters[group].has(value)) {
          activeFilters[group].delete(value);
        } else {
          activeFilters[group].add(value);
        }
        renderAll();
      });
    }
    container.appendChild(btn);
  };

  const addSep = () => {
    const sep = document.createElement('div');
    sep.className = 'pill-sep';
    container.appendChild(sep);
  };

  // Players
  addLabel('Players');
  for (const p of (filters.players || [])) {
    addPill(String(p), 'players', String(p));
  }
  addSep();

  // Time
  addLabel('Time');
  for (const t of (filters.time || [])) {
    addPill(t, 'time', t);
  }
  addSep();

  // Age
  addLabel('Age');
  for (const a of (filters.age || [])) {
    addPill(a, 'age', a);
  }
  addSep();

  // Style
  addLabel('Style');
  for (const s of (filters.style || [])) {
    addPill(s, 'style', s);
  }
  addSep();

  // Type
  addLabel('Type');
  for (const t of (filters.type || [])) {
    addPill(t, 'type', t);
  }
  addSep();

  // Tags (dynamic from all games)
  const allTags = new Set();
  for (const g of games) {
    for (const t of (g.tags || [])) allTags.add(t);
  }
  if (allTags.size > 0) {
    addLabel('Tags');
    for (const t of [...allTags].sort()) {
      addPill(t, 'tags', t);
    }
    addSep();
  }

  // Favorites
  const favCount = games.filter(g => g.favorite).length;
  addPill(`Favorites (${favCount})`, 'favorite', null);
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------
function getAllImages(game) {
  const imgs = [];
  if (game.images) {
    if (game.images.cover) imgs.push(game.images.cover);
    for (const g of (game.images.gallery || [])) imgs.push(g);
  }
  return imgs;
}

function heroIndexForGame(game) {
  const imgs = getAllImages(game);
  if (imgs.length === 0) return -1;
  const adj = gameImageAdjust[game.slug] || 0;
  return ((globalImageCycle + adj) % imgs.length + imgs.length) % imgs.length;
}

function renderCard(game) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.slug = game.slug;

  const imgs = getAllImages(game);
  const heroIdx = heroIndexForGame(game);

  // Image wrap
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  if (imgs.length > 0) {
    const img = document.createElement('img');
    img.className = 'card-hero-img';
    img.src = imgs[heroIdx];
    img.alt = game.name;
    img.loading = 'lazy';
    imgWrap.appendChild(img);

    if (imgs.length > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'card-img-nav prev';
      prevBtn.innerHTML = '&#9664;';
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        gameImageAdjust[game.slug] = (gameImageAdjust[game.slug] || 0) - 1;
        renderGrid();
      });
      imgWrap.appendChild(prevBtn);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'card-img-nav next';
      nextBtn.innerHTML = '&#9654;';
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        gameImageAdjust[game.slug] = (gameImageAdjust[game.slug] || 0) + 1;
        renderGrid();
      });
      imgWrap.appendChild(nextBtn);
    }
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-img-placeholder';
    placeholder.textContent = '\uD83C\uDFB2';
    imgWrap.appendChild(placeholder);
  }
  imgWrap.addEventListener('click', () => openModal(game));
  card.appendChild(imgWrap);

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = game.name;
  body.appendChild(name);

  // Meta line
  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const players = game.players || [];
  if (players.length > 0) {
    const sp = document.createElement('span');
    sp.textContent = `\u{1F465} ${formatPlayers(players)}`;
    meta.appendChild(sp);
  }
  if (game.time) {
    const sp = document.createElement('span');
    sp.textContent = `\u{23F1} ${game.time}`;
    meta.appendChild(sp);
  }
  if (game.age) {
    const sp = document.createElement('span');
    sp.textContent = `\u{1F464} ${game.age}`;
    meta.appendChild(sp);
  }
  body.appendChild(meta);

  // Badges
  const badges = document.createElement('div');
  badges.className = 'card-badges';
  for (const s of (game.style || [])) {
    const b = document.createElement('span');
    b.className = 'badge badge-style';
    b.textContent = s;
    badges.appendChild(b);
  }
  for (const t of (game.type || [])) {
    const b = document.createElement('span');
    b.className = 'badge badge-type';
    b.textContent = t;
    badges.appendChild(b);
  }
  for (const t of (game.tags || [])) {
    const b = document.createElement('span');
    b.className = 'badge badge-tag';
    b.textContent = t;
    badges.appendChild(b);
  }
  body.appendChild(badges);
  card.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const notesPreview = document.createElement('div');
  notesPreview.className = 'card-notes-preview';
  notesPreview.textContent = game.notes || '';
  footer.appendChild(notesPreview);

  const starBtn = document.createElement('button');
  starBtn.className = 'star-btn' + (game.favorite ? ' starred' : '');
  starBtn.textContent = '\u2B50';
  starBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newVal = !game.favorite;
    await api('PUT', `/api/games/${encodeURIComponent(game.slug)}/favorite`, { favorite: newVal });
    game.favorite = newVal;
    renderAll();
  });
  footer.appendChild(starBtn);
  card.appendChild(footer);

  return card;
}

function formatPlayers(players) {
  if (players.length === 0) return '';
  const nums = players.filter(p => typeof p === 'number').sort((a, b) => a - b);
  const hasPlus = players.includes('8+');
  if (nums.length === 0 && hasPlus) return '8+';
  if (nums.length === 1 && !hasPlus) return String(nums[0]);
  const min = nums[0];
  const max = hasPlus ? '8+' : nums[nums.length - 1];
  return `${min}-${max}`;
}

function renderGrid() {
  const grid = document.getElementById('game-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  if (filteredGames.length === 0) {
    empty.style.display = '';
    grid.style.display = 'none';
  } else {
    empty.style.display = 'none';
    grid.style.display = '';
    for (const game of filteredGames) {
      grid.appendChild(renderCard(game));
    }
  }

  updateStats();
}

function updateStats() {
  document.getElementById('stat-total').textContent = games.length;
  document.getElementById('stat-shown').textContent = filteredGames.length;
  document.getElementById('stat-favorites').textContent = games.filter(g => g.favorite).length;
}

function renderAll() {
  applyFilters();
  buildFilterPills();
  renderGrid();
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
function openModal(game) {
  modalGame = game;
  const imgs = getAllImages(game);
  modalImageIndex = 0;

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('open');

  renderModalImage();
  renderModalDetails();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalGame = null;
}

function renderModalImage() {
  const imgs = getAllImages(modalGame);
  const heroImg = document.getElementById('modal-hero-img');
  const dots = document.getElementById('modal-img-dots');

  if (imgs.length > 0) {
    heroImg.src = imgs[modalImageIndex];
    heroImg.style.display = '';
  } else {
    heroImg.style.display = 'none';
  }

  // Dots
  dots.innerHTML = '';
  for (let i = 0; i < imgs.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'modal-img-dot' + (i === modalImageIndex ? ' active' : '');
    dot.addEventListener('click', () => {
      modalImageIndex = i;
      renderModalImage();
    });
    dots.appendChild(dot);
  }
}

function renderModalDetails() {
  const details = document.getElementById('modal-details');
  const g = modalGame;
  details.innerHTML = '';

  // Title
  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = g.name;
  details.appendChild(title);

  // Name field
  details.appendChild(makeTextField('Name', g.name, 'name'));

  // Players (pill picker)
  details.appendChild(makePillPicker('Players', filters.players || [], g.players || [], 'players'));

  // Time (single select pills)
  details.appendChild(makePillPicker('Time to Play', filters.time || [], g.time ? [g.time] : [], 'time', true));

  // Age (single select pills)
  details.appendChild(makePillPicker('Age Range', filters.age || [], g.age ? [g.age] : [], 'age', true));

  // Style
  details.appendChild(makePillPicker('Style', filters.style || [], g.style || [], 'style'));

  // Type
  details.appendChild(makePillPicker('Type', filters.type || [], g.type || [], 'type'));

  // Tags (pill picker + custom entry)
  const allTags = new Set();
  for (const gm of games) {
    for (const t of (gm.tags || [])) allTags.add(t);
  }
  details.appendChild(makeTagPicker('Tags', [...allTags].sort(), g.tags || []));

  // Notes
  details.appendChild(makeTextArea('Notes', g.notes || '', 'notes'));

  // Links
  details.appendChild(makeLinksEditor(g.links || []));

  // Favorite toggle
  const favField = document.createElement('div');
  favField.className = 'modal-field';
  const favLabel = document.createElement('label');
  favLabel.textContent = 'Favorite';
  favField.appendChild(favLabel);
  const favBtn = document.createElement('button');
  favBtn.className = 'pill' + (g.favorite ? ' active' : '');
  favBtn.textContent = g.favorite ? '\u2B50 Favorite' : '\u2606 Not Favorite';
  favBtn.style.alignSelf = 'flex-start';
  favBtn.addEventListener('click', () => {
    g.favorite = !g.favorite;
    favBtn.classList.toggle('active', g.favorite);
    favBtn.textContent = g.favorite ? '\u2B50 Favorite' : '\u2606 Not Favorite';
  });
  favField.appendChild(favBtn);
  details.appendChild(favField);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'modal-delete-btn';
  deleteBtn.textContent = 'Delete Game';
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${g.name}"? This removes it from the catalog (images are kept on disk).`)) return;
    await api('DELETE', `/api/games/${encodeURIComponent(g.slug)}`);
    games = games.filter(gm => gm.slug !== g.slug);
    closeModal();
    renderAll();
  });
  actions.appendChild(deleteBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-save-btn';
  saveBtn.textContent = 'Save Changes';
  saveBtn.addEventListener('click', () => saveModalChanges());
  actions.appendChild(saveBtn);

  details.appendChild(actions);
}

function makeTextField(label, value, key) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  field.appendChild(lbl);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.dataset.key = key;
  field.appendChild(input);
  return field;
}

function makeTextArea(label, value, key) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  field.appendChild(lbl);
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.dataset.key = key;
  ta.rows = 3;
  field.appendChild(ta);
  return field;
}

function makePillPicker(label, options, selected, key, singleSelect = false) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  field.appendChild(lbl);

  const picker = document.createElement('div');
  picker.className = 'modal-pill-picker';
  picker.dataset.key = key;
  picker.dataset.single = singleSelect ? '1' : '';

  const selectedSet = new Set(selected.map(String));

  for (const opt of options) {
    const pill = document.createElement('button');
    pill.className = 'pill' + (selectedSet.has(String(opt)) ? ' active' : '');
    pill.textContent = String(opt);
    pill.dataset.value = String(opt);
    pill.addEventListener('click', () => {
      if (singleSelect) {
        // Deselect all others
        picker.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      } else {
        pill.classList.toggle('active');
      }
    });
    picker.appendChild(pill);
  }
  field.appendChild(picker);
  return field;
}

function makeTagPicker(label, existingTags, selected) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  field.appendChild(lbl);

  const picker = document.createElement('div');
  picker.className = 'modal-pill-picker';
  picker.dataset.key = 'tags';

  const selectedSet = new Set(selected);
  const allTags = new Set([...existingTags, ...selected]);

  for (const tag of [...allTags].sort()) {
    const pill = document.createElement('button');
    pill.className = 'pill' + (selectedSet.has(tag) ? ' active' : '');
    pill.textContent = tag;
    pill.dataset.value = tag;
    pill.addEventListener('click', () => pill.classList.toggle('active'));
    picker.appendChild(pill);
  }

  // Add custom tag input
  const addRow = document.createElement('div');
  addRow.style.cssText = 'display:flex;gap:0.3rem;margin-top:0.3rem;';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.placeholder = 'New tag...';
  tagInput.style.cssText = 'flex:1;background:var(--bg-deep);border:1px solid var(--border);border-radius:8px;padding:0.3rem 0.6rem;color:var(--text);font-size:0.8rem;font-family:inherit;outline:none;';
  const addBtn = document.createElement('button');
  addBtn.className = 'pill';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => {
    const val = tagInput.value.trim().toLowerCase();
    if (!val) return;
    // Check if pill already exists
    const existing = picker.querySelector(`[data-value="${CSS.escape(val)}"]`);
    if (existing) {
      existing.classList.add('active');
    } else {
      const pill = document.createElement('button');
      pill.className = 'pill active';
      pill.textContent = val;
      pill.dataset.value = val;
      pill.addEventListener('click', () => pill.classList.toggle('active'));
      picker.appendChild(pill);
    }
    tagInput.value = '';
  });
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
  });
  addRow.appendChild(tagInput);
  addRow.appendChild(addBtn);

  field.appendChild(picker);
  field.appendChild(addRow);
  return field;
}

function makeLinksEditor(links) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  const lbl = document.createElement('label');
  lbl.textContent = 'Links';
  field.appendChild(lbl);

  const container = document.createElement('div');
  container.className = 'modal-links';
  container.id = 'modal-links-container';

  for (const link of links) {
    container.appendChild(makeLinkRow(link.label || '', link.url || ''));
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'modal-link-add';
  addBtn.textContent = '+ Add link';
  addBtn.addEventListener('click', () => {
    container.insertBefore(makeLinkRow('', ''), addBtn);
  });
  container.appendChild(addBtn);

  field.appendChild(container);
  return field;
}

function makeLinkRow(label, url) {
  const row = document.createElement('div');
  row.className = 'modal-link-row';
  const labelInput = document.createElement('input');
  labelInput.placeholder = 'Label';
  labelInput.value = label;
  labelInput.dataset.linkField = 'label';
  const urlInput = document.createElement('input');
  urlInput.placeholder = 'URL';
  urlInput.value = url;
  urlInput.dataset.linkField = 'url';
  const removeBtn = document.createElement('button');
  removeBtn.className = 'modal-link-remove';
  removeBtn.textContent = '\u00D7';
  removeBtn.addEventListener('click', () => row.remove());
  row.appendChild(labelInput);
  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  return row;
}

async function saveModalChanges() {
  const details = document.getElementById('modal-details');
  const data = {};

  // Name
  const nameInput = details.querySelector('[data-key="name"]');
  if (nameInput) data.name = nameInput.value.trim();

  // Notes
  const notesInput = details.querySelector('textarea[data-key="notes"]');
  if (notesInput) data.notes = notesInput.value;

  // Pill pickers
  details.querySelectorAll('.modal-pill-picker').forEach(picker => {
    const key = picker.dataset.key;
    const single = picker.dataset.single === '1';
    const activePills = picker.querySelectorAll('.pill.active');
    const values = [...activePills].map(p => p.dataset.value);

    if (key === 'players') {
      data.players = values.map(v => v === '8+' ? '8+' : parseInt(v, 10));
    } else if (single) {
      data[key] = values[0] || '';
    } else {
      data[key] = values;
    }
  });

  // Links
  const links = [];
  document.querySelectorAll('#modal-links-container .modal-link-row').forEach(row => {
    const label = row.querySelector('[data-link-field="label"]').value.trim();
    const url = row.querySelector('[data-link-field="url"]').value.trim();
    if (label || url) links.push({ label, url });
  });
  data.links = links;

  // Favorite
  data.favorite = modalGame.favorite;

  try {
    const updated = await api('PUT', `/api/games/${encodeURIComponent(modalGame.slug)}`, data);
    // Update local game data
    const idx = games.findIndex(g => g.slug === modalGame.slug);
    if (idx >= 0) {
      games[idx] = updated;
    }
    // If slug changed, update
    if (updated.slug !== modalGame.slug) {
      modalGame = updated;
    }
    closeModal();
    renderAll();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Random picker
// ---------------------------------------------------------------------------
function pickRandom() {
  if (filteredGames.length === 0) return;
  const game = filteredGames[Math.floor(Math.random() * filteredGames.length)];

  const overlay = document.getElementById('pick-overlay');
  const card = document.getElementById('pick-card');
  const imgs = getAllImages(game);
  const coverSrc = imgs.length > 0 ? imgs[0] : '';

  card.innerHTML = '';
  if (coverSrc) {
    const img = document.createElement('img');
    img.src = coverSrc;
    img.alt = game.name;
    card.appendChild(img);
  }
  const h2 = document.createElement('h2');
  h2.textContent = game.name;
  card.appendChild(h2);

  const meta = document.createElement('p');
  const parts = [];
  if (game.players && game.players.length) parts.push(`${formatPlayers(game.players)} players`);
  if (game.time) parts.push(game.time);
  if (game.age) parts.push(`Ages ${game.age}`);
  meta.textContent = parts.join(' \u2022 ');
  card.appendChild(meta);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'pick-dismiss';
  dismissBtn.textContent = 'Close';
  dismissBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  card.appendChild(dismissBtn);

  overlay.style.display = '';

  // Highlight the card in the grid
  document.querySelectorAll('.card.picked').forEach(c => c.classList.remove('picked'));
  const gridCard = document.querySelector(`.card[data-slug="${game.slug}"]`);
  if (gridCard) {
    gridCard.classList.add('picked');
    gridCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
let settingsOriginalTheme = '';

function openSettings() {
  settingsOriginalTheme = config.theme;
  document.getElementById('settings-overlay').classList.add('open');
  renderSettings();
}

function closeSettings() {
  document.documentElement.setAttribute('data-theme', settingsOriginalTheme);
  document.getElementById('settings-overlay').classList.remove('open');
}

function renderSettings() {
  const content = document.getElementById('settings-content');
  content.innerHTML = '';

  // Theme section
  const themeTitle = document.createElement('h3');
  themeTitle.textContent = 'Theme';
  content.appendChild(themeTitle);

  const themePicker = document.createElement('div');
  themePicker.className = 'modal-pill-picker';
  themePicker.id = 'settings-theme-picker';
  for (const theme of (config.themes || [])) {
    const pill = document.createElement('button');
    pill.className = 'pill' + (theme === config.theme ? ' active' : '');
    pill.textContent = theme;
    pill.dataset.value = theme;
    pill.addEventListener('click', () => {
      themePicker.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      document.documentElement.setAttribute('data-theme', theme);
    });
    themePicker.appendChild(pill);
  }
  content.appendChild(themePicker);

  // Filter options
  const filtersTitle = document.createElement('h3');
  filtersTitle.textContent = 'Filter Options';
  filtersTitle.style.marginTop = '0.5rem';
  content.appendChild(filtersTitle);

  const categories = [
    { key: 'players', label: 'Players' },
    { key: 'time', label: 'Time' },
    { key: 'age', label: 'Age' },
    { key: 'style', label: 'Style' },
    { key: 'type', label: 'Type' },
  ];

  for (const { key, label } of categories) {
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.dataset.filterKey = key;

    const lbl = document.createElement('label');
    lbl.textContent = label;
    section.appendChild(lbl);

    const items = document.createElement('div');
    items.className = 'settings-filter-items';
    for (const val of (filters[key] || [])) {
      items.appendChild(makeSettingsItem(String(val)));
    }
    section.appendChild(items);

    const addRow = document.createElement('div');
    addRow.className = 'settings-add-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Add ${label.toLowerCase()}...`;
    const addBtn = document.createElement('button');
    addBtn.className = 'pill';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) return;
      items.appendChild(makeSettingsItem(v));
      input.value = '';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });
    addRow.appendChild(input);
    addRow.appendChild(addBtn);
    section.appendChild(addRow);

    content.appendChild(section);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-save-btn';
  saveBtn.textContent = 'Save Settings';
  saveBtn.addEventListener('click', saveSettings);
  actions.appendChild(saveBtn);
  content.appendChild(actions);
}

function makeSettingsItem(value) {
  const item = document.createElement('div');
  item.className = 'settings-filter-item';
  item.dataset.value = value;
  const text = document.createElement('span');
  text.textContent = value;
  item.appendChild(text);
  const btn = document.createElement('button');
  btn.className = 'settings-filter-remove';
  btn.textContent = '\u00D7';
  btn.addEventListener('click', () => item.remove());
  item.appendChild(btn);
  return item;
}

async function saveSettings() {
  const themePicker = document.getElementById('settings-theme-picker');
  const activePill = themePicker.querySelector('.pill.active');
  const newTheme = activePill ? activePill.dataset.value : config.theme;

  const newFilters = {};
  document.querySelectorAll('#settings-content .settings-section[data-filter-key]').forEach(section => {
    const key = section.dataset.filterKey;
    const items = section.querySelectorAll('.settings-filter-item');
    newFilters[key] = [...items].map(item => {
      const val = item.dataset.value;
      if (key === 'players') {
        const num = parseInt(val, 10);
        return isNaN(num) ? val : num;
      }
      return val;
    });
  });

  try {
    if (newTheme !== settingsOriginalTheme) {
      await api('PUT', '/api/config/theme', { theme: newTheme });
      config.theme = newTheme;
    }
    await api('PUT', '/api/defaults', { filters: newFilters });
    filters = newFilters;
    settingsOriginalTheme = config.theme;
    document.getElementById('settings-overlay').classList.remove('open');
    renderAll();
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
function setupEvents() {
  // Search
  const searchInput = document.getElementById('search-input');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTerm = searchInput.value.toLowerCase().trim();
      renderAll();
    }, 200);
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', (e) => {
    const val = e.target.value;
    const sep = val.lastIndexOf('-');
    sortKey = val.substring(0, sep);
    sortAsc = val.substring(sep + 1) === 'asc';
    renderAll();
  });

  // Pick button
  document.getElementById('pick-btn').addEventListener('click', pickRandom);

  // Global gallery nav
  document.getElementById('global-gallery-prev').addEventListener('click', () => {
    globalImageCycle--;
    renderGrid();
  });
  document.getElementById('global-gallery-next').addEventListener('click', () => {
    globalImageCycle++;
    renderGrid();
  });
  document.getElementById('global-gallery-reset').addEventListener('click', () => {
    globalImageCycle = 0;
    gameImageAdjust = {};
    renderGrid();
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Modal image nav
  document.getElementById('modal-img-prev').addEventListener('click', () => {
    const imgs = getAllImages(modalGame);
    if (imgs.length === 0) return;
    modalImageIndex = (modalImageIndex - 1 + imgs.length) % imgs.length;
    renderModalImage();
  });
  document.getElementById('modal-img-next').addEventListener('click', () => {
    const imgs = getAllImages(modalGame);
    if (imgs.length === 0) return;
    modalImageIndex = (modalImageIndex + 1) % imgs.length;
    renderModalImage();
  });

  // Pick overlay dismiss on background click
  document.getElementById('pick-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.style.display = 'none';
    }
  });

  // Settings
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const pickOverlay = document.getElementById('pick-overlay');
      if (pickOverlay.style.display !== 'none') {
        pickOverlay.style.display = 'none';
      } else if (document.getElementById('settings-overlay').classList.contains('open')) {
        closeSettings();
      } else if (document.getElementById('modal-overlay').classList.contains('open')) {
        closeModal();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  try {
    await fetchConfig();
    await fetchGames();
    setupEvents();
    renderAll();
  } catch (err) {
    console.error('Failed to initialize:', err);
    document.getElementById('game-grid').innerHTML =
      `<p style="color:var(--danger);padding:2rem;">Failed to load: ${err.message}</p>`;
  }
}

init();
