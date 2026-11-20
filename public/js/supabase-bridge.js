/* SHIMOGY Supabase Auth & PostgREST Live Bridge (Cross-Device / All Hosts) */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ihgfsvkcpgxklotjmokl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_jvFnU7agmMpbWk3HVPDn5g_3YQn9_xC';
  var REFRESH_KEY = 'shimogy_sb_refresh';
  var ADMIN_TOKEN_KEY = 'shimogy_admin_token';
  var MEMBER_TOKEN_KEY = 'shimogy_member_token';
  var schemaMissing = false;

  var BOOTSTRAPPED_ADMINS = {
    'mal77ham@gmail.com': true,
    'maleham06@gmail.com': true,
    'admin@shimogy.com': true
  };

  function getNativeFetch() {
    if (typeof window.ShimogyNativeFetch === 'function') return window.ShimogyNativeFetch;
    if (typeof window.fetch === 'function') return window.fetch.bind(window);
    return null;
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function addDaysISO(baseDateStr, days) {
    var base = baseDateStr ? new Date(String(baseDateStr).slice(0, 10) + 'T00:00:00Z') : new Date();
    if (isNaN(base.getTime())) base = new Date();
    base.setUTCDate(base.getUTCDate() + Math.max(0, Math.round(Number(days) || 0)));
    return base.toISOString().split('T')[0];
  }

  function parseDurationDays(durationStr, defaultDays) {
    var s = String(durationStr || '').toLowerCase();
    var m = s.match(/(\d+)/);
    var num = m ? Number(m[1]) : 0;
    if (!num) return defaultDays;
    if (s.indexOf('month') !== -1) return num * 30;
    if (s.indexOf('week') !== -1) return num * 7;
    if (s.indexOf('year') !== -1) return num * 365;
    return num;
  }

  function computeReturnsDate(startDate, durationStr, explicitDate) {
    if (explicitDate && /^\d{4}-\d{2}-\d{2}/.test(String(explicitDate))) {
      return String(explicitDate).slice(0, 10);
    }
    return addDaysISO(startDate || todayISO(), parseDurationDays(durationStr, 60));
  }

  function computeLoanReturnDate(startDate, durationStr, explicitDate) {
    if (explicitDate && /^\d{4}-\d{2}-\d{2}/.test(String(explicitDate))) {
      return String(explicitDate).slice(0, 10);
    }
    return addDaysISO(startDate || todayISO(), parseDurationDays(durationStr, 30));
  }

  function normalizePhone(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.indexOf('256') === 0 && digits.length >= 12) {
      return '0' + digits.slice(3);
    }
    return digits || String(phone || '').trim();
  }

  function normalizeSavingsStatus(accountType, status) {
    var t = String(accountType || '').toLowerCase();
    var s = String(status || '').trim();
    if (t.indexOf('fixed') !== -1 && (!s || s.toLowerCase() === 'active' || s.toLowerCase() === 'available' || s.toLowerCase() === 'locked')) {
      return 'Locked';
    }
    if (t.indexOf('current') !== -1 && (!s || s.toLowerCase() === 'active' || s.toLowerCase() === 'available' || s.toLowerCase() === 'locked')) {
      return 'Available';
    }
    return s || 'Available';
  }

  function sanitizeUrl(url, fallback) {
    var raw = String(url || '').trim();
    if (!raw) return fallback || '';
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(raw)) return raw;
    if (/^(javascript|vbscript|data):/i.test(raw)) return fallback || '';
    if (/^https?:\/\//i.test(raw) || /^(\/)?[a-zA-Z0-9._\-\/]+\.(html|jpg|jpeg|png|webp|gif|svg)([?#].*)?$/i.test(raw) || raw.indexOf('/api/media/') === 0) {
      return raw;
    }
    return fallback || '';
  }

  function toNonNegativeNumber(val, fallback) {
    if (val === undefined || val === null || val === '') return fallback !== undefined ? fallback : 0;
    var n = Number(val);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  }

  function sanitizeMember(m) {
    if (!m) return m;
    var copy = Object.assign({}, m);
    delete copy.password_hash;
    return copy;
  }

  function sbHeaders(accessToken, extra) {
    var bearer = accessToken || SUPABASE_ANON_KEY;
    return Object.assign(
      {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + bearer,
        Accept: 'application/json'
      },
      extra || {}
    );
  }

  function saveRefreshToken(rt) {
    try {
      if (rt) localStorage.setItem(REFRESH_KEY, rt);
    } catch (_e) {}
  }

  function getRefreshToken() {
    try {
      return localStorage.getItem(REFRESH_KEY) || '';
    } catch (_e) {
      return '';
    }
  }

  function clearRefreshToken() {
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch (_e) {}
  }

  function unwrapToken(rawToken) {
    var t = String(rawToken || '');
    if (t.indexOf('sb_adm_') === 0) return { prefix: 'sb_adm_', role: 'admin', jwt: t.slice(7) };
    if (t.indexOf('sb_mem_') === 0) return { prefix: 'sb_mem_', role: 'member', jwt: t.slice(7) };
    return { prefix: '', role: '', jwt: '' };
  }

  function parseRespJson(res) {
    return res.text().then(function (txt) {
      if (!txt) return null;
      try { return JSON.parse(txt); } catch (_e) { return { message: txt }; }
    });
  }

  function authRequest(path, method, body, accessToken) {
    var fetchFn = getNativeFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, status: 503, data: { error: 'Network unavailable.' } });
    return fetchFn(SUPABASE_URL + '/auth/v1/' + path, {
      method: method || 'GET',
      headers: sbHeaders(accessToken, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
      .then(function (res) {
        return parseRespJson(res).then(function (data) {
          return { ok: res.ok, status: res.status, data: data || {} };
        });
      })
      .catch(function (err) {
        return { ok: false, status: 503, data: { error: (err && err.message) || 'Unable to reach Supabase Auth.' } };
      });
  }

  function tryRefreshSession(tokenInfo) {
    var rt = getRefreshToken();
    if (!rt || !tokenInfo || !tokenInfo.prefix) return Promise.resolve(null);
    return authRequest('token?grant_type=refresh_token', 'POST', { refresh_token: rt }).then(function (r) {
      if (!r.ok || !r.data || !r.data.access_token) return null;
      saveRefreshToken(r.data.refresh_token || rt);
      var newWrapped = tokenInfo.prefix + r.data.access_token;
      try {
        localStorage.setItem(tokenInfo.role === 'admin' ? ADMIN_TOKEN_KEY : MEMBER_TOKEN_KEY, newWrapped);
      } catch (_e) {}
      return r.data.access_token;
    });
  }

  function restRaw(method, path, body, accessToken, extraHeaders, retried) {
    var fetchFn = getNativeFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, status: 503, data: { error: 'Network unavailable.' } });
    var tokenInfo = typeof accessToken === 'object' && accessToken !== null ? accessToken : { jwt: accessToken || '' };
    var jwt = tokenInfo.jwt || '';
    var headers = sbHeaders(jwt, Object.assign(body !== undefined ? { 'Content-Type': 'application/json' } : {}, extraHeaders || {}));

    return fetchFn(SUPABASE_URL + '/rest/v1/' + path, {
      method: method || 'GET',
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
      .then(function (res) {
        return parseRespJson(res).then(function (data) {
          if (res.status === 401 && !retried && tokenInfo.prefix) {
            return tryRefreshSession(tokenInfo).then(function (newJwt) {
              if (!newJwt) return { ok: false, status: 401, data: data || { error: 'Session expired. Please sign in again.' } };
              tokenInfo.jwt = newJwt;
              return restRaw(method, path, body, tokenInfo, extraHeaders, true);
            });
          }
          if (!res.ok) {
            var msg = (data && (data.message || data.error_description || data.error || data.hint)) || ('Supabase request failed (' + res.status + ')');
            if (String(msg).indexOf('PGRST205') !== -1) schemaMissing = true;
            return { ok: false, status: res.status === 401 || res.status === 403 ? res.status : (res.status || 400), data: { error: msg, code: data && data.code } };
          }
          return { ok: true, status: res.status, data: data };
        });
      })
      .catch(function (err) {
        return { ok: false, status: 503, data: { error: (err && err.message) || 'Unable to reach Supabase.' } };
      });
  }

  function restGet(path, tokenInfo) {
    return restRaw('GET', path, undefined, tokenInfo).then(function (r) {
      return r.ok ? r.data : null;
    });
  }

  function restPost(table, payload, tokenInfo, prefer) {
    return restRaw('POST', table, payload, tokenInfo, { Prefer: prefer || 'return=representation' });
  }

  function restPatch(path, payload, tokenInfo) {
    return restRaw('PATCH', path, payload, tokenInfo, { Prefer: 'return=representation' });
  }

  function restDelete(path, tokenInfo) {
    return restRaw('DELETE', path, undefined, tokenInfo, { Prefer: 'return=minimal' });
  }

  function rpcCall(fnName, args, tokenInfo) {
    return restRaw('POST', 'rpc/' + fnName, args || {}, tokenInfo);
  }

  function getPublicSiteData() {
    if (schemaMissing) return Promise.resolve(null);
    return Promise.all([
      restGet('site_settings?select=key,value'),
      restGet('hero_slides?is_active=eq.1&order=sort_order.asc,id.asc'),
      restGet('testimonials?is_active=eq.1&order=sort_order.asc,id.asc'),
      restGet('investment_plans?order=price.asc,id.asc'),
      restGet('public_cycles?order=id.asc'),
      restGet('updates?status=eq.published&order=published_date.desc,id.desc')
    ]).then(function (parts) {
      var settingsRows = parts[0];
      if (!Array.isArray(settingsRows) || !settingsRows.length) return null;
      var settings = {};
      settingsRows.forEach(function (r) {
        if (r && r.key) settings[r.key] = String(r.value || '');
      });
      return {
        source: 'supabase',
        settings: settings,
        heroSlides: Array.isArray(parts[1]) ? parts[1] : [],
        testimonials: Array.isArray(parts[2]) ? parts[2] : [],
        plans: Array.isArray(parts[3]) ? parts[3] : [],
        publicCycles: Array.isArray(parts[4]) ? parts[4] : [],
        updates: Array.isArray(parts[5]) ? parts[5] : []
      };
    });
  }

  function createServiceRequest(body) {
    var b = body || {};
    var payload = {
      request_type: String(b.request_type || 'investment').slice(0, 60),
      applicant_name: String(b.applicant_name || '').trim().slice(0, 140),
      applicant_phone: normalizePhone(b.applicant_phone || ''),
      details_json: JSON.stringify(b.details || {}),
      age_confirmed: b.age_confirmed ? 1 : 0,
      guardian_name: String(b.guardian_name || '').trim().slice(0, 140),
      status: 'pending'
    };
    return restPost('service_requests', payload, null, 'return=minimal').then(function (res) {
      if (!res.ok) return null;
      var row = Array.isArray(res.data) && res.data[0] ? res.data[0] : { id: Date.now() };
      return { id: row.id, status: 'pending' };
    });
  }

  function createDeletionRequest(body) {
    var b = body || {};
    var payload = {
      full_name: String(b.full_name || '').trim().slice(0, 140),
      phone: normalizePhone(b.phone || ''),
      email: String(b.email || '').trim().slice(0, 160),
      reason: String(b.reason || '').trim().slice(0, 1000),
      status: 'pending'
    };
    return restPost('deletion_requests', payload, null, 'return=minimal').then(function (res) {
      if (!res.ok) return null;
      var row = Array.isArray(res.data) && res.data[0] ? res.data[0] : { id: Date.now() };
      return {
        id: row.id,
        message: 'Your data deletion request has been logged. Our compliance team will process and confirm removal within 72 hours.'
      };
    });
  }

  function attachCoMembers(cycles, peerRows) {
    var map = {};
    (peerRows || []).forEach(function (r) {
      var k = String(r.cycle_name || '').trim().toLowerCase();
      var n = String(r.co_member_name || '').trim();
      if (!k || !n) return;
      if (!map[k]) map[k] = [];
      if (map[k].indexOf(n) === -1) map[k].push(n);
    });
    return (cycles || []).map(function (c) {
      var k = String(c.cycle_name || '').trim().toLowerCase();
      var peers = (map[k] || []).slice().sort(function (a, b) { return a.localeCompare(b); });
      return Object.assign({}, c, { co_members: peers });
    });
  }

  function fetchMemberFullProfileRest(tokenInfo) {
    return restRaw('GET', 'members?select=*&limit=1', undefined, tokenInfo).then(function (mRes) {
      if (!mRes.ok) return { ok: false, status: mRes.status, data: mRes.data };
      var member = Array.isArray(mRes.data) && mRes.data[0] ? mRes.data[0] : null;
      if (!member) {
        return {
          ok: false,
          status: 404,
          data: { error: 'No client ledger profile matches your Supabase Auth email. Ask Operations to link your email in Clients Directory.' }
        };
      }
      return Promise.all([
        restGet('investments?order=id.desc', tokenInfo),
        restGet('savings?order=id.desc', tokenInfo),
        restGet('loans?order=id.desc', tokenInfo),
        restGet('member_cycles?order=id.desc', tokenInfo),
        restGet('client_notifications?order=id.desc&limit=30', tokenInfo),
        rpcCall('get_my_cycle_co_members', {}, tokenInfo)
      ]).then(function (parts) {
        var investments = (parts[0] || []).map(function (inv) {
          return Object.assign({}, inv, {
            returns_date: inv.returns_date || computeReturnsDate(String(inv.created_at || todayISO()), String(inv.duration || '60 Days'))
          });
        });
        var savings = (parts[1] || []).map(function (s) {
          return Object.assign({}, s, {
            status: normalizeSavingsStatus(s.account_type, s.status)
          });
        });
        var loans = (parts[2] || []).map(function (l) {
          return Object.assign({}, l, {
            return_date: l.return_date || computeLoanReturnDate(String(l.request_date || todayISO()), String(l.duration || '30 days'))
          });
        });
        var peerRows = parts[5] && parts[5].ok && Array.isArray(parts[5].data) ? parts[5].data : [];
        var cycles = attachCoMembers(parts[3] || [], peerRows);
        var profile = Object.assign({}, sanitizeMember(member), {
          investments: investments,
          savings: savings,
          loans: loans,
          cycles: cycles,
          notifications: parts[4] || []
        });
        return { ok: true, status: 200, data: { member: profile } };
      });
    });
  }

  function resolveMemberAdmin(phoneInput, fallbackName, tokenInfo) {
    var phone = normalizePhone(phoneInput || '');
    return restGet('members?phone=eq.' + encodeURIComponent(phone) + '&select=id,name,phone&limit=1', tokenInfo).then(function (rows) {
      var m = Array.isArray(rows) && rows[0] ? rows[0] : null;
      return {
        memberId: m ? Number(m.id) : null,
        memberPhone: m ? m.phone : phone,
        memberName: String(fallbackName || (m ? m.name : '')).trim() || 'Client'
      };
    });
  }

  function notifyCyclePeersAdmin(exitingCycle, fallbackName, tokenInfo) {
    var cycleName = String(exitingCycle.cycle_name || '').trim();
    if (!cycleName) return Promise.resolve();
    var exiterId = exitingCycle.member_id !== null && exitingCycle.member_id !== undefined ? Number(exitingCycle.member_id) : null;
    var exiterPhone = normalizePhone(exitingCycle.member_phone || '');

    var namePromise = exiterId
      ? restGet('members?id=eq.' + encodeURIComponent(exiterId) + '&select=name&limit=1', tokenInfo).then(function (r) {
          return (r && r[0] && r[0].name) || fallbackName || exitingCycle.member_name || 'A client';
        })
      : Promise.resolve(fallbackName || exitingCycle.member_name || 'A client');

    return Promise.all([
      namePromise,
      restGet('member_cycles?select=member_id,member_phone,member_name,cycle_name,status', tokenInfo)
    ]).then(function (parts) {
      var exiterName = String(parts[0] || 'A client').trim();
      var allCycles = parts[1] || [];
      var seen = {};
      var payloads = [];
      allCycles.forEach(function (p) {
        if (String(p.cycle_name || '').trim().toLowerCase() !== cycleName.toLowerCase()) return;
        var st = String(p.status || 'active').toLowerCase();
        if (st === 'exited' || st === 'stopped') return;
        var pId = p.member_id !== null && p.member_id !== undefined ? Number(p.member_id) : null;
        var pPhone = normalizePhone(p.member_phone || '');
        var isSelf = (pId !== null && exiterId !== null && pId === exiterId) || (pPhone !== '' && pPhone === exiterPhone);
        if (isSelf) return;
        var key = pId !== null ? 'id:' + pId : 'ph:' + pPhone;
        if (seen[key]) return;
        seen[key] = true;
        payloads.push({
          member_id: pId,
          member_phone: pPhone || String(p.member_phone || ''),
          notif_type: 'cycle_exit',
          cycle_name: cycleName,
          title: 'Client Left Your Cycle',
          message: exiterName + ' has left your cycle (' + cycleName + ').',
          is_read: 0
        });
      });
      if (!payloads.length) return;
      return restPost('client_notifications', payloads, tokenInfo, 'return=minimal');
    });
  }

  function handleApi(url, method, body, rawToken) {
    var pathOnly = String(url || '').split('?')[0];
    var verb = String(method || 'GET').toUpperCase();
    var b = body || {};
    var tokenInfo = unwrapToken(rawToken);

    if (pathOnly === '/api/health' && verb === 'GET') {
      return Promise.resolve({
        status: 200,
        data: { status: 'ok', database: 'postgres', supabaseUrl: SUPABASE_URL, timestamp: new Date().toISOString() }
      });
    }

    if (pathOnly === '/api/site-data' && verb === 'GET') {
      return getPublicSiteData().then(function (data) {
        if (!data) return { status: 503, data: { error: 'Unable to load public Supabase catalog.' } };
        return { status: 200, data: data };
      });
    }

    if (pathOnly === '/api/requests' && verb === 'POST') {
      if (!b.request_type || !b.applicant_name || !b.applicant_phone) {
        return Promise.resolve({ status: 400, data: { error: 'Full name, phone number, and request type are required.' } });
      }
      if (!b.age_confirmed) {
        return Promise.resolve({ status: 400, data: { error: 'Age verification or parent/guardian consent confirmation is required.' } });
      }
      return createServiceRequest(b).then(function (res) {
        return res ? { status: 201, data: res } : { status: 503, data: { error: 'Unable to submit request to Supabase.' } };
      });
    }

    if (pathOnly === '/api/deletion-requests' && verb === 'POST') {
      if (!b.full_name || !b.phone) {
        return Promise.resolve({ status: 400, data: { error: 'Full name and registered phone number are required.' } });
      }
      return createDeletionRequest(b).then(function (res) {
        return res ? { status: 201, data: res } : { status: 503, data: { error: 'Unable to log deletion request.' } };
      });
    }

    if (pathOnly === '/api/logout' && verb === 'POST') {
      clearRefreshToken();
      if (tokenInfo.jwt) authRequest('logout', 'POST', undefined, tokenInfo.jwt).catch(function () {});
      return Promise.resolve({ status: 200, data: { success: true } });
    }

    // ============================================================
    // SUPABASE AUTH SIGN-IN ENDPOINTS
    // ============================================================
    if (pathOnly === '/api/admin/login' && verb === 'POST') {
      var adminEmail = String(b.email || '').trim().toLowerCase();
      var adminPass = String(b.password || '');
      if (!adminEmail || !adminPass) {
        return Promise.resolve({ status: 400, data: { error: 'Email and password are required.' } });
      }
      return authRequest('token?grant_type=password', 'POST', { email: adminEmail, password: adminPass }).then(function (authRes) {
        if (!authRes.ok || !authRes.data || !authRes.data.access_token || !authRes.data.user) {
          return { status: 401, data: { error: 'Invalid Supabase Auth email or password.' } };
        }
        var jwt = authRes.data.access_token;
        var user = authRes.data.user;
        var userEmail = String(user.email || adminEmail).trim().toLowerCase();
        var isMetaAdmin = user.app_metadata && String(user.app_metadata.role || '').toLowerCase() === 'admin';
        var admInfo = { prefix: 'sb_adm_', role: 'admin', jwt: jwt };

        return rpcCall('is_shimogy_admin', {}, admInfo).then(function (rpcRes) {
          var isDbAdmin = Boolean(rpcRes && rpcRes.ok && rpcRes.data === true);
          if (!isDbAdmin && !isMetaAdmin && !BOOTSTRAPPED_ADMINS[userEmail]) {
            return {
              status: 403,
              data: { error: 'This Supabase Auth user (' + userEmail + ') is not authorized as a SHIMOGY administrator.' }
            };
          }
          saveRefreshToken(authRes.data.refresh_token || '');
          return {
            status: 200,
            data: {
              token: 'sb_adm_' + jwt,
              refresh_token: authRes.data.refresh_token || '',
              supabaseAuth: true,
              admin: {
                id: user.id,
                email: userEmail,
                name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || 'SHIMOGY Administrator'
              }
            }
          };
        });
      });
    }

    if (pathOnly === '/api/member/login' && verb === 'POST') {
      var rawId = String(b.email || b.phone || b.identifier || '').trim();
      var memPass = String(b.password || '');
      if (!rawId || !memPass) {
        return Promise.resolve({ status: 400, data: { error: 'Email and password are required.' } });
      }
      if (rawId.indexOf('@') === -1) {
        return Promise.resolve({
          status: 400,
          data: { error: 'Sign in using your registered Supabase Auth email address and password.' }
        });
      }
      return authRequest('token?grant_type=password', 'POST', { email: rawId.toLowerCase(), password: memPass }).then(function (authRes) {
        if (!authRes.ok || !authRes.data || !authRes.data.access_token) {
          return { status: 401, data: { error: 'Invalid Supabase Auth email or password.' } };
        }
        var jwt = authRes.data.access_token;
        var memInfo = { prefix: 'sb_mem_', role: 'member', jwt: jwt };
        return fetchMemberFullProfileRest(memInfo).then(function (profRes) {
          if (!profRes.ok) return { status: profRes.status, data: profRes.data };
          saveRefreshToken(authRes.data.refresh_token || '');
          return {
            status: 200,
            data: {
              token: 'sb_mem_' + jwt,
              refresh_token: authRes.data.refresh_token || '',
              supabaseAuth: true,
              member: profRes.data.member
            }
          };
        });
      });
    }

    // ============================================================
    // CLIENT PORTAL AUTHENTICATED ROUTES (PostgREST + RLS)
    // ============================================================
    if (pathOnly.indexOf('/api/member/') === 0) {
      if (tokenInfo.role !== 'member' || !tokenInfo.jwt) {
        return Promise.resolve({ status: 401, data: { error: 'Client Supabase session required.' } });
      }

      if (pathOnly === '/api/member/me' && verb === 'GET') {
        return fetchMemberFullProfileRest(tokenInfo).then(function (res) {
          return { status: res.status, data: res.data };
        });
      }

      if (pathOnly === '/api/member/change-password' && verb === 'POST') {
        if (!b.currentPassword || !b.newPassword || String(b.newPassword).length < 6) {
          return Promise.resolve({ status: 400, data: { error: 'Current password and new password (min 6 chars) are required.' } });
        }
        return authRequest('user', 'GET', undefined, tokenInfo.jwt).then(function (uRes) {
          var email = uRes.ok && uRes.data && uRes.data.email;
          if (!email) return { status: 401, data: { error: 'Session expired. Please sign in again.' } };
          return authRequest('token?grant_type=password', 'POST', { email: email, password: String(b.currentPassword) }).then(function (chk) {
            if (!chk.ok) return { status: 400, data: { error: 'Current password is incorrect.' } };
            return authRequest('user', 'PUT', { password: String(b.newPassword) }, tokenInfo.jwt).then(function (upd) {
              if (!upd.ok) return { status: 400, data: { error: (upd.data && (upd.data.msg || upd.data.error)) || 'Failed to update password.' } };
              return { status: 200, data: { success: true } };
            });
          });
        });
      }

      var mCycAct = pathOnly.match(/^\/api\/member\/cycles\/(\d+)\/action$/);
      if (mCycAct && verb === 'POST') {
        var cycId = Number(mCycAct[1]);
        var act = String(b.action || '').toLowerCase();
        var reason = String(b.reason || '').trim().slice(0, 500);
        if (act !== 'exit' && act !== 'stop') {
          return Promise.resolve({ status: 400, data: { error: 'Valid action (exit or stop) is required.' } });
        }
        return Promise.all([
          restGet('members?select=id,name,phone&limit=1', tokenInfo),
          restGet('member_cycles?id=eq.' + cycId + '&limit=1', tokenInfo),
          rpcCall('get_my_cycle_co_members', {}, tokenInfo)
        ]).then(function (parts) {
          var mem = parts[0] && parts[0][0];
          var cyc = parts[1] && parts[1][0];
          if (!mem || !cyc) return { status: 404, data: { error: 'Cycle record not found.' } };
          var curSt = String(cyc.status || 'active').toLowerCase();
          if (curSt === 'exited' || curSt === 'stopped' || curSt === 'completed') {
            return { status: 400, data: { error: 'This cycle has already been closed.' } };
          }
          if (curSt === 'exit_pending') {
            return { status: 409, data: { error: 'Your cycle exit request is already awaiting admin approval.' } };
          }
          var peers = parts[2] && parts[2].ok && Array.isArray(parts[2].data) ? parts[2].data : [];
          var hasPeers = peers.some(function (p) {
            return String(p.cycle_name || '').trim().toLowerCase() === String(cyc.cycle_name || '').trim().toLowerCase();
          });
          var requiresApproval = act === 'exit' || hasPeers;
          if (!requiresApproval) {
            return restPatch('member_cycles?id=eq.' + cycId, { status: 'stopped' }, tokenInfo).then(function (r) {
              if (!r.ok) return { status: r.status, data: r.data };
              return { status: 200, data: { success: true, status: 'stopped', pendingApproval: false, message: 'Custom cycle stopped successfully.' } };
            });
          }
          return restPatch('member_cycles?id=eq.' + cycId, { status: 'exit_pending' }, tokenInfo).then(function (uRes) {
            if (!uRes.ok) return { status: uRes.status, data: uRes.data };
            return restGet("cycle_exit_requests?member_cycle_id=eq." + cycId + "&status=eq.pending&limit=1", tokenInfo).then(function (exRows) {
              if (Array.isArray(exRows) && exRows.length) {
                return { status: 200, data: { success: true, status: 'exit_pending', pendingApproval: true, message: 'Cycle exit request submitted. It will take effect once accepted by Admin.' } };
              }
              return restPost('cycle_exit_requests', {
                member_cycle_id: cycId,
                member_id: mem.id,
                member_phone: mem.phone,
                member_name: mem.name || cyc.member_name || 'Client',
                cycle_name: String(cyc.cycle_name || ''),
                cycle_type: String(cyc.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public',
                action_type: act,
                reason: reason,
                status: 'pending'
              }, tokenInfo, 'return=minimal').then(function (insRes) {
                if (!insRes.ok) return { status: insRes.status, data: insRes.data };
                return { status: 200, data: { success: true, status: 'exit_pending', pendingApproval: true, message: 'Cycle exit request submitted. It will take effect once accepted by Admin.' } };
              });
            });
          });
        });
      }

      if (pathOnly === '/api/member/notifications/read-all' && verb === 'POST') {
        return restPatch('client_notifications?is_read=eq.0', { is_read: 1 }, tokenInfo).then(function (r) {
          return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
        });
      }

      var mNotifRead = pathOnly.match(/^\/api\/member\/notifications\/(\d+)\/read$/);
      if (mNotifRead && verb === 'POST') {
        return restPatch('client_notifications?id=eq.' + Number(mNotifRead[1]), { is_read: 1 }, tokenInfo).then(function (r) {
          return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
        });
      }

      return Promise.resolve({ status: 404, data: { error: 'Client endpoint not found.' } });
    }

    // ============================================================
    // ADMIN AUTHENTICATED ROUTES (PostgREST + RLS)
    // ============================================================
    if (pathOnly.indexOf('/api/admin/') === 0) {
      if (tokenInfo.role !== 'admin' || !tokenInfo.jwt) {
        return Promise.resolve({ status: 401, data: { error: 'Admin Supabase Auth session required.' } });
      }

      if (pathOnly === '/api/admin/me' && verb === 'GET') {
        return authRequest('user', 'GET', undefined, tokenInfo.jwt).then(function (uRes) {
          if (!uRes.ok || !uRes.data || !uRes.data.email) {
            return { status: 401, data: { error: 'Admin session expired.' } };
          }
          var email = String(uRes.data.email).trim().toLowerCase();
          return restGet('admin_users?select=id,email,name&limit=20', tokenInfo).then(function (rows) {
            var match = (rows || []).find(function (a) { return String(a.email || '').toLowerCase() === email; });
            return {
              status: 200,
              data: {
                admin: match || {
                  id: uRes.data.id,
                  email: email,
                  name: (uRes.data.user_metadata && (uRes.data.user_metadata.full_name || uRes.data.user_metadata.name)) || 'SHIMOGY Administrator'
                }
              }
            };
          });
        });
      }

      if (pathOnly === '/api/admin/admins' && verb === 'GET') {
        return restGet('admin_users?select=id,email,name,created_at&order=id.asc', tokenInfo).then(function (rows) {
          return { status: 200, data: { admins: rows || [] } };
        });
      }

      if (pathOnly === '/api/admin/admins' && verb === 'POST') {
        var addEmail = String(b.email || '').trim().toLowerCase();
        var addName = String(b.name || 'SHIMOGY Administrator').trim().slice(0, 120);
        if (!addEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addEmail)) {
          return Promise.resolve({ status: 400, data: { error: 'Please enter a valid administrator email address.' } });
        }
        return restPost('admin_users', { email: addEmail, name: addName, password_hash: 'supabase_auth' }, tokenInfo).then(function (r) {
          if (!r.ok) return { status: r.status, data: r.data };
          var row = Array.isArray(r.data) && r.data[0] ? r.data[0] : { id: Date.now(), email: addEmail, name: addName };
          return { status: 201, data: row };
        });
      }

      var mDelAdm = pathOnly.match(/^\/api\/admin\/admins\/(\d+)$/);
      if (mDelAdm && verb === 'DELETE') {
        return restDelete('admin_users?id=eq.' + Number(mDelAdm[1]), tokenInfo).then(function (r) {
          return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
        });
      }

      if (pathOnly === '/api/admin/change-password' && verb === 'POST') {
        var newEmail = String(b.newEmail || '').trim().toLowerCase();
        var newPass = String(b.newPassword || '');
        if (!newEmail && !newPass) {
          return Promise.resolve({ status: 400, data: { error: 'Enter a new email or password to update.' } });
        }
        if (newPass && newPass.length < 6) {
          return Promise.resolve({ status: 400, data: { error: 'Password must be at least 6 characters.' } });
        }
        return authRequest('user', 'GET', undefined, tokenInfo.jwt).then(function (uRes) {
          if (!uRes.ok || !uRes.data || !uRes.data.email) {
            return { status: 401, data: { error: 'Admin session expired.' } };
          }
          var curEmail = String(uRes.data.email).trim().toLowerCase();
          var payload = {};
          if (newEmail && newEmail !== curEmail) payload.email = newEmail;
          if (newPass) payload.password = newPass;
          return authRequest('user', 'PUT', payload, tokenInfo.jwt).then(function (updRes) {
            if (!updRes.ok) {
              return { status: 400, data: { error: (updRes.data && (updRes.data.msg || updRes.data.error)) || 'Supabase Auth update failed.' } };
            }
            if (payload.email) {
              return restPatch('admin_users?email=ilike.' + encodeURIComponent(curEmail), { email: payload.email }, tokenInfo).then(function () {
                return { status: 200, data: { success: true, email: payload.email } };
              });
            }
            return { status: 200, data: { success: true, email: curEmail } };
          });
        });
      }

      if (pathOnly === '/api/admin/upload' && verb === 'POST') {
        var dataUrl = String(b.dataUrl || '');
        if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) {
          return Promise.resolve({ status: 400, data: { error: 'Valid PNG, JPG, WEBP, or GIF image is required.' } });
        }
        return Promise.resolve({ status: 200, data: { id: Date.now(), url: dataUrl } });
      }

      if (pathOnly === '/api/admin/overview' && verb === 'GET') {
        return Promise.all([
          restRaw('GET', 'site_settings?select=key,value', undefined, tokenInfo),
          restGet('members?order=id.desc', tokenInfo),
          restGet('investments?order=id.desc', tokenInfo),
          restGet('savings?order=id.desc', tokenInfo),
          restGet('loans?order=id.desc', tokenInfo),
          restGet('member_cycles?order=id.desc', tokenInfo),
          restGet('investment_plans?order=price.asc,id.asc', tokenInfo),
          restGet('public_cycles?order=id.asc', tokenInfo),
          restGet('updates?order=published_date.desc,id.desc', tokenInfo),
          restGet('hero_slides?order=sort_order.asc,id.asc', tokenInfo),
          restGet('testimonials?order=sort_order.asc,id.asc', tokenInfo),
          restGet('service_requests?order=id.desc', tokenInfo),
          restGet('deletion_requests?order=id.desc', tokenInfo),
          restGet('cycle_exit_requests?order=id.desc', tokenInfo)
        ]).then(function (parts) {
          if (!parts[0].ok) return { status: parts[0].status, data: parts[0].data };
          var settings = {};
          (parts[0].data || []).forEach(function (r) {
            if (r && r.key) settings[r.key] = r.value;
          });
          var members = (parts[1] || []).map(sanitizeMember);
          var investments = (parts[2] || []).map(function (inv) {
            return Object.assign({}, inv, {
              returns_date: inv.returns_date || computeReturnsDate(String(inv.created_at || todayISO()), String(inv.duration || '60 Days'))
            });
          });
          var savings = (parts[3] || []).map(function (sv) {
            return Object.assign({}, sv, { status: normalizeSavingsStatus(sv.account_type, sv.status) });
          });
          var loans = (parts[4] || []).map(function (ln) {
            return Object.assign({}, ln, {
              return_date: ln.return_date || computeLoanReturnDate(String(ln.request_date || todayISO()), String(ln.duration || '30 days'))
            });
          });
          return {
            status: 200,
            data: {
              databaseMode: 'postgres',
              supabaseUrl: SUPABASE_URL,
              settings: settings,
              members: members,
              investments: investments,
              savings: savings,
              loans: loans,
              memberCycles: parts[5] || [],
              plans: parts[6] || [],
              publicCycles: parts[7] || [],
              updates: parts[8] || [],
              heroSlides: parts[9] || [],
              testimonials: parts[10] || [],
              requests: parts[11] || [],
              deletionRequests: parts[12] || [],
              cycleExitRequests: parts[13] || []
            }
          };
        });
      }

      if (pathOnly === '/api/admin/settings' && verb === 'PUT') {
        var urlKeys = { logo_url: 1, social_facebook: 1, social_tiktok: 1, social_youtube: 1, social_instagram: 1 };
        var rows = Object.keys(b).map(function (k) {
          return {
            key: String(k),
            value: urlKeys[k] ? sanitizeUrl(String(b[k] || ''), '') : String(b[k] === undefined || b[k] === null ? '' : b[k])
          };
        });
        if (!rows.length) return Promise.resolve({ status: 200, data: { success: true } });
        return restPost('site_settings?on_conflict=key', rows, tokenInfo, 'resolution=merge-duplicates,return=minimal').then(function (r) {
          return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
        });
      }

      // Hero Slides CRUD
      if (pathOnly === '/api/admin/hero-slides' && verb === 'POST') {
        if (!b.title || !b.subtitle || !b.image_url) return Promise.resolve({ status: 400, data: { error: 'Title, subtitle, and image URL are required.' } });
        return restPost('hero_slides', {
          badge_text: String(b.badge_text || ''),
          title: String(b.title).trim(),
          subtitle: String(b.subtitle).trim(),
          cta_text: String(b.cta_text || 'Explore Plans').trim(),
          cta_link: sanitizeUrl(String(b.cta_link || 'investments.html'), 'investments.html'),
          image_url: sanitizeUrl(String(b.image_url), '/assets/aistudio/partnership_65dac3a6.jpg'),
          image_alt: String(b.image_alt || b.title).trim(),
          sort_order: Number(b.sort_order || 0),
          is_active: b.is_active === false || b.is_active === 0 ? 0 : 1
        }, tokenInfo).then(function (r) {
          return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
        });
      }
      var mHero = pathOnly.match(/^\/api\/admin\/hero-slides\/(\d+)$/);
      if (mHero) {
        if (verb === 'PUT') {
          return restPatch('hero_slides?id=eq.' + mHero[1], {
            badge_text: String(b.badge_text || ''),
            title: String(b.title || '').trim(),
            subtitle: String(b.subtitle || '').trim(),
            cta_text: String(b.cta_text || 'Explore Plans').trim(),
            cta_link: sanitizeUrl(String(b.cta_link || 'investments.html'), 'investments.html'),
            image_url: sanitizeUrl(String(b.image_url || ''), '/assets/aistudio/partnership_65dac3a6.jpg'),
            image_alt: String(b.image_alt || b.title || '').trim(),
            sort_order: Number(b.sort_order || 0),
            is_active: b.is_active === false || b.is_active === 0 ? 0 : 1
          }, tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
        if (verb === 'DELETE') {
          return restDelete('hero_slides?id=eq.' + mHero[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
      }

      // Testimonials CRUD
      if (pathOnly === '/api/admin/testimonials' && verb === 'POST') {
        if (!b.client_name || !b.quote) return Promise.resolve({ status: 400, data: { error: 'Client name and quote are required.' } });
        return restPost('testimonials', {
          client_name: String(b.client_name).trim(),
          role: String(b.role || 'Verified Client').trim(),
          location: String(b.location || 'Kampala, Uganda').trim(),
          quote: String(b.quote).trim(),
          photo_url: sanitizeUrl(String(b.photo_url || '/assets/aistudio/josephine_a1a0850e.jpg'), '/assets/aistudio/josephine_a1a0850e.jpg'),
          photo_alt: String(b.photo_alt || 'Portrait of SHIMOGY client ' + b.client_name).trim(),
          sort_order: Number(b.sort_order || 0),
          is_active: b.is_active === false || b.is_active === 0 ? 0 : 1
        }, tokenInfo).then(function (r) {
          return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
        });
      }
      var mTest = pathOnly.match(/^\/api\/admin\/testimonials\/(\d+)$/);
      if (mTest) {
        if (verb === 'PUT') {
          return restPatch('testimonials?id=eq.' + mTest[1], {
            client_name: String(b.client_name || '').trim(),
            role: String(b.role || 'Verified Client').trim(),
            location: String(b.location || 'Kampala, Uganda').trim(),
            quote: String(b.quote || '').trim(),
            photo_url: sanitizeUrl(String(b.photo_url || '/assets/aistudio/josephine_a1a0850e.jpg'), '/assets/aistudio/josephine_a1a0850e.jpg'),
            photo_alt: String(b.photo_alt || 'Portrait of SHIMOGY client ' + (b.client_name || '')).trim(),
            sort_order: Number(b.sort_order || 0),
            is_active: b.is_active === false || b.is_active === 0 ? 0 : 1
          }, tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
        if (verb === 'DELETE') {
          return restDelete('testimonials?id=eq.' + mTest[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
      }

      // Investment Plans CRUD
      if (pathOnly === '/api/admin/plans' && verb === 'POST') {
        if (!b.name || !b.price) return Promise.resolve({ status: 400, data: { error: 'Plan name and price are required.' } });
        var price = toNonNegativeNumber(b.price);
        var expRet = toNonNegativeNumber(b.expected_return !== undefined ? b.expected_return : b.price);
        if (price === null || expRet === null) return Promise.resolve({ status: 400, data: { error: 'Invalid plan price or return.' } });
        var risk = String(b.risk || 'Low');
        return restPost('investment_plans', {
          name: String(b.name).trim(),
          price: price,
          expected_return: expRet,
          duration: String(b.duration || '30 Days').trim(),
          risk: risk,
          risk_level: risk === 'High' ? 3 : (risk === 'Medium' ? 2 : 1),
          description: String(b.description || '').trim(),
          image_url: sanitizeUrl(String(b.image_url || '/assets/aistudio/graph_ddbd7244.jpg'), '/assets/aistudio/graph_ddbd7244.jpg'),
          image_alt: String(b.image_alt || b.name + ' investment plan').trim(),
          slots_left: Math.max(0, Number(b.slots_left !== undefined ? b.slots_left : 5)),
          status: String(b.status || 'available'),
          badge: String(b.badge || '').trim()
        }, tokenInfo).then(function (r) {
          return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
        });
      }
      var mPlan = pathOnly.match(/^\/api\/admin\/plans\/(\d+)$/);
      if (mPlan) {
        if (verb === 'PUT') {
          var pRisk = String(b.risk || 'Low');
          var patchPlan = {
            name: String(b.name || '').trim(),
            price: toNonNegativeNumber(b.price, 0),
            expected_return: toNonNegativeNumber(b.expected_return, 0),
            duration: String(b.duration || '30 Days').trim(),
            risk: pRisk,
            risk_level: pRisk === 'High' ? 3 : (pRisk === 'Medium' ? 2 : 1),
            description: String(b.description || '').trim(),
            image_url: sanitizeUrl(String(b.image_url || ''), '/assets/aistudio/graph_ddbd7244.jpg'),
            image_alt: String(b.image_alt || '').trim(),
            slots_left: Math.max(0, Number(b.slots_left !== undefined ? b.slots_left : 5)),
            status: String(b.status || 'available'),
            badge: String(b.badge || '').trim()
          };
          return restPatch('investment_plans?id=eq.' + mPlan[1], patchPlan, tokenInfo).then(function (r) {
            return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
          });
        }
        if (verb === 'DELETE') {
          return restDelete('investment_plans?id=eq.' + mPlan[1], tokenInfo).then(function (r) {
            return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
          });
        }
      }

      // Public Cycles CRUD
      if (pathOnly === '/api/admin/public-cycles' && verb === 'POST') {
        if (!b.name || !b.contribution) return Promise.resolve({ status: 400, data: { error: 'Cycle name and contribution are required.' } });
        return restPost('public_cycles', {
          name: String(b.name).trim(),
          contribution: toNonNegativeNumber(b.contribution, 0),
          payout_duration: String(b.payout_duration || 'Monthly').trim(),
          description: String(b.description || '').trim(),
          image_url: sanitizeUrl(String(b.image_url || '/assets/aistudio/partnership_65dac3a6.jpg'), '/assets/aistudio/partnership_65dac3a6.jpg'),
          image_alt: String(b.image_alt || b.name + ' savings cycle').trim(),
          status: 'Active'
        }, tokenInfo).then(function (r) {
          return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
        });
      }
      var mPubCyc = pathOnly.match(/^\/api\/admin\/public-cycles\/(\d+)$/);
      if (mPubCyc) {
        if (verb === 'PUT') {
          return restPatch('public_cycles?id=eq.' + mPubCyc[1], {
            name: String(b.name || '').trim(),
            contribution: toNonNegativeNumber(b.contribution, 0),
            payout_duration: String(b.payout_duration || 'Monthly').trim(),
            description: String(b.description || '').trim(),
            image_url: sanitizeUrl(String(b.image_url || ''), '/assets/aistudio/partnership_65dac3a6.jpg'),
            image_alt: String(b.image_alt || '').trim(),
            status: 'Active'
          }, tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
        if (verb === 'DELETE') {
          return restDelete('public_cycles?id=eq.' + mPubCyc[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
      }

      // Updates CRUD
      if (pathOnly === '/api/admin/updates' && verb === 'POST') {
        if (!b.title || !b.excerpt || !b.detail) return Promise.resolve({ status: 400, data: { error: 'Title, excerpt, and detail are required.' } });
        return restPost('updates', {
          title: String(b.title).trim(),
          category: String(b.category || 'news'),
          excerpt: String(b.excerpt).trim(),
          detail: String(b.detail).trim(),
          image_url: sanitizeUrl(String(b.image_url || '/assets/aistudio/graph_ddbd7244.jpg'), '/assets/aistudio/graph_ddbd7244.jpg'),
          image_alt: String(b.image_alt || b.title).trim(),
          published_date: String(b.published_date || todayISO()),
          status: 'published'
        }, tokenInfo).then(function (r) {
          return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
        });
      }
      var mUpd = pathOnly.match(/^\/api\/admin\/updates\/(\d+)$/);
      if (mUpd && verb === 'DELETE') {
        return restDelete('updates?id=eq.' + mUpd[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
      }

      // Member Inspect by Phone
      var mInspect = pathOnly.match(/^\/api\/admin\/member\/(.+)$/);
      if (mInspect && verb === 'GET') {
        var rawPhone = decodeURIComponent(mInspect[1]);
        var normPhone = normalizePhone(rawPhone);
        return restGet('members?or=(phone.eq.' + encodeURIComponent(normPhone) + ',phone.eq.' + encodeURIComponent(rawPhone) + ')&limit=1', tokenInfo).then(function (mRows) {
          var mem = Array.isArray(mRows) && mRows[0] ? mRows[0] : null;
          if (!mem) return { status: 404, data: { error: 'Client not found.' } };
          var mId = mem.id;
          var mPhone = mem.phone;
          var filter = 'or=(member_id.eq.' + mId + ',member_phone.eq.' + encodeURIComponent(mPhone) + ')';
          return Promise.all([
            restGet('investments?' + filter + '&order=id.desc', tokenInfo),
            restGet('savings?' + filter + '&order=id.desc', tokenInfo),
            restGet('loans?' + filter + '&order=id.desc', tokenInfo),
            restGet('member_cycles?' + filter + '&order=id.desc', tokenInfo),
            restGet('client_notifications?' + filter + '&order=id.desc&limit=30', tokenInfo)
          ]).then(function (parts) {
            return {
              status: 200,
              data: {
                member: Object.assign({}, sanitizeMember(mem), {
                  investments: parts[0] || [],
                  savings: (parts[1] || []).map(function (s) { return Object.assign({}, s, { status: normalizeSavingsStatus(s.account_type, s.status) }); }),
                  loans: (parts[2] || []).map(function (l) { return Object.assign({}, l, { return_date: l.return_date || computeLoanReturnDate(l.request_date, l.duration) }); }),
                  cycles: parts[3] || [],
                  notifications: parts[4] || []
                })
              }
            };
          });
        });
      }

      // Create Member (+ optional ledgers)
      if (pathOnly === '/api/admin/members' && verb === 'POST') {
        var cName = String(b.name || '').trim();
        var cPhone = normalizePhone(b.phone || '');
        var cPass = String(b.password || '').trim();
        if (!cName || !cPhone || !cPass) return Promise.resolve({ status: 400, data: { error: 'Name, phone, and password are required.' } });
        return restGet('members?phone=eq.' + encodeURIComponent(cPhone) + '&select=id&limit=1', tokenInfo).then(function (dup) {
          if (Array.isArray(dup) && dup.length) return { status: 409, data: { error: 'A client with that phone number already exists.' } };
          return restPost('members', {
            name: cName,
            phone: cPhone,
            email: String(b.email || '').trim(),
            group_name: String(b.group_name || '').trim(),
            balance: toNonNegativeNumber(b.balance, 0),
            total_invested: toNonNegativeNumber(b.total_invested, 0),
            status: String(b.status || 'active'),
            password_hash: 'supabase_auth',
            age_verified: b.age_verified === false ? 0 : 1,
            guardian_name: String(b.guardian_name || '').trim()
          }, tokenInfo).then(function (insRes) {
            if (!insRes.ok) return { status: insRes.status, data: insRes.data };
            var mid = (insRes.data && insRes.data[0] && insRes.data[0].id) || null;
            var ops = [];
            if (b.investment && b.investment.plan_name && Number(b.investment.amount) > 0) {
              var iAmt = Math.max(0, Math.round(Number(b.investment.amount || 0)));
              var iDur = String(b.investment.duration || '60 Days').trim();
              ops.push(restPost('investments', {
                member_id: mid,
                member_phone: cPhone,
                member_name: cName,
                plan_name: String(b.investment.plan_name).trim(),
                amount: iAmt,
                expected_return: Math.max(0, Math.round(Number(b.investment.expected_return || iAmt))),
                duration: iDur,
                returns_date: computeReturnsDate(todayISO(), iDur, b.investment.returns_date),
                status: 'active'
              }, tokenInfo, 'return=minimal'));
            }
            if (b.savings && b.savings.account_type) {
              var sType = String(b.savings.account_type).trim();
              ops.push(restPost('savings', {
                member_id: mid,
                member_phone: cPhone,
                member_name: cName,
                account_type: sType,
                balance: Math.max(0, Math.round(Number(b.savings.balance || 0))),
                open_date: todayISO(),
                status: normalizeSavingsStatus(sType, b.savings.status)
              }, tokenInfo, 'return=minimal'));
            }
            if (b.loan && Number(b.loan.amount) > 0) {
              var lDur = String(b.loan.duration || '30 days').trim();
              ops.push(restPost('loans', {
                member_id: mid,
                member_phone: cPhone,
                member_name: cName,
                amount: Math.max(0, Math.round(Number(b.loan.amount || 0))),
                purpose: String(b.loan.purpose || 'Client Loan').trim(),
                duration: lDur,
                interest_rate: String(b.loan.interest_rate || '10%').trim(),
                status: String(b.loan.status || 'active').trim(),
                request_date: todayISO(),
                return_date: computeLoanReturnDate(todayISO(), lDur, b.loan.return_date)
              }, tokenInfo, 'return=minimal'));
            }
            if (b.cycle && b.cycle.cycle_name) {
              var totalMems = Math.max(2, Math.round(Number(b.cycle.number_of_members || 10)));
              ops.push(restPost('member_cycles', {
                member_id: mid,
                member_phone: cPhone,
                member_name: cName,
                cycle_name: String(b.cycle.cycle_name).trim(),
                contribution: Math.max(0, Math.round(Number(b.cycle.contribution || 0))),
                payout_duration: String(b.cycle.payout_duration || 'Monthly').trim(),
                number_of_members: totalMems,
                cycle_number: Math.min(totalMems, Math.max(1, Math.round(Number(b.cycle.cycle_number || 1)))),
                cycle_type: String(b.cycle.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public',
                join_date: todayISO(),
                status: 'active'
              }, tokenInfo, 'return=minimal'));
            }
            return Promise.all(ops).then(function () { return { status: 201, data: { id: mid } }; });
          });
        });
      }

      var mMem = pathOnly.match(/^\/api\/admin\/members\/(\d+)$/);
      if (mMem) {
        var targetId = Number(mMem[1]);
        if (verb === 'PUT') {
          return restGet('members?id=eq.' + targetId + '&limit=1', tokenInfo).then(function (rows) {
            var ex = rows && rows[0];
            if (!ex) return { status: 404, data: { error: 'Client not found.' } };
            var uPhone = normalizePhone(b.phone || ex.phone);
            var uName = String(b.name || ex.name).trim();
            return restPatch('members?id=eq.' + targetId, {
              name: uName,
              phone: uPhone,
              email: String(b.email !== undefined ? b.email : ex.email).trim(),
              group_name: String(b.group_name !== undefined ? b.group_name : ex.group_name).trim(),
              balance: toNonNegativeNumber(b.balance !== undefined ? b.balance : ex.balance, Number(ex.balance || 0)),
              total_invested: toNonNegativeNumber(b.total_invested !== undefined ? b.total_invested : ex.total_invested, Number(ex.total_invested || 0)),
              status: String(b.status !== undefined ? b.status : ex.status)
            }, tokenInfo).then(function (uRes) {
              if (!uRes.ok) return { status: uRes.status, data: uRes.data };
              return Promise.all([
                restPatch('investments?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo),
                restPatch('savings?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo),
                restPatch('loans?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo),
                restPatch('member_cycles?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo)
              ]).then(function () { return { status: 200, data: { success: true } }; });
            });
          });
        }
        if (verb === 'DELETE') {
          return restGet('members?id=eq.' + targetId + '&limit=1', tokenInfo).then(function (rows) {
            var mem = rows && rows[0];
            if (!mem) return { status: 404, data: { error: 'Client not found.' } };
            var filt = 'or=(member_id.eq.' + targetId + ',member_phone.eq.' + encodeURIComponent(mem.phone) + ')';
            return Promise.all([
              restDelete('investments?' + filt, tokenInfo),
              restDelete('savings?' + filt, tokenInfo),
              restDelete('loans?' + filt, tokenInfo),
              restDelete('member_cycles?' + filt, tokenInfo),
              restDelete('cycle_exit_requests?' + filt, tokenInfo),
              restDelete('client_notifications?' + filt, tokenInfo)
            ]).then(function () {
              return restDelete('members?id=eq.' + targetId, tokenInfo).then(function (dRes) {
                return dRes.ok ? { status: 200, data: { success: true } } : { status: dRes.status, data: dRes.data };
              });
            });
          });
        }
      }

      // Investments CRUD
      if (pathOnly === '/api/admin/investments' && verb === 'POST') {
        if (!b.member_phone || !b.plan_name || !b.amount) return Promise.resolve({ status: 400, data: { error: 'Client phone, plan name, and amount are required.' } });
        return resolveMemberAdmin(b.member_phone, b.member_name, tokenInfo).then(function (m) {
          var amt = toNonNegativeNumber(b.amount, 0);
          var dur = String(b.duration || '60 Days').trim();
          return restPost('investments', {
            member_id: m.memberId,
            member_phone: m.memberPhone,
            member_name: m.memberName,
            plan_name: String(b.plan_name).trim(),
            amount: amt,
            expected_return: toNonNegativeNumber(b.expected_return !== undefined ? b.expected_return : b.amount, amt),
            duration: dur,
            returns_date: computeReturnsDate(todayISO(), dur, b.returns_date),
            status: String(b.status || 'active')
          }, tokenInfo).then(function (r) {
            if (!r.ok) return { status: r.status, data: r.data };
            if (!m.memberId) return { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } };
            return restGet('members?id=eq.' + m.memberId + '&select=total_invested&limit=1', tokenInfo).then(function (mr) {
              var cur = (mr && mr[0] && Number(mr[0].total_invested || 0)) || 0;
              return restPatch('members?id=eq.' + m.memberId, { total_invested: cur + amt }, tokenInfo).then(function () {
                return { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } };
              });
            });
          });
        });
      }
      var mInv = pathOnly.match(/^\/api\/admin\/investments\/(\d+)$/);
      if (mInv) {
        if (verb === 'PUT') {
          return restGet('investments?id=eq.' + mInv[1] + '&limit=1', tokenInfo).then(function (rows) {
            var ex = rows && rows[0];
            if (!ex) return { status: 404, data: { error: 'Investment record not found.' } };
            var dur = String(b.duration !== undefined ? b.duration : ex.duration).trim() || '60 Days';
            var newAmt = toNonNegativeNumber(b.amount !== undefined ? b.amount : ex.amount, Number(ex.amount || 0));
            return restPatch('investments?id=eq.' + mInv[1], {
              plan_name: String(b.plan_name !== undefined ? b.plan_name : ex.plan_name).trim(),
              amount: newAmt,
              expected_return: toNonNegativeNumber(b.expected_return !== undefined ? b.expected_return : ex.expected_return, Number(ex.expected_return || 0)),
              duration: dur,
              returns_date: computeReturnsDate(String(ex.created_at || todayISO()), dur, b.returns_date !== undefined ? b.returns_date : ex.returns_date),
              status: String(b.status !== undefined ? b.status : ex.status)
            }, tokenInfo).then(function (uRes) {
              return uRes.ok ? { status: 200, data: { success: true } } : { status: uRes.status, data: uRes.data };
            });
          });
        }
        if (verb === 'DELETE') {
          return restDelete('investments?id=eq.' + mInv[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
      }

      // Savings CRUD
      if (pathOnly === '/api/admin/savings' && verb === 'POST') {
        if (!b.member_phone || !b.account_type) return Promise.resolve({ status: 400, data: { error: 'Client phone and account type are required.' } });
        return resolveMemberAdmin(b.member_phone, b.member_name, tokenInfo).then(function (m) {
          var bal = toNonNegativeNumber(b.balance, 0);
          var acct = String(b.account_type).trim();
          return restPost('savings', {
            member_id: m.memberId,
            member_phone: m.memberPhone,
            member_name: m.memberName,
            account_type: acct,
            balance: bal,
            open_date: todayISO(),
            status: normalizeSavingsStatus(acct, b.status)
          }, tokenInfo).then(function (r) {
            if (!r.ok) return { status: r.status, data: r.data };
            if (!m.memberId || bal <= 0) return { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } };
            return restGet('members?id=eq.' + m.memberId + '&select=balance&limit=1', tokenInfo).then(function (mr) {
              var cur = (mr && mr[0] && Number(mr[0].balance || 0)) || 0;
              return restPatch('members?id=eq.' + m.memberId, { balance: cur + bal }, tokenInfo).then(function () {
                return { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } };
              });
            });
          });
        });
      }
      var mSav = pathOnly.match(/^\/api\/admin\/savings\/(\d+)$/);
      if (mSav) {
        if (verb === 'PUT') {
          return restGet('savings?id=eq.' + mSav[1] + '&limit=1', tokenInfo).then(function (rows) {
            var ex = rows && rows[0];
            if (!ex) return { status: 404, data: { error: 'Savings record not found.' } };
            var acct = String(b.account_type !== undefined ? b.account_type : ex.account_type).trim();
            return restPatch('savings?id=eq.' + mSav[1], {
              account_type: acct,
              balance: toNonNegativeNumber(b.balance !== undefined ? b.balance : ex.balance, Number(ex.balance || 0)),
              status: normalizeSavingsStatus(acct, b.status !== undefined ? b.status : ex.status)
            }, tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
          });
        }
        if (verb === 'DELETE') {
          return restDelete('savings?id=eq.' + mSav[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
      }

      // Loans CRUD
      if (pathOnly === '/api/admin/loans' && verb === 'POST') {
        if (!b.member_phone || !b.amount) return Promise.resolve({ status: 400, data: { error: 'Client phone and loan amount are required.' } });
        return resolveMemberAdmin(b.member_phone, b.member_name, tokenInfo).then(function (m) {
          var dur = String(b.duration || '30 days').trim();
          var reqDate = String(b.request_date || todayISO());
          return restPost('loans', {
            member_id: m.memberId,
            member_phone: m.memberPhone,
            member_name: m.memberName,
            amount: toNonNegativeNumber(b.amount, 0),
            purpose: String(b.purpose || '').trim(),
            duration: dur,
            interest_rate: String(b.interest_rate || '10%').trim(),
            status: String(b.status || 'active'),
            request_date: reqDate,
            return_date: computeLoanReturnDate(reqDate, dur, b.return_date)
          }, tokenInfo).then(function (r) {
            return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
          });
        });
      }
      var mLoan = pathOnly.match(/^\/api\/admin\/loans\/(\d+)$/);
      if (mLoan) {
        if (verb === 'PUT') {
          return restGet('loans?id=eq.' + mLoan[1] + '&limit=1', tokenInfo).then(function (rows) {
            var ex = rows && rows[0];
            if (!ex) return { status: 404, data: { error: 'Loan record not found.' } };
            var dur = String(b.duration !== undefined ? b.duration : ex.duration).trim() || '30 days';
            var reqDate = String(b.request_date !== undefined ? b.request_date : (ex.request_date || todayISO()));
            return restPatch('loans?id=eq.' + mLoan[1], {
              amount: toNonNegativeNumber(b.amount !== undefined ? b.amount : ex.amount, Number(ex.amount || 0)),
              purpose: String(b.purpose !== undefined ? b.purpose : ex.purpose).trim(),
              duration: dur,
              interest_rate: String(b.interest_rate !== undefined ? b.interest_rate : ex.interest_rate).trim(),
              return_date: computeLoanReturnDate(reqDate, dur, b.return_date !== undefined ? b.return_date : ex.return_date),
              status: String(b.status !== undefined ? b.status : ex.status)
            }, tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
          });
        }
        if (verb === 'DELETE') {
          return restDelete('loans?id=eq.' + mLoan[1], tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        }
      }

      // Member Cycles CRUD
      if (pathOnly === '/api/admin/member-cycles' && verb === 'POST') {
        if (!b.cycle_name) return Promise.resolve({ status: 400, data: { error: 'Cycle name is required.' } });
        return resolveMemberAdmin(b.member_phone || '', b.member_name || '', tokenInfo).then(function (m) {
          var totalC = Math.max(2, Number(b.number_of_members || 10));
          return restPost('member_cycles', {
            member_id: m.memberId,
            member_phone: m.memberPhone,
            member_name: m.memberName,
            cycle_name: String(b.cycle_name).trim(),
            contribution: toNonNegativeNumber(b.contribution, 0),
            payout_duration: String(b.payout_duration || 'Monthly').trim(),
            number_of_members: totalC,
            cycle_number: Math.min(totalC, Math.max(1, Number(b.cycle_number || 1))),
            cycle_type: String(b.cycle_type || 'public').toLowerCase() === 'custom' ? 'custom' : 'public',
            join_date: String(b.join_date || todayISO()),
            status: String(b.status || 'active')
          }, tokenInfo).then(function (r) {
            return r.ok ? { status: 201, data: { id: (r.data && r.data[0] && r.data[0].id) || Date.now() } } : { status: r.status, data: r.data };
          });
        });
      }
      var mCyc = pathOnly.match(/^\/api\/admin\/member-cycles\/(\d+)$/);
      if (mCyc) {
        if (verb === 'PUT') {
          return restGet('member_cycles?id=eq.' + mCyc[1] + '&limit=1', tokenInfo).then(function (rows) {
            var ex = rows && rows[0];
            if (!ex) return { status: 404, data: { error: 'Cycle record not found.' } };
            var nextTot = Math.max(2, Number(b.number_of_members !== undefined ? b.number_of_members : (ex.number_of_members || 10)));
            var nextStatus = String(b.status !== undefined ? b.status : ex.status);
            var prevLower = String(ex.status || 'active').toLowerCase();
            var nextLower = nextStatus.toLowerCase();
            var transExit = prevLower !== 'exited' && prevLower !== 'stopped' && (nextLower === 'exited' || nextLower === 'stopped');
            var cName = String(b.cycle_name !== undefined ? b.cycle_name : ex.cycle_name).trim();
            return restPatch('member_cycles?id=eq.' + mCyc[1], {
              cycle_name: cName,
              contribution: toNonNegativeNumber(b.contribution !== undefined ? b.contribution : ex.contribution, Number(ex.contribution || 0)),
              payout_duration: String(b.payout_duration !== undefined ? b.payout_duration : ex.payout_duration).trim(),
              number_of_members: nextTot,
              cycle_number: Math.min(nextTot, Math.max(1, Number(b.cycle_number !== undefined ? b.cycle_number : (ex.cycle_number || 1)))),
              cycle_type: String(b.cycle_type !== undefined ? b.cycle_type : (ex.cycle_type || 'public')).toLowerCase() === 'custom' ? 'custom' : 'public',
              status: nextStatus
            }, tokenInfo).then(function (r) {
              if (!r.ok) return { status: r.status, data: r.data };
              if (!transExit) return { status: 200, data: { success: true } };
              var processedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
              return Promise.all([
                restPatch('cycle_exit_requests?member_cycle_id=eq.' + mCyc[1] + '&status=eq.pending', { status: 'approved', processed_at: processedAt }, tokenInfo),
                notifyCyclePeersAdmin({ cycle_name: cName, member_id: ex.member_id, member_phone: ex.member_phone, member_name: ex.member_name }, ex.member_name, tokenInfo)
              ]).then(function () { return { status: 200, data: { success: true } }; });
            });
          });
        }
        if (verb === 'DELETE') {
          return restDelete('cycle_exit_requests?member_cycle_id=eq.' + mCyc[1], tokenInfo).then(function () {
            return restDelete('member_cycles?id=eq.' + mCyc[1], tokenInfo).then(function (r) {
              return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
            });
          });
        }
      }

      // Service Requests
      var mReq = pathOnly.match(/^\/api\/admin\/requests\/(\d+)$/);
      if (mReq) {
        if (verb === 'PUT') {
          return restPatch('service_requests?id=eq.' + mReq[1], { status: String(b.status || 'reviewed') }, tokenInfo).then(function (r) {
            return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
          });
        }
        if (verb === 'DELETE') {
          return restDelete('service_requests?id=eq.' + mReq[1], tokenInfo).then(function (r) {
            return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
          });
        }
      }

      // Deletion Requests Process
      var mDel = pathOnly.match(/^\/api\/admin\/deletion-requests\/(\d+)\/process$/);
      if (mDel && verb === 'POST') {
        return restGet('deletion_requests?id=eq.' + mDel[1] + '&limit=1', tokenInfo).then(function (rows) {
          var reqRow = rows && rows[0];
          if (!reqRow) return { status: 404, data: { error: 'Deletion request not found.' } };
          var processedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
          var act = String(b.action || '');
          if (act === 'purge') {
            var p = normalizePhone(reqRow.phone);
            return restGet('members?phone=eq.' + encodeURIComponent(p) + '&limit=1', tokenInfo).then(function (mRows) {
              var mem = mRows && mRows[0];
              var ops = [restDelete('service_requests?applicant_phone=eq.' + encodeURIComponent(p), tokenInfo)];
              if (mem) {
                var f = 'or=(member_id.eq.' + mem.id + ',member_phone.eq.' + encodeURIComponent(mem.phone) + ')';
                ops.push(
                  restDelete('investments?' + f, tokenInfo),
                  restDelete('savings?' + f, tokenInfo),
                  restDelete('loans?' + f, tokenInfo),
                  restDelete('member_cycles?' + f, tokenInfo),
                  restDelete('cycle_exit_requests?' + f, tokenInfo),
                  restDelete('client_notifications?' + f, tokenInfo),
                  restDelete('members?id=eq.' + mem.id, tokenInfo)
                );
              }
              return Promise.all(ops).then(function () {
                return restPatch('deletion_requests?id=eq.' + mDel[1], { status: 'completed', processed_at: processedAt }, tokenInfo);
              });
            }).then(function () { return { status: 200, data: { success: true } }; });
          }
          return restPatch('deletion_requests?id=eq.' + mDel[1], {
            status: act === 'reject' ? 'rejected' : 'completed',
            processed_at: processedAt
          }, tokenInfo).then(function (r) { return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data }; });
        });
      }

      // Cycle Exit Request Process
      var mExit = pathOnly.match(/^\/api\/admin\/cycle-exit-requests\/(\d+)\/process$/);
      if (mExit && verb === 'POST') {
        var exitId = mExit[1];
        var action = String(b.action || '').toLowerCase();
        if (action !== 'approve' && action !== 'decline') {
          return Promise.resolve({ status: 400, data: { error: 'Action must be approve or decline.' } });
        }
        return restGet('cycle_exit_requests?id=eq.' + exitId + '&limit=1', tokenInfo).then(function (rows) {
          var reqRow = rows && rows[0];
          if (!reqRow) return { status: 404, data: { error: 'Cycle exit request not found.' } };
          if (String(reqRow.status || 'pending').toLowerCase() !== 'pending') {
            return { status: 409, data: { error: 'This cycle exit request has already been processed.' } };
          }
          var processedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
          if (action === 'approve') {
            var finalSt = String(reqRow.action_type || 'exit').toLowerCase() === 'stop' ? 'stopped' : 'exited';
            return restGet('member_cycles?id=eq.' + reqRow.member_cycle_id + '&limit=1', tokenInfo).then(function (cRows) {
              var cycRow = cRows && cRows[0];
              var ops = [
                restPatch('cycle_exit_requests?id=eq.' + exitId, { status: 'approved', processed_at: processedAt }, tokenInfo),
                notifyCyclePeersAdmin({
                  cycle_name: (cycRow && cycRow.cycle_name) || reqRow.cycle_name,
                  member_id: cycRow ? cycRow.member_id : reqRow.member_id,
                  member_phone: (cycRow && cycRow.member_phone) || reqRow.member_phone,
                  member_name: (cycRow && cycRow.member_name) || reqRow.member_name
                }, reqRow.member_name, tokenInfo),
                restPost('client_notifications', {
                  member_id: reqRow.member_id || null,
                  member_phone: String(reqRow.member_phone || ''),
                  notif_type: 'cycle_exit_approved',
                  cycle_name: String(reqRow.cycle_name || ''),
                  title: 'Cycle Exit Approved',
                  message: 'Your request to exit ' + reqRow.cycle_name + ' was approved by Admin.',
                  is_read: 0
                }, tokenInfo, 'return=minimal')
              ];
              if (cycRow) ops.push(restPatch('member_cycles?id=eq.' + cycRow.id, { status: finalSt }, tokenInfo));
              return Promise.all(ops).then(function () { return { status: 200, data: { success: true, status: 'approved' } }; });
            });
          }
          return Promise.all([
            restPatch('cycle_exit_requests?id=eq.' + exitId, { status: 'declined', processed_at: processedAt }, tokenInfo),
            restPatch('member_cycles?id=eq.' + reqRow.member_cycle_id + '&status=eq.exit_pending', { status: 'active' }, tokenInfo),
            restPost('client_notifications', {
              member_id: reqRow.member_id || null,
              member_phone: String(reqRow.member_phone || ''),
              notif_type: 'cycle_exit_declined',
              cycle_name: String(reqRow.cycle_name || ''),
              title: 'Cycle Exit Declined',
              message: 'Your request to exit ' + reqRow.cycle_name + ' was declined by Admin. Your cycle remains active.',
              is_read: 0
            }, tokenInfo, 'return=minimal')
          ]).then(function () { return { status: 200, data: { success: true, status: 'declined' } }; });
        });
      }
    }

    return Promise.resolve(null);
  }

  window.ShimogySupabase = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    isConfigured: function () { return true; },
    isSchemaReady: function () { return !schemaMissing; },
    getPublicSiteData: getPublicSiteData,
    createServiceRequest: createServiceRequest,
    createDeletionRequest: createDeletionRequest,
    handleApi: handleApi
  };
})();
