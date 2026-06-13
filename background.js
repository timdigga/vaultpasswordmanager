/* ─── Vault — background.js (service worker) ────── */

// Plaintext site index: [{ id, site, username }] — no passwords here
let siteIndex = [];
let isUnlocked = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'VAULT_UNLOCKED') {
    siteIndex = msg.index;
    isUnlocked = true;
    updateBadge(siteIndex.length);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'VAULT_LOCKED') {
    siteIndex = [];
    isUnlocked = false;
    chrome.action.setBadgeText({ text: '' });
    // Wipe all cached passwords from session storage
    chrome.storage.session.clear();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'CHECK_SITE') {
    if (!isUnlocked) { sendResponse({ match: false }); return true; }
    const host = normalise(msg.hostname);
    const matches = siteIndex.filter(e => domainMatch(host, normalise(e.site)));
    sendResponse({ match: matches.length > 0, entries: matches });
    return true;
  }

  // Content script asking for the actual password to fill
  if (msg.type === 'GET_PASSWORD') {
    chrome.storage.session.get('pwCache', data => {
      const cache = data.pwCache || {};
      const pw = cache[msg.id] || null;
      sendResponse({ password: pw });
    });
    return true;
  }

  // Popup → background: store decrypted passwords in session cache (memory-safe)
  if (msg.type === 'CACHE_PASSWORDS') {
    chrome.storage.session.set({ pwCache: msg.cache }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

function normalise(raw) {
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/^www\./, '');
  }
}

function domainMatch(pageHost, savedHost) {
  return pageHost === savedHost || pageHost.endsWith('.' + savedHost);
}

function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count <= 99 ? String(count) : '99+' });
    chrome.action.setBadgeBackgroundColor({ color: '#111111' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}
