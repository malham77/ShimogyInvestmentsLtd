/* Admin Operations Console Controller */
(function () {
  'use strict';

  var site = window.ShimogySite;
  var TOKEN_KEY = 'shimogy_admin_token';
  var memoryToken = '';
  var adminPieChart = null;
  var adminBarChart = null;
  var state = {
    settings: {},
    members: [],
    investments: [],
    savings: [],
    loans: [],
    memberCycles: [],
    plans: [],
    publicCycles: [],
    updates: [],
    heroSlides: [],
    testimonials: [],
    requests: [],
    deletionRequests: []
  };

  function getToken() {
    if (memoryToken) return memoryToken;
    try {
      memoryToken = localStorage.getItem(TOKEN_KEY) || '';
      return memoryToken;
    } catch (_e) {
      return '';
    }
  }

  function setToken(token) {
    memoryToken = token || '';
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_e) {}
  }

  function apiFetch(url, options) {
    var opts = options || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var token = getToken();
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (txt) {
        var data = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch (_e) { data = { error: 'Server returned an unexpected response (' + r.status + ').' }; }
        if (!r.ok) {
          var err = new Error(data.error || 'Request failed (' + r.status + ')');
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function showToast(msg, isError) {
    var el = document.getElementById('globalAdminToast');
    if (!el) return;
    el.innerHTML = '<div class="alert-box ' + (isError ? 'alert-error' : 'alert-success') + '">' + site.escapeHtml(msg) + '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setPreviewImg(previewImgId, url, fallbackUrl) {
    var imgEl = document.getElementById(previewImgId);
    if (!imgEl) return;
    var cleanUrl = String(url || '').trim();
    imgEl.src = site.assetUrl(cleanUrl || fallbackUrl || 'assets/aistudio/logo2_be71428a.jpg');
  }

  function bindImagePreview(urlInputId, previewImgId, fallbackUrl) {
    var urlEl = document.getElementById(urlInputId);
    var imgEl = document.getElementById(previewImgId);
    if (!urlEl || !imgEl) return;
    imgEl.addEventListener('error', function () {
      var safeFallback = site.assetUrl(fallbackUrl);
      if (fallbackUrl && imgEl.getAttribute('src') !== safeFallback) {
        imgEl.src = safeFallback;
      }
    });
    var sync = function () { setPreviewImg(previewImgId, urlEl.value, fallbackUrl); };
    urlEl.addEventListener('input', sync);
    urlEl.addEventListener('change', sync);
  }

  function compressImageDataUrl(dataUrl, maxDim, quality, cb) {
    var str = String(dataUrl || '');
    if (!str.startsWith('data:image/') || str.length <= 95000) {
      cb(str);
      return;
    }
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.width || maxDim;
        var h = img.height || maxDim;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var out = canvas.toDataURL('image/jpeg', quality);
        if (out.length > 112000) {
          out = canvas.toDataURL('image/jpeg', 0.52);
        }
        cb(out);
      } catch (_e) {
        cb(str);
      }
    };
    img.onerror = function () { cb(str); };
    img.src = str;
  }

  // Image upload helper (File -> compressed base64 -> /api/admin/upload -> sets target input URL + preview)
  function bindImageUpload(fileInputId, targetUrlInputId, previewImgId, fallbackUrl) {
    var fileEl = document.getElementById(fileInputId);
    var urlEl = document.getElementById(targetUrlInputId);
    if (!fileEl || !urlEl) return;
    fileEl.addEventListener('change', function () {
      var file = fileEl.files && fileEl.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        compressImageDataUrl(reader.result, 900, 0.74, function (finalDataUrl) {
          apiFetch('/api/admin/upload', {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, dataUrl: finalDataUrl })
          })
            .then(function (res) {
              urlEl.value = res.url;
              if (previewImgId) setPreviewImg(previewImgId, res.url, fallbackUrl);
              showToast('Image saved to database successfully.', false);
            })
            .catch(function (err) {
              showToast('Upload failed: ' + err.message, true);
            });
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function closeMobileSidebar() {
    var sidebar = document.getElementById('adminSidebar');
    var backdrop = document.getElementById('adminSidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  // Sidebar & Tabs Navigation
  function switchTab(tabId, labelText) {
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.sidebar-link').forEach(function (l) { l.classList.remove('active'); });
    var target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    var activeBtn = document.querySelector('.sidebar-link[data-tab="' + tabId + '"]');
    if (activeBtn) {
      activeBtn.classList.add('active');
      document.getElementById('activeTabTitle').textContent = labelText || activeBtn.textContent.trim();
    }
    closeMobileSidebar();
  }

  document.querySelectorAll('.sidebar-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.getAttribute('data-tab'), btn.textContent.trim());
    });
  });

  var toggleBtn = document.getElementById('sidebarToggleBtn');
  var sidebarBackdrop = document.getElementById('adminSidebarBackdrop');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      var sidebar = document.getElementById('adminSidebar');
      var willOpen = sidebar ? !sidebar.classList.contains('open') : false;
      if (sidebar) sidebar.classList.toggle('open', willOpen);
      if (sidebarBackdrop) sidebarBackdrop.classList.toggle('open', willOpen);
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  function renderOverviewCharts() {
    if (typeof window.Chart !== 'function') return;

    var pieCanvas = document.getElementById('adminFundsPie');
    var barCanvas = document.getElementById('adminRequestsBar');
    if (!pieCanvas || !barCanvas) return;

    if (adminPieChart) {
      adminPieChart.destroy();
      adminPieChart = null;
    }
    if (adminBarChart) {
      adminBarChart.destroy();
      adminBarChart = null;
    }

    var isDark = document.documentElement.classList.contains('dark');
    var legendColor = isDark ? '#F1F5F9' : '#0A192F';
    var tickMuted = isDark ? '#CBD5E1' : '#475569';
    var gridColor = isDark ? 'rgba(148, 163, 184, 0.2)' : '#E2E8F0';
    var pieBorder = isDark ? '#0F1C33' : '#FFFFFF';

    var invTotal = state.investments.reduce(function (acc, i) { return acc + Number(i.amount || 0); }, 0);
    var savTotal = state.savings.reduce(function (acc, s) { return acc + Number(s.balance || 0); }, 0);
    var loanTotal = state.loans.reduce(function (acc, l) { return acc + Number(l.amount || 0); }, 0);
    var cycleTotal = state.memberCycles.reduce(function (acc, c) { return acc + Number(c.contribution || 0); }, 0);

    var hasFunds = invTotal > 0 || savTotal > 0 || loanTotal > 0 || cycleTotal > 0;
    adminPieChart = new window.Chart(pieCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: hasFunds
          ? ['Member Investments', 'Savings Deposits', 'Member Loans', 'Cycle Contributions']
          : ['No Financial Balances Recorded'],
        datasets: [{
          data: hasFunds ? [invTotal, savTotal, loanTotal, cycleTotal] : [1],
          backgroundColor: hasFunds ? ['#2563EB', '#10B981', '#F59E0B', '#0EA5E9'] : [isDark ? '#334155' : '#CBD5E1'],
          borderColor: pieBorder,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 14,
              color: legendColor,
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
            }
          }
        }
      }
    });

    var pendingCounts = { investment: 0, savings: 0, cycle: 0, loan: 0 };
    var reviewedCounts = { investment: 0, savings: 0, cycle: 0, loan: 0 };
    state.requests.forEach(function (r) {
      var key = String(r.request_type || '').toLowerCase();
      if (!(key in pendingCounts)) {
        if (key.indexOf('invest') !== -1) key = 'investment';
        else if (key.indexOf('sav') !== -1) key = 'savings';
        else if (key.indexOf('cyc') !== -1) key = 'cycle';
        else if (key.indexOf('loan') !== -1) key = 'loan';
        else return;
      }
      if (String(r.status || '').toLowerCase() === 'pending') pendingCounts[key] += 1;
      else reviewedCounts[key] += 1;
    });

    adminBarChart = new window.Chart(barCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Investments', 'Savings', 'Cycles', 'Loans'],
        datasets: [
          {
            label: 'Pending Review',
            data: [pendingCounts.investment, pendingCounts.savings, pendingCounts.cycle, pendingCounts.loan],
            backgroundColor: '#F59E0B',
            borderRadius: 6
          },
          {
            label: 'Reviewed / Processed',
            data: [reviewedCounts.investment, reviewedCounts.savings, reviewedCounts.cycle, reviewedCounts.loan],
            backgroundColor: '#2563EB',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              color: legendColor,
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0, color: tickMuted, font: { size: 11 } },
            grid: { color: gridColor }
          },
          x: {
            ticks: { color: legendColor, font: { size: 11, weight: '600' } },
            grid: { display: false }
          }
        }
      }
    });
  }

  // Render All Sections
  function renderOverview() {
    document.getElementById('ovMembersCount').textContent = String(state.members.length);
    document.getElementById('ovPlansCount').textContent = String(state.plans.length);
    document.getElementById('ovCyclesCount').textContent = String(state.publicCycles.length);
    var pending = state.requests.filter(function (r) { return r.status === 'pending'; }).length;
    document.getElementById('ovPendingReqCount').textContent = String(pending);

    renderOverviewCharts();

    var invBody = document.getElementById('ovRecentInvBody');
    invBody.innerHTML = state.investments.slice(0, 6).map(function (i) {
      return '<tr><td>' + site.escapeHtml(i.member_name) + '</td><td>' + site.escapeHtml(i.plan_name) + '</td><td class="tabular-nums">' + site.formatUGX(i.amount) + '</td><td>' + site.escapeHtml(i.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">No investments yet.</td></tr>';

    var reqBody = document.getElementById('ovRecentReqBody');
    reqBody.innerHTML = state.requests.slice(0, 6).map(function (r) {
      return '<tr><td>' + site.escapeHtml(r.applicant_name) + '</td><td>' + site.escapeHtml(r.request_type) + '</td><td>' + site.escapeHtml(r.status) + '</td><td>' + site.escapeHtml((r.created_at || '').slice(0, 10)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">No service requests yet.</td></tr>';
  }

  function renderSettings() {
    var s = state.settings || {};
    var map = {
      setCompanyName: 'company_name',
      setSlogan: 'slogan',
      setRegInfo: 'registration_info',
      setAddress: 'address',
      setPhonePrimary: 'phone_primary',
      setPhoneSecondary: 'phone_secondary',
      setWhatsapp: 'whatsapp_number',
      setEmail: 'email',
      setHours: 'working_hours',
      setLogoUrl: 'logo_url',
      setFacebook: 'social_facebook',
      setTiktok: 'social_tiktok',
      setYoutube: 'social_youtube',
      setInstagram: 'social_instagram',
      setStatsMembers: 'stats_members',
      setStatsCapital: 'stats_capital',
      setStatsYears: 'stats_years',
      setStatsHours: 'stats_hours',
      setMission: 'about_mission',
      setVision: 'about_vision',
      setStory: 'about_story',
      setRiskDisclosure: 'risk_disclosure',
      setAgePolicy: 'age_consent_policy',
      quickTickerInput: 'quick_updates_ticker'
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = s[map[id]] || '';
    });
    setPreviewImg('setLogoPreview', s.logo_url, 'assets/aistudio/logo2_be71428a.jpg');
  }

  function renderHeroSlides() {
    var tbody = document.getElementById('heroSlidesTableBody');
    tbody.innerHTML = state.heroSlides.map(function (h) {
      return (
        '<tr>' +
          '<td class="tabular-nums">' + site.escapeHtml(h.sort_order) + '</td>' +
          '<td><img src="' + site.escapeHtml(site.assetUrl(h.image_url)) + '" alt="' + site.escapeHtml(h.image_alt) + '" width="72" height="44" style="object-fit:cover;border-radius:4px;" /></td>' +
          '<td><strong>' + site.escapeHtml(h.title) + '</strong></td>' +
          '<td>' + site.escapeHtml(h.cta_text) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm edit-hero-btn" data-id="' + h.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-hero-btn" data-id="' + h.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="5">No hero slides configured.</td></tr>';

    tbody.querySelectorAll('.edit-hero-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = String(btn.getAttribute('data-id'));
        var item = state.heroSlides.find(function (x) { return String(x.id) === targetId; });
        if (!item) return;
        document.getElementById('heroEditId').value = item.id;
        document.getElementById('heroBadge').value = item.badge_text || '';
        document.getElementById('heroTitle').value = item.title || '';
        document.getElementById('heroSubtitle').value = item.subtitle || '';
        document.getElementById('heroCtaText').value = item.cta_text || '';
        document.getElementById('heroCtaLink').value = item.cta_link || '';
        document.getElementById('heroImageUrl').value = item.image_url || '';
        setPreviewImg('heroImgPreview', item.image_url, 'assets/aistudio/partnership_65dac3a6.jpg');
        document.getElementById('heroImageAlt').value = item.image_alt || '';
        document.getElementById('heroOrder').value = item.sort_order || 1;
        document.getElementById('cancelHeroEditBtn').style.display = 'inline-flex';
      });
    });

    tbody.querySelectorAll('.del-hero-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) {
          btn.dataset.confirmed = '1';
          btn.textContent = 'Confirm?';
          return;
        }
        apiFetch('/api/admin/hero-slides/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Hero slide deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderTestimonials() {
    var tbody = document.getElementById('testimonialsTableBody');
    tbody.innerHTML = state.testimonials.map(function (t) {
      return (
        '<tr>' +
          '<td><img src="' + site.escapeHtml(site.assetUrl(t.photo_url)) + '" alt="' + site.escapeHtml(t.photo_alt) + '" width="44" height="44" style="object-fit:cover;border-radius:50%;" /></td>' +
          '<td><strong>' + site.escapeHtml(t.client_name) + '</strong></td>' +
          '<td>' + site.escapeHtml(t.role) + ' · ' + site.escapeHtml(t.location) + '</td>' +
          '<td style="max-width:300px;">' + site.escapeHtml(t.quote) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm edit-test-btn" data-id="' + t.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-test-btn" data-id="' + t.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="5">No testimonials added yet.</td></tr>';

    tbody.querySelectorAll('.edit-test-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = String(btn.getAttribute('data-id'));
        var item = state.testimonials.find(function (x) { return String(x.id) === targetId; });
        if (!item) return;
        document.getElementById('testEditId').value = item.id;
        document.getElementById('testClientName').value = item.client_name || '';
        document.getElementById('testRole').value = item.role || '';
        document.getElementById('testLocation').value = item.location || '';
        document.getElementById('testOrder').value = item.sort_order || 1;
        document.getElementById('testPhotoUrl').value = item.photo_url || '';
        setPreviewImg('testPhotoPreview', item.photo_url, 'assets/aistudio/josephine_a1a0850e.jpg');
        document.getElementById('testPhotoAlt').value = item.photo_alt || '';
        document.getElementById('testQuote').value = item.quote || '';
        document.getElementById('cancelTestEditBtn').style.display = 'inline-flex';
      });
    });

    tbody.querySelectorAll('.del-test-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/testimonials/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Testimonial removed.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderPlans() {
    var tbody = document.getElementById('plansTableBody');
    tbody.innerHTML = state.plans.map(function (p) {
      return (
        '<tr>' +
          '<td><strong>' + site.escapeHtml(p.name) + '</strong></td>' +
          '<td class="tabular-nums">' + site.formatUGX(p.price) + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(p.expected_return) + '</td>' +
          '<td>' + site.escapeHtml(p.duration) + '</td>' +
          '<td>' + site.escapeHtml(p.risk) + '</td>' +
          '<td class="tabular-nums">' + site.escapeHtml(p.slots_left) + ' (' + site.escapeHtml(p.status) + ')</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm edit-plan-btn" data-id="' + p.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-plan-btn" data-id="' + p.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="7">No public plans yet.</td></tr>';

    tbody.querySelectorAll('.edit-plan-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = String(btn.getAttribute('data-id'));
        var p = state.plans.find(function (x) { return String(x.id) === targetId; });
        if (!p) return;
        document.getElementById('planEditId').value = p.id;
        document.getElementById('planName').value = p.name;
        document.getElementById('planPrice').value = p.price;
        document.getElementById('planReturn').value = p.expected_return;
        document.getElementById('planDuration').value = p.duration;
        document.getElementById('planRisk').value = p.risk;
        document.getElementById('planSlots').value = p.slots_left;
        document.getElementById('planStatus').value = p.status;
        document.getElementById('planBadge').value = p.badge || '';
        document.getElementById('planImageUrl').value = p.image_url;
        setPreviewImg('planImgPreview', p.image_url, 'assets/aistudio/graph_ddbd7244.jpg');
        document.getElementById('planImageAlt').value = p.image_alt || '';
        document.getElementById('planDescription').value = p.description || '';
        document.getElementById('cancelPlanEditBtn').style.display = 'inline-flex';
      });
    });

    tbody.querySelectorAll('.del-plan-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/plans/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Plan deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderPublicCycles() {
    var tbody = document.getElementById('publicCyclesTableBody');
    tbody.innerHTML = state.publicCycles.map(function (c) {
      return (
        '<tr>' +
          '<td><img src="' + site.escapeHtml(site.assetUrl(c.image_url)) + '" alt="' + site.escapeHtml(c.image_alt || c.name) + '" width="64" height="40" style="object-fit:cover;border-radius:4px;" /></td>' +
          '<td><strong>' + site.escapeHtml(c.name) + '</strong></td>' +
          '<td class="tabular-nums">' + site.formatUGX(c.contribution) + '</td>' +
          '<td>' + site.escapeHtml(c.payout_duration) + '</td>' +
          '<td><span class="status-text status-active">Active</span></td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm edit-pub-cyc-btn" data-id="' + c.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-pub-cyc-btn" data-id="' + c.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="6">No public cycles created yet.</td></tr>';

    tbody.querySelectorAll('.edit-pub-cyc-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = String(btn.getAttribute('data-id'));
        var c = state.publicCycles.find(function (x) { return String(x.id) === targetId; });
        if (!c) return;
        document.getElementById('pubCycleEditId').value = c.id;
        document.getElementById('pubCycleName').value = c.name;
        document.getElementById('pubCycleContrib').value = c.contribution;
        document.getElementById('pubCyclePayout').value = c.payout_duration || 'Monthly';
        document.getElementById('pubCycleImageUrl').value = c.image_url;
        setPreviewImg('pubCycleImgPreview', c.image_url, 'assets/aistudio/partnership_65dac3a6.jpg');
        document.getElementById('pubCycleImageAlt').value = c.image_alt || '';
        document.getElementById('pubCycleDesc').value = c.description || '';
        document.getElementById('cancelPubCycleEditBtn').style.display = 'inline-flex';
      });
    });

    tbody.querySelectorAll('.del-pub-cyc-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/public-cycles/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Public cycle deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderUpdates() {
    var tbody = document.getElementById('updatesTableBody');
    tbody.innerHTML = state.updates.map(function (u) {
      return (
        '<tr>' +
          '<td>' + site.escapeHtml(u.published_date) + '</td>' +
          '<td>' + site.escapeHtml(u.category) + '</td>' +
          '<td><strong>' + site.escapeHtml(u.title) + '</strong></td>' +
          '<td><button type="button" class="btn btn-danger btn-sm del-upd-btn" data-id="' + u.id + '">Delete</button></td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="4">No updates published yet.</td></tr>';

    tbody.querySelectorAll('.del-upd-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/updates/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Update removed.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function inspectMemberByPhone(phone) {
    apiFetch('/api/admin/member/' + encodeURIComponent(phone))
      .then(function (data) {
        var m = data.member;
        var card = document.getElementById('memberInspectorCard');
        card.style.display = 'block';
        document.getElementById('inspectorTitle').textContent = 'Editing Member: ' + m.name + ' (' + m.phone + ')';
        document.getElementById('editMemId').value = m.id;
        document.getElementById('editMemName').value = m.name || '';
        document.getElementById('editMemPhone').value = m.phone || '';
        document.getElementById('editMemEmail').value = m.email || '';
        document.getElementById('editMemGroup').value = m.group_name || '';
        document.getElementById('editMemBalance').value = m.balance || 0;
        document.getElementById('editMemInvested').value = m.total_invested || 0;
        document.getElementById('editMemStatus').value = m.status || 'active';
        document.getElementById('editMemNewPass').value = '';

        var ledgers =
          '<h4>Investments (' + m.investments.length + ')</h4>' +
          '<ul class="clean-list">' + (m.investments.map(function (i) { return '<li>' + site.escapeHtml(i.plan_name) + ' — ' + site.formatUGX(i.amount) + ' -> ' + site.formatUGX(i.expected_return) + ' (' + site.escapeHtml(i.duration) + ')</li>'; }).join('') || '<li>None</li>') + '</ul>' +
          '<h4 style="margin-top:12px;">Savings (' + m.savings.length + ')</h4>' +
          '<ul class="clean-list">' + (m.savings.map(function (s) { return '<li>' + site.escapeHtml(s.account_type) + ' — ' + site.formatUGX(s.balance) + '</li>'; }).join('') || '<li>None</li>') + '</ul>' +
          '<h4 style="margin-top:12px;">Loans (' + m.loans.length + ')</h4>' +
          '<ul class="clean-list">' + (m.loans.map(function (l) { return '<li>' + site.formatUGX(l.amount) + ' (' + site.escapeHtml(l.duration) + ' · ' + site.escapeHtml(l.status) + ') — ' + site.escapeHtml(l.purpose) + '</li>'; }).join('') || '<li>None</li>') + '</ul>' +
          '<h4 style="margin-top:12px;">Cycles (' + m.cycles.length + ')</h4>' +
          '<ul class="clean-list">' + (m.cycles.map(function (c) { return '<li>' + site.escapeHtml(c.cycle_name) + ' — ' + site.formatUGX(c.contribution) + ' (' + site.escapeHtml(c.payout_duration) + ', ' + site.escapeHtml(c.number_of_members) + ' members)</li>'; }).join('') || '<li>None</li>') + '</ul>';
        document.getElementById('inspectorLedgers').innerHTML = ledgers;
        card.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function (e) { showToast(e.message, true); });
  }

  function renderMembers(filterText) {
    var q = String(filterText || '').trim().toLowerCase();
    var list = !q ? state.members : state.members.filter(function (m) {
      return String(m.name).toLowerCase().includes(q) || String(m.phone).toLowerCase().includes(q);
    });
    var tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = list.map(function (m) {
      return (
        '<tr>' +
          '<td><strong>' + site.escapeHtml(m.name) + '</strong></td>' +
          '<td class="font-mono-num">' + site.escapeHtml(m.phone) + '</td>' +
          '<td>' + site.escapeHtml(m.group_name || '--') + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(m.balance) + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(m.total_invested) + '</td>' +
          '<td>' + site.escapeHtml(m.status) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm inspect-mem-btn" data-phone="' + site.escapeHtml(m.phone) + '">Inspect / Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-mem-btn" data-id="' + m.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="7">No matching members found.</td></tr>';

    tbody.querySelectorAll('.inspect-mem-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        inspectMemberByPhone(btn.getAttribute('data-phone'));
      });
    });

    tbody.querySelectorAll('.del-mem-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/members/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Member and all linked records deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderAdminLoans() {
    var tbody = document.getElementById('adminLoansTableBody');
    tbody.innerHTML = state.loans.map(function (l) {
      return (
        '<tr>' +
          '<td>' + site.escapeHtml(l.member_name) + '</td>' +
          '<td class="font-mono-num">' + site.escapeHtml(l.member_phone) + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(l.amount) + '</td>' +
          '<td>' + site.escapeHtml(l.duration) + '</td>' +
          '<td>' + site.escapeHtml(l.status) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm mark-loan-paid-btn" data-id="' + l.id + '">Mark Paid</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-loan-btn" data-id="' + l.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="6">No member loans recorded yet.</td></tr>';

    tbody.querySelectorAll('.mark-loan-paid-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        apiFetch('/api/admin/loans/' + btn.getAttribute('data-id'), {
          method: 'PUT',
          body: JSON.stringify({ status: 'paid' })
        }).then(function () { showToast('Loan marked as paid.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });

    tbody.querySelectorAll('.del-loan-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/loans/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Loan deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderRequests() {
    var tbody = document.getElementById('requestsTableBody');
    tbody.innerHTML = state.requests.map(function (r) {
      return (
        '<tr>' +
          '<td class="tabular-nums">#' + r.id + '</td>' +
          '<td>' + site.escapeHtml(r.request_type) + '</td>' +
          '<td><strong>' + site.escapeHtml(r.applicant_name) + '</strong></td>' +
          '<td class="font-mono-num">' + site.escapeHtml(r.applicant_phone) + '</td>' +
          '<td style="max-width:260px;font-size:0.82rem;">' + site.escapeHtml(r.details_json) + '</td>' +
          '<td>' + (r.age_confirmed ? 'Confirmed' : 'Pending') + (r.guardian_name ? ' (Guardian: ' + site.escapeHtml(r.guardian_name) + ')' : '') + '</td>' +
          '<td>' + site.escapeHtml(r.status) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-outline btn-sm req-approve-btn" data-id="' + r.id + '">Mark Reviewed</button>' +
            '<button type="button" class="btn btn-danger btn-sm req-del-btn" data-id="' + r.id + '">Delete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="8">No service requests received yet.</td></tr>';

    tbody.querySelectorAll('.req-approve-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        apiFetch('/api/admin/requests/' + btn.getAttribute('data-id'), {
          method: 'PUT',
          body: JSON.stringify({ status: 'reviewed' })
        }).then(function () { showToast('Request marked reviewed.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });

    tbody.querySelectorAll('.req-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/requests/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Service request deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderDeletionRequests() {
    var tbody = document.getElementById('deletionTableBody');
    tbody.innerHTML = state.deletionRequests.map(function (d) {
      return (
        '<tr>' +
          '<td class="tabular-nums">#' + d.id + '</td>' +
          '<td>' + site.escapeHtml(d.full_name) + '</td>' +
          '<td class="font-mono-num">' + site.escapeHtml(d.phone) + '</td>' +
          '<td>' + site.escapeHtml(d.email || '--') + '</td>' +
          '<td>' + site.escapeHtml(d.reason || '--') + '</td>' +
          '<td>' + site.escapeHtml(d.status) + '</td>' +
          '<td style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-danger btn-sm del-purge-btn" data-id="' + d.id + '">Purge Member Data</button>' +
            '<button type="button" class="btn btn-outline btn-sm del-complete-btn" data-id="' + d.id + '">Complete</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="7">No data deletion requests logged.</td></tr>';

    tbody.querySelectorAll('.del-purge-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm Purge?'; return; }
        apiFetch('/api/admin/deletion-requests/' + btn.getAttribute('data-id') + '/process', {
          method: 'POST',
          body: JSON.stringify({ action: 'purge' })
        }).then(function () { showToast('Member records purged and request completed.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });

    tbody.querySelectorAll('.del-complete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        apiFetch('/api/admin/deletion-requests/' + btn.getAttribute('data-id') + '/process', {
          method: 'POST',
          body: JSON.stringify({ action: 'complete' })
        }).then(function () { showToast('Deletion request marked completed.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function loadOverview(isInteractiveLogin) {
    apiFetch('/api/admin/overview')
      .then(function (data) {
        state = Object.assign(state, data);
        document.getElementById('adminLoginView').style.display = 'none';
        document.getElementById('adminWorkspaceView').style.display = 'flex';
        renderOverview();
        renderSettings();
        renderHeroSlides();
        renderTestimonials();
        renderPlans();
        renderPublicCycles();
        renderUpdates();
        renderMembers(document.getElementById('memberSearchInput').value);
        renderAdminLoans();
        renderRequests();
        renderDeletionRequests();
        if (site && typeof site.observeReveals === 'function') {
          site.observeReveals(document.getElementById('adminMain'));
        }
        return apiFetch('/api/admin/me');
      })
      .then(function (me) {
        if (me && me.admin) {
          document.getElementById('secAdminEmail').value = me.admin.email || '';
        }
      })
      .catch(function (err) {
        if (!err || err.status === 401 || !isInteractiveLogin) {
          setToken('');
          document.getElementById('adminLoginView').style.display = 'flex';
          document.getElementById('adminWorkspaceView').style.display = 'none';
        }
        if (isInteractiveLogin) {
          var fb = document.getElementById('adminLoginFeedback');
          if (fb) fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml((err && err.message) || 'Unable to open dashboard.') + '</div>';
        }
      });
  }

  var togglePassBtn = document.getElementById('toggleAdminPassBtn');
  if (togglePassBtn) {
    togglePassBtn.addEventListener('click', function () {
      var passInput = document.getElementById('adminPasswordInput');
      if (!passInput) return;
      var show = passInput.type === 'password';
      passInput.type = show ? 'text' : 'password';
      togglePassBtn.textContent = show ? 'Hide' : 'Show';
      togglePassBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  }

  // Auth Handlers
  document.getElementById('adminLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('adminEmailInput').value.trim();
    var password = document.getElementById('adminPasswordInput').value;
    var fb = document.getElementById('adminLoginFeedback');
    fb.innerHTML = '';

    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    })
      .then(function (r) {
        return r.text().then(function (txt) {
          var d = {};
          try { d = txt ? JSON.parse(txt) : {}; } catch (_e) { d = { error: 'Server returned status ' + r.status }; }
          return { ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml(res.data.error || 'Login failed.') + '</div>';
          return;
        }
        setToken(res.data.token);
        loadOverview(true);
      })
      .catch(function (err) {
        fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml((err && err.message) || 'Network error. Please try again.') + '</div>';
      });
  });

  function syncCloudButtonVisibility() {
    var connectBtn = document.getElementById('connectCloudBtn');
    if (!connectBtn) return;
    var signedIn = window.ShimogyCloud && typeof window.ShimogyCloud.isAdminSignedIn === 'function' && window.ShimogyCloud.isAdminSignedIn();
    connectBtn.style.display = signedIn ? 'none' : 'inline-flex';
  }

  function handleGoogleAdminSignIn() {
    var fb = document.getElementById('adminLoginFeedback');
    if (fb) fb.innerHTML = '';
    if (!window.ShimogyCloud || typeof window.ShimogyCloud.signInAdminWithGoogle !== 'function') {
      if (fb) fb.innerHTML = '<div class="alert-box alert-error">Google Cloud Sign-In is unavailable offline.</div>';
      else showToast('Google Cloud Sign-In is unavailable offline.', true);
      return;
    }
    window.ShimogyCloud.signInAdminWithGoogle()
      .then(function (res) {
        setToken(res.token);
        syncCloudButtonVisibility();
        loadOverview(true);
        showToast('Signed in with Google Cloud Sync. All edits are now live worldwide.', false);
      })
      .catch(function (err) {
        var msg = (err && err.message) || 'Google Sign-In failed.';
        if (fb && document.getElementById('adminLoginView').style.display !== 'none') {
          fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml(msg) + '</div>';
        } else {
          showToast(msg, true);
        }
      });
  }

  var googleAdminBtn = document.getElementById('googleAdminLoginBtn');
  if (googleAdminBtn) googleAdminBtn.addEventListener('click', handleGoogleAdminSignIn);

  var connectCloudBtn = document.getElementById('connectCloudBtn');
  if (connectCloudBtn) connectCloudBtn.addEventListener('click', handleGoogleAdminSignIn);

  document.getElementById('adminLogoutBtn').addEventListener('click', function () {
    apiFetch('/api/logout', { method: 'POST' }).catch(function () {});
    if (window.ShimogyCloud && typeof window.ShimogyCloud.signOutCloud === 'function') {
      window.ShimogyCloud.signOutCloud().catch(function () {});
    }
    setToken('');
    document.getElementById('adminWorkspaceView').style.display = 'none';
    document.getElementById('adminLoginView').style.display = 'flex';
  });

  document.getElementById('adminRefreshBtn').addEventListener('click', function () {
    loadOverview();
    showToast('Dashboard data synchronized.', false);
  });

  // Forms Submissions
  document.getElementById('settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {
      company_name: document.getElementById('setCompanyName').value,
      slogan: document.getElementById('setSlogan').value,
      registration_info: document.getElementById('setRegInfo').value,
      address: document.getElementById('setAddress').value,
      phone_primary: document.getElementById('setPhonePrimary').value,
      phone_secondary: document.getElementById('setPhoneSecondary').value,
      whatsapp_number: document.getElementById('setWhatsapp').value,
      email: document.getElementById('setEmail').value,
      working_hours: document.getElementById('setHours').value,
      logo_url: document.getElementById('setLogoUrl').value,
      social_facebook: document.getElementById('setFacebook').value,
      social_tiktok: document.getElementById('setTiktok').value,
      social_youtube: document.getElementById('setYoutube').value,
      social_instagram: document.getElementById('setInstagram').value,
      stats_members: document.getElementById('setStatsMembers').value,
      stats_capital: document.getElementById('setStatsCapital').value,
      stats_years: document.getElementById('setStatsYears').value,
      stats_hours: document.getElementById('setStatsHours').value,
      about_mission: document.getElementById('setMission').value,
      about_vision: document.getElementById('setVision').value,
      about_story: document.getElementById('setStory').value,
      risk_disclosure: document.getElementById('setRiskDisclosure').value,
      age_consent_policy: document.getElementById('setAgePolicy').value
    };
    apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () { showToast('Website settings updated across all pages.', false); loadOverview(); })
      .catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('heroSlideForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('heroEditId').value;
    var payload = {
      badge_text: document.getElementById('heroBadge').value,
      title: document.getElementById('heroTitle').value,
      subtitle: document.getElementById('heroSubtitle').value,
      cta_text: document.getElementById('heroCtaText').value,
      cta_link: document.getElementById('heroCtaLink').value,
      image_url: document.getElementById('heroImageUrl').value,
      image_alt: document.getElementById('heroImageAlt').value,
      sort_order: Number(document.getElementById('heroOrder').value || 1),
      is_active: 1
    };
    apiFetch(id ? '/api/admin/hero-slides/' + id : '/api/admin/hero-slides', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    }).then(function () {
      document.getElementById('heroSlideForm').reset();
      document.getElementById('heroEditId').value = '';
      document.getElementById('cancelHeroEditBtn').style.display = 'none';
      setPreviewImg('heroImgPreview', '', 'assets/aistudio/partnership_65dac3a6.jpg');
      showToast('Hero slide saved.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('cancelHeroEditBtn').addEventListener('click', function () {
    document.getElementById('heroSlideForm').reset();
    document.getElementById('heroEditId').value = '';
    this.style.display = 'none';
    setPreviewImg('heroImgPreview', '', 'assets/aistudio/partnership_65dac3a6.jpg');
  });

  document.getElementById('testimonialForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('testEditId').value;
    var payload = {
      client_name: document.getElementById('testClientName').value,
      role: document.getElementById('testRole').value,
      location: document.getElementById('testLocation').value,
      sort_order: Number(document.getElementById('testOrder').value || 1),
      photo_url: document.getElementById('testPhotoUrl').value,
      photo_alt: document.getElementById('testPhotoAlt').value,
      quote: document.getElementById('testQuote').value,
      is_active: 1
    };
    apiFetch(id ? '/api/admin/testimonials/' + id : '/api/admin/testimonials', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    }).then(function () {
      document.getElementById('testimonialForm').reset();
      document.getElementById('testEditId').value = '';
      document.getElementById('cancelTestEditBtn').style.display = 'none';
      setPreviewImg('testPhotoPreview', '', 'assets/aistudio/josephine_a1a0850e.jpg');
      showToast('Investor testimonial saved.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('cancelTestEditBtn').addEventListener('click', function () {
    document.getElementById('testimonialForm').reset();
    document.getElementById('testEditId').value = '';
    this.style.display = 'none';
    setPreviewImg('testPhotoPreview', '', 'assets/aistudio/josephine_a1a0850e.jpg');
  });

  document.getElementById('publicPlanForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('planEditId').value;
    var payload = {
      name: document.getElementById('planName').value,
      price: Number(document.getElementById('planPrice').value),
      expected_return: Number(document.getElementById('planReturn').value),
      duration: document.getElementById('planDuration').value,
      risk: document.getElementById('planRisk').value,
      slots_left: Number(document.getElementById('planSlots').value),
      status: document.getElementById('planStatus').value,
      badge: document.getElementById('planBadge').value,
      image_url: document.getElementById('planImageUrl').value,
      image_alt: document.getElementById('planImageAlt').value,
      description: document.getElementById('planDescription').value
    };
    apiFetch(id ? '/api/admin/plans/' + id : '/api/admin/plans', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    }).then(function () {
      document.getElementById('publicPlanForm').reset();
      document.getElementById('planEditId').value = '';
      document.getElementById('cancelPlanEditBtn').style.display = 'none';
      setPreviewImg('planImgPreview', '', 'assets/aistudio/graph_ddbd7244.jpg');
      showToast('Investment plan saved.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('cancelPlanEditBtn').addEventListener('click', function () {
    document.getElementById('publicPlanForm').reset();
    document.getElementById('planEditId').value = '';
    this.style.display = 'none';
    setPreviewImg('planImgPreview', '', 'assets/aistudio/graph_ddbd7244.jpg');
  });

  document.getElementById('publicCycleForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('pubCycleEditId').value;
    var payload = {
      name: document.getElementById('pubCycleName').value,
      contribution: Number(document.getElementById('pubCycleContrib').value),
      payout_duration: document.getElementById('pubCyclePayout').value,
      image_url: document.getElementById('pubCycleImageUrl').value,
      image_alt: document.getElementById('pubCycleImageAlt').value,
      description: document.getElementById('pubCycleDesc').value
    };
    apiFetch(id ? '/api/admin/public-cycles/' + id : '/api/admin/public-cycles', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    }).then(function () {
      document.getElementById('publicCycleForm').reset();
      document.getElementById('pubCycleEditId').value = '';
      document.getElementById('cancelPubCycleEditBtn').style.display = 'none';
      setPreviewImg('pubCycleImgPreview', '', 'assets/aistudio/partnership_65dac3a6.jpg');
      showToast('Public savings cycle saved (Status: Active).', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('cancelPubCycleEditBtn').addEventListener('click', function () {
    document.getElementById('publicCycleForm').reset();
    document.getElementById('pubCycleEditId').value = '';
    this.style.display = 'none';
    setPreviewImg('pubCycleImgPreview', '', 'assets/aistudio/partnership_65dac3a6.jpg');
  });

  var quickTickerForm = document.getElementById('quickTickerForm');
  if (quickTickerForm) {
    quickTickerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = document.getElementById('quickTickerInput').value.trim();
      apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ quick_updates_ticker: val })
      }).then(function () {
        showToast('Quick Updates scrolling banner text updated.', false);
        loadOverview();
      }).catch(function (err) { showToast(err.message, true); });
    });
  }

  document.getElementById('publicUpdateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {
      title: document.getElementById('updTitle').value,
      category: document.getElementById('updCategory').value,
      published_date: document.getElementById('updDate').value,
      image_url: document.getElementById('updImageUrl').value,
      image_alt: document.getElementById('updImageAlt').value,
      excerpt: document.getElementById('updExcerpt').value,
      detail: document.getElementById('updDetail').value
    };
    apiFetch('/api/admin/updates', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        document.getElementById('publicUpdateForm').reset();
        setPreviewImg('updImgPreview', '', 'assets/aistudio/graph_ddbd7244.jpg');
        showToast('Company update published.', false);
        loadOverview();
      })
      .catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('memberSearchBtn').addEventListener('click', function () {
    renderMembers(document.getElementById('memberSearchInput').value);
  });
  document.getElementById('memberSearchInput').addEventListener('input', function (e) {
    renderMembers(e.target.value);
  });

  document.getElementById('updateMemberForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('editMemId').value;
    var payload = {
      name: document.getElementById('editMemName').value,
      phone: document.getElementById('editMemPhone').value,
      email: document.getElementById('editMemEmail').value,
      group_name: document.getElementById('editMemGroup').value,
      balance: Number(document.getElementById('editMemBalance').value),
      total_invested: Number(document.getElementById('editMemInvested').value),
      status: document.getElementById('editMemStatus').value,
      password: document.getElementById('editMemNewPass').value
    };
    apiFetch('/api/admin/members/' + id, { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () { showToast('Member record updated.', false); loadOverview(); })
      .catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('cmCyclePayout').addEventListener('change', function (e) {
    document.getElementById('cmCycleCustomWrap').style.display = e.target.value === 'Customize' ? 'flex' : 'none';
  });
  document.getElementById('fiCycPayout').addEventListener('change', function (e) {
    document.getElementById('fiCycCustomWrap').style.display = e.target.value === 'Customize' ? 'flex' : 'none';
  });

  document.getElementById('createMemberForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var payoutVal = document.getElementById('cmCyclePayout').value;
    var customVal = document.getElementById('cmCycleCustom').value.trim();
    var invPlan = document.getElementById('cmInvPlan').value.trim();
    var invAmt = Number(document.getElementById('cmInvAmount').value || 0);
    var savType = document.getElementById('cmSavType').value;
    var loanAmt = Number(document.getElementById('cmLoanAmt').value || 0);
    var cycName = document.getElementById('cmCycleName').value.trim();

    var payload = {
      name: document.getElementById('cmName').value.trim(),
      phone: document.getElementById('cmPhone').value.trim(),
      password: document.getElementById('cmPassword').value.trim(),
      email: document.getElementById('cmEmail').value.trim(),
      group_name: document.getElementById('cmGroup').value.trim(),
      balance: Number(document.getElementById('cmBalance').value || 0),
      total_invested: invAmt,
      investment: invPlan && invAmt > 0 ? {
        plan_name: invPlan,
        amount: invAmt,
        expected_return: Number(document.getElementById('cmInvReturn').value || invAmt),
        duration: document.getElementById('cmInvDuration').value.trim() || '30 Days'
      } : null,
      savings: savType ? {
        account_type: savType,
        balance: Number(document.getElementById('cmSavBal').value || 0)
      } : null,
      loan: loanAmt > 0 ? {
        amount: loanAmt,
        purpose: document.getElementById('cmLoanPurpose').value.trim() || 'Member Loan',
        duration: document.getElementById('cmLoanDur').value.trim() || '30 days',
        interest_rate: document.getElementById('cmLoanRate').value.trim() || '10%',
        status: 'active'
      } : null,
      cycle: cycName ? {
        cycle_name: cycName,
        contribution: Number(document.getElementById('cmCycleContrib').value || 0),
        payout_duration: payoutVal === 'Customize' && customVal ? customVal : payoutVal,
        number_of_members: Number(document.getElementById('cmCycleMembers').value || 10)
      } : null
    };

    apiFetch('/api/admin/members', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        document.getElementById('createMemberForm').reset();
        document.getElementById('cmCycleCustomWrap').style.display = 'none';
        showToast('Member created with all linked investments, savings, loans, and cycles.', false);
        loadOverview();
      })
      .catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addInvForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiFetch('/api/admin/investments', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiInvPhone').value,
        member_name: document.getElementById('fiInvName').value,
        plan_name: document.getElementById('fiInvPlan').value,
        amount: Number(document.getElementById('fiInvAmt').value),
        expected_return: Number(document.getElementById('fiInvRet').value),
        duration: document.getElementById('fiInvDur').value
      })
    }).then(function () {
      document.getElementById('addInvForm').reset();
      showToast('Investment recorded and synced to member portal.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addSavForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiFetch('/api/admin/savings', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiSavPhone').value,
        member_name: document.getElementById('fiSavName').value,
        account_type: document.getElementById('fiSavType').value,
        balance: Number(document.getElementById('fiSavBal').value)
      })
    }).then(function () {
      document.getElementById('addSavForm').reset();
      showToast('Savings account recorded.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addLoanForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiFetch('/api/admin/loans', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiLoanPhone').value,
        member_name: document.getElementById('fiLoanName').value,
        amount: Number(document.getElementById('fiLoanAmt').value),
        duration: document.getElementById('fiLoanDur').value,
        purpose: document.getElementById('fiLoanPurpose').value,
        interest_rate: document.getElementById('fiLoanRate').value,
        status: document.getElementById('fiLoanStatus').value
      })
    }).then(function () {
      document.getElementById('addLoanForm').reset();
      showToast('Member loan recorded and visible in Client Portal.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addCycleForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pVal = document.getElementById('fiCycPayout').value;
    var cVal = document.getElementById('fiCycCustom').value.trim();
    apiFetch('/api/admin/member-cycles', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiCycPhone').value,
        member_name: document.getElementById('fiCycName').value,
        cycle_name: document.getElementById('fiCycTitle').value,
        contribution: Number(document.getElementById('fiCycContrib').value),
        number_of_members: Number(document.getElementById('fiCycMembers').value),
        payout_duration: pVal === 'Customize' && cVal ? cVal : pVal
      })
    }).then(function () {
      document.getElementById('addCycleForm').reset();
      document.getElementById('fiCycCustomWrap').style.display = 'none';
      showToast('Member cycle recorded.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('adminSecurityForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiFetch('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({
        newEmail: document.getElementById('secAdminEmail').value,
        newPassword: document.getElementById('secAdminPass').value
      })
    }).then(function () {
      document.getElementById('secAdminPass').value = '';
      showToast('Administrator credentials updated.', false);
    }).catch(function (err) { showToast(err.message, true); });
  });

  // Bind image upload inputs and live preview thumbnails
  bindImagePreview('setLogoUrl', 'setLogoPreview', 'assets/aistudio/logo2_be71428a.jpg');
  bindImageUpload('setLogoUpload', 'setLogoUrl', 'setLogoPreview', 'assets/aistudio/logo2_be71428a.jpg');
  bindImagePreview('heroImageUrl', 'heroImgPreview', 'assets/aistudio/partnership_65dac3a6.jpg');
  bindImageUpload('heroImageUpload', 'heroImageUrl', 'heroImgPreview', 'assets/aistudio/partnership_65dac3a6.jpg');
  bindImagePreview('testPhotoUrl', 'testPhotoPreview', 'assets/aistudio/josephine_a1a0850e.jpg');
  bindImageUpload('testPhotoUpload', 'testPhotoUrl', 'testPhotoPreview', 'assets/aistudio/josephine_a1a0850e.jpg');
  bindImagePreview('planImageUrl', 'planImgPreview', 'assets/aistudio/graph_ddbd7244.jpg');
  bindImageUpload('planImageUpload', 'planImageUrl', 'planImgPreview', 'assets/aistudio/graph_ddbd7244.jpg');
  bindImagePreview('pubCycleImageUrl', 'pubCycleImgPreview', 'assets/aistudio/partnership_65dac3a6.jpg');
  bindImageUpload('pubCycleImageUpload', 'pubCycleImageUrl', 'pubCycleImgPreview', 'assets/aistudio/partnership_65dac3a6.jpg');
  bindImagePreview('updImageUrl', 'updImgPreview', 'assets/aistudio/graph_ddbd7244.jpg');
  bindImageUpload('updImageUpload', 'updImageUrl', 'updImgPreview', 'assets/aistudio/graph_ddbd7244.jpg');

  window.addEventListener('shimogy:theme-change', function () {
    var workspace = document.getElementById('adminWorkspaceView');
    if (workspace && workspace.style.display !== 'none') {
      renderOverviewCharts();
    }
  });

  window.addEventListener('shimogy:cloud-auth', function (e) {
    var detail = (e && e.detail) || {};
    syncCloudButtonVisibility();
    if (detail.isAdmin && detail.user && !getToken()) {
      setToken('cloud_adm_' + detail.user.uid);
      loadOverview(false);
    }
  });

  // Set default date for update form
  var dateEl = document.getElementById('updDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  syncCloudButtonVisibility();
  if (getToken()) {
    loadOverview();
  }
})();
