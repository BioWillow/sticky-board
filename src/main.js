import './style.css';

const STORAGE_KEY = 'petari-sticky-board-v2';
const LEGACY_STORAGE_KEY = 'petari-sticky-notes-v1';
const THEME_STORAGE_KEY = 'petari-theme';
const COLORS = [
  { key: 'yellow', label: 'イエロー', value: '#f4cf58' },
  { key: 'pink', label: 'ピンク', value: '#f4a9bc' },
  { key: 'blue', label: 'ブルー', value: '#a9ccef' },
  { key: 'green', label: 'グリーン', value: '#a9d9bd' }
];
const board = document.querySelector('#board');
const addButton = document.querySelector('#addNote');
const emptyAddButton = document.querySelector('#emptyAdd');
const emptyState = document.querySelector('#emptyState');
const saveStatus = document.querySelector('#saveStatus');
const addColorMenu = document.querySelector('#addColorMenu');
const searchInput = document.querySelector('#noteSearch');
const searchCount = document.querySelector('#searchCount');
const filterTabs = document.querySelector('#filterTabs');
const completeDropzone = document.querySelector('#completeDropzone');
const projectSelect = document.querySelector('#projectSelect');
const createProjectButton = document.querySelector('#createProject');
const renameProjectButton = document.querySelector('#renameProject');
const deleteProjectButton = document.querySelector('#deleteProject');
const arrangeButton = document.querySelector('#arrangeNotes');
const themeButton = document.querySelector('#themeToggle');

const initialState = loadState();
let notes = initialState.notes;
let projects = initialState.projects;
let activeProjectId = initialState.activeProjectId;
let activeFilter = 'incomplete';
let topZ = notes.reduce((max, note) => Math.max(max, note.z || 1), 1);
let saveTimer;

function getInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === 'dark';
  themeButton.querySelector('span:first-child').textContent = isDark ? '☀' : '☾';
  themeButton.querySelector('span:last-child').textContent = isDark ? 'ライト' : 'ダーク';
  themeButton.setAttribute('aria-label', isDark ? 'ライトテーマに切り替え' : 'ダークテーマに切り替え');
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function normalizeNotes(rawNotes, fallbackProjectId) {
  const allowedColors = COLORS.map(color => color.value);
  return rawNotes.map(note => ({
    ...note,
    projectId: note.projectId || fallbackProjectId,
    color: allowedColors.includes(note.color) ? note.color : COLORS[0].value,
    completed: Boolean(note.completed)
  }));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.projects?.length) {
      const activeId = saved.projects.some(project => project.id === saved.activeProjectId) ? saved.activeProjectId : saved.projects[0].id;
      return { projects: saved.projects, activeProjectId: activeId, notes: normalizeNotes(Array.isArray(saved.notes) ? saved.notes : [], saved.projects[0].id) };
    }

    const defaultProject = { id: makeId(), name: 'マイプロジェクト' };
    const legacyNotes = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    return { projects: [defaultProject], activeProjectId: defaultProject.id, notes: normalizeNotes(Array.isArray(legacyNotes) ? legacyNotes : [], defaultProject.id) };
  } catch {
    const defaultProject = { id: makeId(), name: 'マイプロジェクト' };
    return { projects: [defaultProject], activeProjectId: defaultProject.id, notes: [] };
  }
}

function saveNotes() {
  saveStatus.classList.add('saving');
  saveStatus.innerHTML = '<span aria-hidden="true">●</span> 保存中…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, activeProjectId, notes }));
    saveStatus.classList.remove('saving');
    saveStatus.innerHTML = '<span aria-hidden="true">●</span> 自動保存';
  }, 180);
}

function getNoteSize() {
  return window.innerWidth < 768 ? { width: 180, height: 160 } : window.innerWidth <= 1100 ? { width: 200, height: 175 } : { width: 220, height: 190 };
}

function overlaps(a, b, gap = 12) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function findFreePosition() {
  const { width, height } = getNoteSize();
  const maxX = Math.max(0, board.clientWidth - width);
  const maxY = Math.max(0, board.clientHeight - height);
  const step = window.innerWidth < 768 ? 18 : 26;
  const margin = 16;
  const projectNotes = notes.filter(note => note.projectId === activeProjectId);
  const occupied = projectNotes.map(note => ({ x: note.x * maxX, y: note.y * maxY, width, height }));

  for (let y = margin; y <= maxY; y += step) {
    for (let x = margin; x <= maxX; x += step) {
      const candidate = { x: Math.min(x, maxX), y: Math.min(y, maxY), width, height };
      if (!occupied.some(rect => overlaps(candidate, rect))) return candidate;
    }
  }

  const offset = (projectNotes.length * 24) % Math.max(1, Math.min(maxX, maxY));
  return { x: Math.min(offset, maxX), y: Math.min(offset, maxY), width, height };
}

function colorMenuHtml(selectedColor) {
  return COLORS.map(color => `
    <button class="color-option${color.value === selectedColor ? ' selected' : ''}" type="button" role="menuitem" data-color="${color.value}" aria-label="${color.label}" title="${color.label}">
      <span style="--swatch-color:${color.value}" aria-hidden="true"></span>
      <span>${color.label}</span>
    </button>
  `).join('');
}

function addNote(color = COLORS[0].value) {
  const pos = findFreePosition();
  const maxX = Math.max(1, board.clientWidth - pos.width);
  const maxY = Math.max(1, board.clientHeight - pos.height);
  const note = {
    id: makeId(),
    projectId: activeProjectId,
    text: '',
    x: pos.x / maxX,
    y: pos.y / maxY,
    color,
    completed: false,
    z: ++topZ
  };
  notes.push(note);
  renderNote(note, true);
  updateEmptyState();
  saveNotes();
  applySearch();
}

function renderNote(note, focus = false) {
  const element = document.createElement('article');
  element.className = `note${note.completed ? ' completed' : ''}`;
  element.dataset.id = note.id;
  element.style.setProperty('--note-color', note.color);
  const tiltSeed = [...note.id].reduce((total, char) => total + char.charCodeAt(0), 0);
  const tilt = [-1.4, -0.8, 0.7, 1.2][tiltSeed % 4];
  element.style.setProperty('--note-tilt', `${tilt}deg`);
  element.style.zIndex = note.z;
  element.innerHTML = `
    <div class="note-handle" aria-label="付箋を移動"></div>
    <button class="color-trigger" type="button" aria-label="付箋の色を変更" aria-haspopup="true" aria-expanded="false"><span style="--swatch-color:${note.color}" aria-hidden="true"></span></button>
    <button class="complete-toggle" type="button" aria-label="${note.completed ? '未完了に戻す' : '完了にする'}" aria-pressed="${note.completed}">✓</button>
    <button class="delete-note" type="button" aria-label="付箋を削除">×</button>
    <div class="color-menu note-color-menu" role="menu" aria-label="付箋の色を変更" hidden>${colorMenuHtml(note.color)}</div>
    <textarea class="note-text" aria-label="付箋の内容" placeholder="ここに入力…"></textarea>
  `;
  element.querySelector('.note-text').value = note.text;
  board.append(element);
  positionElement(element, note);

  const textarea = element.querySelector('.note-text');
  const colorTrigger = element.querySelector('.color-trigger');
  const colorMenu = element.querySelector('.note-color-menu');
  const completeToggle = element.querySelector('.complete-toggle');
  textarea.addEventListener('input', () => {
    note.text = textarea.value;
    saveNotes();
    applySearch();
  });
  element.querySelector('.delete-note').addEventListener('click', () => {
    notes = notes.filter(item => item.id !== note.id);
    element.remove();
    updateEmptyState();
    saveNotes();
    applySearch();
  });
  colorTrigger.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = colorMenu.hidden;
    closeAllColorMenus();
    colorMenu.hidden = !willOpen;
    colorTrigger.setAttribute('aria-expanded', String(willOpen));
  });
  colorMenu.addEventListener('click', event => {
    const option = event.target.closest('[data-color]');
    if (!option) return;
    note.color = option.dataset.color;
    element.style.setProperty('--note-color', note.color);
    colorTrigger.querySelector('span').style.setProperty('--swatch-color', note.color);
    colorMenu.innerHTML = colorMenuHtml(note.color);
    colorMenu.hidden = true;
    colorTrigger.setAttribute('aria-expanded', 'false');
    saveNotes();
  });
  completeToggle.addEventListener('click', () => setCompleted(note, element, !note.completed));
  setupDrag(element, note);
  if (focus) requestAnimationFrame(() => textarea.focus());
}

function setCompleted(note, element, completed) {
  note.completed = completed;
  element.classList.toggle('completed', completed);
  const toggle = element.querySelector('.complete-toggle');
  toggle.setAttribute('aria-pressed', String(completed));
  toggle.setAttribute('aria-label', completed ? '未完了に戻す' : '完了にする');
  saveNotes();
  applySearch();
}

function positionElement(element, note) {
  const { width, height } = getNoteSize();
  const maxX = Math.max(0, board.clientWidth - width);
  const maxY = Math.max(0, board.clientHeight - height);
  element.style.left = `${Math.min(Math.max(note.x, 0), 1) * maxX}px`;
  element.style.top = `${Math.min(Math.max(note.y, 0), 1) * maxY}px`;
}

function arrangeNotes() {
  const projectNotes = notes.filter(note => note.projectId === activeProjectId);
  if (!projectNotes.length) return;

  const { width, height } = getNoteSize();
  const gap = window.innerWidth < 768 ? 14 : 22;
  const margin = window.innerWidth < 768 ? 10 : 18;
  const usableWidth = Math.max(width, board.clientWidth - margin * 2);
  const columns = Math.max(1, Math.floor((usableWidth + gap) / (width + gap)));
  const rows = Math.ceil(projectNotes.length / columns);
  const requiredHeight = margin * 2 + rows * height + Math.max(0, rows - 1) * gap;
  if (requiredHeight > board.clientHeight) board.style.height = `${requiredHeight}px`;
  const maxX = Math.max(1, board.clientWidth - width);
  const maxY = Math.max(1, board.clientHeight - height);

  projectNotes.forEach((note, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = Math.min(margin + column * (width + gap), maxX);
    const y = Math.min(margin + row * (height + gap), maxY);
    note.x = x / maxX;
    note.y = y / maxY;
    const element = document.querySelector(`.note[data-id="${CSS.escape(note.id)}"]`);
    if (element) positionElement(element, note);
  });

  arrangeButton.classList.add('arranged');
  window.setTimeout(() => arrangeButton.classList.remove('arranged'), 420);
  saveNotes();
}

function setupDrag(element, note) {
  const handle = element.querySelector('.note-handle');
  handle.addEventListener('pointerdown', event => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const boardRect = board.getBoundingClientRect();
    const noteRect = element.getBoundingClientRect();
    const offsetX = event.clientX - noteRect.left;
    const offsetY = event.clientY - noteRect.top;
    const startX = note.x;
    const startY = note.y;
    element.classList.add('dragging');
    note.z = ++topZ;
    element.style.zIndex = note.z;

    const onMove = moveEvent => {
      const maxX = Math.max(0, board.clientWidth - element.offsetWidth);
      const maxY = Math.max(0, board.clientHeight - element.offsetHeight);
      const x = Math.min(Math.max(moveEvent.clientX - boardRect.left - offsetX, 0), maxX);
      const y = Math.min(Math.max(moveEvent.clientY - boardRect.top - offsetY, 0), maxY);
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      note.x = maxX ? x / maxX : 0;
      note.y = maxY ? y / maxY : 0;
      const dropRect = completeDropzone.getBoundingClientRect();
      const overDropzone = moveEvent.clientX >= dropRect.left && moveEvent.clientX <= dropRect.right && moveEvent.clientY >= dropRect.top && moveEvent.clientY <= dropRect.bottom;
      completeDropzone.classList.toggle('drag-over', overDropzone);
    };
    const onUp = () => {
      const droppedToComplete = completeDropzone.classList.contains('drag-over');
      completeDropzone.classList.remove('drag-over');
      element.classList.remove('dragging');
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (droppedToComplete) {
        note.x = startX;
        note.y = startY;
        positionElement(element, note);
        setCompleted(note, element, true);
      } else {
        saveNotes();
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

function updateEmptyState() {
  emptyState.classList.toggle('hidden', notes.some(note => note.projectId === activeProjectId));
}

function applySearch() {
  const keyword = searchInput.value.trim().toLocaleLowerCase('ja');
  let matched = 0;

  document.querySelectorAll('.note').forEach(element => {
    const note = notes.find(item => item.id === element.dataset.id);
    const matchesProject = note?.projectId === activeProjectId;
    const matchesKeyword = !keyword || note?.text.toLocaleLowerCase('ja').includes(keyword);
    const matchesStatus = activeFilter === 'all' || (activeFilter === 'complete' ? note?.completed : !note?.completed);
    const isMatch = matchesProject && matchesKeyword && matchesStatus;
    element.classList.toggle('search-hidden', !isMatch);
    if (isMatch) matched += 1;
  });

  const projectTotal = notes.filter(note => note.projectId === activeProjectId).length;
  searchCount.value = `${matched} / ${projectTotal} 件`;
  searchCount.textContent = `${matched} / ${projectTotal} 件`;
}

function renderProjectControls() {
  projectSelect.innerHTML = projects.map(project => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('');
  projectSelect.value = activeProjectId;
  deleteProjectButton.disabled = projects.length === 1;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function switchProject(projectId) {
  activeProjectId = projectId;
  searchInput.value = '';
  projectSelect.value = projectId;
  updateEmptyState();
  applySearch();
  saveNotes();
}

function render() {
  renderProjectControls();
  notes.forEach(note => renderNote(note));
  updateEmptyState();
  applySearch();
}

function closeAllColorMenus() {
  document.querySelectorAll('.color-menu').forEach(menu => { menu.hidden = true; });
  document.querySelectorAll('[aria-haspopup="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
}

function openAddColorMenu() {
  const willOpen = addColorMenu.hidden;
  closeAllColorMenus();
  addColorMenu.hidden = !willOpen;
  addButton.setAttribute('aria-expanded', String(willOpen));
}

addColorMenu.innerHTML = colorMenuHtml();
addButton.addEventListener('click', event => {
  event.stopPropagation();
  openAddColorMenu();
});
emptyAddButton.addEventListener('click', event => {
  event.stopPropagation();
  openAddColorMenu();
  addButton.focus();
});
addColorMenu.addEventListener('click', event => {
  const option = event.target.closest('[data-color]');
  if (!option) return;
  addNote(option.dataset.color);
  closeAllColorMenus();
});
document.addEventListener('click', closeAllColorMenus);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAllColorMenus();
});
searchInput.addEventListener('input', applySearch);
arrangeButton.addEventListener('click', arrangeNotes);
themeButton.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
});
filterTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  activeFilter = button.dataset.filter;
  filterTabs.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  applySearch();
});
projectSelect.addEventListener('change', () => switchProject(projectSelect.value));
createProjectButton.addEventListener('click', () => {
  const name = window.prompt('新しいプロジェクト名を入力してください', '新しいプロジェクト')?.trim();
  if (!name) return;
  const project = { id: makeId(), name };
  projects.push(project);
  renderProjectControls();
  switchProject(project.id);
});
renameProjectButton.addEventListener('click', () => {
  const project = projects.find(item => item.id === activeProjectId);
  if (!project) return;
  const name = window.prompt('プロジェクト名を変更してください', project.name)?.trim();
  if (!name) return;
  project.name = name;
  renderProjectControls();
  saveNotes();
});
deleteProjectButton.addEventListener('click', () => {
  const project = projects.find(item => item.id === activeProjectId);
  if (!project || projects.length === 1) return;
  const noteCount = notes.filter(note => note.projectId === project.id).length;
  const message = noteCount ? `「${project.name}」と、その付箋 ${noteCount} 件を削除しますか？` : `「${project.name}」を削除しますか？`;
  if (!window.confirm(message)) return;
  projects = projects.filter(item => item.id !== project.id);
  notes = notes.filter(note => note.projectId !== project.id);
  document.querySelectorAll('.note').forEach(element => {
    if (!notes.some(note => note.id === element.dataset.id)) element.remove();
  });
  activeProjectId = projects[0].id;
  renderProjectControls();
  updateEmptyState();
  applySearch();
  saveNotes();
});
window.addEventListener('resize', () => {
  document.querySelectorAll('.note').forEach(element => {
    const note = notes.find(item => item.id === element.dataset.id);
    if (note) positionElement(element, note);
  });
});

setTheme(getInitialTheme());
render();
