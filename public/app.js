/* wb-note UI — vanilla JS, no build step. */

const API = '/api/notes';

const $ = (id) => document.getElementById(id);
const listEl = $('note-list');
const listEmptyEl = $('list-empty');
const toolbarEl = $('toolbar');
const titleEl = $('title-input');
const renderedEl = $('rendered');
const editorEl = $('editor');
const emptyStateEl = $('empty-state');
const saveBtn = $('save');
const editBtn = $('toggle-edit');
const deleteBtn = $('delete');
const toastEl = $('toast');

/** @type {Array<{id:string,title:string,body:string,createdAt:string,updatedAt:string}>} */
let notes = [];
let currentId = null;
let editing = false;
let dirty = false;

/* ---------------------------------------------------------------- helpers */

async function api(method, path = '', body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // The API's error handler returns { error, details? }.
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `${method} ${path} failed (${res.status})`);
  }

  return res.status === 204 ? null : res.json();
}

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
}

function formatStamp(iso) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Markdown → HTML.
 *
 * marked does NOT escape raw HTML and happily emits `javascript:` hrefs, so its
 * output is untrusted and must be sanitised before it reaches innerHTML.
 *
 * If either library failed to load (CDN down, SRI mismatch), fall back to plain
 * text. Never fall back to raw HTML — that would turn an outage into an XSS hole.
 */
function renderMarkdown(md, target) {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    target.textContent = md;
    toast('Markdown libraries failed to load — showing plain text.');
    return;
  }
  target.innerHTML = DOMPurify.sanitize(marked.parse(md));
}

function setDirty(value) {
  dirty = value;
  saveBtn.disabled = !value;
}

/* ------------------------------------------------------------------- view */

function renderSidebar() {
  listEl.replaceChildren();
  listEmptyEl.hidden = notes.length > 0;

  for (const note of notes) {
    const li = document.createElement('li');

    // A real <button>, not a clickable <li>: gives keyboard focus, Enter/Space
    // activation and the right role for free.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = note.id;
    if (note.id === currentId) btn.setAttribute('aria-current', 'true');

    // textContent, never innerHTML: a note titled `<img onerror=...>` would
    // otherwise execute right here in the sidebar.
    btn.textContent = note.title;

    const stamp = document.createElement('span');
    stamp.className = 'stamp';
    stamp.textContent = formatStamp(note.updatedAt);
    btn.append(stamp);

    btn.addEventListener('click', () => selectNote(note.id));
    li.append(btn);
    listEl.append(li);
  }
}

function setMode(edit) {
  editing = edit;
  editorEl.hidden = !edit;
  renderedEl.hidden = edit;
  editBtn.textContent = edit ? 'Preview' : 'Edit';
  if (edit) editorEl.focus();
}

function showNote(note) {
  toolbarEl.hidden = false;
  emptyStateEl.hidden = true;

  titleEl.value = note.title;
  editorEl.value = note.body;
  renderMarkdown(note.body, renderedEl);
  setMode(false);
  setDirty(false);
}

function showEmptyState() {
  currentId = null;
  toolbarEl.hidden = true;
  renderedEl.hidden = true;
  editorEl.hidden = true;
  emptyStateEl.hidden = false;
  setDirty(false);
}

/* ---------------------------------------------------------------- actions */

function confirmDiscard() {
  return !dirty || confirm('Discard unsaved changes?');
}

function selectNote(id) {
  if (id === currentId) return;
  if (!confirmDiscard()) return;

  const note = notes.find((n) => n.id === id);
  if (!note) return;

  currentId = id;
  showNote(note);
  renderSidebar();
}

async function loadNotes() {
  try {
    notes = await api('GET');
    renderSidebar();
  } catch (err) {
    toast(err.message);
  }
}

async function createNote() {
  if (!confirmDiscard()) return;

  try {
    // The API rejects an empty title with 400, so seed a placeholder.
    const note = await api('POST', '', { title: 'Untitled', body: '' });
    notes.unshift(note);
    currentId = note.id;
    renderSidebar();
    showNote(note);
    setMode(true);
    titleEl.select();
  } catch (err) {
    toast(err.message);
  }
}

async function saveNote() {
  if (!currentId || !dirty) return;

  const title = titleEl.value.trim();
  if (title.length === 0) {
    toast('Title must not be empty.');
    titleEl.focus();
    return;
  }

  try {
    const updated = await api('PATCH', `/${currentId}`, { title, body: editorEl.value });

    // Replace in place, then re-sort newest-first to match the server's ordering.
    notes = notes.map((n) => (n.id === updated.id ? updated : n));
    notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    renderSidebar();
    renderMarkdown(updated.body, renderedEl);
    setDirty(false);
  } catch (err) {
    toast(err.message);
  }
}

async function deleteNote() {
  if (!currentId) return;
  if (!confirm('Delete this note?')) return;

  try {
    await api('DELETE', `/${currentId}`);
    notes = notes.filter((n) => n.id !== currentId);
    showEmptyState();
    renderSidebar();
  } catch (err) {
    toast(err.message);
  }
}

/* ------------------------------------------------------------------ wiring */

$('new-note').addEventListener('click', createNote);
saveBtn.addEventListener('click', saveNote);
deleteBtn.addEventListener('click', deleteNote);

editBtn.addEventListener('click', () => {
  // Re-render on the way back to preview so it reflects unsaved edits.
  if (editing) renderMarkdown(editorEl.value, renderedEl);
  setMode(!editing);
});

titleEl.addEventListener('input', () => setDirty(true));
editorEl.addEventListener('input', () => setDirty(true));

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    void saveNote();
  }
});

// Browsers ignore custom text here, but returnValue still triggers the prompt.
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

void loadNotes();
