/* ─── Vault — content.js ────────────────────────── */
(function () {
  'use strict';

  if (window.__vaultInjected) return;
  window.__vaultInjected = true;

  const hostname = location.hostname;
  let notifEl = null;
  let checkDone = false;

  // ─── Detect login form ────────────────────────────
  function hasPasswordField() {
    return !!document.querySelector('input[type="password"]');
  }

  function runCheck() {
    if (checkDone) return;
    if (!hasPasswordField()) return;
    checkDone = true;
    chrome.runtime.sendMessage({ type: 'CHECK_SITE', hostname }, res => {
      if (chrome.runtime.lastError) return;
      if (res && res.match && res.entries.length > 0) showNotification(res.entries);
    });
  }

  const observer = new MutationObserver(runCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  runCheck();
  window.addEventListener('DOMContentLoaded', runCheck, { once: true });

  // ─── Notification ─────────────────────────────────
  function injectStyles() {
    if (document.getElementById('__vault-styles')) return;
    const s = document.createElement('style');
    s.id = '__vault-styles';
    s.textContent = `
      #__vault-notif {
        all: initial;
        position: fixed !important;
        top: 16px !important;
        right: 16px !important;
        z-index: 2147483647 !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 10px !important;
        background: #fff !important;
        border: 1.5px solid #e2e2e2 !important;
        border-radius: 14px !important;
        padding: 11px 12px 11px 13px !important;
        box-shadow: 0 8px 30px rgba(0,0,0,.12), 0 1px 4px rgba(0,0,0,.05) !important;
        width: 290px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif !important;
        -webkit-font-smoothing: antialiased !important;
        cursor: default !important;
        animation: __vaultIn .22s cubic-bezier(.16,1,.3,1) both !important;
      }
      @keyframes __vaultIn {
        from { opacity: 0; transform: translateX(12px) scale(.97); }
        to   { opacity: 1; transform: translateX(0) scale(1); }
      }
      #__vault-notif.__vault-out {
        animation: __vaultOut .16s ease forwards !important;
      }
      @keyframes __vaultOut {
        to { opacity: 0; transform: translateX(12px) scale(.97); }
      }
      #__vault-icon {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        background: #f5f5f5 !important;
        border: 1px solid #e8e8e8 !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      #__vault-icon svg {
        display: block !important;
        width: 15px !important;
        height: 15px !important;
      }
      #__vault-body {
        flex: 1 !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 1px !important;
      }
      #__vault-title {
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #111 !important;
        letter-spacing: -.1px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        line-height: 1.3 !important;
      }
      #__vault-sub {
        font-size: 11.5px !important;
        color: #999 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        line-height: 1.3 !important;
      }
      #__vault-actions {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 4px !important;
        flex-shrink: 0 !important;
      }
      #__vault-fill {
        all: unset !important;
        box-sizing: border-box !important;
        background: #111 !important;
        color: #fff !important;
        border-radius: 8px !important;
        padding: 6px 12px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif !important;
        cursor: pointer !important;
        line-height: 1 !important;
        white-space: nowrap !important;
        transition: opacity .12s !important;
        display: block !important;
      }
      #__vault-fill:hover { opacity: .8 !important; }
      #__vault-close {
        all: unset !important;
        box-sizing: border-box !important;
        width: 26px !important;
        height: 26px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        color: #bbb !important;
        transition: color .12s, background .12s !important;
      }
      #__vault-close:hover { color: #111 !important; background: #f0f0f0 !important; }
      #__vault-close svg {
        display: block !important;
        width: 14px !important;
        height: 14px !important;
        stroke: currentColor !important;
      }
    `;
    document.documentElement.appendChild(s);
  }

  function showNotification(entries) {
    if (notifEl) return;
    injectStyles();

    const first = entries[0];
    const count = entries.length;

    notifEl = document.createElement('div');
    notifEl.id = '__vault-notif';

    notifEl.innerHTML = `
      <div id="__vault-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div id="__vault-body">
        <div id="__vault-title">${escHtml(first.username || 'Saved login found')}</div>
        <div id="__vault-sub">${count > 1 ? count + ' saved logins' : 'Vault · ' + escHtml(hostname.replace(/^www\./, ''))}</div>
      </div>
      <div id="__vault-actions">
        <button id="__vault-fill">Fill</button>
        <button id="__vault-close" title="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    document.documentElement.appendChild(notifEl);

    notifEl.querySelector('#__vault-fill').addEventListener('click', () => {
      doFill(entries);
      dismiss(true);
    });
    notifEl.querySelector('#__vault-close').addEventListener('click', () => dismiss(false));

    const t = setTimeout(() => dismiss(false), 8000);
    notifEl._clear = () => clearTimeout(t);
  }

  function dismiss(fast) {
    if (!notifEl) return;
    if (notifEl._clear) notifEl._clear();
    if (fast) { notifEl.remove(); notifEl = null; return; }
    notifEl.classList.add('__vault-out');
    setTimeout(() => { notifEl && (notifEl.remove(), notifEl = null); }, 180);
  }

  // ─── Autofill ─────────────────────────────────────
  function doFill(entries) {
    const entry = entries[0];

    // Find password field
    const pwField = document.querySelector('input[type="password"]');
    if (!pwField) return;

    // Find the form scope
    const scope = pwField.closest('form') || document.body;

    // Find username field — broad selector ordered by specificity
    const userField =
      scope.querySelector('input[autocomplete="username"]') ||
      scope.querySelector('input[autocomplete="email"]') ||
      scope.querySelector('input[type="email"]') ||
      scope.querySelector('input[type="text"][name*="user" i]') ||
      scope.querySelector('input[type="text"][name*="email" i]') ||
      scope.querySelector('input[type="text"][name*="login" i]') ||
      scope.querySelector('input[type="text"][id*="user" i]') ||
      scope.querySelector('input[type="text"][id*="email" i]') ||
      scope.querySelector('input[type="text"][placeholder*="email" i]') ||
      scope.querySelector('input[type="text"][placeholder*="user" i]') ||
      scope.querySelector('input[type="text"]');

    // Fill username
    if (userField && entry.username) {
      fillField(userField, entry.username);
    }

    // Fetch the actual password from the session cache in the background worker
    chrome.runtime.sendMessage({ type: 'GET_PASSWORD', id: entry.id }, res => {
      if (chrome.runtime.lastError) return;
      if (res && res.password) {
        fillField(pwField, res.password);
      }
    });
  }

  // Works with React, Vue, Angular — triggers their synthetic event system
  function fillField(el, value) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) {
      setter.set.call(el, value);
    } else {
      el.value = value;
    }
    ['input', 'change', 'keyup', 'keydown'].forEach(t =>
      el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true }))
    );
    el.blur();
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
