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
    if (s === 'active' || s === 'approved' || s === 'completed' || s === 'paid') return 'status-active';
    if (s === 'pending' || s === 'review') return 'status-pending';
    return 'status-closed';
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
      ? ['#1D4ED8', '#059669', '#0284C7', '#D97706']
      : ['#CBD5E1'];

    pieChartInstance = new window.Chart(pieCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieValues,
          backgroundColor: pieColors,
          borderColor: '#FFFFFF',
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
              color: '#0A192F',
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
              { label: 'Capital Committed (UGX)', data: barCapital, backgroundColor: '#1D4ED8', borderRadius: 6 },
              { label: 'Expected Payout (UGX)', data: barReturns, backgroundColor: '#0284C7', borderRadius: 6 }
            ]
          : [
              { label: 'Current Balance (UGX)', data: barCapital, backgroundColor: ['#1D4ED8', '#059669', '#0284C7', '#D97706'], borderRadius: 6 }
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
              color: '#0A192F',
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#475569', font: { size: 11 } },
            grid: { color: '#E2E8F0' }
          },
          x: {
            ticks: { color: '#0A192F', font: { size: 11, weight: '600' } },
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

    document.getElementById('portalWelcomeTitle').textContent = 'Welcome, ' + (m.name || 'Member');
    document.getElementById('portalMemberMeta').textContent =
      'Registered Phone: ' + (m.phone || '--') +
      (m.group_name ? ' · Primary Group: ' + m.group_name : '') +
      ' · Status: ' + String(m.status || 'active').toUpperCase();

    var investments = m.investments || [];
    var savings = m.savings || [];
    var loans = m.loans || [];
    var cycles = m.cycles || [];

    var totalInvested = investments.reduce(function (acc, i) { return acc + Number(i.amount || 0); }, 0);
    if (!totalInvested && Number(m.total_invested) > 0) totalInvested = Number(m.total_invested);

    var savingsSum = savings.reduce(function (acc, s) { return acc + Number(s.balance || 0); }, 0);
    var displayBalance = Number(m.balance || 0) || savingsSum;

    document.getElementById('kpiTotalInvested').textContent = site.formatUGX(totalInvested);
    document.getElementById('kpiAccountBalance').textContent = site.formatUGX(displayBalance);
    document.getElementById('kpiActivePlans').textContent = String(investments.length);
    document.getElementById('kpiActiveLoans').textContent = String(loans.length);

    renderMemberCharts(investments, savings, loans, cycles, displayBalance, totalInvested);

    // Investments Table
    var invBody = document.getElementById('memberInvestmentsBody');
    if (!investments.length) {
      invBody.innerHTML = '<tr><td colspan="6">No investment plans recorded yet.</td></tr>';
    } else {
      invBody.innerHTML = investments.map(function (inv) {
        return (
          '<tr>' +
            '<td><strong>' + site.escapeHtml(inv.plan_name || 'Investment Plan') + '</strong></td>' +
            '<td class="tabular-nums">' + site.formatUGX(inv.amount) + '</td>' +
            '<td class="tabular-nums">' + site.formatUGX(inv.expected_return) + '</td>' +
            '<td>' + site.escapeHtml(inv.duration || '--') + '</td>' +
            '<td><span class="status-text ' + statusClass(inv.status) + '">' + site.escapeHtml(inv.status || 'active') + '</span></td>' +
            '<td>' + site.escapeHtml((inv.created_at || '').slice(0, 10) || '--') + '</td>' +
          '</tr>'
        );
      }).join('');
    }

    // Savings Table
    var savBody = document.getElementById('memberSavingsBody');
    if (!savings.length) {
      savBody.innerHTML = '<tr><td colspan="4">No savings accounts recorded yet.</td></tr>';
    } else {
      savBody.innerHTML = savings.map(function (sv) {
        return (
          '<tr>' +
            '<td><strong>' + site.escapeHtml(sv.account_type || 'Current Account') + '</strong></td>' +
            '<td class="tabular-nums">' + site.formatUGX(sv.balance) + '</td>' +
            '<td>' + site.escapeHtml(sv.open_date || '--') + '</td>' +
            '<td><span class="status-text ' + statusClass(sv.status) + '">' + site.escapeHtml(sv.status || 'active') + '</span></td>' +
          '</tr>'
        );
      }).join('');
    }

    // Loans Table
    var loanBody = document.getElementById('memberLoansBody');
    if (!loans.length) {
      loanBody.innerHTML = '<tr><td colspan="6">No loans on record for your account.</td></tr>';
    } else {
      loanBody.innerHTML = loans.map(function (ln) {
        return (
          '<tr>' +
            '<td class="tabular-nums"><strong>' + site.formatUGX(ln.amount) + '</strong></td>' +
            '<td>' + site.escapeHtml(ln.purpose || 'Member Loan') + '</td>' +
            '<td>' + site.escapeHtml(ln.duration || '--') + '</td>' +
            '<td>' + site.escapeHtml(ln.interest_rate || '10%') + '</td>' +
            '<td><span class="status-text ' + statusClass(ln.status) + '">' + site.escapeHtml(ln.status || 'pending') + '</span></td>' +
            '<td>' + site.escapeHtml(ln.request_date || '--') + '</td>' +
          '</tr>'
        );
      }).join('');
    }

    // Cycles Table
    var cycBody = document.getElementById('memberCyclesBody');
    if (!cycles.length) {
      cycBody.innerHTML = '<tr><td colspan="5">You are not enrolled in any savings cycles yet.</td></tr>';
    } else {
      cycBody.innerHTML = cycles.map(function (cy) {
        return (
          '<tr>' +
            '<td><strong>' + site.escapeHtml(cy.cycle_name) + '</strong></td>' +
            '<td class="tabular-nums">' + site.formatUGX(cy.contribution) + '</td>' +
            '<td>' + site.escapeHtml(cy.payout_duration || 'Monthly') + '</td>' +
            '<td class="tabular-nums">' + site.escapeHtml(cy.number_of_members || '--') + '</td>' +
            '<td><span class="status-text ' + statusClass(cy.status) + '">' + site.escapeHtml(cy.status || 'active') + '</span></td>' +
          '</tr>'
        );
      }).join('');
    }

    site.observeReveals(portalSec);
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
    if (!token) {
      showLogin();
      return;
    }
    fetch('/api/member/me', {
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

    fetch('/api/member/login', {
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

  document.getElementById('memberLogoutBtn').addEventListener('click', function () {
    var token = getToken();
    if (token) {
      fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(function () {});
    }
    showLogin();
  });

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

    fetch('/api/member/change-password', {
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

    fetch('/api/deletion-requests', {
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
