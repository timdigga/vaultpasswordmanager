/* ─── Vault — popup.js ──────────────────────────── */

// ─── Crypto helpers ───────────────────────────────
const enc = s => new TextEncoder().encode(s);
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const keyMat = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(text));
  return b64(iv) + '.' + b64(ct);
}

async function decrypt(data, key) {
  const [ivB64, ctB64] = data.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
  return new TextDecoder().decode(plain);
}

async function hashPassword(pw, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pw, salt);
  const check = await encrypt('__vault_check__', key);
  return { saltB64: b64(salt), check };
}

// ─── Storage helpers ──────────────────────────────
const store = {
  get: keys => new Promise(r => chrome.storage.local.get(keys, r)),
  set: obj  => new Promise(r => chrome.storage.local.set(obj, r)),
};

// ─── State ────────────────────────────────────────
let sessionKey  = null;   // AES-GCM CryptoKey, lives only in memory
let sessionSalt = null;
let allEntries  = [];
let editingId   = null;

// ─── DOM refs ─────────────────────────────────────
const $ = id => document.getElementById(id);

const screens = {
  lock:  $('lock-screen'),
  setup: $('setup-screen'),
  main:  $('main-screen'),
  form:  $('form-screen'),
};

function show(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ─── Toast ────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── Eye toggle helper ────────────────────────────
function bindEye(btnId, inputId) {
  const btn = $(btnId), inp = $(inputId);
  btn.addEventListener('click', () => {
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });
}

// ─── Favicon helper ───────────────────────────────
function faviconEl(site) {
  const div = document.createElement('div');
  div.className = 'entry-favicon';
  try {
    const domain = new URL(site.startsWith('http') ? site : `https://${site}`).hostname;
    const img = document.createElement('img');
    img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    img.onerror = () => { div.textContent = site.charAt(0).toUpperCase(); img.remove(); };
    div.appendChild(img);
  } catch {
    div.textContent = site.charAt(0).toUpperCase();
  }
  return div;
}

// ─── Password generator ───────────────────────────
function generatePassword(len = 18) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+=?';
  let pw = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  arr.forEach(n => pw += chars[n % chars.length]);
  return pw;
}

// ─── Render entries ───────────────────────────────
function renderEntries(entries) {
  const list = $('entries-list');
  const empty = $('empty-state');

  // Remove old cards
  list.querySelectorAll('.entry-card').forEach(c => c.remove());

  if (!entries.length) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const info = document.createElement('div');
    info.className = 'entry-info';
    const site = document.createElement('div');
    site.className = 'entry-site';
    site.textContent = entry.site;
    const user = document.createElement('div');
    user.className = 'entry-user';
    user.textContent = entry.username || '—';
    info.appendChild(site);
    info.appendChild(user);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'entry-copy';
    copyBtn.title = 'Copy password';
    copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    copyBtn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(entry.password);
        toast('Password copied');
      } catch { toast('Copy failed'); }
    });

    card.appendChild(faviconEl(entry.site));
    card.appendChild(info);
    card.appendChild(copyBtn);

    card.addEventListener('click', () => openForm(entry));
    list.appendChild(card);
  });
}

// ─── Load & decrypt entries ───────────────────────
async function loadEntries() {
  const { encEntries } = await store.get('encEntries');
  if (!encEntries) { allEntries = []; renderEntries([]); return; }
  try {
    const json = await decrypt(encEntries, sessionKey);
    allEntries = JSON.parse(json);
    renderEntries(allEntries);
  } catch { toast('Decryption error'); }
}

// ─── Save & encrypt entries ───────────────────────
async function saveEntries() {
  const json = JSON.stringify(allEntries);
  const enc2 = await encrypt(json, sessionKey);
  await store.set({ encEntries: enc2 });
  broadcastIndex();
}

// ─── Form ─────────────────────────────────────────
function openForm(entry = null) {
  editingId = entry ? entry.id : null;
  $('form-title-label').textContent = entry ? 'Edit entry' : 'New entry';
  $('field-site').value   = entry ? entry.site     : '';
  $('field-user').value   = entry ? entry.username : '';
  $('field-pass').value   = entry ? entry.password : '';
  $('field-notes').value  = entry ? (entry.notes || '') : '';
  $('field-pass').type    = 'password';
  $('form-error').textContent = '';
  $('delete-entry-btn').style.display = entry ? 'block' : 'none';
  show('form');
}

$('back-to-main').addEventListener('click', () => show('main'));

$('generate-btn').addEventListener('click', () => {
  $('field-pass').value = generatePassword();
  $('field-pass').type  = 'text';
});

$('save-entry-btn').addEventListener('click', async () => {
  const site     = $('field-site').value.trim();
  const username = $('field-user').value.trim();
  const password = $('field-pass').value;
  const notes    = $('field-notes').value.trim();

  if (!site)     { $('form-error').textContent = 'Site is required.'; return; }
  if (!password) { $('form-error').textContent = 'Password is required.'; return; }

  if (editingId) {
    const idx = allEntries.findIndex(e => e.id === editingId);
    if (idx !== -1) allEntries[idx] = { id: editingId, site, username, password, notes };
  } else {
    allEntries.push({ id: crypto.randomUUID(), site, username, password, notes });
  }
  await saveEntries();
  toast(editingId ? 'Entry updated' : 'Entry saved');
  renderEntries(filterEntries($('search-input').value));
  show('main');
});

$('delete-entry-btn').addEventListener('click', async () => {
  allEntries = allEntries.filter(e => e.id !== editingId);
  await saveEntries();
  toast('Entry deleted');
  renderEntries(filterEntries($('search-input').value));
  show('main');
});

// ─── Search ───────────────────────────────────────
function filterEntries(query) {
  if (!query) return allEntries;
  const q = query.toLowerCase();
  return allEntries.filter(e =>
    e.site.toLowerCase().includes(q) ||
    (e.username && e.username.toLowerCase().includes(q))
  );
}

$('search-input').addEventListener('input', e => {
  renderEntries(filterEntries(e.target.value));
});

// ─── Main screen buttons ──────────────────────────
$('add-btn').addEventListener('click', () => openForm());
$('lock-btn').addEventListener('click', () => {
  sessionKey = null;
  allEntries = [];
  $('master-input').value = '';
  chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' });
  show('lock');
});

// ─── Lock screen ──────────────────────────────────
$('unlock-btn').addEventListener('click', unlock);
$('master-input').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
$('setup-link').addEventListener('click', () => show('setup'));

async function unlock() {
  const pw = $('master-input').value;
  if (!pw) { $('lock-error').textContent = 'Enter your master password.'; return; }

  const { masterSalt, masterCheck } = await store.get(['masterSalt', 'masterCheck']);
  if (!masterSalt) { $('lock-error').textContent = 'No master password set.'; return; }

  try {
    const key = await deriveKey(pw, unb64(masterSalt));
    const val = await decrypt(masterCheck, key);
    if (val !== '__vault_check__') throw new Error();
    sessionKey = key;
    sessionSalt = masterSalt;
    $('lock-error').textContent = '';
    $('master-input').value = '';
    await loadEntries();
    broadcastIndex();
    highlightCurrentTab();
    show('main');
  } catch {
    $('lock-error').textContent = 'Incorrect password.';
    $('master-input').value = '';
    $('master-input').focus();
  }
}

// ─── Setup screen ─────────────────────────────────
$('back-to-lock').addEventListener('click', () => show('lock'));

$('save-master-btn').addEventListener('click', async () => {
  const pw  = $('setup-pw').value;
  const pw2 = $('setup-confirm').value;
  if (!pw)         { $('setup-error').textContent = 'Enter a password.'; return; }
  if (pw.length < 8) { $('setup-error').textContent = 'Must be at least 8 characters.'; return; }
  if (pw !== pw2)  { $('setup-error').textContent = 'Passwords don\'t match.'; return; }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = b64(salt);
  const key = await deriveKey(pw, salt);
  const check = await encrypt('__vault_check__', key);

  await store.set({ masterSalt: saltB64, masterCheck: check });
  sessionKey  = key;
  sessionSalt = saltB64;
  allEntries  = [];
  $('setup-pw').value = '';
  $('setup-confirm').value = '';
  $('setup-error').textContent = '';
  toast('Master password saved');
  broadcastIndex();
  show('main');
});

// ─── Eye toggles ──────────────────────────────────
bindEye('toggle-master',     'master-input');
bindEye('toggle-field-pass', 'field-pass');

// ─── Broadcast site index to background ──────────
function broadcastIndex() {
  // Site index (no passwords) — for domain matching in content script
  const index = allEntries.map(e => ({ id: e.id, site: e.site, username: e.username || '' }));
  chrome.runtime.sendMessage({ type: 'VAULT_UNLOCKED', index });

  // Password cache in chrome.storage.session — cleared on browser close or vault lock
  const cache = {};
  allEntries.forEach(e => { cache[e.id] = e.password; });
  chrome.runtime.sendMessage({ type: 'CACHE_PASSWORDS', cache });
}

// ─── Highlight matches for the active tab ─────────
async function highlightCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const url = new URL(tab.url);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    const matches = allEntries.filter(e => {
      try {
        const saved = new URL(e.site.startsWith('http') ? e.site : `https://${e.site}`)
          .hostname.replace(/^www\./, '').toLowerCase();
        return host === saved || host.endsWith('.' + saved);
      } catch {
        return e.site.toLowerCase().replace(/^www\./, '') === host;
      }
    });

    const banner = $('tab-match-banner');
    if (!banner) return;

    if (matches.length > 0) {
      const m = matches[0];
      banner.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span class="tab-match-text">${m.username || m.site}</span>
        <span class="tab-match-domain">${host}</span>
      `;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  } catch { /* non-http tabs */ }
}

// ─── Init ─────────────────────────────────────────
(async () => {
  const { masterSalt } = await store.get('masterSalt');
  if (!masterSalt) {
    show('setup');
  } else {
    show('lock');
    setTimeout(() => $('master-input').focus(), 50);
  }
})();
