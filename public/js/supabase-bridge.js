/* SHIMOGY Supabase Auth, Member Portal RPC & PostgREST Live Bridge (Cross-Device / All Hosts) */
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

  function nowTimestampISO() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
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
    delete copy.pg_pass_hash;
    return copy;
  }

  // Synchronous UTF-8 SHA-256 hex helper (matches PostgreSQL pgcrypto convert_to + sha256)
  function sha256Hex(str) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var bytes = unescape(encodeURIComponent(String(str)));
    var words = [];
    var i;
    for (i = 0; i < bytes.length; i++) {
      words[i >> 2] = (words[i >> 2] || 0) | ((bytes.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8));
    }
    var bitLen = bytes.length * 8;
    words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (24 - (bitLen % 32)));
    words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    var w = new Array(64);
    var rotr = function (n, x) { return (x >>> n) | (x << (32 - n)); };

    for (i = 0; i < words.length; i += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t = 0; t < 64; t++) {
        if (t < 16) {
          w[t] = words[i + t] | 0;
        } else {
          var s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
          var s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
          w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }
        var S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        var ch = (e & f) ^ ((~e) & g);
        var temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return (v >>> 0).toString(16).padStart(8, '0'); }).join('');
  }

  function randomHex(byteCount) {
    var out = '';
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var arr = new Uint8Array(byteCount);
      window.crypto.getRandomValues(arr);
      for (var i = 0; i < arr.length; i++) {
        out += arr[i].toString(16).padStart(2, '0');
      }
      return out;
    }
    for (var j = 0; j < byteCount; j++) {
      out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    }
    return out;
  }

  function hashPgPassword(password) {
    var salt = randomHex(16);
    var digest = sha256Hex(salt + ':' + String(password));
    return 'sha256:' + salt + ':' + digest;
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
    if (t.indexOf('sb_adm_') === 0) return { prefix: 'sb_adm_', role: 'admin', jwt: t.slice(7), raw: t };
    if (t.indexOf('sb_mem_') === 0) return { prefix: 'sb_mem_', role: 'member', jwt: t.slice(7), raw: t };
    if (t.indexOf('pg_mem_') === 0) return { prefix: 'pg_mem_', role: 'member', jwt: '', raw: t };
    return { prefix: '', role: '', jwt: '', raw: '' };
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
    if (!rt || !tokenInfo || !tokenInfo.prefix || !tokenInfo.jwt) return Promise.resolve(null);
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
          if (res.status === 401 && !retried && tokenInfo.prefix && tokenInfo.jwt) {
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

  function normalizeMemberProfile(rawMember) {
    if (!rawMember) return rawMember;
    var clean = sanitizeMember(rawMember);
    clean.investments = (rawMember.investments || []).map(function (inv) {
      return Object.assign({}, inv, {
        returns_date: inv.returns_date || computeReturnsDate(String(inv.created_at || todayISO()), String(inv.duration || '60 Days'))
      });
    });
    clean.savings = (rawMember.savings || []).map(function (s) {
      return Object.assign({}, s, {
        status: normalizeSavingsStatus(s.account_type, s.status)
      });
    });
    clean.loans = (rawMember.loans || []).map(function (l) {
      return Object.assign({}, l, {
        return_date: l.return_date || computeLoanReturnDate(String(l.request_date || todayISO()), String(l.duration || '30 days'))
      });
    });
    clean.cycles = rawMember.cycles || [];
    clean.notifications = rawMember.notifications || [];
    return clean;
  }

  function belongsToMemberRow(row, memberId, normSelfPhone) {
    if (row.member_id !== null && row.member_id !== undefined) {
      return Number(row.member_id) === Number(memberId);
    }
    var rNorm = normalizePhone(String(row.member_phone || ''));
    return Boolean(normSelfPhone && rNorm && rNorm === normSelfPhone);
  }

  function buildStrictMemberFilter(memberId, memberPhone) {
    var cleanPhone = String(memberPhone || '').trim();
    if (!cleanPhone) return 'member_id=eq.' + encodeURIComponent(memberId);
    return 'or=(member_id.eq.' + encodeURIComponent(memberId) + ',and(member_id.is.null,member_phone.eq.' + encodeURIComponent(cleanPhone) + '))';
  }

  function fetchMemberFullProfileRest(tokenInfo) {
    if (tokenInfo.prefix === 'pg_mem_' && tokenInfo.raw) {
      return rpcCall('member_portal_get_profile', { p_token: tokenInfo.raw }).then(function (r) {
        if (!r.ok || !r.data) {
          return { ok: false, status: r.status || 401, data: r.data || { error: 'Session expired. Please sign in again.' } };
        }
        if (!r.data.ok || !r.data.member) {
          return {
            ok: false,
            status: Number(r.data.status || 401),
            data: { error: r.data.error || 'Session expired. Please sign in again.' }
          };
        }
        return { ok: true, status: 200, data: { member: normalizeMemberProfile(r.data.member) } };
      });
    }

    return authRequest('user', 'GET', undefined, tokenInfo.jwt).then(function (uRes) {
      var authEmail = String((uRes.ok && uRes.data && uRes.data.email) || '').trim().toLowerCase();
      if (!authEmail) {
        return { ok: false, status: 401, data: { error: 'Session expired. Please sign in again.' } };
      }
      return restRaw('GET', 'members?email=ilike.' + encodeURIComponent(authEmail) + '&select=*&limit=1', undefined, tokenInfo).then(function (mRes) {
        if (!mRes.ok) return { ok: false, status: mRes.status, data: mRes.data };
        var member = Array.isArray(mRes.data) && mRes.data[0] ? mRes.data[0] : null;
        if (!member) {
          return {
            ok: false,
            status: 404,
            data: { error: 'No client ledger profile matches your Supabase Auth email. Ask Operations to link your email in Clients Directory.' }
          };
        }
        var mId = Number(member.id);
        var normPhone = normalizePhone(member.phone || '');
        var filt = buildStrictMemberFilter(mId, member.phone);

        return Promise.all([
          restGet('investments?' + filt + '&order=id.desc', tokenInfo),
          restGet('savings?' + filt + '&order=id.desc', tokenInfo),
          restGet('loans?' + filt + '&order=id.desc', tokenInfo),
          restGet('member_cycles?' + filt + '&order=id.desc', tokenInfo),
          restGet('client_notifications?' + filt + '&order=id.desc&limit=30', tokenInfo),
          rpcCall('get_my_cycle_co_members', {}, tokenInfo)
        ]).then(function (parts) {
          var invs = (parts[0] || []).filter(function (row) { return belongsToMemberRow(row, mId, normPhone); });
          var savs = (parts[1] || []).filter(function (row) { return belongsToMemberRow(row, mId, normPhone); });
          var loans = (parts[2] || []).filter(function (row) { return belongsToMemberRow(row, mId, normPhone); });
          var rawCycs = (parts[3] || []).filter(function (row) { return belongsToMemberRow(row, mId, normPhone); });
          var notifs = (parts[4] || []).filter(function (row) { return belongsToMemberRow(row, mId, normPhone); });
          var peerRows = parts[5] && parts[5].ok && Array.isArray(parts[5].data) ? parts[5].data : [];
          var cycles = attachCoMembers(rawCycs, peerRows);
          var profile = normalizeMemberProfile(
            Object.assign({}, member, {
              investments: invs,
              savings: savs,
              loans: loans,
              cycles: cycles,
              notifications: notifs
            })
          );
          return { ok: true, status: 200, data: { member: profile } };
        });
      });
    });
  }

  function resolveMemberAdmin(identifierInput, fallbackName, tokenInfo) {
    var raw = String(identifierInput || '').trim();
    var isEmail = raw.indexOf('@') !== -1;
    var phone = isEmail ? '' : normalizePhone(raw);
    var queryPath = isEmail
      ? 'members?email=ilike.' + encodeURIComponent(raw.toLowerCase()) + '&select=id,name,phone,email&limit=1'
      : 'members?or=(phone.eq.' + encodeURIComponent(phone) + ',phone.eq.' + encodeURIComponent(raw) + ')&select=id,name,phone,email&limit=1';
    return restGet(queryPath, tokenInfo).then(function (rows) {
      var m = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!m && isEmail) {
        return { found: false, isEmail: true, memberId: null, memberPhone: '', memberName: '' };
      }
      return {
        found: Boolean(m),
        isEmail: isEmail,
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
    // ADMIN & CLIENT PORTAL SIGN-IN ENDPOINTS
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
        var admInfo = { prefix: 'sb_adm_', role: 'admin', jwt: jwt, raw: 'sb_adm_' + jwt };

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
        return Promise.resolve({ status: 400, data: { error: 'Phone number (or email) and password are required.' } });
      }

      // 1. Primary path: verify against Admin-assigned phone/email + password via live Postgres RPC
      return rpcCall('verify_member_portal_login', {
        p_identifier: rawId,
        p_password: memPass
      }).then(function (rpcRes) {
        if (rpcRes.ok && rpcRes.data && rpcRes.data.ok && rpcRes.data.token) {
          var pgToken = String(rpcRes.data.token);
          var pgInfo = { prefix: 'pg_mem_', role: 'member', jwt: '', raw: pgToken };
          return fetchMemberFullProfileRest(pgInfo).then(function (profRes) {
            if (!profRes.ok) return { status: profRes.status, data: profRes.data };
            return {
              status: 200,
              data: {
                token: pgToken,
                member: profRes.data.member
              }
            };
          });
        }

        // 2. Fallback: Supabase Auth email login (if registered separately in Supabase Auth Users)
        if (rawId.indexOf('@') !== -1) {
          return authRequest('token?grant_type=password', 'POST', { email: rawId.toLowerCase(), password: memPass }).then(function (authRes) {
            if (!authRes.ok || !authRes.data || !authRes.data.access_token) {
              return { status: 401, data: { error: (rpcRes.data && rpcRes.data.error) || 'Invalid phone/email or password.' } };
            }
            var jwt = authRes.data.access_token;
            var memInfo = { prefix: 'sb_mem_', role: 'member', jwt: jwt, raw: 'sb_mem_' + jwt };
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

        var rpcErrMsg = (rpcRes.data && rpcRes.data.error) || 'Invalid phone/email or password.';
        var statusCode = rpcRes.status === 503 ? 503 : 401;
        return { status: statusCode, data: { error: rpcErrMsg } };
      });
    }

    // ============================================================
    // CLIENT PORTAL AUTHENTICATED ROUTES (Postgres RPC & PostgREST + RLS)
    // ============================================================
    if (pathOnly.indexOf('/api/member/') === 0) {
      if (tokenInfo.role !== 'member' || (!tokenInfo.jwt && !tokenInfo.raw)) {
        return Promise.resolve({ status: 401, data: { error: 'Client session required.' } });
      }

      if (pathOnly === '/api/member/me' && verb === 'GET') {
        return fetchMemberFullProfileRest(tokenInfo).then(function (res) {
          return { status: res.status, data: res.data };
        });
      }

      if (pathOnly === '/api/member/change-password' && verb === 'POST') {
        var curPass = String(b.currentPassword || '');
        var nxtPass = String(b.newPassword || '');
        if (tokenInfo.prefix === 'pg_mem_') {
          if (!curPass || nxtPass.length < 4) {
            return Promise.resolve({ status: 400, data: { error: 'Current password and new password (min 4 characters) are required.' } });
          }
          return rpcCall('member_portal_change_password', {
            p_token: tokenInfo.raw,
            p_current_password: curPass,
            p_new_password: nxtPass
          }).then(function (r) {
            if (!r.ok || !r.data) {
              return { status: r.status || 400, data: r.data || { error: 'Failed to update password.' } };
            }
            if (!r.data.ok) {
              return { status: Number(r.data.status || 400), data: { error: r.data.error || 'Could not update password.' } };
            }
            return { status: 200, data: { success: true } };
          });
        }

        if (!curPass || nxtPass.length < 6) {
          return Promise.resolve({ status: 400, data: { error: 'Current password and new password (min 6 chars) are required.' } });
        }
        return authRequest('user', 'GET', undefined, tokenInfo.jwt).then(function (uRes) {
          var email = uRes.ok && uRes.data && uRes.data.email;
          if (!email) return { status: 401, data: { error: 'Session expired. Please sign in again.' } };
          return authRequest('token?grant_type=password', 'POST', { email: email, password: curPass }).then(function (chk) {
            if (!chk.ok) return { status: 400, data: { error: 'Current password is incorrect.' } };
            return authRequest('user', 'PUT', { password: nxtPass }, tokenInfo.jwt).then(function (upd) {
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

        if (tokenInfo.prefix === 'pg_mem_') {
          return rpcCall('member_portal_cycle_action', {
            p_token: tokenInfo.raw,
            p_cycle_id: cycId,
            p_action: act,
            p_reason: reason
          }).then(function (r) {
            if (!r.ok || !r.data) {
              return { status: r.status || 400, data: r.data || { error: 'Unable to update cycle.' } };
            }
            if (!r.data.ok) {
              return { status: Number(r.data.status || 400), data: { error: r.data.error || 'Unable to update cycle.' } };
            }
            return { status: 200, data: r.data };
          });
        }

        return authRequest('user', 'GET', undefined, tokenInfo.jwt).then(function (uRes) {
          var email = String((uRes.ok && uRes.data && uRes.data.email) || '').trim().toLowerCase();
          if (!email) return { status: 401, data: { error: 'Session expired. Please sign in again.' } };
          return Promise.all([
            restGet('members?email=ilike.' + encodeURIComponent(email) + '&select=id,name,phone&limit=1', tokenInfo),
            restGet('member_cycles?id=eq.' + cycId + '&limit=1', tokenInfo),
            rpcCall('get_my_cycle_co_members', {}, tokenInfo)
          ]).then(function (parts) {
            var mem = parts[0] && parts[0][0];
            var cyc = parts[1] && parts[1][0];
            if (!mem || !cyc) return { status: 404, data: { error: 'Cycle record not found.' } };
            var normMemPhone = normalizePhone(mem.phone || '');
            if (!belongsToMemberRow(cyc, Number(mem.id), normMemPhone)) {
              return { status: 403, data: { error: 'You are not authorized to modify this cycle.' } };
            }
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
            return restPatch('member_cycles?id=eq.' + cycId, { status: 'exit_pending' }, tokenInfo).then(function (uRes2) {
              if (!uRes2.ok) return { status: uRes2.status, data: uRes2.data };
              return restGet('cycle_exit_requests?member_cycle_id=eq.' + cycId + '&status=eq.pending&limit=1', tokenInfo).then(function (exRows) {
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
        });
      }

      if (pathOnly === '/api/member/notifications/read-all' && verb === 'POST') {
        if (tokenInfo.prefix === 'pg_mem_') {
          return rpcCall('member_portal_mark_notif_read', { p_token: tokenInfo.raw, p_notif_id: 0 }).then(function (r) {
            return r.ok && r.data && r.data.ok ? { status: 200, data: { success: true } } : { status: r.status || 400, data: r.data };
          });
        }
        return restPatch('client_notifications?is_read=eq.0', { is_read: 1 }, tokenInfo).then(function (r) {
          return r.ok ? { status: 200, data: { success: true } } : { status: r.status, data: r.data };
        });
      }

      var mNotifRead = pathOnly.match(/^\/api\/member\/notifications\/(\d+)\/read$/);
      if (mNotifRead && verb === 'POST') {
        var notifId = Number(mNotifRead[1]);
        if (tokenInfo.prefix === 'pg_mem_') {
          return rpcCall('member_portal_mark_notif_read', { p_token: tokenInfo.raw, p_notif_id: notifId }).then(function (r) {
            return r.ok && r.data && r.data.ok ? { status: 200, data: { success: true } } : { status: r.status || 400, data: r.data };
          });
        }
        return restPatch('client_notifications?id=eq.' + notifId, { is_read: 1 }, tokenInfo).then(function (r) {
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
        if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
          return Promise.resolve({ status: 400, data: { error: 'Please enter a valid administrator email address.' } });
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
            var returnedEmail = String((updRes.data && updRes.data.email) || curEmail).trim().toLowerCase();
            if (payload.email && returnedEmail === payload.email) {
              return restPatch('admin_users?email=ilike.' + encodeURIComponent(curEmail), { email: payload.email }, tokenInfo).then(function () {
                return { status: 200, data: { success: true, email: payload.email } };
              });
            }
            var note = payload.email && returnedEmail !== payload.email
              ? ' Verification link sent to ' + payload.email + '. Your current email stays ' + curEmail + ' until confirmed.'
              : '';
            return { status: 200, data: { success: true, email: curEmail, note: note } };
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
          restGet('cycle_exit_requests?order=id.desc', tokenInfo),
          restGet('client_password_changes?select=id,member_id,member_name,member_phone,member_email,changed_by,change_source,change_note,changed_at&order=id.desc&limit=100', tokenInfo)
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
              cycleExitRequests: parts[13] || [],
              passwordChanges: parts[14] || []
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

      // Member Inspect by Phone or Email
      var mInspect = pathOnly.match(/^\/api\/admin\/member\/(.+)$/);
      if (mInspect && verb === 'GET') {
        var rawParam = decodeURIComponent(mInspect[1]).trim();
        var isMail = rawParam.indexOf('@') !== -1;
        var normPhone = isMail ? '' : normalizePhone(rawParam);
        var mQuery = isMail
          ? 'members?email=ilike.' + encodeURIComponent(rawParam.toLowerCase()) + '&limit=1'
          : 'members?or=(phone.eq.' + encodeURIComponent(normPhone) + ',phone.eq.' + encodeURIComponent(rawParam) + ')&limit=1';
        return restGet(mQuery, tokenInfo).then(function (mRows) {
          var mem = Array.isArray(mRows) && mRows[0] ? mRows[0] : null;
          if (!mem) return { status: 404, data: { error: 'Client not found.' } };
          var mId = Number(mem.id);
          var mPhoneNorm = normalizePhone(mem.phone || '');
          var filt = buildStrictMemberFilter(mId, mem.phone);
          return Promise.all([
            restGet('investments?' + filt + '&order=id.desc', tokenInfo),
            restGet('savings?' + filt + '&order=id.desc', tokenInfo),
            restGet('loans?' + filt + '&order=id.desc', tokenInfo),
            restGet('member_cycles?' + filt + '&order=id.desc', tokenInfo),
            restGet('client_notifications?' + filt + '&order=id.desc&limit=30', tokenInfo),
            restGet('client_password_changes?member_id=eq.' + mId + '&select=id,member_id,member_name,member_phone,member_email,changed_by,change_source,change_note,changed_at&order=id.desc&limit=25', tokenInfo)
          ]).then(function (parts) {
            var profile = normalizeMemberProfile(
              Object.assign({}, mem, {
                investments: (parts[0] || []).filter(function (row) { return belongsToMemberRow(row, mId, mPhoneNorm); }),
                savings: (parts[1] || []).filter(function (row) { return belongsToMemberRow(row, mId, mPhoneNorm); }),
                loans: (parts[2] || []).filter(function (row) { return belongsToMemberRow(row, mId, mPhoneNorm); }),
                cycles: (parts[3] || []).filter(function (row) { return belongsToMemberRow(row, mId, mPhoneNorm); }),
                notifications: (parts[4] || []).filter(function (row) { return belongsToMemberRow(row, mId, mPhoneNorm); })
              })
            );
            profile.password_changes = parts[5] || [];
            return { status: 200, data: { member: profile } };
          });
        });
      }

      // Create Member (+ optional ledgers + password change audit)
      if (pathOnly === '/api/admin/members' && verb === 'POST') {
        var cName = String(b.name || '').trim();
        var cPhone = normalizePhone(b.phone || '');
        var cEmail = String(b.email || '').trim().toLowerCase();
        var cPass = String(b.password || '').trim();
        if (!cName || !cPhone || !cPass) return Promise.resolve({ status: 400, data: { error: 'Name, phone, and password are required.' } });
        if (cEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cEmail)) {
          return Promise.resolve({ status: 400, data: { error: 'Please enter a valid client email address.' } });
        }
        var dupChecks = [restGet('members?phone=eq.' + encodeURIComponent(cPhone) + '&select=id&limit=1', tokenInfo)];
        if (cEmail) dupChecks.push(restGet('members?email=ilike.' + encodeURIComponent(cEmail) + '&select=id&limit=1', tokenInfo));
        return Promise.all(dupChecks).then(function (dups) {
          if (Array.isArray(dups[0]) && dups[0].length) {
            return { status: 409, data: { error: 'A client with that phone number already exists.' } };
          }
          if (cEmail && Array.isArray(dups[1]) && dups[1].length) {
            return { status: 409, data: { error: 'Another client already uses that email address.' } };
          }
          var pgHash = hashPgPassword(cPass);
          var nowTs = nowTimestampISO();
          return restPost('members', {
            name: cName,
            phone: cPhone,
            email: cEmail,
            group_name: String(b.group_name || '').trim(),
            balance: toNonNegativeNumber(b.balance, 0),
            total_invested: toNonNegativeNumber(b.total_invested, 0),
            status: String(b.status || 'active'),
            password_hash: pgHash,
            pg_pass_hash: pgHash,
            password_updated_at: nowTs,
            password_changed_by: 'Admin',
            age_verified: b.age_verified === false ? 0 : 1,
            guardian_name: String(b.guardian_name || '').trim()
          }, tokenInfo).then(function (insRes) {
            if (!insRes.ok) return { status: insRes.status, data: insRes.data };
            var mid = (insRes.data && insRes.data[0] && insRes.data[0].id) || null;
            var ops = [
              restPost('client_password_changes', {
                member_id: mid,
                member_name: cName,
                member_phone: cPhone,
                member_email: cEmail,
                changed_by: 'Admin',
                change_source: 'admin_create',
                change_note: 'Admin assigned initial client portal password.',
                changed_at: nowTs
              }, tokenInfo, 'return=minimal')
            ];
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
            var uEmail = String(b.email !== undefined ? b.email : (ex.email || '')).trim().toLowerCase();
            if (uEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uEmail)) {
              return { status: 400, data: { error: 'Please enter a valid client email address.' } };
            }
            var emailConflictPromise = uEmail
              ? restGet('members?email=ilike.' + encodeURIComponent(uEmail) + '&id=neq.' + targetId + '&select=id&limit=1', tokenInfo)
              : Promise.resolve([]);
            return emailConflictPromise.then(function (conflicts) {
              if (uEmail && Array.isArray(conflicts) && conflicts.length) {
                return { status: 409, data: { error: 'Another client already uses that email address.' } };
              }
              var patchData = {
                name: uName,
                phone: uPhone,
                email: uEmail,
                group_name: String(b.group_name !== undefined ? b.group_name : ex.group_name).trim(),
                balance: toNonNegativeNumber(b.balance !== undefined ? b.balance : ex.balance, Number(ex.balance || 0)),
                total_invested: toNonNegativeNumber(b.total_invested !== undefined ? b.total_invested : ex.total_invested, Number(ex.total_invested || 0)),
                status: String(b.status !== undefined ? b.status : ex.status)
              };
              var newPassStr = b.password && String(b.password).trim() ? String(b.password).trim() : '';
              var nowTs = nowTimestampISO();
              if (newPassStr) {
                var pgHash = hashPgPassword(newPassStr);
                patchData.pg_pass_hash = pgHash;
                patchData.password_hash = pgHash;
                patchData.password_updated_at = nowTs;
                patchData.password_changed_by = 'Admin';
              }
              return restPatch('members?id=eq.' + targetId, patchData, tokenInfo).then(function (uRes) {
                if (!uRes.ok) return { status: uRes.status, data: uRes.data };
                var sideOps = [
                  restPatch('investments?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo),
                  restPatch('savings?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo),
                  restPatch('loans?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo),
                  restPatch('member_cycles?member_id=eq.' + targetId, { member_phone: uPhone, member_name: uName }, tokenInfo)
                ];
                if (newPassStr) {
                  sideOps.push(
                    restPost('client_password_changes', {
                      member_id: targetId,
                      member_name: uName,
                      member_phone: uPhone,
                      member_email: uEmail,
                      changed_by: 'Admin',
                      change_source: 'admin_reset',
                      change_note: 'Admin reset client portal password.',
                      changed_at: nowTs
                    }, tokenInfo, 'return=minimal')
                  );
                }
                return Promise.all(sideOps).then(function () { return { status: 200, data: { success: true } }; });
              });
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
              restDelete('client_notifications?' + filt, tokenInfo),
              restDelete('client_password_changes?' + filt, tokenInfo)
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
        var invIdent = String(b.member_phone || b.member_email || b.member_identifier || '').trim();
        if (!invIdent || !b.plan_name || !b.amount) return Promise.resolve({ status: 400, data: { error: 'Client phone (or email), plan name, and amount are required.' } });
        return resolveMemberAdmin(invIdent, b.member_name, tokenInfo).then(function (m) {
          if (m.isEmail && !m.found) return { status: 404, data: { error: 'No client account found matching that email address.' } };
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
        var savIdent = String(b.member_phone || b.member_email || b.member_identifier || '').trim();
        if (!savIdent || !b.account_type) return Promise.resolve({ status: 400, data: { error: 'Client phone (or email) and account type are required.' } });
        return resolveMemberAdmin(savIdent, b.member_name, tokenInfo).then(function (m) {
          if (m.isEmail && !m.found) return { status: 404, data: { error: 'No client account found matching that email address.' } };
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
        var loanIdent = String(b.member_phone || b.member_email || b.member_identifier || '').trim();
        if (!loanIdent || !b.amount) return Promise.resolve({ status: 400, data: { error: 'Client phone (or email) and loan amount are required.' } });
        return resolveMemberAdmin(loanIdent, b.member_name, tokenInfo).then(function (m) {
          if (m.isEmail && !m.found) return { status: 404, data: { error: 'No client account found matching that email address.' } };
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
        var cycIdent = String(b.member_phone || b.member_email || b.member_identifier || '').trim();
        if (!b.cycle_name) return Promise.resolve({ status: 400, data: { error: 'Cycle name is required.' } });
        return resolveMemberAdmin(cycIdent, b.member_name || '', tokenInfo).then(function (m) {
          if (m.isEmail && !m.found) return { status: 404, data: { error: 'No client account found matching that email address.' } };
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
              var processedAt = nowTimestampISO();
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
          var processedAt = nowTimestampISO();
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
                  restDelete('client_password_changes?' + f, tokenInfo),
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
          var processedAt = nowTimestampISO();
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
