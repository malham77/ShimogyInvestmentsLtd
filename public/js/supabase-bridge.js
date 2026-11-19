/* SHIMOGY Supabase REST Bridge (Static Cloudflare Pages & Cross-Platform Catalog / Public Submissions) */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ihgfsvkcpgxklotjmokl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_jvFnU7agmMpbWk3HVPDn5g_3YQn9_xC';
  var schemaMissing = false;

  function getNativeFetch() {
    if (typeof window.ShimogyNativeFetch === 'function') return window.ShimogyNativeFetch;
    if (typeof window.fetch === 'function') return window.fetch.bind(window);
    return null;
  }

  function normalizePhone(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.indexOf('256') === 0 && digits.length >= 12) {
      return '0' + digits.slice(3);
    }
    return digits || String(phone || '').trim();
  }

  function sbHeaders(extra) {
    return Object.assign(
      {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        Accept: 'application/json'
      },
      extra || {}
    );
  }

  function restGet(path) {
    var fetchFn = getNativeFetch();
    if (!fetchFn || schemaMissing) return Promise.resolve(null);
    return fetchFn(SUPABASE_URL + '/rest/v1/' + path, {
      method: 'GET',
      headers: sbHeaders()
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            if (txt.indexOf('PGRST205') !== -1 || res.status === 404) {
              schemaMissing = true;
            }
            return null;
          });
        }
        return res.json();
      })
      .catch(function () {
        return null;
      });
  }

  function restPost(table, payload) {
    var fetchFn = getNativeFetch();
    if (!fetchFn || schemaMissing) return Promise.resolve(null);
    return fetchFn(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: sbHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            if (txt.indexOf('PGRST205') !== -1 || res.status === 404) {
              schemaMissing = true;
            }
            return null;
          });
        }
        return res.text().then(function (txt) {
          if (!txt) return [{ id: Date.now(), ok: true }];
          try {
            var parsed = JSON.parse(txt);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch (_e) {
            return [{ id: Date.now(), ok: true }];
          }
        });
      })
      .catch(function () {
        return null;
      });
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
      var heroSlides = parts[1];
      var testimonials = parts[2];
      var plans = parts[3];
      var publicCycles = parts[4];
      var updates = parts[5];

      if (!Array.isArray(settingsRows) || !settingsRows.length) {
        return null;
      }

      var settings = {};
      settingsRows.forEach(function (r) {
        if (r && r.key) settings[r.key] = String(r.value || '');
      });

      return {
        source: 'supabase',
        settings: settings,
        heroSlides: Array.isArray(heroSlides) ? heroSlides : [],
        testimonials: Array.isArray(testimonials) ? testimonials : [],
        plans: Array.isArray(plans) ? plans : [],
        publicCycles: Array.isArray(publicCycles) ? publicCycles : [],
        updates: Array.isArray(updates) ? updates : []
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
    return restPost('service_requests', payload).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return null;
      return { id: rows[0].id, status: 'pending' };
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
    return restPost('deletion_requests', payload).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return null;
      return {
        id: rows[0].id,
        message: 'Your data deletion request has been logged. Our compliance team will process and confirm removal within 72 hours.'
      };
    });
  }

  window.ShimogySupabase = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    isConfigured: function () { return true; },
    isSchemaReady: function () { return !schemaMissing; },
    getPublicSiteData: getPublicSiteData,
    createServiceRequest: createServiceRequest,
    createDeletionRequest: createDeletionRequest
  };
})();
