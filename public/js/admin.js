/* Admin Operations Console Controller */
(function () {
  'use strict';

  var site = window.ShimogySite;
  var TOKEN_KEY = 'shimogy_admin_token';
  var memoryToken = '';
  var adminPieChart = null;
  var adminBarChart = null;
  var state = {
    databaseMode: 'sqlite',
    supabaseUrl: 'https://ihgfsvkcpgxklotjmokl.supabase.co',
    currentAdminEmail: '',
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
    deletionRequests: [],
    cycleExitRequests: [],
    passwordChanges: []
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
    return site.apiFetch(url, opts).then(function (r) {
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

  function getPreviewCaption(imgEl) {
    var box = imgEl ? imgEl.closest('.img-preview-box') : null;
    return box ? box.querySelector('.img-preview-caption') : null;
  }

  function setPreviewCaption(imgEl, msg, tone) {
    var cap = getPreviewCaption(imgEl);
    if (!cap) return;
    if (!cap.dataset.defaultCaption) {
      cap.dataset.defaultCaption = cap.textContent;
    }
    cap.textContent = msg || cap.dataset.defaultCaption;
    cap.style.color = tone === 'error' ? 'var(--danger-text)' : (tone === 'ok' ? 'var(--success-text)' : '');
  }

  function setPreviewImg(previewImgId, url, fallbackUrl) {
    var imgEl = document.getElementById(previewImgId);
    if (!imgEl) return;
    imgEl.setAttribute('referrerpolicy', 'no-referrer');
    var rawUrl = String(url || '').trim();
    var sanitized = rawUrl ? site.sanitizeUrl(rawUrl, '') : '';
    if (rawUrl && !sanitized) {
      imgEl.dataset.fallbackMode = 'invalid';
      imgEl.src = site.assetUrl(fallbackUrl || 'assets/aistudio/logo2_be71428a.jpg');
      setPreviewCaption(imgEl, 'Enter a valid image link (https://...) or upload a file from your device.', 'error');
      return;
    }
    imgEl.dataset.fallbackMode = sanitized ? 'custom' : 'default';
    imgEl.src = site.assetUrl(sanitized || fallbackUrl || 'assets/aistudio/logo2_be71428a.jpg');
    if (!sanitized) {
      setPreviewCaption(imgEl, '', '');
    }
  }

  function bindImagePreview(urlInputId, previewImgId, fallbackUrl) {
    var urlEl = document.getElementById(urlInputId);
    var imgEl = document.getElementById(previewImgId);
    if (!urlEl || !imgEl) return;
    imgEl.setAttribute('referrerpolicy', 'no-referrer');
    imgEl.addEventListener('load', function () {
      if (imgEl.dataset.fallbackMode === 'custom') {
        setPreviewCaption(imgEl, 'Image preview loaded and ready to save across all devices.', 'ok');
      }
    });
    imgEl.addEventListener('error', function () {
      var safeFallback = site.assetUrl(fallbackUrl);
      if (imgEl.dataset.fallbackMode === 'custom') {
        setPreviewCaption(imgEl, 'Unable to load that image URL — check that it is a direct public image link or upload a file.', 'error');
      }
      if (fallbackUrl && imgEl.getAttribute('src') !== safeFallback) {
        imgEl.dataset.fallbackMode = 'default';
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
      var previewEl = previewImgId ? document.getElementById(previewImgId) : null;
      if (previewEl) setPreviewCaption(previewEl, 'Uploading image to database...', '');
      var reader = new FileReader();
      reader.onload = function () {
        compressImageDataUrl(reader.result, 900, 0.74, function (finalDataUrl) {
          apiFetch('/api/admin/upload', {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, dataUrl: finalDataUrl })
          })
            .then(function (res) {
              urlEl.value = res.url;
              urlEl.dispatchEvent(new Event('change'));
              if (previewImgId) setPreviewImg(previewImgId, res.url, fallbackUrl);
              showToast('Image uploaded to database and ready for all online visitors.', false);
            })
            .catch(function (err) {
              if (previewEl) setPreviewCaption(previewEl, 'Upload failed: ' + err.message, 'error');
              showToast('Upload failed: ' + err.message, true);
            })
            .finally(function () {
              fileEl.value = '';
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
    if (target) {
      target.classList.add('active');
      if (site && typeof site.observeReveals === 'function') {
        site.observeReveals(target);
      }
    }
    var activeBtn = document.querySelector('.sidebar-link[data-tab="' + tabId + '"]');
    if (activeBtn) {
      activeBtn.classList.add('active');
      document.getElementById('activeTabTitle').textContent = labelText || activeBtn.textContent.trim();
    }
    if (tabId === 'tab-overview') {
      requestAnimationFrame(function () {
        if (adminPieChart && typeof adminPieChart.resize === 'function') adminPieChart.resize();
        if (adminBarChart && typeof adminBarChart.resize === 'function') adminBarChart.resize();
      });
    } else if (tabId === 'tab-account' && state.currentAdminEmail) {
      var secEmailEl = document.getElementById('secAdminEmail');
      if (secEmailEl && !secEmailEl.dataset.userEdited) {
        secEmailEl.value = state.currentAdminEmail;
      }
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
          ? ['Client Investments', 'Savings Deposits', 'Client Loans', 'Cycle Contributions']
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

  function renderDbConnectionBadge() {
    var badge = document.getElementById('dbConnectionBadge');
    if (!badge) return;
    var mode = String(state.databaseMode || 'sqlite').toLowerCase();
    if (mode === 'postgres') {
      badge.className = 'countdown-text countdown-ok';
      badge.textContent = 'Connected Live to Supabase PostgreSQL';
    } else if (window.location.protocol !== 'file:') {
      badge.className = 'countdown-text countdown-danger';
      badge.textContent = 'Server Not Linked to Supabase PostgreSQL (Configure DATABASE_URL)';
    } else {
      badge.className = 'countdown-text countdown-neutral';
      badge.textContent = 'Offline Workspace Mode';
    }
  }

  // Render All Sections
  function renderOverview() {
    document.getElementById('ovMembersCount').textContent = String(state.members.length);
    document.getElementById('ovPlansCount').textContent = String(state.plans.length);
    document.getElementById('ovCyclesCount').textContent = String(state.publicCycles.length);
    var pendingReqs = state.requests.filter(function (r) { return r.status === 'pending'; }).length;
    var pendingExits = (state.cycleExitRequests || []).filter(function (e) { return e.status === 'pending'; }).length;
    document.getElementById('ovPendingReqCount').textContent = String(pendingReqs + pendingExits);

    var exitAlertWrap = document.getElementById('ovExitAlertWrap');
    if (exitAlertWrap) {
      if (pendingExits > 0) {
        exitAlertWrap.innerHTML =
          '<div class="alert-box alert-info" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<span><strong>' + pendingExits + ' Cycle Exit Request' + (pendingExits === 1 ? '' : 's') + '</strong> awaiting admin approval.</span>' +
            '<button type="button" id="ovReviewExitsBtn" class="btn btn-primary btn-sm">Review Cycle Exits</button>' +
          '</div>';
        var revBtn = document.getElementById('ovReviewExitsBtn');
        if (revBtn) {
          revBtn.addEventListener('click', function () {
            var navBtn = document.querySelector('.sidebar-link[data-tab="tab-requests"]');
            if (navBtn) navBtn.click();
          });
        }
      } else {
        exitAlertWrap.innerHTML = '';
      }
    }

    renderDbConnectionBadge();
    renderOverviewCharts();

    var invBody = document.getElementById('ovRecentInvBody');
    invBody.innerHTML = state.investments.slice(0, 6).map(function (i) {
      return (
        '<tr>' +
          '<td>' + site.escapeHtml(i.member_name) + '</td>' +
          '<td>' + site.escapeHtml(i.plan_name) + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(i.amount) + '</td>' +
          '<td class="font-mono-num">' + site.escapeHtml(site.computeReturnsDate(i)) + '</td>' +
          '<td>' + site.escapeHtml(i.status) + '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="5">No client investments yet.</td></tr>';

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
          '<td><img src="' + site.escapeHtml(site.assetUrl(h.image_url)) + '" alt="' + site.escapeHtml(h.image_alt) + '" width="72" height="44" referrerpolicy="no-referrer" style="object-fit:cover;border-radius:4px;" /></td>' +
          '<td><strong>' + site.escapeHtml(h.title) + '</strong></td>' +
          '<td>' + site.escapeHtml(h.cta_text) + '</td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm edit-hero-btn" data-id="' + h.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-hero-btn" data-id="' + h.id + '">Delete</button>' +
          '</div></td>' +
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
          '<td><img src="' + site.escapeHtml(site.assetUrl(t.photo_url)) + '" alt="' + site.escapeHtml(t.photo_alt) + '" width="44" height="44" referrerpolicy="no-referrer" style="object-fit:cover;border-radius:50%;" /></td>' +
          '<td><strong>' + site.escapeHtml(t.client_name) + '</strong></td>' +
          '<td>' + site.escapeHtml(t.role) + ' · ' + site.escapeHtml(t.location) + '</td>' +
          '<td style="max-width:300px;overflow-wrap:anywhere;word-break:break-word;">' + site.escapeHtml(t.quote) + '</td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm edit-test-btn" data-id="' + t.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-test-btn" data-id="' + t.id + '">Delete</button>' +
          '</div></td>' +
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
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm edit-plan-btn" data-id="' + p.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-plan-btn" data-id="' + p.id + '">Delete</button>' +
          '</div></td>' +
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
          '<td><img src="' + site.escapeHtml(site.assetUrl(c.image_url)) + '" alt="' + site.escapeHtml(c.image_alt || c.name) + '" width="64" height="40" referrerpolicy="no-referrer" style="object-fit:cover;border-radius:4px;" /></td>' +
          '<td><strong>' + site.escapeHtml(c.name) + '</strong></td>' +
          '<td class="tabular-nums">' + site.formatUGX(c.contribution) + '</td>' +
          '<td>' + site.escapeHtml(c.payout_duration) + '</td>' +
          '<td><span class="status-text status-active">Active</span></td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm edit-pub-cyc-btn" data-id="' + c.id + '">Edit</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-pub-cyc-btn" data-id="' + c.id + '">Delete</button>' +
          '</div></td>' +
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

  function inspectMemberByPhone(phone, skipScroll) {
    apiFetch('/api/admin/member/' + encodeURIComponent(phone))
      .then(function (data) {
        var m = data.member;
        var card = document.getElementById('memberInspectorCard');
        card.style.display = 'block';
        document.getElementById('inspectorTitle').textContent = 'Update Client: ' + m.name + ' (' + m.phone + ')';
        document.getElementById('editMemId').value = m.id;
        document.getElementById('editMemName').value = m.name || '';
        document.getElementById('editMemPhone').value = m.phone || '';
        document.getElementById('editMemEmail').value = m.email || '';
        document.getElementById('editMemGroup').value = m.group_name || '';
        document.getElementById('editMemBalance').value = m.balance || 0;
        document.getElementById('editMemInvested').value = m.total_invested || 0;
        document.getElementById('editMemStatus').value = m.status || 'active';
        document.getElementById('editMemNewPass').value = '';

        var invHtml = (m.investments || []).map(function (i) {
          var retDt = site.computeReturnsDate(i);
          var st = String(i.status || 'active').toLowerCase();
          return (
            '<div class="inspector-record-card" data-inv-id="' + site.escapeHtml(i.id) + '">' +
              '<div class="inspector-record-grid">' +
                '<div class="form-field" style="margin-bottom:0;"><label>Plan Name</label><input type="text" class="insp-inv-plan" value="' + site.escapeHtml(i.plan_name || '') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Capital (UGX)</label><input type="number" class="insp-inv-amt" min="0" value="' + site.escapeHtml(i.amount || 0) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Expected Return</label><input type="number" class="insp-inv-ret" min="0" value="' + site.escapeHtml(i.expected_return || 0) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Duration</label><input type="text" class="insp-inv-dur" value="' + site.escapeHtml(i.duration || '60 Days') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Returns Date</label><input type="date" class="insp-inv-date" value="' + site.escapeHtml(retDt) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Status</label>' +
                  '<select class="insp-inv-status">' +
                    '<option value="active"' + (st === 'active' ? ' selected' : '') + '>Active</option>' +
                    '<option value="completed"' + (st === 'completed' ? ' selected' : '') + '>Completed</option>' +
                    '<option value="closed"' + (st === 'closed' ? ' selected' : '') + '>Closed</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="inspector-record-actions">' +
                '<button type="button" class="btn btn-primary btn-sm insp-inv-save" data-id="' + site.escapeHtml(i.id) + '">Update Investment</button>' +
                '<button type="button" class="btn btn-danger btn-sm insp-inv-del" data-id="' + site.escapeHtml(i.id) + '">Delete</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') || '<p style="font-size:0.86rem;color:var(--text-muted);">No investments recorded for this client.</p>';

        var savHtml = (m.savings || []).map(function (s) {
          var acct = String(s.account_type || 'Current Account');
          var normSt = site.normalizeSavingsStatus(acct, s.status);
          return (
            '<div class="inspector-record-card" data-sav-id="' + site.escapeHtml(s.id) + '">' +
              '<div class="inspector-record-grid">' +
                '<div class="form-field" style="margin-bottom:0;"><label>Account Type</label>' +
                  '<select class="insp-sav-type">' +
                    '<option value="Current Account"' + (acct === 'Current Account' ? ' selected' : '') + '>Current Account</option>' +
                    '<option value="Fixed Account"' + (acct === 'Fixed Account' ? ' selected' : '') + '>Fixed Account</option>' +
                  '</select>' +
                '</div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Balance (UGX)</label><input type="number" class="insp-sav-bal" min="0" value="' + site.escapeHtml(s.balance || 0) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Status (Auto: Fixed=Locked, Current=Available)</label>' +
                  '<select class="insp-sav-status">' +
                    '<option value="Available"' + (normSt === 'Available' ? ' selected' : '') + '>Available</option>' +
                    '<option value="Locked"' + (normSt === 'Locked' ? ' selected' : '') + '>Locked</option>' +
                    '<option value="suspended"' + (normSt === 'suspended' ? ' selected' : '') + '>Suspended</option>' +
                    '<option value="closed"' + (normSt === 'closed' ? ' selected' : '') + '>Closed</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="inspector-record-actions">' +
                '<button type="button" class="btn btn-primary btn-sm insp-sav-save" data-id="' + site.escapeHtml(s.id) + '">Update Savings</button>' +
                '<button type="button" class="btn btn-danger btn-sm insp-sav-del" data-id="' + site.escapeHtml(s.id) + '">Delete</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') || '<p style="font-size:0.86rem;color:var(--text-muted);">No savings accounts recorded for this client.</p>';

        var loanHtml = (m.loans || []).map(function (l) {
          var cd = site.computeLoanCountdown(l);
          var st = String(l.status || 'active').toLowerCase();
          return (
            '<div class="inspector-record-card" data-loan-id="' + site.escapeHtml(l.id) + '">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
                '<span style="font-size:0.8rem;font-weight:700;color:var(--text-muted);">Daily Countdown:</span>' +
                '<span class="countdown-text countdown-' + cd.tone + '">' + site.escapeHtml(cd.label) + '</span>' +
              '</div>' +
              '<div class="inspector-record-grid">' +
                '<div class="form-field" style="margin-bottom:0;"><label>Loan Amount (UGX)</label><input type="number" class="insp-loan-amt" min="0" value="' + site.escapeHtml(l.amount || 0) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Purpose</label><input type="text" class="insp-loan-purpose" value="' + site.escapeHtml(l.purpose || '') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Duration</label><input type="text" class="insp-loan-dur" value="' + site.escapeHtml(l.duration || '30 days') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Interest Rate</label><input type="text" class="insp-loan-rate" value="' + site.escapeHtml(l.interest_rate || '10%') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Returning Date</label><input type="date" class="insp-loan-date" value="' + site.escapeHtml(cd.returnDate) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Status</label>' +
                  '<select class="insp-loan-status">' +
                    '<option value="active"' + (st === 'active' ? ' selected' : '') + '>Active</option>' +
                    '<option value="pending"' + (st === 'pending' ? ' selected' : '') + '>Pending</option>' +
                    '<option value="paid"' + (st === 'paid' ? ' selected' : '') + '>Paid</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="inspector-record-actions">' +
                '<button type="button" class="btn btn-primary btn-sm insp-loan-save" data-id="' + site.escapeHtml(l.id) + '">Update Loan</button>' +
                '<button type="button" class="btn btn-danger btn-sm insp-loan-del" data-id="' + site.escapeHtml(l.id) + '">Delete</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') || '<p style="font-size:0.86rem;color:var(--text-muted);">No loans recorded for this client.</p>';

        var cycHtml = (m.cycles || []).map(function (c) {
          var ts = site.computeCycleTurnState(c);
          var cType = ts.cycleType;
          var st = String(c.status || 'active').toLowerCase();
          return (
            '<div class="inspector-record-card" data-cyc-id="' + site.escapeHtml(c.id) + '">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
                '<span class="cycle-turn-main">' + site.escapeHtml(ts.label) + '</span>' +
                '<span class="cycle-turn-sub">' + site.escapeHtml(ts.subLabel) + '</span>' +
              '</div>' +
              '<div class="inspector-record-grid">' +
                '<div class="form-field" style="margin-bottom:0;"><label>Cycle Name</label><input type="text" class="insp-cyc-name" value="' + site.escapeHtml(c.cycle_name || '') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Contribution (UGX)</label><input type="number" class="insp-cyc-contrib" min="0" value="' + site.escapeHtml(c.contribution || 0) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Pay Out Duration</label><input type="text" class="insp-cyc-payout" value="' + site.escapeHtml(c.payout_duration || 'Weekly') + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Clients Count</label><input type="number" class="insp-cyc-total" min="2" value="' + site.escapeHtml(c.number_of_members || 10) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>My Cycle Number</label><input type="number" class="insp-cyc-num" min="1" value="' + site.escapeHtml(c.cycle_number || 1) + '" /></div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Cycle Type</label>' +
                  '<select class="insp-cyc-type">' +
                    '<option value="public"' + (cType === 'public' ? ' selected' : '') + '>Public Cycle</option>' +
                    '<option value="custom"' + (cType === 'custom' ? ' selected' : '') + '>Custom Cycle</option>' +
                  '</select>' +
                '</div>' +
                '<div class="form-field" style="margin-bottom:0;"><label>Status</label>' +
                  '<select class="insp-cyc-status">' +
                    '<option value="active"' + (st === 'active' ? ' selected' : '') + '>Active</option>' +
                    '<option value="exit_pending"' + (st === 'exit_pending' ? ' selected' : '') + '>Exit Pending Approval</option>' +
                    '<option value="exited"' + (st === 'exited' ? ' selected' : '') + '>Exited</option>' +
                    '<option value="stopped"' + (st === 'stopped' ? ' selected' : '') + '>Stopped</option>' +
                    '<option value="completed"' + (st === 'completed' ? ' selected' : '') + '>Completed</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="inspector-record-actions">' +
                '<button type="button" class="btn btn-primary btn-sm insp-cyc-save" data-id="' + site.escapeHtml(c.id) + '">Update Cycle</button>' +
                '<button type="button" class="btn btn-danger btn-sm insp-cyc-del" data-id="' + site.escapeHtml(c.id) + '">Delete</button>' +
              '</div>' +
            '</div>'
          );
        }).join('') || '<p style="font-size:0.86rem;color:var(--text-muted);">No savings cycles recorded for this client.</p>';

        var auditWrap = document.getElementById('inspectorPasswordAudit');
        if (auditWrap) {
          var lastUpdated = m.password_updated_at ? String(m.password_updated_at).replace('T', ' ').slice(0, 16) : 'Initial setup';
          var changedBy = m.password_changed_by || 'Admin';
          var changesList = Array.isArray(m.password_changes) ? m.password_changes : [];
          var changesRows = changesList.map(function (pc) {
            return (
              '<tr>' +
                '<td class="font-mono-num">' + site.escapeHtml(String(pc.changed_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
                '<td><span class="status-text ' + (String(pc.changed_by || '').toLowerCase() === 'client' ? 'status-pending' : 'status-active') + '">' + site.escapeHtml(pc.changed_by || 'Admin') + '</span></td>' +
                '<td>' + site.escapeHtml(pc.change_note || 'Password updated') + '</td>' +
              '</tr>'
            );
          }).join('') || '<tr><td colspan="3">No recorded password changes yet.</td></tr>';
          auditWrap.innerHTML =
            '<div class="inspector-section-block">' +
              '<h4>Password &amp; Security Activity</h4>' +
              '<p style="font-size:0.86rem;color:var(--text-muted);margin-bottom:10px;">Last password update: <strong>' + site.escapeHtml(lastUpdated) + '</strong> · By: <strong>' + site.escapeHtml(changedBy) + '</strong></p>' +
              '<div class="table-wrap"><table class="data-table"><thead><tr><th>Date / Time</th><th>Changed By</th><th>Details</th></tr></thead><tbody>' + changesRows + '</tbody></table></div>' +
            '</div>';
        }

        var wrap = document.getElementById('inspectorLedgers');
        wrap.innerHTML =
          '<div class="inspector-section-block"><h4>Update Client Investments (' + (m.investments || []).length + ')</h4>' + invHtml + '</div>' +
          '<div class="inspector-section-block"><h4>Update Client Savings (' + (m.savings || []).length + ')</h4>' + savHtml + '</div>' +
          '<div class="inspector-section-block"><h4>Update Client Loans (' + (m.loans || []).length + ')</h4>' + loanHtml + '</div>' +
          '<div class="inspector-section-block"><h4>Update Client Cycles (' + (m.cycles || []).length + ')</h4>' + cycHtml + '</div>';

        // Bind Update / Delete handlers for client ledgers
        var reloadInspector = function (msg) {
          showToast(msg, false);
          loadOverview();
          inspectMemberByPhone(m.phone, true);
        };

        wrap.querySelectorAll('.insp-inv-save').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var row = btn.closest('.inspector-record-card');
            apiFetch('/api/admin/investments/' + encodeURIComponent(btn.getAttribute('data-id')), {
              method: 'PUT',
              body: JSON.stringify({
                plan_name: row.querySelector('.insp-inv-plan').value.trim(),
                amount: Number(row.querySelector('.insp-inv-amt').value || 0),
                expected_return: Number(row.querySelector('.insp-inv-ret').value || 0),
                duration: row.querySelector('.insp-inv-dur').value.trim(),
                returns_date: row.querySelector('.insp-inv-date').value,
                status: row.querySelector('.insp-inv-status').value
              })
            }).then(function () { reloadInspector('Client investment updated.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });
        wrap.querySelectorAll('.insp-inv-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
            apiFetch('/api/admin/investments/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' })
              .then(function () { reloadInspector('Investment deleted.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });

        wrap.querySelectorAll('.insp-sav-save').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var row = btn.closest('.inspector-record-card');
            var acctType = row.querySelector('.insp-sav-type').value;
            var reqStatus = row.querySelector('.insp-sav-status').value;
            apiFetch('/api/admin/savings/' + encodeURIComponent(btn.getAttribute('data-id')), {
              method: 'PUT',
              body: JSON.stringify({
                account_type: acctType,
                balance: Number(row.querySelector('.insp-sav-bal').value || 0),
                status: site.normalizeSavingsStatus(acctType, reqStatus)
              })
            }).then(function () { reloadInspector('Client savings account updated.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });
        wrap.querySelectorAll('.insp-sav-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
            apiFetch('/api/admin/savings/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' })
              .then(function () { reloadInspector('Savings account deleted.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });

        wrap.querySelectorAll('.insp-loan-save').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var row = btn.closest('.inspector-record-card');
            apiFetch('/api/admin/loans/' + encodeURIComponent(btn.getAttribute('data-id')), {
              method: 'PUT',
              body: JSON.stringify({
                amount: Number(row.querySelector('.insp-loan-amt').value || 0),
                purpose: row.querySelector('.insp-loan-purpose').value.trim(),
                duration: row.querySelector('.insp-loan-dur').value.trim(),
                interest_rate: row.querySelector('.insp-loan-rate').value.trim(),
                return_date: row.querySelector('.insp-loan-date').value,
                status: row.querySelector('.insp-loan-status').value
              })
            }).then(function () { reloadInspector('Client loan & countdown updated.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });
        wrap.querySelectorAll('.insp-loan-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
            apiFetch('/api/admin/loans/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' })
              .then(function () { reloadInspector('Loan deleted.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });

        wrap.querySelectorAll('.insp-cyc-save').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var row = btn.closest('.inspector-record-card');
            apiFetch('/api/admin/member-cycles/' + encodeURIComponent(btn.getAttribute('data-id')), {
              method: 'PUT',
              body: JSON.stringify({
                cycle_name: row.querySelector('.insp-cyc-name').value.trim(),
                contribution: Number(row.querySelector('.insp-cyc-contrib').value || 0),
                payout_duration: row.querySelector('.insp-cyc-payout').value.trim(),
                number_of_members: Number(row.querySelector('.insp-cyc-total').value || 10),
                cycle_number: Number(row.querySelector('.insp-cyc-num').value || 1),
                cycle_type: row.querySelector('.insp-cyc-type').value,
                status: row.querySelector('.insp-cyc-status').value
              })
            }).then(function () { reloadInspector('Client cycle & turn number updated.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });
        wrap.querySelectorAll('.insp-cyc-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
            apiFetch('/api/admin/member-cycles/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' })
              .then(function () { reloadInspector('Cycle deleted.'); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });

        if (!skipScroll) {
          card.scrollIntoView({ behavior: 'smooth' });
        }
      })
      .catch(function (e) { showToast(e.message, true); });
  }

  function renderMembers(filterText) {
    var q = String(filterText || '').trim().toLowerCase();
    var list = !q ? state.members : state.members.filter(function (m) {
      return (
        String(m.name || '').toLowerCase().includes(q) ||
        String(m.phone || '').toLowerCase().includes(q) ||
        String(m.email || '').toLowerCase().includes(q)
      );
    });
    var tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = list.map(function (m) {
      var passInfo = m.password_updated_at
        ? String(m.password_updated_at).replace('T', ' ').slice(0, 16) + ' (' + (m.password_changed_by || 'Admin') + ')'
        : 'Initial setup';
      return (
        '<tr>' +
          '<td><strong>' + site.escapeHtml(m.name) + '</strong></td>' +
          '<td class="font-mono-num">' + site.escapeHtml(m.phone) + '</td>' +
          '<td>' + site.escapeHtml(m.email || '--') + '</td>' +
          '<td>' + site.escapeHtml(m.group_name || '--') + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(m.balance) + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(m.total_invested) + '</td>' +
          '<td style="font-size:0.82rem;">' + site.escapeHtml(passInfo) + '</td>' +
          '<td>' + site.escapeHtml(m.status) + '</td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm inspect-mem-btn" data-phone="' + site.escapeHtml(m.phone || m.email) + '">Update Client</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-mem-btn" data-id="' + m.id + '">Delete</button>' +
          '</div></td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="9">No matching clients found.</td></tr>';

    tbody.querySelectorAll('.inspect-mem-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        inspectMemberByPhone(btn.getAttribute('data-phone'));
      });
    });

    tbody.querySelectorAll('.del-mem-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
        apiFetch('/api/admin/members/' + btn.getAttribute('data-id'), { method: 'DELETE' })
          .then(function () { showToast('Client and all linked records deleted.', false); loadOverview(); })
          .catch(function (e) { showToast(e.message, true); });
      });
    });
  }

  function renderPasswordChanges() {
    var tbody = document.getElementById('passwordChangesTableBody');
    if (!tbody) return;
    var list = state.passwordChanges || [];
    tbody.innerHTML = list.map(function (pc) {
      var by = String(pc.changed_by || 'Admin');
      var badgeCls = by.toLowerCase() === 'client' ? 'status-pending' : 'status-active';
      return (
        '<tr>' +
          '<td class="font-mono-num">' + site.escapeHtml(String(pc.changed_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td><strong>' + site.escapeHtml(pc.member_name || '--') + '</strong></td>' +
          '<td class="font-mono-num">' + site.escapeHtml(pc.member_phone || '--') + '</td>' +
          '<td>' + site.escapeHtml(pc.member_email || '--') + '</td>' +
          '<td><span class="status-text ' + badgeCls + '">' + site.escapeHtml(by) + '</span></td>' +
          '<td style="font-size:0.84rem;">' + site.escapeHtml(pc.change_note || 'Password updated') + '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="6">No client password changes recorded yet.</td></tr>';
  }

  function renderAdminLoans() {
    var tbody = document.getElementById('adminLoansTableBody');
    tbody.innerHTML = state.loans.map(function (l) {
      var cd = site.computeLoanCountdown(l);
      return (
        '<tr>' +
          '<td>' + site.escapeHtml(l.member_name) + '</td>' +
          '<td class="font-mono-num">' + site.escapeHtml(l.member_phone) + '</td>' +
          '<td class="tabular-nums">' + site.formatUGX(l.amount) + '</td>' +
          '<td>' + site.escapeHtml(l.duration) + '</td>' +
          '<td class="font-mono-num">' + site.escapeHtml(cd.returnDate || '--') + '</td>' +
          '<td><span class="countdown-text countdown-' + cd.tone + '">' + site.escapeHtml(cd.label) + '</span></td>' +
          '<td>' + site.escapeHtml(l.status) + '</td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm mark-loan-paid-btn" data-id="' + l.id + '">Mark Paid</button>' +
            '<button type="button" class="btn btn-danger btn-sm del-loan-btn" data-id="' + l.id + '">Delete</button>' +
          '</div></td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="8">No client loans recorded yet.</td></tr>';

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
          '<td style="max-width:260px;font-size:0.82rem;overflow-wrap:anywhere;word-break:break-word;">' + site.escapeHtml(r.details_json) + '</td>' +
          '<td>' + (r.age_confirmed ? 'Confirmed' : 'Pending') + (r.guardian_name ? ' (Guardian: ' + site.escapeHtml(r.guardian_name) + ')' : '') + '</td>' +
          '<td>' + site.escapeHtml(r.status) + '</td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-outline btn-sm req-approve-btn" data-id="' + r.id + '">Mark Reviewed</button>' +
            '<button type="button" class="btn btn-danger btn-sm req-del-btn" data-id="' + r.id + '">Delete</button>' +
          '</div></td>' +
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

  function renderCycleExitRequests() {
    var tbody = document.getElementById('cycleExitRequestsTableBody');
    if (!tbody) return;
    var list = state.cycleExitRequests || [];
    tbody.innerHTML = list.map(function (ex) {
      var st = String(ex.status || 'pending').toLowerCase();
      var actionsHtml = st === 'pending'
        ? '<div class="table-actions">' +
            '<button type="button" class="btn btn-primary btn-sm exit-approve-btn" data-id="' + site.escapeHtml(ex.id) + '">Accept Exit</button>' +
            '<button type="button" class="btn btn-danger btn-sm exit-decline-btn" data-id="' + site.escapeHtml(ex.id) + '">Decline</button>' +
          '</div>'
        : '<span style="color:var(--text-muted);font-size:0.82rem;">Processed ' + site.escapeHtml(String(ex.processed_at || '').slice(0, 10)) + '</span>';

      return (
        '<tr>' +
          '<td class="tabular-nums">#' + site.escapeHtml(ex.id) + '</td>' +
          '<td><strong>' + site.escapeHtml(ex.member_name) + '</strong></td>' +
          '<td class="font-mono-num">' + site.escapeHtml(ex.member_phone) + '</td>' +
          '<td><strong>' + site.escapeHtml(ex.cycle_name) + '</strong></td>' +
          '<td>' + site.escapeHtml(String(ex.cycle_type || 'public').toUpperCase()) + '</td>' +
          '<td class="font-mono-num">' + site.escapeHtml(String(ex.created_at || '').slice(0, 16)) + '</td>' +
          '<td><span class="status-text ' + (st === 'approved' ? 'status-active' : (st === 'pending' ? 'status-pending' : 'status-closed')) + '">' + site.escapeHtml(st) + '</span></td>' +
          '<td>' + actionsHtml + '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="8">No cycle exit requests submitted yet.</td></tr>';

    tbody.querySelectorAll('.exit-approve-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) {
          btn.dataset.confirmed = '1';
          btn.textContent = 'Confirm Accept?';
          return;
        }
        btn.disabled = true;
        apiFetch('/api/admin/cycle-exit-requests/' + encodeURIComponent(btn.getAttribute('data-id')) + '/process', {
          method: 'POST',
          body: JSON.stringify({ action: 'approve' })
        })
          .then(function () {
            showToast('Cycle exit accepted. Other clients in this cycle have been notified.', false);
            loadOverview();
          })
          .catch(function (e) {
            btn.disabled = false;
            showToast(e.message, true);
          });
      });
    });

    tbody.querySelectorAll('.exit-decline-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) {
          btn.dataset.confirmed = '1';
          btn.textContent = 'Confirm Decline?';
          return;
        }
        btn.disabled = true;
        apiFetch('/api/admin/cycle-exit-requests/' + encodeURIComponent(btn.getAttribute('data-id')) + '/process', {
          method: 'POST',
          body: JSON.stringify({ action: 'decline' })
        })
          .then(function () {
            showToast('Cycle exit request declined and cycle restored to active.', false);
            loadOverview();
          })
          .catch(function (e) {
            btn.disabled = false;
            showToast(e.message, true);
          });
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
          '<td style="max-width:240px;overflow-wrap:anywhere;word-break:break-word;">' + site.escapeHtml(d.reason || '--') + '</td>' +
          '<td>' + site.escapeHtml(d.status) + '</td>' +
          '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-danger btn-sm del-purge-btn" data-id="' + d.id + '">Purge Client Data</button>' +
            '<button type="button" class="btn btn-outline btn-sm del-complete-btn" data-id="' + d.id + '">Complete</button>' +
          '</div></td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="7">No data deletion requests logged.</td></tr>';

    tbody.querySelectorAll('.del-purge-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm Purge?'; return; }
        apiFetch('/api/admin/deletion-requests/' + btn.getAttribute('data-id') + '/process', {
          method: 'POST',
          body: JSON.stringify({ action: 'purge' })
        }).then(function () { showToast('Client records purged and request completed.', false); loadOverview(); })
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
        renderPasswordChanges();
        renderAdminLoans();
        renderCycleExitRequests();
        renderRequests();
        renderDeletionRequests();
        if (site && typeof site.observeReveals === 'function') {
          site.observeReveals(document.getElementById('adminMain'));
        }
        return apiFetch('/api/admin/me');
      })
      .then(function (me) {
        if (me && me.admin) {
          state.currentAdminEmail = me.admin.email || '';
          var secEmailEl = document.getElementById('secAdminEmail');
          if (secEmailEl) {
            secEmailEl.value = state.currentAdminEmail;
            delete secEmailEl.dataset.userEdited;
          }
          var secNoteEl = document.getElementById('secCurrentAdminNote');
          if (secNoteEl) {
            secNoteEl.textContent = 'Currently signed in as: ' + (state.currentAdminEmail || 'Administrator');
          }
        }
        return loadAuthorizedAdmins();
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

    site.apiFetch('/api/admin/login', {
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

  function exchangeAdminGoogleToken(idToken, fallbackCloudToken) {
    if (window.location.protocol !== 'file:' && idToken) {
      return site.apiFetch('/api/admin/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken })
      })
        .then(function (r) {
          return r.text().then(function (txt) {
            var d = {};
            try { d = txt ? JSON.parse(txt) : {}; } catch (_e) { d = {}; }
            if (!r.ok) {
              throw new Error(d.error || 'Google account could not be verified with live database.');
            }
            return d.token;
          });
        });
    }
    return Promise.resolve(fallbackCloudToken);
  }

  function handleGoogleAdminSignIn() {
    var fb = document.getElementById('adminLoginFeedback');
    if (fb) fb.innerHTML = '';
    if (!window.ShimogyCloud || typeof window.ShimogyCloud.signInAdminWithGoogle !== 'function') {
      if (fb) fb.innerHTML = '<div class="alert-box alert-error">Google Cloud Sign-In is unavailable offline.</div>';
      else showToast('Google Cloud Sign-In is unavailable offline.', true);
      return;
    }
    var existingToken = getToken();
    var hadLivePgToken = existingToken && existingToken.indexOf('cloud_') !== 0;
    window.ShimogyCloud.signInAdminWithGoogle()
      .then(function (res) {
        return exchangeAdminGoogleToken(res && res.idToken, res && res.token).then(function (liveToken) {
          if (liveToken) {
            setToken(liveToken);
          } else if (!hadLivePgToken && res && res.token) {
            setToken(res.token);
          }
          syncCloudButtonVisibility();
          loadOverview(true);
          showToast('Signed in with Google. All edits save live to the central database across all devices.', false);
        });
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
    var updatedPhone = document.getElementById('editMemPhone').value;
    var payload = {
      name: document.getElementById('editMemName').value,
      phone: updatedPhone,
      email: document.getElementById('editMemEmail').value,
      group_name: document.getElementById('editMemGroup').value,
      balance: Number(document.getElementById('editMemBalance').value),
      total_invested: Number(document.getElementById('editMemInvested').value),
      status: document.getElementById('editMemStatus').value,
      password: document.getElementById('editMemNewPass').value
    };
    apiFetch('/api/admin/members/' + id, { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () {
        showToast('Client record updated.', false);
        loadOverview();
        inspectMemberByPhone(updatedPhone, true);
      })
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
    var invReturnsDateEl = document.getElementById('cmInvReturnsDate');
    var savType = document.getElementById('cmSavType').value;
    var loanAmt = Number(document.getElementById('cmLoanAmt').value || 0);
    var loanReturnDateEl = document.getElementById('cmLoanReturnDate');
    var cycName = document.getElementById('cmCycleName').value.trim();
    var cycNumberEl = document.getElementById('cmCycleNumber');
    var cycTypeEl = document.getElementById('cmCycleType');

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
        duration: document.getElementById('cmInvDuration').value.trim() || '60 Days',
        returns_date: invReturnsDateEl ? invReturnsDateEl.value : ''
      } : null,
      savings: savType ? {
        account_type: savType,
        balance: Number(document.getElementById('cmSavBal').value || 0),
        status: site.normalizeSavingsStatus(savType)
      } : null,
      loan: loanAmt > 0 ? {
        amount: loanAmt,
        purpose: document.getElementById('cmLoanPurpose').value.trim() || 'Client Loan',
        duration: document.getElementById('cmLoanDur').value.trim() || '30 days',
        interest_rate: document.getElementById('cmLoanRate').value.trim() || '10%',
        return_date: loanReturnDateEl ? loanReturnDateEl.value : '',
        status: 'active'
      } : null,
      cycle: cycName ? {
        cycle_name: cycName,
        contribution: Number(document.getElementById('cmCycleContrib').value || 0),
        payout_duration: payoutVal === 'Customize' && customVal ? customVal : payoutVal,
        number_of_members: Number(document.getElementById('cmCycleMembers').value || 10),
        cycle_number: Number(cycNumberEl ? cycNumberEl.value || 1 : 1),
        cycle_type: cycTypeEl ? cycTypeEl.value : 'public'
      } : null
    };

    apiFetch('/api/admin/members', { method: 'POST', body: JSON.stringify(payload) })
      .then(function () {
        document.getElementById('createMemberForm').reset();
        document.getElementById('cmCycleCustomWrap').style.display = 'none';
        showToast('Client created with all linked investments, savings, loans, and cycles.', false);
        loadOverview();
      })
      .catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addInvForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var retDateEl = document.getElementById('fiInvReturnsDate');
    apiFetch('/api/admin/investments', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiInvPhone').value.trim(),
        member_name: document.getElementById('fiInvName').value.trim(),
        plan_name: document.getElementById('fiInvPlan').value.trim(),
        amount: Number(document.getElementById('fiInvAmt').value),
        expected_return: Number(document.getElementById('fiInvRet').value),
        duration: document.getElementById('fiInvDur').value.trim(),
        returns_date: retDateEl ? retDateEl.value : ''
      })
    }).then(function () {
      document.getElementById('addInvForm').reset();
      showToast('Investment recorded and synced to client portal.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addSavForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var acctType = document.getElementById('fiSavType').value;
    apiFetch('/api/admin/savings', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiSavPhone').value.trim(),
        member_name: document.getElementById('fiSavName').value.trim(),
        account_type: acctType,
        balance: Number(document.getElementById('fiSavBal').value),
        status: site.normalizeSavingsStatus(acctType)
      })
    }).then(function () {
      document.getElementById('addSavForm').reset();
      showToast('Savings account recorded (Status: ' + site.normalizeSavingsStatus(acctType) + ').', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addLoanForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var loanRetEl = document.getElementById('fiLoanReturnDate');
    apiFetch('/api/admin/loans', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiLoanPhone').value.trim(),
        member_name: document.getElementById('fiLoanName').value.trim(),
        amount: Number(document.getElementById('fiLoanAmt').value),
        duration: document.getElementById('fiLoanDur').value.trim(),
        purpose: document.getElementById('fiLoanPurpose').value.trim(),
        interest_rate: document.getElementById('fiLoanRate').value.trim(),
        return_date: loanRetEl ? loanRetEl.value : '',
        status: document.getElementById('fiLoanStatus').value
      })
    }).then(function () {
      document.getElementById('addLoanForm').reset();
      showToast('Client loan recorded with Returning Date & Daily Countdown.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  document.getElementById('addCycleForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pVal = document.getElementById('fiCycPayout').value;
    var cVal = document.getElementById('fiCycCustom').value.trim();
    var cycNumEl = document.getElementById('fiCycNumber');
    var cycTypeEl = document.getElementById('fiCycType');
    apiFetch('/api/admin/member-cycles', {
      method: 'POST',
      body: JSON.stringify({
        member_phone: document.getElementById('fiCycPhone').value.trim(),
        member_name: document.getElementById('fiCycName').value.trim(),
        cycle_name: document.getElementById('fiCycTitle').value.trim(),
        contribution: Number(document.getElementById('fiCycContrib').value),
        number_of_members: Number(document.getElementById('fiCycMembers').value),
        cycle_number: Number(cycNumEl ? cycNumEl.value || 1 : 1),
        cycle_type: cycTypeEl ? cycTypeEl.value : 'public',
        payout_duration: pVal === 'Customize' && cVal ? cVal : pVal
      })
    }).then(function () {
      document.getElementById('addCycleForm').reset();
      document.getElementById('fiCycCustomWrap').style.display = 'none';
      showToast('Client cycle recorded with Cycle Number.', false);
      loadOverview();
    }).catch(function (err) { showToast(err.message, true); });
  });

  var secEmailInput = document.getElementById('secAdminEmail');
  if (secEmailInput) {
    secEmailInput.addEventListener('input', function () {
      secEmailInput.dataset.userEdited = '1';
    });
  }

  var secPassToggleBtn = document.getElementById('secAdminPassToggle');
  if (secPassToggleBtn) {
    secPassToggleBtn.addEventListener('click', function () {
      var pEl = document.getElementById('secAdminPass');
      if (!pEl) return;
      var show = pEl.type === 'password';
      pEl.type = show ? 'text' : 'password';
      secPassToggleBtn.textContent = show ? 'Hide' : 'Show';
      secPassToggleBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  }

  document.getElementById('adminSecurityForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var newEmailVal = (document.getElementById('secAdminEmail').value || '').trim().toLowerCase();
    var newPassVal = document.getElementById('secAdminPass').value || '';
    if (newPassVal && newPassVal.length < 6) {
      showToast('Password must be at least 6 characters.', true);
      return;
    }
    if (!newPassVal && newEmailVal === String(state.currentAdminEmail || '').trim().toLowerCase()) {
      showToast('Enter a new email address or a new password (min 6 characters) to update.', true);
      return;
    }
    apiFetch('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({
        newEmail: newEmailVal,
        newPassword: newPassVal
      })
    }).then(function (res) {
      document.getElementById('secAdminPass').value = '';
      if (res && res.email) {
        state.currentAdminEmail = res.email;
        document.getElementById('secAdminEmail').value = res.email;
        delete document.getElementById('secAdminEmail').dataset.userEdited;
        var secNoteEl = document.getElementById('secCurrentAdminNote');
        if (secNoteEl) secNoteEl.textContent = 'Currently signed in as: ' + res.email;
      }
      var toastMsg = 'Administrator credentials updated.';
      if (res && res.note) {
        toastMsg += ' ' + res.note;
      }
      showToast(toastMsg, false);
    }).catch(function (err) { showToast(err.message, true); });
  });

  function loadAuthorizedAdmins() {
    var tbody = document.getElementById('authorizedAdminsBody');
    if (!tbody) return Promise.resolve();
    return apiFetch('/api/admin/admins')
      .then(function (res) {
        var rows = (res && res.admins) || [];
        tbody.innerHTML = rows.map(function (a) {
          var isSelf = String(a.email || '').toLowerCase() === String(state.currentAdminEmail || '').toLowerCase();
          return (
            '<tr>' +
              '<td><strong>' + site.escapeHtml(a.email || '') + '</strong>' + (isSelf ? ' <span class="status-badge status-active">Current</span>' : '') + '</td>' +
              '<td>' + site.escapeHtml(a.name || 'SHIMOGY Administrator') + '</td>' +
              '<td>' + site.escapeHtml(String(a.created_at || '').slice(0, 10) || '--') + '</td>' +
              '<td>' + (isSelf ? '<span style="font-size:0.8rem;color:var(--text-muted);">Active Session</span>' : '<button type="button" class="btn btn-danger btn-sm del-auth-admin-btn" data-id="' + site.escapeHtml(a.id) + '">Remove</button>') + '</td>' +
            '</tr>'
          );
        }).join('') || '<tr><td colspan="4">No authorized administrator accounts found.</td></tr>';

        tbody.querySelectorAll('.del-auth-admin-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!btn.dataset.confirmed) { btn.dataset.confirmed = '1'; btn.textContent = 'Confirm?'; return; }
            apiFetch('/api/admin/admins/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' })
              .then(function () { showToast('Administrator email removed.', false); loadAuthorizedAdmins(); })
              .catch(function (err) { showToast(err.message, true); });
          });
        });
      })
      .catch(function () {});
  }

  var authAdminsForm = document.getElementById('adminAuthorizedEmailsForm');
  if (authAdminsForm) {
    authAdminsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var emailEl = document.getElementById('authAdminEmailInput');
      var nameEl = document.getElementById('authAdminNameInput');
      var emailVal = emailEl ? emailEl.value.trim().toLowerCase() : '';
      var nameVal = nameEl ? nameEl.value.trim() : '';
      if (!emailVal) return;
      apiFetch('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ email: emailVal, name: nameVal || 'SHIMOGY Administrator' })
      })
        .then(function () {
          authAdminsForm.reset();
          showToast('Authorized ' + emailVal + ' for Supabase Auth Admin sign-in.', false);
          loadAuthorizedAdmins();
        })
        .catch(function (err) { showToast(err.message, true); });
    });
  }

  var verifyLiveSyncBtn = document.getElementById('verifyLiveSyncBtn');
  if (verifyLiveSyncBtn) {
    verifyLiveSyncBtn.addEventListener('click', function () {
      renderDbConnectionBadge();
      loadOverview();
      showToast('Live Supabase & server status refreshed.', false);
    });
  }

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
    var curToken = getToken();
    if (detail.isAdmin && detail.user && (!curToken || curToken.indexOf('cloud_') === 0)) {
      var cloudToken = 'cloud_adm_' + detail.user.uid;
      if (window.location.protocol !== 'file:' && window.ShimogyCloud && typeof window.ShimogyCloud.getIdToken === 'function') {
        window.ShimogyCloud.getIdToken()
          .then(function (idToken) { return exchangeAdminGoogleToken(idToken, cloudToken); })
          .then(function (liveToken) {
            if (liveToken) {
              setToken(liveToken);
              loadOverview(false);
            }
          })
          .catch(function () {});
      } else if (window.location.protocol === 'file:') {
        setToken(cloudToken);
        loadOverview(false);
      }
    }
  });

  // Set default date for update form
  var dateEl = document.getElementById('updDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  syncCloudButtonVisibility();
  if (getToken() && (window.location.protocol === 'file:' || getToken().indexOf('cloud_') !== 0)) {
    loadOverview();
  } else if (getToken() && getToken().indexOf('cloud_') === 0) {
    setToken('');
  }
})();
