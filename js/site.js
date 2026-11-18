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

    assetUrl: function (url) {
      var clean = String(url || '').trim();
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

    fetchSiteData: function () {
      if (!this.dataPromise) {
        this.dataPromise = fetch('/api/site-data', { cache: 'no-store' })
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

    initNavigation: function () {
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

    observeReveals: function (root) {
      var scope = root || document;
      var targets = scope.querySelectorAll(
        '.section-heading, .plan-card, .numbered-card, .kpi-box, .testimonial-card, .feature-panel, .loan-box, .news-card, .hero-main, .hero-side-card, .sidebar-section, .chart-card, .panel-card, .form-card, .info-banner, .table-wrap, .two-col-grid > *, .loan-grid > *, .legal-article > h2, .legal-article > p, .legal-article > ul, .footer-grid > *'
      );

      var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion || !('IntersectionObserver' in window)) {
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
              } else if (entry.boundingClientRect.top > window.innerHeight * 0.96) {
                // Reset only when scrolled completely back up so scrolling down again slides it smoothly
                entry.target.classList.remove('is-visible');
              }
            });
          },
          { threshold: 0.1, rootMargin: '0px 0px -48px 0px' }
        );
      }

      var newlyArmed = [];
      targets.forEach(function (el, idx) {
        if (!el.classList.contains('reveal')) {
          el.classList.add('reveal');

          if (!el.classList.contains('reveal-left') && !el.classList.contains('reveal-right') && !el.classList.contains('reveal-up')) {
            var parent = el.parentElement;
            var siblingIndex = parent ? Array.prototype.indexOf.call(parent.children, el) : idx;
            if (el.classList.contains('hero-side-card') || el.closest('.updates-sidebar')) {
              el.classList.add('reveal-right');
            } else if (el.classList.contains('hero-main') || el.classList.contains('section-heading')) {
              el.classList.add(idx % 2 === 0 ? 'reveal-left' : 'reveal-right');
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
        // Wait two frames so the browser commits the initial off-center transform before observing
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            newlyArmed.forEach(function (el) {
              revealObserver.observe(el);
            });
          });
        });
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
        if (el && val) el.setAttribute('href', val);
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
