/* SHIMOGY Investment Group Ltd — Progressive Web App Install, Offline Status & Real-Time Notification Engine */
(function () {
  'use strict';

  var SEEN_FEED_KEY = 'shimogy_pwa_seen_feed_v1';
  var NOTIFIED_IDS_KEY = 'shimogy_pwa_notified_ids_v1';
  var LOAN_OS_ALERT_PREFIX = 'shimogy_loan_os_alert_';

  var deferredPrompt = null;
  var swRegistration = null;
  var isInstalled = false;
  var isIOS = false;
  var pollTimer = null;
  var broadcastChannel = null;

  try {
    if (typeof BroadcastChannel === 'function') {
      broadcastChannel = new BroadcastChannel('shimogy_live_alerts');
    }
  } catch (_e) {}

  function escapeHtml(str) {
    if (window.ShimogySite && typeof window.ShimogySite.escapeHtml === 'function') {
      return window.ShimogySite.escapeHtml(str);
    }
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isHttpOrigin() {
    return Boolean(window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:'));
  }

  function detectPlatform() {
    try {
      isInstalled =
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true;
    } catch (_e) {
      isInstalled = false;
    }
    var ua = String((window.navigator && window.navigator.userAgent) || '').toLowerCase();
    isIOS = /iphone|ipad|ipod/.test(ua);
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function getStoredJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_e) {
      return fallback;
    }
  }

  function setStoredJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_e) {}
  }

  function getToastStack() {
    var stack = document.getElementById('shimogyLiveAlertStack');
    if (!stack && document.body) {
      stack = document.createElement('div');
      stack.id = 'shimogyLiveAlertStack';
      stack.className = 'pwa-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showInAppAlert(title, message, href, actionLabel) {
    var stack = getToastStack();
    if (!stack) return;
    while (stack.children.length >= 3) {
      stack.removeChild(stack.firstChild);
    }
    var card = document.createElement('div');
    card.className = 'pwa-toast-card';
    var ctaHtml = href
      ? '<a href="' + escapeHtml(href) + '" class="pwa-toast-link">' + escapeHtml(actionLabel || 'Open') + '</a>'
      : '';
    card.innerHTML =
      '<div class="pwa-toast-head">' +
        '<span class="pwa-toast-dot" aria-hidden="true"></span>' +
        '<strong>' + escapeHtml(title) + '</strong>' +
        '<button type="button" class="pwa-toast-close" aria-label="Dismiss notification">&times;</button>' +
      '</div>' +
      '<p class="pwa-toast-body">' + escapeHtml(message) + '</p>' +
      (ctaHtml ? '<div class="pwa-toast-actions">' + ctaHtml + '</div>' : '');

    var closeBtn = card.querySelector('.pwa-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (card.parentNode) card.parentNode.removeChild(card);
      });
    }
    stack.appendChild(card);
    setTimeout(function () {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 9500);
  }

  function showDeviceNotification(title, body, url, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return Promise.resolve(false);
    }
    var opts = {
      body: String(body || ''),
      icon: './pwa-192x192.png',
      badge: './pwa-192x192.png',
      tag: String(tag || 'shimogy-alert'),
      renotify: true,
      vibrate: [160, 80, 160],
      data: { url: url || './index.html' }
    };

    if (swRegistration && typeof swRegistration.showNotification === 'function') {
      return swRegistration.showNotification(title, opts).then(function () {
        return true;
      }).catch(function () {
        try {
          new Notification(title, opts);
          return true;
        } catch (_e) {
          return false;
        }
      });
    }

    if ('serviceWorker' in navigator && isHttpOrigin()) {
      return navigator.serviceWorker.ready.then(function (reg) {
        swRegistration = reg;
        return reg.showNotification(title, opts).then(function () { return true; });
      }).catch(function () {
        try {
          new Notification(title, opts);
          return true;
        } catch (_e) {
          return false;
        }
      });
    }

    try {
      new Notification(title, opts);
      return Promise.resolve(true);
    } catch (_e) {
      return Promise.resolve(false);
    }
  }

  function notifyLive(title, body, url, tag, actionLabel) {
    showInAppAlert(title, body, url, actionLabel || 'View');
    return showDeviceNotification(title, body, url, tag);
  }

  function syncInstallButtons() {
    var btns = document.querySelectorAll('.pwa-install-btn, #pwaInstallNavBtn');
    btns.forEach(function (btn) {
      if (isInstalled) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'inline-flex';
        btn.setAttribute('data-ready', deferredPrompt ? 'true' : 'guide');
        var labelSpan = btn.querySelector('.pwa-install-label');
        if (labelSpan) {
          labelSpan.textContent = isIOS && !deferredPrompt ? 'Add App' : 'Install App';
        }
      }
    });
  }

  function ensureInstallGuideModal() {
    var modal = document.getElementById('pwaInstallGuideModal');
    if (modal) return modal;
    if (!document.body) return null;
    modal = document.createElement('div');
    modal.id = 'pwaInstallGuideModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'pwaInstallGuideTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<div class="modal-dialog">' +
        '<div class="modal-header">' +
          '<h3 id="pwaInstallGuideTitle">Install SHIMOGY App</h3>' +
          '<button type="button" id="closePwaGuideBtn" class="modal-close-btn" aria-label="Close modal">&times;</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
          '<img src="pwa-192x192.png" alt="SHIMOGY app icon" width="52" height="52" style="border-radius:12px;border:1px solid var(--border-light);background:#F7F7F7;" />' +
          '<div>' +
            '<div style="font-weight:700;color:var(--text-heading);">SHIMOGY Investment Group</div>' +
            '<div style="font-size:0.84rem;color:var(--text-muted);">Fast home-screen launch, offline viewing &amp; real-time alerts</div>' +
          '</div>' +
        '</div>' +
        '<div id="pwaInstallGuideSteps" style="font-size:0.9rem;color:var(--text-secondary);line-height:1.65;margin-bottom:16px;"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">' +
          '<button type="button" id="pwaGuideNativeRetryBtn" class="btn btn-primary btn-sm" style="display:none;">Install Now</button>' +
          '<button type="button" id="pwaGuideDoneBtn" class="btn btn-outline btn-sm">Got It</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    var closeModal = function () {
      if (window.ShimogySite && typeof window.ShimogySite.closeModal === 'function') {
        window.ShimogySite.closeModal(modal);
      } else {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
      }
    };
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    var closeBtn = document.getElementById('closePwaGuideBtn');
    var doneBtn = document.getElementById('pwaGuideDoneBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (doneBtn) doneBtn.addEventListener('click', closeModal);
    return modal;
  }

  function openInstallGuide() {
    var modal = ensureInstallGuideModal();
    if (!modal) return;
    var stepsEl = document.getElementById('pwaInstallGuideSteps');
    var retryBtn = document.getElementById('pwaGuideNativeRetryBtn');
    var ua = String((window.navigator && window.navigator.userAgent) || '').toLowerCase();
    var isAndroid = /android/.test(ua);

    if (stepsEl) {
      if (!isHttpOrigin()) {
        stepsEl.innerHTML =
          '<p>You are currently viewing a local file (<code style="font-size:0.82rem;">file://</code>). All pages, Client Portal, and local updates work normally.</p>' +
          '<p style="margin-top:8px;">To install as a Chrome/Phone home-screen app with background push notifications, open this website via your live web link (HTTPS) or local server, then click <strong>Install App</strong>.</p>';
      } else if (isIOS) {
        stepsEl.innerHTML =
          '<ol style="padding-left:18px;margin:0;display:grid;gap:8px;">' +
            '<li>Tap the <strong>Share</strong> icon (square with upward arrow) at the bottom or top of Safari.</li>' +
            '<li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>' +
            '<li>Tap <strong>Add</strong> — SHIMOGY will launch like a native iPhone/iPad app.</li>' +
          '</ol>';
      } else if (isAndroid) {
        stepsEl.innerHTML =
          '<ol style="padding-left:18px;margin:0;display:grid;gap:8px;">' +
            '<li>Open the browser menu (<strong>&#8942;</strong>) in the top-right corner of Chrome.</li>' +
            '<li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>' +
            '<li>Confirm <strong>Install</strong> to place SHIMOGY on your phone home screen.</li>' +
          '</ol>';
      } else {
        stepsEl.innerHTML =
          '<ol style="padding-left:18px;margin:0;display:grid;gap:8px;">' +
            '<li>Look for the <strong>Install</strong> icon on the right side of the Chrome / Edge address bar, or open <strong>Chrome Menu &#8942; &rarr; Cast, save, and share &rarr; Install page as app</strong>.</li>' +
            '<li>Click <strong>Install</strong> to open SHIMOGY in its own standalone window.</li>' +
          '</ol>';
      }
    }

    if (retryBtn) {
      if (deferredPrompt) {
        retryBtn.style.display = 'inline-flex';
        retryBtn.onclick = function () { triggerInstall(); };
      } else {
        retryBtn.style.display = 'none';
      }
    }

    if (window.ShimogySite && typeof window.ShimogySite.openModal === 'function') {
      window.ShimogySite.openModal(modal);
    } else {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function triggerInstall() {
    if (isInstalled) return Promise.resolve(true);
    if (deferredPrompt) {
      var promptEvt = deferredPrompt;
      deferredPrompt = null;
      syncInstallButtons();
      return Promise.resolve(promptEvt.prompt()).then(function () {
        return promptEvt.userChoice;
      }).then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          isInstalled = true;
          syncInstallButtons();
          var modal = document.getElementById('pwaInstallGuideModal');
          if (modal && window.ShimogySite) window.ShimogySite.closeModal(modal);
          return true;
        }
        return false;
      }).catch(function () {
        openInstallGuide();
        return false;
      });
    }
    openInstallGuide();
    return Promise.resolve(false);
  }

  function bindInstallButtons() {
    document.querySelectorAll('.pwa-install-btn, #pwaInstallNavBtn').forEach(function (btn) {
      if (btn.dataset.pwaBound) return;
      btn.dataset.pwaBound = '1';
      btn.addEventListener('click', function () {
        triggerInstall();
      });
    });
    syncInstallButtons();
  }

  function syncOfflineIndicator() {
    var online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    var existing = document.getElementById('shimogyOfflinePill');
    if (online) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    if (!existing && document.body) {
      existing = document.createElement('div');
      existing.id = 'shimogyOfflinePill';
      existing.className = 'pwa-offline-banner';
      existing.setAttribute('role', 'status');
      existing.innerHTML = '<span class="pwa-offline-dot" aria-hidden="true"></span><span>Offline Mode — Cached data active</span>';
      document.body.appendChild(existing);
    }
  }

  function getAuthHeaderForPush() {
    try {
      var mTok = localStorage.getItem('shimogy_member_token') || '';
      if (mTok && mTok.indexOf('cloud_') !== 0) {
        return { Authorization: 'Bearer ' + mTok };
      }
    } catch (_e) {}
    return {};
  }

  function syncPushSubscription() {
    if (!isHttpOrigin() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return Promise.resolve({ ok: false, reason: 'unsupported' });
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return Promise.resolve({ ok: false, reason: 'permission' });
    }
    var apiFetch = (window.ShimogySite && window.ShimogySite.apiFetch) || window.fetch.bind(window);
    return navigator.serviceWorker.ready.then(function (reg) {
      swRegistration = reg;
      return apiFetch('/api/pwa/vapid-public-key', { cache: 'no-store' }).then(function (r) {
        return r.json().catch(function () { return {}; });
      }).then(function (cfg) {
        if (!cfg || !cfg.publicKey) {
          return { ok: true, localOnly: true };
        }
        return reg.pushManager.getSubscription().then(function (existingSub) {
          if (existingSub) return existingSub;
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(cfg.publicKey)
          });
        }).then(function (sub) {
          if (!sub) return { ok: false };
          var headers = Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaderForPush());
          return apiFetch('/api/pwa/subscribe', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub })
          }).then(function (res) {
            return res.json().catch(function () { return { success: true }; });
          });
        });
      });
    }).catch(function () {
      return { ok: false };
    });
  }

  function enableNotifications() {
    if (!('Notification' in window)) {
      showInAppAlert('In-App Alerts Active', 'Browser OS notifications are not supported here, so alerts will appear directly in this app.', '', '');
      return Promise.resolve({ permission: 'unsupported' });
    }
    var reqPerm = function () {
      if (Notification.permission === 'granted') return Promise.resolve('granted');
      if (Notification.permission === 'denied') return Promise.resolve('denied');
      return Notification.requestPermission();
    };
    return reqPerm().then(function (perm) {
      window.dispatchEvent(new CustomEvent('shimogy:notif-permission', { detail: { permission: perm } }));
      if (perm !== 'granted') {
        if (perm === 'denied') {
          showInAppAlert('Notifications Blocked', 'Enable notifications for SHIMOGY in your browser site settings to receive lock-screen loan & update alerts.', '', '');
        }
        return { permission: perm };
      }
      return syncPushSubscription().then(function (subRes) {
        showDeviceNotification(
          'SHIMOGY Real-Time Alerts Enabled',
          'You will now receive instant updates, loan repayment reminders, and cycle alerts on this device.',
          './dashboard.html',
          'shimogy-enabled'
        );
        return { permission: perm, subscription: subRes };
      });
    });
  }

  function processSiteDataDiff(data) {
    if (!data || typeof data !== 'object') return;
    var updates = Array.isArray(data.updates) ? data.updates : [];
    var plans = Array.isArray(data.plans) ? data.plans : [];
    var cycles = Array.isArray(data.publicCycles) ? data.publicCycles : [];
    var settings = data.settings || {};

    var maxUpdId = updates.reduce(function (m, u) { return Math.max(m, Number(u.id || 0)); }, 0);
    var maxPlanId = plans.reduce(function (m, p) { return Math.max(m, Number(p.id || 0)); }, 0);
    var maxCycId = cycles.reduce(function (m, c) { return Math.max(m, Number(c.id || 0)); }, 0);
    var ticker = String(settings.quick_updates_ticker || '').trim();

    var prev = getStoredJson(SEEN_FEED_KEY, null);
    var next = {
      maxUpdId: maxUpdId,
      maxPlanId: maxPlanId,
      maxCycId: maxCycId,
      ticker: ticker,
      ts: Date.now()
    };

    if (!prev) {
      setStoredJson(SEEN_FEED_KEY, next);
      return;
    }

    if (maxUpdId > Number(prev.maxUpdId || 0)) {
      var newestUpd = updates.find(function (u) { return Number(u.id || 0) === maxUpdId; }) || updates[0];
      if (newestUpd) {
        notifyLive(
          'New Update: ' + (newestUpd.title || 'SHIMOGY Announcement'),
          newestUpd.excerpt || 'Open the Updates page to read the latest announcement.',
          './updates.html',
          'upd-' + maxUpdId,
          'Read Update'
        );
      }
    } else if (ticker && prev.ticker !== undefined && ticker !== prev.ticker) {
      notifyLive(
        'SHIMOGY Quick Update',
        ticker.slice(0, 220),
        './updates.html',
        'ticker-' + Date.now(),
        'View Updates'
      );
    }

    if (maxPlanId > Number(prev.maxPlanId || 0)) {
      var newestPlan = plans.find(function (p) { return Number(p.id || 0) === maxPlanId; }) || plans[0];
      if (newestPlan) {
        notifyLive(
          'New Investment Plan: ' + (newestPlan.name || 'Plan Open'),
          'Browse the new SHIMOGY business investment opportunity.',
          './investments.html',
          'plan-' + maxPlanId,
          'View Plan'
        );
      }
    }

    if (maxCycId > Number(prev.maxCycId || 0)) {
      var newestCyc = cycles.find(function (c) { return Number(c.id || 0) === maxCycId; }) || cycles[0];
      if (newestCyc) {
        notifyLive(
          'New Savings Cycle: ' + (newestCyc.name || 'Cycle Open'),
          'A new SHIMOGY community savings cycle is now open.',
          './cycles.html',
          'cyc-' + maxCycId,
          'View Cycle'
        );
      }
    }

    setStoredJson(SEEN_FEED_KEY, next);
  }

  function processMemberSnapshot(member) {
    if (!member) return;
    var notifs = Array.isArray(member.notifications) ? member.notifications : [];
    var seenNotifs = getStoredJson(NOTIFIED_IDS_KEY, {});
    var changed = false;

    notifs.forEach(function (n) {
      if (Number(n.is_read) === 1) return;
      var key = String(n.id || '');
      if (!key || seenNotifs[key]) return;
      seenNotifs[key] = Date.now();
      changed = true;
      notifyLive(
        n.title || 'SHIMOGY Client Alert',
        n.message || 'You have a new notification in your Client Portal.',
        './dashboard.html',
        'portal-notif-' + key,
        'View Alert'
      );
    });

    if (changed) {
      var trimmed = {};
      Object.keys(seenNotifs).slice(-120).forEach(function (k) { trimmed[k] = seenNotifs[k]; });
      setStoredJson(NOTIFIED_IDS_KEY, trimmed);
    }

    // Immediate client-side loan repayment check (works even offline / without Node server!)
    var site = window.ShimogySite;
    var loans = Array.isArray(member.loans) ? member.loans : [];
    var today = site ? site.todayISO() : new Date().toISOString().split('T')[0];

    loans.forEach(function (loan) {
      var st = String(loan.status || 'active').toLowerCase();
      if (st === 'paid' || st === 'settled' || st === 'closed') return;
      if (!site || typeof site.computeLoanCountdown !== 'function') return;
      var cd = site.computeLoanCountdown(loan);
      if (cd.daysLeft === null || cd.daysLeft > 3) return;
      var alertKey = LOAN_OS_ALERT_PREFIX + String(loan.id || '') + '_' + today;
      try {
        if (localStorage.getItem(alertKey)) return;
        localStorage.setItem(alertKey, '1');
      } catch (_e) {}

      var amtStr = site.formatUGX(loan.amount);
      var msg = cd.daysLeft < 0
        ? 'Your ' + amtStr + ' loan was due on ' + cd.returnDate + ' (' + cd.label + '). Please settle promptly.'
        : 'Your ' + amtStr + ' loan repayment is scheduled for ' + cd.returnDate + ' (' + cd.label + ').';
      notifyLive('Loan Repayment Reminder', msg, './dashboard.html', alertKey, 'Check Loan');
    });
  }

  function pollPublicUpdates() {
    var apiFetch = (window.ShimogySite && window.ShimogySite.apiFetch) || window.fetch.bind(window);
    return apiFetch('/api/site-data?_=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data) processSiteDataDiff(data);
        return data;
      })
      .catch(function () { return null; });
  }

  function emitLiveRefreshHint(kind) {
    try {
      if (broadcastChannel) broadcastChannel.postMessage({ type: 'refresh', kind: kind, ts: Date.now() });
    } catch (_e) {}
  }

  function registerServiceWorker() {
    if (!isHttpOrigin() || !('serviceWorker' in navigator)) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) {
        swRegistration = reg;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          syncPushSubscription();
        }
        return reg;
      })
      .catch(function () {
        return null;
      });
  }

  function init() {
    detectPlatform();
    bindInstallButtons();
    syncOfflineIndicator();
    registerServiceWorker();

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      syncInstallButtons();
    });

    window.addEventListener('appinstalled', function () {
      isInstalled = true;
      deferredPrompt = null;
      syncInstallButtons();
      showInAppAlert('SHIMOGY App Installed', 'You can now open SHIMOGY directly from your home screen or desktop.', '', '');
    });

    window.addEventListener('online', function () {
      syncOfflineIndicator();
      pollPublicUpdates();
    });
    window.addEventListener('offline', syncOfflineIndicator);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        pollPublicUpdates();
      }
    });

    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', function () {
        pollPublicUpdates();
      });
    }

    if (!pollTimer) {
      pollTimer = setInterval(function () {
        if (document.visibilityState === 'visible') {
          pollPublicUpdates();
        }
      }, 28000);
    }
  }

  window.ShimogyPWA = {
    init: init,
    triggerInstall: triggerInstall,
    enableNotifications: enableNotifications,
    syncPushSubscription: syncPushSubscription,
    notifyLive: notifyLive,
    processSiteDataDiff: processSiteDataDiff,
    processMemberSnapshot: processMemberSnapshot,
    emitLiveRefreshHint: emitLiveRefreshHint,
    getStatus: function () {
      detectPlatform();
      return {
        isInstalled: isInstalled,
        isInstallable: Boolean(deferredPrompt),
        isIOS: isIOS,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
        notificationSupported: 'Notification' in window,
        notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
        pushSupported: isHttpOrigin() && 'serviceWorker' in navigator && 'PushManager' in window
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
