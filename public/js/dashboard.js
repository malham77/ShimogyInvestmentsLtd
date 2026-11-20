/* Client Portal Controller */
(function () {
  'use strict';

  var site = window.ShimogySite;
  var TOKEN_KEY = 'shimogy_member_token';
  var memoryToken = '';
  var currentMember = null;
  var pieChartInstance = null;
  var barChartInstance = null;

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

  function statusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'available') return 'status-available';
    if (s === 'locked') return 'status-locked';
    if (s === 'active' || s === 'approved' || s === 'completed' || s === 'paid') return 'status-active';
    if (s === 'pending' || s === 'review' || s === 'exit_pending') return 'status-pending';
    return 'status-closed';
  }

  function formatCycleStatusLabel(status) {
    var s = String(status || 'active').toLowerCase();
    if (s === 'exit_pending') return 'Exit Pending';
    if (s === 'active') return 'Active';
    if (s === 'exited') return 'Exited';
    if (s === 'stopped') return 'Stopped';
    if (s === 'completed') return 'Completed';
    return status || 'Active';
  }

  function renderMemberCharts(investments, savings, loans, cycles, displayBalance, totalInvested) {
    if (typeof window.Chart !== 'function') return;

    var pieCanvas = document.getElementById('memberPortfolioPie');
    var barCanvas = document.getElementById('memberPlansBar');
    if (!pieCanvas || !barCanvas) return;

    if (pieChartInstance) {
      pieChartInstance.destroy();
      pieChartInstance = null;
    }
    if (barChartInstance) {
      barChartInstance.destroy();
      barChartInstance = null;
    }

    var isDark = document.documentElement.classList.contains('dark');
    var legendColor = isDark ? '#F1F5F9' : '#0A192F';
    var tickMuted = isDark ? '#CBD5E1' : '#475569';
    var gridColor = isDark ? 'rgba(148, 163, 184, 0.2)' : '#E2E8F0';
    var pieBorder = isDark ? '#0F1C33' : '#FFFFFF';

    var savingsTotal = savings.reduce(function (acc, s) { return acc + Number(s.balance || 0); }, 0);
    if (!savingsTotal && Number(displayBalance) > 0) savingsTotal = Number(displayBalance);
    var cycleTotal = cycles.reduce(function (acc, c) { return acc + Number(c.contribution || 0); }, 0);
    var loansTotal = loans.reduce(function (acc, l) { return acc + Number(l.amount || 0); }, 0);

    var hasData = totalInvested > 0 || savingsTotal > 0 || cycleTotal > 0 || loansTotal > 0;
    var pieLabels = hasData
      ? ['Invested Capital', 'Savings Accounts', 'Cycle Contributions', 'Recorded Loans']
      : ['No Active Balances Yet'];
    var pieValues = hasData
      ? [totalInvested, savingsTotal, cycleTotal, loansTotal]
      : [1];
    var pieColors = hasData
      ? ['#2563EB', '#10B981', '#0EA5E9', '#F59E0B']
      : [isDark ? '#334155' : '#CBD5E1'];

    pieChartInstance = new window.Chart(pieCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieValues,
          backgroundColor: pieColors,
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

    var barLabels = investments.length
      ? investments.map(function (inv) { return String(inv.plan_name || 'Plan').slice(0, 18); })
      : ['Invested', 'Savings', 'Cycles', 'Loans'];
    var barCapital = investments.length
      ? investments.map(function (inv) { return Number(inv.amount || 0); })
      : [totalInvested, savingsTotal, cycleTotal, loansTotal];
    var barReturns = investments.length
      ? investments.map(function (inv) { return Number(inv.expected_return || 0); })
      : [totalInvested, savingsTotal, cycleTotal, loansTotal];

    barChartInstance = new window.Chart(barCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: investments.length
          ? [
              { label: 'Capital Committed (UGX)', data: barCapital, backgroundColor: '#2563EB', borderRadius: 6 },
              { label: 'Expected Payout (UGX)', data: barReturns, backgroundColor: '#0EA5E9', borderRadius: 6 }
            ]
          : [
              { label: 'Current Balance (UGX)', data: barCapital, backgroundColor: ['#2563EB', '#10B981', '#0EA5E9', '#F59E0B'], borderRadius: 6 }
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
            ticks: { color: tickMuted, font: { size: 11 } },
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

  function renderMember(m) {
    currentMember = m;
    document.getElementById('memberLoginSection').style.display = 'none';
    var portalSec = document.getElementById('memberPortalSection');
    portalSec.style.display = 'block';
    document.getElementById('memberLogoutBtn').style.display = 'inline-flex';

    document.getElementById('portalWelcomeTitle').textContent = 'Welcome, ' + (m.name || 'Client');
    document.getElementById('portalMemberMeta').textContent =
      'Registered Phone: ' + (m.phone || '--') +
      (m.group_name ? ' · Primary Group: ' + m.group_name : '') +
      ' · Status: ' + String(m.status || 'active').toUpperCase();

    var investments = m.investments || [];
    var savings = m.savings || [];
    var loans = m.loans || [];
    var cycles = m.cycles || [];
    var notifications = m.notifications || [];

    renderNotifications(notifications);

    var totalInvested = investments.reduce(function (acc, i) { return acc + Number(i.amount || 0); }, 0);
    if (!totalInvested && Number(m.total_invested) > 0) totalInvested = Number(m.total_invested);

    var savingsSum = savings.reduce(function (acc, s) { return acc + Number(s.balance || 0); }, 0);
    var displayBalance = Number(m.balance || 0) || savingsSum;

    document.getElementById('kpiTotalInvested').textContent = site.formatUGX(totalInvested);
    document.getElementById('kpiAccountBalance').textContent = site.formatUGX(displayBalance);
    document.getElementById('kpiActivePlans').textContent = String(investments.length);
    document.getElementById('kpiActiveLoans').textContent = String(loans.length);

    renderMemberCharts(investments, savings, loans, cycles, displayBalance, totalInvested);

    // Investments Table (Returns Date)
    var invBody = document.getElementById('memberInvestmentsBody');
    if (!investments.length) {
      invBody.innerHTML = '<tr><td colspan="6">No investment plans recorded yet.</td></tr>';
    } else {
      invBody.innerHTML = investments.map(function (inv) {
        var retDate = site.computeReturnsDate(inv);
        return (
          '<tr>' +
            '<td><strong>' + site.escapeHtml(inv.plan_name || 'Investment Plan') + '</strong></td>' +
            '<td class="tabular-nums">' + site.formatUGX(inv.amount) + '</td>' +
            '<td class="tabular-nums">' + site.formatUGX(inv.expected_return) + '</td>' +
            '<td>' + site.escapeHtml(inv.duration || '--') + '</td>' +
            '<td><span class="status-text ' + statusClass(inv.status) + '">' + site.escapeHtml(inv.status || 'active') + '</span></td>' +
            '<td class="font-mono-num">' + site.escapeHtml(retDate || '--') + '</td>' +
          '</tr>'
        );
      }).join('');
    }

    // Savings Table (Fixed -> Locked, Current -> Available)
    var savBody = document.getElementById('memberSavingsBody');
    if (!savings.length) {
      savBody.innerHTML = '<tr><td colspan="4">No savings accounts recorded yet.</td></tr>';
    } else {
      savBody.innerHTML = savings.map(function (sv) {
        var normStatus = site.normalizeSavingsStatus(sv.account_type, sv.status);
        return (
          '<tr>' +
            '<td><strong>' + site.escapeHtml(sv.account_type || 'Current Account') + '</strong></td>' +
            '<td class="tabular-nums">' + site.formatUGX(sv.balance) + '</td>' +
            '<td class="font-mono-num">' + site.escapeHtml(sv.open_date || '--') + '</td>' +
            '<td><span class="status-text ' + statusClass(normStatus) + '">' + site.escapeHtml(normStatus) + '</span></td>' +
          '</tr>'
        );
      }).join('');
    }

    // Loans Table (Returning Date & Daily Countdown)
    var loanBody = document.getElementById('memberLoansBody');
    if (!loans.length) {
      loanBody.innerHTML = '<tr><td colspan="7">No loans on record for your account.</td></tr>';
    } else {
      loanBody.innerHTML = loans.map(function (ln) {
        var cd = site.computeLoanCountdown(ln);
        return (
          '<tr>' +
            '<td class="tabular-nums"><strong>' + site.formatUGX(ln.amount) + '</strong></td>' +
            '<td>' + site.escapeHtml(ln.purpose || 'Client Loan') + '</td>' +
            '<td>' + site.escapeHtml(ln.duration || '--') + '</td>' +
            '<td>' + site.escapeHtml(ln.interest_rate || '10%') + '</td>' +
            '<td class="font-mono-num">' + site.escapeHtml(cd.returnDate || '--') + '</td>' +
            '<td><span class="countdown-text countdown-' + cd.tone + '">' + site.escapeHtml(cd.label) + '</span></td>' +
            '<td><span class="status-text ' + statusClass(ln.status) + '">' + site.escapeHtml(ln.status || 'pending') + '</span></td>' +
          '</tr>'
        );
      }).join('');
    }

    // Cycles Table (Shared Co-Clients + My Cycle Number + Exit Approval Flow)
    var cycBody = document.getElementById('memberCyclesBody');
    if (!cycles.length) {
      cycBody.innerHTML = '<tr><td colspan="8">You are not enrolled in any savings cycles yet.</td></tr>';
    } else {
      cycBody.innerHTML = cycles.map(function (cy) {
        var turnState = site.computeCycleTurnState(cy);
        var isClosed = turnState.status === 'exited' || turnState.status === 'stopped' || turnState.status === 'completed';
        var isExitPending = turnState.status === 'exit_pending';
        var actType = turnState.cycleType === 'custom' ? 'stop' : 'exit';
        var actLabel = turnState.cycleType === 'custom' ? 'Stop Cycle' : 'Exit Cycle';

        var coList = Array.isArray(cy.co_members) ? cy.co_members : [];
        var coHtml = coList.length
          ? '<div class="shared-clients-cell">' +
              '<span class="shared-clients-names">' + coList.map(function (n) { return site.escapeHtml(n); }).join(', ') + '</span>' +
              '<span class="shared-clients-meta">' + coList.length + ' other client' + (coList.length === 1 ? '' : 's') + '</span>' +
            '</div>'
          : '<span style="color:var(--text-muted);font-size:0.82rem;">No other clients yet</span>';

        var actionHtml;
        if (isClosed) {
          actionHtml = '<span style="color:var(--text-muted);font-size:0.8rem;">No action</span>';
        } else if (isExitPending) {
          actionHtml = '<span class="status-text status-pending" style="font-size:0.8rem;">Awaiting Admin Approval</span>';
        } else {
          actionHtml = '<button type="button" class="btn btn-danger btn-sm client-cycle-action-btn" data-id="' +
            site.escapeHtml(cy.id) +
            '" data-action="' +
            actType +
            '">' +
            actLabel +
          '</button>';
        }

        return (
          '<tr>' +
            '<td><strong>' + site.escapeHtml(cy.cycle_name) + '</strong><div style="font-size:0.75rem;color:var(--text-muted);">' + (turnState.cycleType === 'custom' ? 'Custom Cycle' : 'Public Cycle') + '</div></td>' +
            '<td>' + coHtml + '</td>' +
            '<td class="tabular-nums">' + site.formatUGX(cy.contribution) + '</td>' +
            '<td>' + site.escapeHtml(cy.payout_duration || 'Monthly') + '</td>' +
            '<td class="tabular-nums">' + site.escapeHtml(turnState.totalClients) + '</td>' +
            '<td><span class="cycle-turn-main">' + site.escapeHtml(turnState.label) + '</span><span class="cycle-turn-sub">' + site.escapeHtml(turnState.subLabel) + '</span></td>' +
            '<td><span class="status-text ' + statusClass(cy.status) + '">' + site.escapeHtml(formatCycleStatusLabel(cy.status)) + '</span></td>' +
            '<td>' + actionHtml + '</td>' +
          '</tr>'
        );
      }).join('');

      cycBody.querySelectorAll('.client-cycle-action-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cid = btn.getAttribute('data-id');
          var act = btn.getAttribute('data-action');
          var fb = document.getElementById('memberCycleFeedback');
          if (!btn.dataset.confirmed) {
            btn.dataset.confirmed = '1';
            btn.textContent = act === 'stop' ? 'Confirm Stop?' : 'Request Exit?';
            setTimeout(function () {
              if (btn && btn.dataset) {
                delete btn.dataset.confirmed;
                btn.textContent = act === 'stop' ? 'Stop Cycle' : 'Exit Cycle';
              }
            }, 4000);
            return;
          }
          btn.disabled = true;
          site.apiFetch('/api/member/cycles/' + encodeURIComponent(cid) + '/action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + getToken()
            },
            body: JSON.stringify({ action: act })
          })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
            .then(function (res) {
              if (!res.ok) {
                if (fb) fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml(res.data.error || 'Unable to update cycle.') + '</div>';
                return;
              }
              if (fb) {
                var defaultMsg = act === 'stop'
                  ? 'Custom cycle updated.'
                  : 'Cycle exit request sent for admin approval.';
                fb.innerHTML = '<div class="alert-box alert-success">' + site.escapeHtml((res.data && res.data.message) || defaultMsg) + '</div>';
              }
              loadMemberProfile();
            })
            .catch(function () {
              if (fb) fb.innerHTML = '<div class="alert-box alert-error">Network error updating cycle.</div>';
            })
            .finally(function () {
              btn.disabled = false;
            });
        });
      });
    }

    site.observeReveals(portalSec);
  }

  function renderNotifications(notifications) {
    var sec = document.getElementById('memberNotificationsSection');
    var listEl = document.getElementById('memberNotificationsList');
    var markAllBtn = document.getElementById('markAllNotifsReadBtn');
    if (!sec || !listEl) return;

    var unread = (notifications || []).filter(function (n) { return !Number(n.is_read); });
    if (!unread.length) {
      sec.style.display = 'none';
      listEl.innerHTML = '';
      if (markAllBtn) markAllBtn.style.display = 'none';
      return;
    }

    sec.style.display = 'block';
    if (markAllBtn) {
      markAllBtn.style.display = unread.length > 1 ? 'inline-flex' : 'none';
      markAllBtn.onclick = function () {
        markAllBtn.disabled = true;
        site.apiFetch('/api/member/notifications/read-all', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + getToken() }
        })
          .then(function () { loadMemberProfile(); })
          .finally(function () { markAllBtn.disabled = false; });
      };
    }

    listEl.innerHTML = unread.map(function (n) {
      return (
        '<div class="notif-item">' +
          '<div class="notif-body">' +
            '<div class="notif-title">' + site.escapeHtml(n.title || 'Cycle Notification') + '</div>' +
            '<div class="notif-message">' + site.escapeHtml(n.message || '') + '</div>' +
            '<div class="notif-meta">' + site.escapeHtml(String(n.created_at || '').slice(0, 16)) + '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-outline btn-sm dismiss-notif-btn" data-id="' + site.escapeHtml(n.id) + '">Dismiss</button>' +
        '</div>'
      );
    }).join('');

    listEl.querySelectorAll('.dismiss-notif-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nid = btn.getAttribute('data-id');
        btn.disabled = true;
        site.apiFetch('/api/member/notifications/' + encodeURIComponent(nid) + '/read', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + getToken() }
        })
          .then(function () { loadMemberProfile(); })
          .catch(function () { btn.disabled = false; });
      });
    });
  }

  function showLogin() {
    currentMember = null;
    setToken('');
    document.getElementById('memberLoginSection').style.display = 'block';
    document.getElementById('memberPortalSection').style.display = 'none';
    document.getElementById('memberLogoutBtn').style.display = 'none';
  }

  function loadMemberProfile() {
    var token = getToken();
    if (token && window.location.protocol !== 'file:' && token.indexOf('cloud_') === 0) {
      setToken('');
      token = '';
    }
    if (!token) {
      showLogin();
      return;
    }
    site.apiFetch('/api/member/me', {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Session expired');
        return r.json();
      })
      .then(function (data) {
        if (data && data.member) renderMember(data.member);
        else showLogin();
      })
      .catch(function () {
        showLogin();
      });
  }

  document.getElementById('memberLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var phone = document.getElementById('memberPhoneInput').value.trim();
    var password = document.getElementById('memberPasswordInput').value;
    var fb = document.getElementById('memberLoginFeedback');
    fb.innerHTML = '';

    site.apiFetch('/api/member/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, password: password })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml(res.data.error || 'Invalid login credentials.') + '</div>';
          return;
        }
        setToken(res.data.token);
        loadMemberProfile();
      })
      .catch(function () {
        fb.innerHTML = '<div class="alert-box alert-error">Network error. Please try again.</div>';
      });
  });

  function exchangeMemberGoogleToken(idToken) {
    return site.apiFetch('/api/member/google-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken })
    }).then(function (r) {
      return r.text().then(function (txt) {
        var d = {};
        try { d = txt ? JSON.parse(txt) : {}; } catch (_e) { d = {}; }
        if (!r.ok) {
          throw new Error(d.error || 'No SHIMOGY client account matches this Google email.');
        }
        return d;
      });
    });
  }

  var googleMemberBtn = document.getElementById('googleMemberLoginBtn');
  if (googleMemberBtn) {
    googleMemberBtn.addEventListener('click', function () {
      var fb = document.getElementById('memberLoginFeedback');
      fb.innerHTML = '';
      if (!window.ShimogyCloud || typeof window.ShimogyCloud.signInMemberWithGoogle !== 'function') {
        fb.innerHTML = '<div class="alert-box alert-error">Cloud Google Sign-In is unavailable offline. Please use your phone number and password.</div>';
        return;
      }
      googleMemberBtn.disabled = true;
      window.ShimogyCloud.signInMemberWithGoogle()
        .then(function (res) {
          if (window.location.protocol !== 'file:' && res && res.idToken) {
            return exchangeMemberGoogleToken(res.idToken).then(function (pgRes) {
              setToken(pgRes.token);
              if (pgRes.member) renderMember(pgRes.member);
              else loadMemberProfile();
            });
          }
          setToken(res.token);
          if (res.member) renderMember(res.member);
          else loadMemberProfile();
        })
        .catch(function (err) {
          fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml((err && err.message) || 'Google Sign-In did not complete.') + '</div>';
        })
        .finally(function () {
          googleMemberBtn.disabled = false;
        });
    });
  }

  function handleSignOutToMainSite() {
    var token = getToken();
    setToken('');
    var finish = function () {
      window.location.href = 'index.html';
    };
    var ops = [];
    if (token) {
      ops.push(site.apiFetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(function () {}));
    }
    if (window.ShimogyCloud && typeof window.ShimogyCloud.signOutCloud === 'function') {
      ops.push(window.ShimogyCloud.signOutCloud().catch(function () {}));
    }
    Promise.all(ops).then(finish, finish);
  }

  document.getElementById('memberLogoutBtn').addEventListener('click', handleSignOutToMainSite);
  var portalSignOutBtn = document.getElementById('portalSignOutBtn');
  if (portalSignOutBtn) {
    portalSignOutBtn.addEventListener('click', handleSignOutToMainSite);
  }

  document.getElementById('refreshPortalBtn').addEventListener('click', loadMemberProfile);

  // Modals
  var passModal = document.getElementById('changePassModal');
  var delModal = document.getElementById('memberDelModal');

  document.getElementById('openChangePassBtn').addEventListener('click', function () {
    document.getElementById('changePassFeedback').innerHTML = '';
    site.openModal(passModal);
  });
  document.getElementById('closeChangePassModal').addEventListener('click', function () { site.closeModal(passModal); });

  document.getElementById('openMemberDelBtn').addEventListener('click', function () {
    document.getElementById('memDelFeedback').innerHTML = '';
    site.openModal(delModal);
  });
  document.getElementById('closeMemberDelModal').addEventListener('click', function () { site.closeModal(delModal); });

  document.getElementById('memberChangePassForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var currentPassword = document.getElementById('curMemberPass').value;
    var newPassword = document.getElementById('newMemberPass').value;
    var fb = document.getElementById('changePassFeedback');

    if (getToken().indexOf('cloud_') === 0) {
      fb.innerHTML = '<div class="alert-box alert-info">Cloud portal passwords are managed centrally by our Kampala Operations Team (+256 752 259 416) or through your linked Google account security settings.</div>';
      return;
    }

    site.apiFetch('/api/member/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + getToken()
      },
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml(res.data.error || 'Could not update password.') + '</div>';
          return;
        }
        fb.innerHTML = '<div class="alert-box alert-success">Password updated successfully.</div>';
        document.getElementById('memberChangePassForm').reset();
      })
      .catch(function () {
        fb.innerHTML = '<div class="alert-box alert-error">Network error.</div>';
      });
  });

  document.getElementById('memberDelForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!currentMember) return;
    var reason = document.getElementById('memDelReason').value.trim();
    var fb = document.getElementById('memDelFeedback');

    site.apiFetch('/api/deletion-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: currentMember.name,
        phone: currentMember.phone,
        email: currentMember.email || '',
        reason: reason || 'Requested from Client Portal'
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          fb.innerHTML = '<div class="alert-box alert-error">' + site.escapeHtml(res.data.error || 'Could not submit request.') + '</div>';
          return;
        }
        fb.innerHTML = '<div class="alert-box alert-success">' + site.escapeHtml(res.data.message) + '</div>';
        document.getElementById('memberDelForm').reset();
      })
      .catch(function () {
        fb.innerHTML = '<div class="alert-box alert-error">Network error.</div>';
      });
  });

  window.addEventListener('shimogy:theme-change', function () {
    if (!currentMember) return;
    var investments = currentMember.investments || [];
    var savings = currentMember.savings || [];
    var loans = currentMember.loans || [];
    var cycles = currentMember.cycles || [];
    var totalInvested = investments.reduce(function (acc, i) { return acc + Number(i.amount || 0); }, 0);
    if (!totalInvested && Number(currentMember.total_invested) > 0) totalInvested = Number(currentMember.total_invested);
    var savingsSum = savings.reduce(function (acc, s) { return acc + Number(s.balance || 0); }, 0);
    var displayBalance = Number(currentMember.balance || 0) || savingsSum;
    renderMemberCharts(investments, savings, loans, cycles, displayBalance, totalInvested);
  });

  window.addEventListener('shimogy:cloud-auth', function (e) {
    var detail = (e && e.detail) || {};
    var curToken = getToken();
    if (detail.user && !detail.isAdmin && (!curToken || curToken.indexOf('cloud_') === 0) && window.ShimogyCloud) {
      if (window.location.protocol !== 'file:' && typeof window.ShimogyCloud.getIdToken === 'function') {
        window.ShimogyCloud.getIdToken()
          .then(function (idToken) { return idToken ? exchangeMemberGoogleToken(idToken) : null; })
          .then(function (pgRes) {
            if (pgRes && pgRes.token) {
              setToken(pgRes.token);
              if (pgRes.member) renderMember(pgRes.member);
              else loadMemberProfile();
            }
          })
          .catch(function () {});
        return;
      }
      if (window.location.protocol === 'file:' && typeof window.ShimogyCloud.fetchMemberSessionFromCloud === 'function') {
        var cloudToken = 'cloud_mem_uid_' + detail.user.uid;
        window.ShimogyCloud.fetchMemberSessionFromCloud(cloudToken).then(function (res) {
          if (res && res.member) {
            setToken(cloudToken);
            renderMember(res.member);
          }
        }).catch(function () {});
      }
    }
  });

  // Hydrate updates list
  site.fetchSiteData().then(function (data) {
    var listEl = document.getElementById('portalUpdatesList');
    var updates = (data && data.updates) || [];
    if (!updates.length) {
      listEl.innerHTML = '<li>No recent company updates posted.</li>';
      return;
    }
    listEl.innerHTML = updates.slice(0, 4).map(function (u) {
      return '<li><strong>' + site.escapeHtml(u.title) + '</strong> (' + site.escapeHtml(u.published_date) + ') — ' + site.escapeHtml(u.excerpt) + '</li>';
    }).join('');
  });

  loadMemberProfile();
})();
