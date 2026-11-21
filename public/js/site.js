/* Shared site helpers: navigation dropdowns, scroll reveals, WhatsApp handoff, keyboard accessibility, cookie consent, business details hydration */
(function () {
  'use strict';

  var revealObserver = null;

  window.ShimogySite = {
    dataPromise: null,
    defaultWhatsapp: '256752259416',

    escapeHtml: function (str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    formatUGX: function (val) {
      var num = Number(val || 0);
      if (Number.isNaN(num)) num = 0;
      return 'UGX ' + Math.round(num).toLocaleString('en-US');
    },

    sanitizeUrl: function (url, fallback) {
      var clean = String(url || '').trim();
      if (!clean) return fallback || '';
      var lower = clean.toLowerCase().replace(/[\u0000-\u001F\u007F\s]+/g, '');
      if (
        lower.indexOf('javascript:') === 0 ||
        lower.indexOf('vbscript:') === 0 ||
        lower.indexOf('data:text/') === 0 ||
        lower.indexOf('data:application/') === 0
      ) {
        return fallback || '';
      }
      var candidate = clean;
      if (candidate.indexOf('//') === 0) {
        candidate = 'https:' + candidate;
      } else if (
        candidate.indexOf('/') !== 0 &&
        candidate.indexOf('assets/') !== 0 &&
        candidate.indexOf('https://') !== 0 &&
        candidate.indexOf('http://') !== 0 &&
        candidate.indexOf('mailto:') !== 0 &&
        candidate.indexOf('tel:') !== 0 &&
        candidate.indexOf('data:image/') !== 0 &&
        !/^[a-zA-Z0-9._-]+\.html([#?].*)?$/.test(candidate) &&
        /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/|$|\?)/.test(candidate)
      ) {
        candidate = 'https://' + candidate;
      }
      var driveFileMatch = candidate.match(/^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
      if (driveFileMatch) {
        return 'https://drive.google.com/thumbnail?id=' + driveFileMatch[1] + '&sz=w1200';
      }
      var driveOpenMatch = candidate.match(/^https?:\/\/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
      if (driveOpenMatch) {
        return 'https://drive.google.com/thumbnail?id=' + driveOpenMatch[1] + '&sz=w1200';
      }
      if (
        candidate.indexOf('/') === 0 ||
        candidate.indexOf('assets/') === 0 ||
        candidate.indexOf('https://') === 0 ||
        candidate.indexOf('http://') === 0 ||
        candidate.indexOf('mailto:') === 0 ||
        candidate.indexOf('tel:') === 0 ||
        candidate.indexOf('data:image/') === 0 ||
        /^[a-zA-Z0-9._-]+\.html([#?].*)?$/.test(candidate)
      ) {
        return candidate;
      }
      return fallback || '';
    },

    todayISO: function () {
      return new Date().toISOString().split('T')[0];
    },

    addDaysToISO: function (baseDateStr, daysToAdd) {
      var clean = String(baseDateStr || '').slice(0, 10);
      var base = /^\d{4}-\d{2}-\d{2}$/.test(clean) ? new Date(clean + 'T00:00:00Z') : new Date();
      if (Number.isNaN(base.getTime())) base = new Date();
      base.setUTCDate(base.getUTCDate() + Number(daysToAdd || 0));
      return base.toISOString().split('T')[0];
    },

    parseDurationDays: function (durationText, fallbackDays) {
      var s = String(durationText || '').toLowerCase();
      var m = s.match(/(\d+)/);
      var n = m ? Number(m[1]) : 0;
      if (s.indexOf('year') !== -1) return (n || 1) * 365;
      if (s.indexOf('month') !== -1) return (n || 1) * 30;
      if (s.indexOf('bi-week') !== -1) return 14;
      if (s.indexOf('week') !== -1) return (n || 1) * 7;
      if (s.indexOf('daily') !== -1) return 1;
      if (n > 0) return n;
      return fallbackDays || 30;
    },

    computeReturnsDate: function (inv) {
      var given = String((inv && inv.returns_date) || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
      var base = String((inv && inv.created_at) || this.todayISO()).slice(0, 10);
      var days = this.parseDurationDays(inv && inv.duration, 60);
      return this.addDaysToISO(base, days);
    },

    computeLoanReturnDate: function (loan) {
      var given = String((loan && loan.return_date) || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(given)) return given;
      var base = String((loan && loan.request_date) || (loan && loan.created_at) || this.todayISO()).slice(0, 10);
      var days = this.parseDurationDays(loan && loan.duration, 30);
      return this.addDaysToISO(base, days);
    },

    computeLoanCountdown: function (loan) {
      var status = String((loan && loan.status) || 'active').toLowerCase();
      var returnDate = this.computeLoanReturnDate(loan);
      if (status === 'paid' || status === 'settled' || status === 'closed') {
        return { returnDate: returnDate, label: 'Settled / Paid', tone: 'ok', daysLeft: 0 };
      }
      var today = new Date(this.todayISO() + 'T00:00:00Z');
      var target = new Date(returnDate + 'T00:00:00Z');
      if (Number.isNaN(target.getTime())) {
        return { returnDate: returnDate, label: 'Pending schedule', tone: 'neutral', daysLeft: null };
      }
      var diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
      if (diffDays > 7) {
        return { returnDate: returnDate, label: diffDays + ' days remaining', tone: 'ok', daysLeft: diffDays };
      }
      if (diffDays > 1) {
        return { returnDate: returnDate, label: diffDays + ' days remaining', tone: 'warn', daysLeft: diffDays };
      }
      if (diffDays === 1) {
        return { returnDate: returnDate, label: '1 day remaining (Due Tomorrow)', tone: 'warn', daysLeft: 1 };
      }
      if (diffDays === 0) {
        return { returnDate: returnDate, label: 'Due Today', tone: 'danger', daysLeft: 0 };
      }
      var overdue = Math.abs(diffDays);
      return { returnDate: returnDate, label: 'Overdue by ' + overdue + (overdue === 1 ? ' day' : ' days'), tone: 'danger', daysLeft: diffDays };
    },

    normalizeSavingsStatus: function (accountType, status) {
      var raw = String(status || '').trim().toLowerCase();
      if (raw === 'suspended' || raw === 'closed') return status;
      if (String(accountType || '').toLowerCase().indexOf('fixed') !== -1) return 'Locked';
      return 'Available';
    },

    computeCycleTurnState: function (cycle) {
      var totalClients = Math.max(2, Number((cycle && cycle.number_of_members) || 10));
      var initialTurn = Math.min(totalClients, Math.max(1, Number((cycle && cycle.cycle_number) || 1)));
      var cycleType = String((cycle && cycle.cycle_type) || 'public').toLowerCase() === 'custom' ? 'custom' : 'public';
      var status = String((cycle && cycle.status) || 'active').toLowerCase();
      var periodDays = Math.max(1, this.parseDurationDays(cycle && cycle.payout_duration, 7));

      var joinStr = String((cycle && (cycle.join_date || cycle.created_at)) || this.todayISO()).slice(0, 10);
      var joinDate = /^\d{4}-\d{2}-\d{2}$/.test(joinStr) ? new Date(joinStr + 'T00:00:00Z') : new Date();
      var today = new Date(this.todayISO() + 'T00:00:00Z');
      var elapsedDays = Math.max(0, Math.floor((today.getTime() - joinDate.getTime()) / 86400000));
      var elapsedTurns = Math.floor(elapsedDays / periodDays);
      var currentTurn = Math.max(0, initialTurn - elapsedTurns);
      var daysToNext = Math.max(0, currentTurn * periodDays - elapsedDays);

      if (status === 'exited' || status === 'stopped' || status === 'completed') {
        return {
          initialTurn: initialTurn,
          currentTurn: currentTurn,
          totalClients: totalClients,
          cycleType: cycleType,
          status: status,
          payoutReached: false,
          daysToPayout: 0,
          label: '#' + initialTurn + ' (' + (status === 'exited' ? 'Exited' : status === 'stopped' ? 'Stopped' : 'Completed') + ')',
          subLabel: cycleType === 'custom' ? 'Custom Cycle' : 'Public Cycle'
        };
      }

      if (status === 'exit_pending') {
        return {
          initialTurn: initialTurn,
          currentTurn: currentTurn,
          totalClients: totalClients,
          cycleType: cycleType,
          status: status,
          payoutReached: false,
          daysToPayout: daysToNext,
          label: 'My Cycle #' + Math.max(1, currentTurn) + ' of ' + totalClients,
          subLabel: 'Exit requested · Awaiting Admin approval'
        };
      }

      if (currentTurn <= 0) {
        return {
          initialTurn: initialTurn,
          currentTurn: 0,
          totalClients: totalClients,
          cycleType: cycleType,
          status: status,
          payoutReached: true,
          daysToPayout: 0,
          label: 'Payout Day Reached!',
          subLabel: 'Started at #' + initialTurn + ' · Turn Ready'
        };
      }

      return {
        initialTurn: initialTurn,
        currentTurn: currentTurn,
        totalClients: totalClients,
        cycleType: cycleType,
        status: status,
        payoutReached: false,
        daysToPayout: daysToNext,
        label: 'My Cycle #' + currentTurn + ' of ' + totalClients,
        subLabel: '~' + daysToNext + 'd to payout (from #' + initialTurn + ')'
      };
    },

    assetUrl: function (url) {
      var clean = this.sanitizeUrl(url, 'assets/aistudio/logo2_be71428a.jpg');
      if (!clean) return 'assets/aistudio/logo2_be71428a.jpg';
      if (clean.indexOf('logobg_263a028d.png') !== -1) {
        clean = 'assets/aistudio/logo2_be71428a.jpg';
      }
      if (clean.indexOf('/assets/') === 0) {
        return clean.slice(1);
      }
      if (window.location && window.location.protocol === 'file:' && clean.indexOf('/') === 0 && clean.indexOf('//') !== 0 && clean.indexOf('/api/') !== 0) {
        return clean.slice(1);
      }
      return clean;
    },

    buildWhatsAppUrl: function (phone, message) {
      var digits = String(phone || this.defaultWhatsapp || '256752259416').replace(/\D/g, '');
      if (digits.startsWith('0') && digits.length >= 10) {
        digits = '256' + digits.slice(1);
      }
      if (!digits) digits = '256752259416';
      var encoded = encodeURIComponent(String(message || 'Hello SHIMOGY Investment Group Operations Team, I would like assistance.'));
      return 'https://wa.me/' + digits + '?text=' + encoded;
    },

    triggerWhatsApp: function (phone, message) {
      var url = this.buildWhatsAppUrl(phone, message);
      try {
        var link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (_e) {}
      return url;
    },

    apiFetch: function (input, init) {
      var fn = (typeof window.shimogyFetch === 'function' ? window.shimogyFetch : window.fetch);
      return fn.call(window, input, init);
    },

    fetchSiteData: function () {
      if (!this.dataPromise) {
        this.dataPromise = this.apiFetch('/api/site-data?_=' + Date.now(), { cache: 'no-store' })
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to load site data');
            return res.json();
          })
          .catch(function () {
            return { settings: {}, heroSlides: [], testimonials: [], plans: [], publicCycles: [], updates: [] };
          });
      }
      return this.dataPromise;
    },

    initImageTransitions: function (root) {
      var self = this;
      var scope = root || document;
      var imgs = scope.querySelectorAll('img');
      imgs.forEach(function (img, idx) {
        if (img.closest('.leaflet-container')) return;
        img.setAttribute('referrerpolicy', 'no-referrer');
        if (img.classList.contains('brand-logo')) return;
        img.classList.add('img-lively');
        var rawSrc = img.getAttribute('src');
        if (rawSrc) {
          var normalized = self.assetUrl(rawSrc);
          if (normalized !== rawSrc && rawSrc.indexOf('/assets/') === 0) {
            img.setAttribute('src', normalized);
          }
        }

        var markLoaded = function () {
          requestAnimationFrame(function () {
            img.classList.add('is-img-loaded');
          });
        };

        if (!img.dataset.livelyBound) {
          img.dataset.livelyBound = '1';
          img.addEventListener('load', markLoaded);
          img.addEventListener('error', function () {
            if (!img.dataset.fallbackApplied) {
              img.dataset.fallbackApplied = '1';
              img.setAttribute('src', self.assetUrl('assets/aistudio/logo2_be71428a.jpg'));
            }
            markLoaded();
          });
        }

        if (img.complete && img.naturalWidth > 0) {
          setTimeout(markLoaded, Math.min(idx * 30, 180));
        } else if (img.complete && img.naturalWidth === 0 && img.getAttribute('src') && !img.dataset.fallbackApplied) {
          img.dataset.fallbackApplied = '1';
          img.setAttribute('src', self.assetUrl('assets/aistudio/logo2_be71428a.jpg'));
          markLoaded();
        }
      });
    },

    initNavigation: function () {
      var header = document.querySelector('.site-header');
      if (header) {
        var syncHeaderOffset = function () {
          var h = header.offsetHeight || 80;
          document.documentElement.style.setProperty('--header-sticky-offset', h + 'px');
        };
        var syncHeaderScroll = function () {
          header.classList.toggle('scrolled', (window.scrollY || window.pageYOffset || 0) > 18);
        };
        syncHeaderOffset();
        syncHeaderScroll();
        window.addEventListener('scroll', syncHeaderScroll, { passive: true });
        window.addEventListener('resize', syncHeaderOffset, { passive: true });
        if (typeof ResizeObserver === 'function') {
          try {
            new ResizeObserver(syncHeaderOffset).observe(header);
          } catch (_e) {}
        }
      }

      var menuBtn = document.getElementById('mobileMenuBtn');
      var nav = document.getElementById('primaryNav');
      if (menuBtn && nav) {
        menuBtn.addEventListener('click', function () {
          var isOpen = nav.classList.toggle('open');
          menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
      }

      var closeAllDropdowns = function (exceptItem) {
        document.querySelectorAll('.nav-item.open').forEach(function (item) {
          if (item !== exceptItem) {
            item.classList.remove('open');
            var btn = item.querySelector('.nav-dropdown-toggle');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        });
      };

      document.querySelectorAll('.nav-dropdown-toggle').forEach(function (toggle) {
        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var parent = toggle.closest('.nav-item');
          if (!parent) return;
          var willOpen = !parent.classList.contains('open');
          closeAllDropdowns(parent);
          parent.classList.toggle('open', willOpen);
          toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      });

      document.addEventListener('click', function (e) {
        if (!e.target.closest('.nav-item')) {
          closeAllDropdowns(null);
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeAllDropdowns(null);
          if (nav && menuBtn && nav.classList.contains('open')) {
            nav.classList.remove('open');
            menuBtn.setAttribute('aria-expanded', 'false');
            menuBtn.focus();
          }
        }
      });
    },

    flushVisibleReveals: function () {
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      document.querySelectorAll('.reveal:not(.is-visible)').forEach(function (el) {
        if (el.closest('.tab-panel:not(.active)')) return;
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        if (rect.top <= vh * 0.96 && rect.bottom >= -20) {
          el.classList.add('is-visible');
        }
      });
    },

    observeReveals: function (root) {
      var self = this;
      var scope = root || document;
      this.initImageTransitions(scope);

      var targets = scope.querySelectorAll(
        '.section-heading, .plan-card, .numbered-card, .kpi-box, .testimonial-card, .feature-panel, .loan-box, .news-card, .hero-main, .hero-side-card, .sidebar-section, .chart-card, .panel-card, .form-card, .info-banner, .alert-box, .table-wrap, .div-photo-shell, .photo-showcase-frame, .filter-bar, .section-label, .kpi-strip > *, .numbered-grid > *, .loan-grid > *, .two-col-grid > div, .section > .container > div:not(.trending-grid):not(.numbered-grid):not(.kpi-strip):not(.charts-grid):not(.testimonials-grid):not(.two-col-grid):not(.loan-grid):not(.news-layout):not(.admin-finance-grid):not(.admin-overview-tables):not(.filter-bar):not(.section-heading):not(.modal-backdrop):not(#loadMoreWrap), .legal-article, .legal-article > h2, .legal-article > p, .legal-article > ul, .footer-grid > *'
      );

      if (!('IntersectionObserver' in window)) {
        targets.forEach(function (el) {
          el.classList.add('reveal', 'is-visible');
        });
        return;
      }

      if (!revealObserver) {
        revealObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.04, rootMargin: '0px 0px -12px 0px' }
        );
      }

      if (!window.__shimogyRevealScrollBound) {
        window.__shimogyRevealScrollBound = true;
        var scrollRaf = null;
        var onViewportChange = function () {
          if (scrollRaf) return;
          scrollRaf = requestAnimationFrame(function () {
            scrollRaf = null;
            self.flushVisibleReveals();
          });
        };
        window.addEventListener('scroll', onViewportChange, { passive: true });
        window.addEventListener('resize', onViewportChange, { passive: true });
      }

      var newlyArmed = [];
      targets.forEach(function (el, idx) {
        if (el.closest('.tab-panel:not(.active)')) return;
        if (!el.classList.contains('reveal')) {
          el.classList.add('reveal');

          if (!el.classList.contains('reveal-left') && !el.classList.contains('reveal-right') && !el.classList.contains('reveal-up')) {
            var parent = el.parentElement;
            var siblingIndex = parent ? Array.prototype.indexOf.call(parent.children, el) : idx;
            if (el.classList.contains('hero-side-card') || el.closest('.updates-sidebar')) {
              el.classList.add('reveal-right');
            } else if (el.classList.contains('div-photo-shell') || el.classList.contains('photo-showcase-frame')) {
              el.classList.add(idx % 2 === 0 ? 'reveal-right' : 'reveal-left');
            } else if (el.classList.contains('hero-main') || el.classList.contains('section-heading') || el.classList.contains('panel-card') || el.classList.contains('form-card') || el.classList.contains('table-wrap')) {
              el.classList.add('reveal-up');
            } else {
              el.classList.add(siblingIndex % 2 === 0 ? 'reveal-left' : 'reveal-right');
            }
          }

          var stagger = idx % 4;
          if (stagger > 0) el.classList.add('reveal-delay-' + stagger);
          newlyArmed.push(el);
        } else if (!el.classList.contains('is-visible')) {
          newlyArmed.push(el);
        }
      });

      if (newlyArmed.length) {
        requestAnimationFrame(function () {
          newlyArmed.forEach(function (el) {
            revealObserver.observe(el);
          });
          requestAnimationFrame(function () {
            self.flushVisibleReveals();
          });
        });
      } else {
        this.flushVisibleReveals();
      }
    },

    openModal: function (modalEl) {
      if (!modalEl) return;
      modalEl.classList.add('open');
      modalEl.setAttribute('aria-hidden', 'false');
      var focusable = modalEl.querySelector('input, select, button, textarea, a[href]');
      if (focusable) {
        setTimeout(function () {
          focusable.focus();
        }, 40);
      }
    },

    closeModal: function (modalEl) {
      if (!modalEl) return;
      modalEl.classList.remove('open');
      modalEl.setAttribute('aria-hidden', 'true');
    },

    initModals: function () {
      var self = this;
      document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
        backdrop.addEventListener('click', function (e) {
          if (e.target === backdrop) self.closeModal(backdrop);
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal-backdrop.open').forEach(function (m) {
            self.closeModal(m);
          });
        }
      });
    },

    initCookies: function () {
      var banner = document.getElementById('cookieBanner');
      if (!banner) return;
      var saved = '';
      try {
        saved = localStorage.getItem('shimogy_cookie_consent') || '';
      } catch (_e) {
        saved = '';
      }
      if (!saved) {
        banner.classList.add('show');
      }
      var acceptAll = document.getElementById('cookieAcceptAll');
      var essentialOnly = document.getElementById('cookieEssentialOnly');
      if (acceptAll) {
        acceptAll.addEventListener('click', function () {
          try { localStorage.setItem('shimogy_cookie_consent', 'all'); } catch (_e) {}
          banner.classList.remove('show');
        });
      }
      if (essentialOnly) {
        essentialOnly.addEventListener('click', function () {
          try { localStorage.setItem('shimogy_cookie_consent', 'essential'); } catch (_e) {}
          banner.classList.remove('show');
        });
      }
    },

    hydrateBusinessInfo: function (data) {
      var self = this;
      var s = (data && data.settings) || {};
      if (s.whatsapp_number) {
        this.defaultWhatsapp = s.whatsapp_number;
      }

      var setText = function (id, val) {
        var el = document.getElementById(id);
        if (el && val) el.textContent = val;
      };
      var setHref = function (id, val) {
        var el = document.getElementById(id);
        var safe = self.sanitizeUrl(val, '');
        if (el && safe) el.setAttribute('href', safe);
      };

      setText('footerCompanyName', s.company_name);
      setText('footerRegInfo', s.registration_info);
      setText('footerAddress', s.address);
      setText('footerHours', s.working_hours);
      setText('footerEmail', s.email);
      setText('footerPhonePrimary', s.phone_primary);
      setText('footerPhoneSecondary', s.phone_secondary);

      if (s.email) setHref('footerEmailLink', 'mailto:' + s.email);
      if (s.social_facebook) setHref('socialFacebook', s.social_facebook);
      if (s.social_tiktok) setHref('socialTiktok', s.social_tiktok);
      if (s.social_youtube) setHref('socialYoutube', s.social_youtube);
      if (s.social_instagram) setHref('socialInstagram', s.social_instagram);

      var waDirectUrl = this.buildWhatsAppUrl(
        s.whatsapp_number || '256752259416',
        'Hello SHIMOGY Investment Group Operations Team, I would like information about your investments, savings, cycles, or loans.'
      );
      setHref('socialWhatsapp', waDirectUrl);
      document.querySelectorAll('.wa-direct-link').forEach(function (el) {
        el.setAttribute('href', waDirectUrl);
      });

      var logoSrc = this.assetUrl(s.logo_url || 'assets/aistudio/logo2_be71428a.jpg');
      document.querySelectorAll('.brand-logo').forEach(function (img) {
        img.setAttribute('referrerpolicy', 'no-referrer');
        img.setAttribute('src', logoSrc);
      });
    },

    THEME_KEY: 'shimogy_theme',

    getTheme: function () {
      try {
        if (localStorage.getItem(this.THEME_KEY) === 'dark') return 'dark';
      } catch (_e) {}
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    },

    applyTheme: function (theme) {
      var isDark = theme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      try {
        localStorage.setItem(this.THEME_KEY, isDark ? 'dark' : 'light');
      } catch (_e) {}

      var themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', isDark ? '#08101E' : '#0A192F');
      }

      var btn = document.getElementById('themeToggleBtn');
      if (btn) {
        btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        btn.setAttribute('title', isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme');
        btn.innerHTML = isDark
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      }

      try {
        window.dispatchEvent(new CustomEvent('shimogy:theme-change', {
          detail: { theme: isDark ? 'dark' : 'light', isDark: isDark }
        }));
      } catch (_e) {}
    },

    initTheme: function () {
      var self = this;
      var current = this.getTheme();
      this.applyTheme(current);
      var btn = document.getElementById('themeToggleBtn');
      if (btn) {
        btn.addEventListener('click', function () {
          var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
          self.applyTheme(next);
        });
      }
    },

    initSeoMetadata: function () {
      if (!window.location || (window.location.protocol !== 'http:' && window.location.protocol !== 'https:')) {
        return;
      }
      var cleanUrl = window.location.origin + window.location.pathname;
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) {
        canonical.setAttribute('href', cleanUrl);
      }
      var ogUrl = document.querySelector('meta[property="og:url"]');
      if (!ogUrl && document.head) {
        ogUrl = document.createElement('meta');
        ogUrl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrl);
      }
      if (ogUrl) {
        ogUrl.setAttribute('content', cleanUrl);
      }
    },

    init: function () {
      var self = this;
      this.initSeoMetadata();
      this.initTheme();
      document.querySelectorAll('img[src^="/assets/"]').forEach(function (img) {
        img.setAttribute('src', self.assetUrl(img.getAttribute('src')));
      });
      this.initNavigation();
      this.initModals();
      this.initCookies();
      this.observeReveals(document);
      this.fetchSiteData().then(function (data) {
        self.hydrateBusinessInfo(data);
        self.observeReveals(document);
        if (window.ShimogyPWA && typeof window.ShimogyPWA.processSiteDataDiff === 'function') {
          window.ShimogyPWA.processSiteDataDiff(data);
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.ShimogySite.init();
    });
  } else {
    window.ShimogySite.init();
  }
})();
